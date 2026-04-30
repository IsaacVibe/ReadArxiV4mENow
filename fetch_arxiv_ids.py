import argparse
import collections
import datetime
import json
import os
import random
import re
import time
import urllib.request
from html.parser import HTMLParser
from urllib.error import HTTPError, URLError
import socket
import http.client


class ArxivAbsPageParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.title = ''
        self.authors = []
        self.categories = []
        self.summary = ''

        self._in_abstract = False
        self._abstract_parts = []

        self._in_title_h1 = False
        self._title_parts = []

        self._in_authors_div = False
        self._author_link = False
        self._meta_authors = []
        self._link_authors = []

        self._capture_subjects = False
        self._subjects_parts = []
        self._all_text_parts = []

        self._meta_primary_category = None

    def handle_starttag(self, tag, attrs):
        attrs_dict = dict(attrs)

        if tag == 'meta':
            name = attrs_dict.get('name', '')
            content = attrs_dict.get('content', '') or ''
            if name == 'citation_title' and content and not self.title:
                self.title = content.strip()
            elif name == 'citation_author' and content:
                self._meta_authors.append(content.strip())
            elif name == 'citation_primary_category' and content:
                self._meta_primary_category = content.strip()
            return

        if tag == 'h1':
            class_attr = attrs_dict.get('class', '')
            if 'title' in class_attr.split():
                self._in_title_h1 = True
                self._title_parts = []
            return

        if tag == 'div':
            class_attr = attrs_dict.get('class', '')
            classes = class_attr.split()
            if 'authors' in classes:
                self._in_authors_div = True
                return
            if 'subheader' in classes:
                self._capture_subjects = True
                self._subjects_parts = []
                return
            return

        if tag == 'blockquote':
            class_attr = attrs_dict.get('class', '')
            if 'abstract' in class_attr.split():
                self._in_abstract = True
                self._abstract_parts = []
            return

        if self._in_authors_div and tag == 'a':
            self._author_link = True
            return

        if self._in_title_h1 and tag == 'span':
            class_attr = attrs_dict.get('class', '')
            if 'descriptor' in class_attr.split():
                return

    def handle_endtag(self, tag):
        if tag == 'h1' and self._in_title_h1:
            self._in_title_h1 = False
            txt = re.sub(r'\s+', ' ', ''.join(self._title_parts)).strip()
            txt = re.sub(r'^\s*Title:\s*', '', txt, flags=re.IGNORECASE).strip()
            if txt and not self.title:
                self.title = txt
            return

        if tag == 'div' and self._in_authors_div:
            self._in_authors_div = False
            self._author_link = False
            return

        if tag == 'a' and self._author_link:
            self._author_link = False
            return

        if tag == 'blockquote' and self._in_abstract:
            self._in_abstract = False
            txt = re.sub(r'\s+', ' ', ' '.join(self._abstract_parts)).strip()
            txt = re.sub(r'^\s*Abstract:\s*', '', txt, flags=re.IGNORECASE).strip()
            self.summary = txt
            return

        if tag == 'div' and self._capture_subjects:
            self._capture_subjects = False
            raw = re.sub(r'\s+', ' ', ' '.join(self._subjects_parts)).strip()
            m = re.search(r'Subjects:\s*(.*)$', raw, flags=re.IGNORECASE)
            subjects_raw = m.group(1).strip() if m else raw
            cats = []
            for code in re.findall(r'\(([^)]+)\)', subjects_raw):
                if code.startswith('astro-ph'):
                    cats.append(code)
            self.categories = cats
            return

    def handle_data(self, data):
        t = data.strip()
        if not t:
            return

        self._all_text_parts.append(t)

        if self._in_title_h1:
            self._title_parts.append(data)
            return

        if self._in_authors_div and self._author_link:
            self._link_authors.append(t)
            return

        if self._in_abstract:
            self._abstract_parts.append(t)
            return

        if self._capture_subjects:
            self._subjects_parts.append(t)
            return

    def finalize(self):
        if self._meta_primary_category:
            if self._meta_primary_category.startswith('astro-ph') and self._meta_primary_category not in self.categories:
                self.categories = [self._meta_primary_category] + self.categories

        if not self.categories:
            raw = ' '.join(self._all_text_parts)
            cats = []
            for code in re.findall(r'\bastro-ph\.[A-Z]{2}\b', raw):
                if code not in cats:
                    cats.append(code)
            self.categories = cats

        preferred_authors = self._link_authors if self._link_authors else self._meta_authors
        preferred_authors = [a for a in preferred_authors if a]
        seen = set()
        uniq = []
        for a in preferred_authors:
            if a not in seen:
                seen.add(a)
                uniq.append(a)
        self.authors = uniq


def backoff_sleep(attempt: int, base_s: float, max_s: float, jitter_s: float):
    t = min(base_s * (2 ** attempt), max_s)
    if jitter_s > 0:
        t += random.uniform(0, jitter_s)
    time.sleep(t)


def fetch_bytes(opener, url: str, max_retries: int = 6, timeout: int = 30) -> bytes:
    headers = {
        'User-Agent': 'RAVEN/1.0 (Python/urllib)',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
    }
    req = urllib.request.Request(url, headers=headers)
    last_err = None
    for attempt in range(max_retries):
        try:
            with opener.open(req, timeout=timeout) as response:
                return response.read()
        except HTTPError as e:
            last_err = e
            if e.code == 429:
                print(f"HTTP 429. Retrying (attempt {attempt+1}/{max_retries})...")
                backoff_sleep(attempt, 2.0, 60.0, 1.0)
                continue
            raise
        except (URLError, socket.timeout, ConnectionResetError, http.client.IncompleteRead, TimeoutError, OSError) as e:
            last_err = e
            print(f"Error: {e}. Retrying (attempt {attempt+1}/{max_retries})...")
            backoff_sleep(attempt, 2.0, 60.0, 1.0)
    raise RuntimeError(f"Max retries exceeded: {last_err}")


def normalize_arxiv_id(s: str) -> str | None:
    s = s.strip()
    m = re.match(r'^(\d{4}\.\d{5})(v\d+)?$', s)
    if m:
        return m.group(1)
    return None


def read_ids_from_file(path: str) -> list[str]:
    ids = []
    with open(path, 'r', encoding='utf-8') as f:
        for line in f:
            t = line.strip()
            if not t:
                continue
            ids.append(t)
    return ids


def fetch_papers_by_ids(arxiv_ids: list[str], delay_base_s: float = 1.2, delay_jitter_s: float = 0.8, max_retries: int = 6, timeout: int = 30):
    opener = urllib.request.build_opener()

    papers = []
    subjects_counter = collections.Counter()

    for idx, arxiv_id in enumerate(arxiv_ids, 1):
        abs_url = f'https://arxiv.org/abs/{arxiv_id}'
        delay_s = max(0.0, delay_base_s) + (random.uniform(0, max(0.0, delay_jitter_s)) if delay_jitter_s else 0.0)
        if delay_s > 0:
            time.sleep(delay_s)

        html = fetch_bytes(opener, abs_url, max_retries=max_retries, timeout=timeout).decode('utf-8', errors='replace')
        parser = ArxivAbsPageParser()
        parser.feed(html)
        parser.finalize()

        cats = [c for c in parser.categories if c.startswith('astro-ph')]
        for cat in cats:
            subjects_counter[cat] += 1

        papers.append({
            'title': parser.title,
            'authors': parser.authors,
            'summary': parser.summary,
            'categories': cats,
            'url': abs_url
        })

        print(f"[{idx}/{len(arxiv_ids)}] {arxiv_id} OK")

    return papers, subjects_counter


def save_json(papers, subjects_counter, date_str: str, out_path: str, update_latest: bool):
    data = {
        "date": date_str,
        "total": len(papers),
        "subjects_counter": dict(subjects_counter.most_common()),
        "papers": papers
    }
    os.makedirs(os.path.dirname(out_path) or '.', exist_ok=True)
    with open(out_path, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

    if update_latest:
        base = os.path.basename(out_path)
        latest_path = os.path.join(os.path.dirname(out_path), 'latest.json')
        with open(latest_path, 'w', encoding='utf-8') as f:
            json.dump({"latest_file": base}, f)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('ids', nargs='*')
    ap.add_argument('--ids-file', type=str, default=None)
    ap.add_argument('--delay-base', type=float, default=1.2)
    ap.add_argument('--delay-jitter', type=float, default=0.8)
    ap.add_argument('--max-retries', type=int, default=6)
    ap.add_argument('--timeout', type=int, default=30)
    ap.add_argument('--out', type=str, default=None)
    ap.add_argument('--update-latest', action='store_true')
    args = ap.parse_args()

    raw_ids = list(args.ids)
    if args.ids_file:
        raw_ids.extend(read_ids_from_file(args.ids_file))

    normalized = []
    for rid in raw_ids:
        nid = normalize_arxiv_id(rid)
        if nid:
            normalized.append(nid)

    seen = set()
    arxiv_ids = []
    for nid in normalized:
        if nid not in seen:
            seen.add(nid)
            arxiv_ids.append(nid)

    if not arxiv_ids:
        raise SystemExit("No valid arXiv IDs provided. Example: python fetch_arxiv_ids.py 2604.03283 2604.22105")

    papers, subjects_counter = fetch_papers_by_ids(
        arxiv_ids,
        delay_base_s=args.delay_base,
        delay_jitter_s=args.delay_jitter,
        max_retries=args.max_retries,
        timeout=args.timeout,
    )

    today = datetime.datetime.now().strftime('%Y-%m-%d')
    ts = datetime.datetime.now().strftime('%Y%m%d_%H%M%S')
    out_path = args.out or os.path.join('public', f'RAVEN_IDS_{ts}.json')
    save_json(papers, subjects_counter, today, out_path, args.update_latest)
    print(f"Saved {len(papers)} papers to {out_path}")


if __name__ == '__main__':
    main()
