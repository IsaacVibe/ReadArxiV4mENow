import urllib.request
from urllib.error import HTTPError, URLError
from html.parser import HTMLParser
import collections
import datetime
import os
import time
import json
import re
import argparse
import random
import socket
import http.client
import ssl
import xml.etree.ElementTree as ET
from typing import Optional, Dict


def parse_h3_any_date(h3_text: str) -> Optional[str]:
    txt = re.sub(r'\s+', ' ', h3_text).strip()
    m = re.search(r'Showing new listings for\s+([A-Za-z]+,\s+\d{1,2}\s+[A-Za-z]+\s+\d{4})', txt)
    if m:
        raw = m.group(1)
        try:
            dt = datetime.datetime.strptime(raw, '%A, %d %B %Y')
            return dt.strftime('%Y-%m-%d')
        except Exception:
            pass

    m = re.search(r'\b([A-Za-z]{3},\s+\d{1,2}\s+[A-Za-z]{3}\s+\d{4})\b', txt)
    if m:
        raw = m.group(1)
        try:
            dt = datetime.datetime.strptime(raw, '%a, %d %b %Y')
            return dt.strftime('%Y-%m-%d')
        except Exception:
            pass

    m = re.search(r'\b([A-Za-z]+,\s+\d{1,2}\s+[A-Za-z]+\s+\d{4})\b', txt)
    if m:
        raw = m.group(1)
        try:
            dt = datetime.datetime.strptime(raw, '%A, %d %B %Y')
            return dt.strftime('%Y-%m-%d')
        except Exception:
            pass

    return None


def parse_h3_listing_type(h3_text: str) -> Optional[str]:
    txt = re.sub(r'\s+', ' ', h3_text).strip().lower()
    if 'new submissions' in txt:
        return 'new'
    if 'cross submissions' in txt or 'cross-lists' in txt or 'cross lists' in txt:
        return 'cross'
    if 'replacement submissions' in txt or 'replacements' in txt:
        return 'replace'
    return None


def parse_cli_date_yyyymmdd(s: Optional[str]) -> Optional[str]:
    if not s:
        return None
    t = s.strip()
    if not re.match(r'^\d{8}$', t):
        return None
    try:
        return datetime.datetime.strptime(t, '%Y%m%d').strftime('%Y-%m-%d')
    except Exception:
        return None


def get_output_paths(date_ymd: str):
    date_obj = datetime.datetime.strptime(date_ymd, '%Y-%m-%d')
    yyyymm = date_obj.strftime('%Y%m')
    yyyymmdd = date_obj.strftime('%Y%m%d')
    out_dir = os.path.join('public', 'archive', yyyymm)
    md_filename = os.path.join(out_dir, f'astroph_{date_ymd}.md')
    json_filename = os.path.join(out_dir, f'RAVEN_{yyyymmdd}.json')
    rel_json = os.path.join('archive', yyyymm, f'RAVEN_{yyyymmdd}.json')
    return out_dir, md_filename, json_filename, rel_json


def outputs_exist(date_ymd: str) -> bool:
    try:
        out_dir, md_filename, json_filename, _rel = get_output_paths(date_ymd)
    except Exception:
        return False
    legacy_md = f'astroph_{date_ymd}.md'
    legacy_json = os.path.join('public', f'RAVEN_{datetime.datetime.strptime(date_ymd, "%Y-%m-%d").strftime("%Y%m%d")}.json')
    return (
        os.path.exists(md_filename)
        or os.path.exists(json_filename)
        or os.path.exists(legacy_md)
        or os.path.exists(legacy_json)
    )


def chunk_list(items: list[str], size: int) -> list[list[str]]:
    if size <= 0:
        size = 100
    return [items[i:i + size] for i in range(0, len(items), size)]


def parse_arxiv_id_from_entry_id(entry_id: str) -> Optional[str]:
    if not entry_id:
        return None
    m = re.search(r'(\d{4}\.\d{5})(v\d+)?', entry_id)
    if not m:
        return None
    return m.group(1)


def fetch_bytes_api(opener, url: str, max_retries: int = 6, timeout: int = 30, backoff_base_s: float = 2.0, backoff_max_s: float = 60.0, jitter_s: float = 1.0) -> bytes:
    headers = {
        'User-Agent': 'RAVEN/1.0 (Python/urllib)',
        'Accept': 'application/atom+xml,application/xml;q=0.9,*/*;q=0.8',
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
            if e.code in (429, 500, 502, 503, 504):
                print(f"HTTP {e.code}. Retrying (attempt {attempt+1}/{max_retries})...")
                backoff_sleep(attempt, backoff_base_s, backoff_max_s, jitter_s)
                continue
            raise
        except (URLError, socket.timeout, ConnectionResetError, http.client.IncompleteRead, TimeoutError, OSError) as e:
            last_err = e
            print(f"Error: {e}. Retrying (attempt {attempt+1}/{max_retries})...")
            backoff_sleep(attempt, backoff_base_s, backoff_max_s, jitter_s)
    raise RuntimeError(f"Max retries exceeded: {last_err}")


def fetch_arxiv_api_metadata(opener, ids: list[str], max_retries: int, timeout: int) -> Dict[str, dict]:
    if not ids:
        return {}
    url = f"https://export.arxiv.org/api/query?id_list={','.join(ids)}&max_results={len(ids)}"
    raw = fetch_bytes_api(opener, url, max_retries=max_retries, timeout=timeout).decode('utf-8', errors='replace')
    root = ET.fromstring(raw)

    atom_ns = '{http://www.w3.org/2005/Atom}'
    out: Dict[str, dict] = {}
    for entry in root.findall(f'{atom_ns}entry'):
        entry_id = (entry.findtext(f'{atom_ns}id') or '').strip()
        arxiv_id = parse_arxiv_id_from_entry_id(entry_id)
        if not arxiv_id:
            continue
        title = (entry.findtext(f'{atom_ns}title') or '').strip()
        title = re.sub(r'\s+', ' ', title).strip()
        summary = (entry.findtext(f'{atom_ns}summary') or '').strip()
        summary = re.sub(r'\s+', ' ', summary).strip()
        authors = []
        for a in entry.findall(f'{atom_ns}author'):
            name = (a.findtext(f'{atom_ns}name') or '').strip()
            if name:
                authors.append(name)
        categories = []
        for c in entry.findall(f'{atom_ns}category'):
            term = (c.attrib.get('term') or '').strip()
            if term and term.startswith('astro-ph'):
                categories.append(term)
        out[arxiv_id] = {
            'title': title,
            'summary': summary,
            'authors': authors,
            'categories': categories,
            'url': entry_id.replace('http://', 'https://').replace('https://export.arxiv.org', 'https://arxiv.org'),
        }
    return out


class ArxivListParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.in_h3 = False
        self.h3_text = []
        self.current_date = None
        self.in_dl = False
        self.current_section = None
        self.current_listing_type = None
        self.current_item_listing_type = None
        self.current_dt_text = []
        self.current_id = None
        self.current_title = None
        self.current_authors = []
        self.current_subject_text = []
        self.items = []
        self._capture_text = False
        self._capture_mode = None
        self._author_link = False

    def handle_starttag(self, tag, attrs):
        attrs_dict = dict(attrs)
        if tag == 'h3':
            self.in_h3 = True
            self.h3_text = []
            return

        if tag == 'dl':
            self.in_dl = True
            return

        if not self.in_dl:
            return

        if tag == 'dt':
            self.current_section = 'dt'
            self.current_item_listing_type = None
            self.current_dt_text = []
            return

        if tag == 'dd':
            self.current_section = 'dd'
            return

        if self.current_section == 'dt' and tag == 'a':
            href = attrs_dict.get('href', '')
            m = re.match(r'^/abs/(\d{4}\.\d{5})(v\d+)?$', href)
            if m:
                self.current_id = m.group(1)
            return

        if self.current_section == 'dd' and tag == 'div':
            class_attr = attrs_dict.get('class', '')
            classes = class_attr.split()
            if 'list-title' in classes:
                self._capture_text = True
                self._capture_mode = 'title'
                self.current_title = ''
                return
            if 'list-authors' in classes:
                self._capture_text = True
                self._capture_mode = 'authors'
                self.current_authors = []
                return
            if 'list-subjects' in classes:
                self._capture_text = True
                self._capture_mode = 'subjects'
                self.current_subject_text = []
                return

        if self._capture_mode == 'authors' and tag == 'a':
            self._author_link = True
            return

    def handle_endtag(self, tag):
        if tag == 'h3' and self.in_h3:
            txt = ''.join(self.h3_text)
            dt = parse_h3_any_date(txt)
            if dt:
                self.current_date = dt
            listing_type = parse_h3_listing_type(txt)
            if listing_type:
                self.current_listing_type = listing_type
            self.in_h3 = False
            return

        if tag == 'dl' and self.in_dl:
            self.in_dl = False
            return

        if not self.in_dl:
            return

        if tag == 'div' and self._capture_text:
            if self._capture_mode == 'title':
                if self.current_id and self.current_title:
                    title = self.current_title.strip()
                    title = re.sub(r'^\s*Title:\s*', '', title, flags=re.IGNORECASE).strip()
                    self.current_title = title
            self._capture_text = False
            self._capture_mode = None
            self._author_link = False
            return

        if tag == 'a' and self._author_link:
            self._author_link = False
            return

        if tag == 'dd':
            effective_listing_type = self.current_item_listing_type or self.current_listing_type or 'new'
            if self.current_id and effective_listing_type in ('new', 'cross'):
                title = self.current_title or ''
                subjects_raw = ' '.join(self.current_subject_text).strip()
                subjects_raw = re.sub(r'\s+', ' ', subjects_raw)
                subjects_raw = re.sub(r'^\s*Subjects:\s*', '', subjects_raw, flags=re.IGNORECASE).strip()
                category_codes = []
                for code in re.findall(r'\(([^)]+)\)', subjects_raw):
                    if code.startswith('astro-ph'):
                        category_codes.append(code)
                self.items.append({
                    'id': self.current_id,
                    'title': title,
                    'authors': self.current_authors,
                    'categories': category_codes,
                    'date': self.current_date,
                    'listing_type': effective_listing_type,
                })
            self.current_section = None
            self.current_item_listing_type = None
            self.current_dt_text = []
            self.current_id = None
            self.current_title = None
            self.current_authors = []
            self.current_subject_text = []

    def handle_data(self, data):
        if self.in_h3:
            self.h3_text.append(data)
            return

        if self.current_section == 'dt':
            t = data.strip()
            if t:
                self.current_dt_text.append(t)
                lower_t = t.lower()
                if 'cross-list from' in lower_t or 'cross list from' in lower_t:
                    self.current_item_listing_type = 'cross'
                elif 'replaced' in lower_t or 'replacement' in lower_t:
                    self.current_item_listing_type = 'replace'
            return

        if not self._capture_text:
            return

        if self._capture_mode == 'title':
            self.current_title = (self.current_title or '') + data
            return

        if self._capture_mode == 'authors':
            if self._author_link:
                name = data.strip()
                if name:
                    self.current_authors.append(name)
            return

        if self._capture_mode == 'subjects':
            t = data.strip()
            if t:
                self.current_subject_text.append(t)


class ArxivAbstractParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.in_blockquote = False
        self.capture = False
        self.parts = []

    def handle_starttag(self, tag, attrs):
        if tag != 'blockquote':
            return
        attrs_dict = dict(attrs)
        class_attr = attrs_dict.get('class', '')
        if 'abstract' in class_attr.split():
            self.in_blockquote = True
            self.capture = True
            self.parts = []

    def handle_endtag(self, tag):
        if tag == 'blockquote' and self.in_blockquote:
            self.in_blockquote = False
            self.capture = False

    def handle_data(self, data):
        if not self.capture:
            return
        t = data.strip()
        if t:
            self.parts.append(t)

    def get_abstract(self):
        txt = ' '.join(self.parts)
        txt = re.sub(r'\s+', ' ', txt).strip()
        txt = re.sub(r'^\s*Abstract:\s*', '', txt, flags=re.IGNORECASE).strip()
        return txt


def safe_mkdir(path: str):
    os.makedirs(path, exist_ok=True)


def read_text_file(path: str) -> Optional[str]:
    try:
        with open(path, 'r', encoding='utf-8') as f:
            return f.read()
    except Exception:
        return None


def write_text_file(path: str, content: str):
    safe_mkdir(os.path.dirname(path))
    with open(path, 'w', encoding='utf-8') as f:
        f.write(content)


def backoff_sleep(attempt: int, base_s: float, max_s: float, jitter_s: float):
    t = min(base_s * (2 ** attempt), max_s)
    if jitter_s > 0:
        t += random.uniform(0, jitter_s)
    time.sleep(t)


def resolve_ca_bundle_path(cli_ca_bundle: Optional[str]) -> Optional[str]:
    if cli_ca_bundle:
        return cli_ca_bundle
    env_path = os.environ.get('RAVEN_SSL_CA_BUNDLE') or os.environ.get('SSL_CERT_FILE')
    if env_path:
        return env_path
    try:
        import certifi
        return certifi.where()
    except Exception:
        return None


def create_ssl_context(ca_bundle_path: Optional[str], insecure: bool) -> ssl.SSLContext:
    if insecure:
        return ssl._create_unverified_context()
    if ca_bundle_path:
        return ssl.create_default_context(cafile=ca_bundle_path)
    return ssl.create_default_context()


def create_opener(ca_bundle_path: Optional[str], insecure: bool):
    ctx = create_ssl_context(ca_bundle_path, insecure)
    return urllib.request.build_opener(urllib.request.HTTPSHandler(context=ctx))


def fetch_bytes(opener, url: str, max_retries: int = 6, timeout: int = 30, backoff_base_s: float = 2.0, backoff_max_s: float = 60.0, jitter_s: float = 1.0) -> bytes:
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
                backoff_sleep(attempt, backoff_base_s, backoff_max_s, jitter_s)
                continue
            raise
        except (URLError, socket.timeout, ConnectionResetError, http.client.IncompleteRead, TimeoutError, OSError) as e:
            last_err = e
            print(f"Error: {e}. Retrying (attempt {attempt+1}/{max_retries})...")
            backoff_sleep(attempt, backoff_base_s, backoff_max_s, jitter_s)
    raise RuntimeError(f"Max retries exceeded: {last_err}")


def parse_listing_date(h3_text: str) -> Optional[str]:
    return parse_h3_any_date(h3_text)


def normalize_delay_s(base_s: float, jitter_s: float) -> float:
    if base_s < 0:
        base_s = 0
    if jitter_s < 0:
        jitter_s = 0
    if jitter_s == 0:
        return base_s
    return base_s + random.uniform(0, jitter_s)


def load_resume_cache(cache_path: str) -> Dict[str, str]:
    txt = read_text_file(cache_path)
    if not txt:
        return {}
    try:
        data = json.loads(txt)
        if isinstance(data, dict):
            return {k: v for k, v in data.items() if isinstance(k, str) and isinstance(v, str)}
    except Exception:
        pass
    return {}


def save_resume_cache(cache_path: str, data: Dict[str, str]):
    safe_mkdir(os.path.dirname(cache_path))
    with open(cache_path, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def fetch_latest_from_list(
    max_papers: Optional[int] = None,
    target_date: Optional[str] = None,
    delay_base_s: float = 1.2,
    delay_jitter_s: float = 0.8,
    use_api: bool = True,
    api_batch_size: int = 100,
    api_delay_s: float = 3.2,
    max_retries: int = 6,
    timeout: int = 30,
    cache_dir: str = '.cache_raven_arxiv',
    use_cache: bool = True,
    resume: bool = True,
    ca_bundle: Optional[str] = None,
    insecure: bool = False,
):
    url = 'https://arxiv.org/list/astro-ph/new?show=2000'
    if target_date:
        url = 'https://arxiv.org/list/astro-ph/pastweek?show=2000'
    print(f"Fetching daily updates from arXiv list page... ({url})")
    opener = create_opener(ca_bundle, insecure)
    html = fetch_bytes(opener, url, max_retries=max_retries, timeout=timeout).decode('utf-8', errors='replace')

    parser = ArxivListParser()
    parser.feed(html)
    latest_date = target_date or parser.current_date or datetime.datetime.now().strftime('%Y-%m-%d')

    items = parser.items
    if target_date:
        items = [it for it in items if it.get('date') == target_date]
    if max_papers is not None:
        items = items[:max_papers]

    papers = []
    subjects_counter = collections.Counter()

    abs_cache_dir = os.path.join(cache_dir, 'abs')
    resume_cache_path = os.path.join(cache_dir, f'resume_{latest_date.replace("-", "")}.json')
    cached_map = load_resume_cache(resume_cache_path) if resume else {}

    id_order = [it['id'] for it in items if it.get('id')]
    cached_summary: Dict[str, str] = {}
    for arxiv_id in id_order:
        cache_path = os.path.join(abs_cache_dir, f'{arxiv_id}.txt')
        if resume and arxiv_id in cached_map:
            cached_summary[arxiv_id] = cached_map[arxiv_id]
        elif use_cache:
            cached_text = read_text_file(cache_path)
            if cached_text is not None:
                cached_summary[arxiv_id] = cached_text.strip()

    api_meta: Dict[str, dict] = {}
    missing_ids = [i for i in id_order if cached_summary.get(i, '') == '']
    if use_api and missing_ids:
        batches = chunk_list(missing_ids, api_batch_size)
        for bi, batch in enumerate(batches, 1):
            if bi > 1 and api_delay_s > 0:
                time.sleep(api_delay_s)
            try:
                meta = fetch_arxiv_api_metadata(opener, batch, max_retries=max_retries, timeout=timeout)
                api_meta.update(meta)
                for mid in batch:
                    if mid in meta and meta[mid].get('summary'):
                        cached_summary[mid] = meta[mid]['summary']
                        if use_cache:
                            write_text_file(os.path.join(abs_cache_dir, f'{mid}.txt'), cached_summary[mid])
                        if resume:
                            cached_map[mid] = cached_summary[mid]
            except Exception as e:
                print(f"Failed to fetch arXiv API batch ({bi}/{len(batches)}): {e}")

    for idx, item in enumerate(items, 1):
        arxiv_id = item['id']
        abs_url = f'https://arxiv.org/abs/{arxiv_id}'

        summary = cached_summary.get(arxiv_id, '')
        if summary == '' and not use_api:
            delay_s = normalize_delay_s(delay_base_s, delay_jitter_s)
            if delay_s > 0:
                time.sleep(delay_s)
            try:
                abs_html = fetch_bytes(opener, abs_url, max_retries=max_retries, timeout=timeout).decode('utf-8', errors='replace')
                abs_parser = ArxivAbstractParser()
                abs_parser.feed(abs_html)
                summary = abs_parser.get_abstract()
                if use_cache and summary:
                    write_text_file(os.path.join(abs_cache_dir, f'{arxiv_id}.txt'), summary)
                if resume:
                    cached_map[arxiv_id] = summary
                    if idx % 10 == 0:
                        save_resume_cache(resume_cache_path, cached_map)
            except Exception as e:
                print(f"Failed to fetch abstract for {arxiv_id}: {e}")
                summary = ''

        meta = api_meta.get(arxiv_id, {})
        title = (meta.get('title') or item.get('title') or '').strip()
        authors = meta.get('authors') or item.get('authors') or []
        cats = meta.get('categories') or item.get('categories') or []

        for cat in cats:
            subjects_counter[cat] += 1

        papers.append({
            'title': title,
            'authors': authors,
            'summary': summary,
            'categories': cats,
            'url': abs_url
        })

    if resume:
        save_resume_cache(resume_cache_path, cached_map)

    return papers, subjects_counter, latest_date


def save_to_markdown_and_json(papers, subjects_counter, latest_date):
    if not papers:
        print("No papers found.")
        return

    if outputs_exist(latest_date):
        print(f"Skip: outputs already exist for {latest_date}.")
        return

    out_dir, md_filename, json_filename, rel_json = get_output_paths(latest_date)
    os.makedirs(out_dir, exist_ok=True)

    with open(md_filename, 'w', encoding='utf-8') as f:
        f.write(f'# arXiv astro-ph 最新论文汇总 ({latest_date})\n\n')
        f.write(f"**生成时间:** {datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n\n")

        f.write('## 数据统计\n')
        f.write(f"- **今日文章总数:** {len(papers)} 篇\n")
        f.write("- **子领域数量分布:**\n")
        for cat, count in subjects_counter.most_common():
            f.write(f"  - `{cat}`: {count} 篇\n")
        f.write('\n')

        f.write('## 论文详细信息\n\n')
        for i, p in enumerate(papers, 1):
            f.write(f"### {i}. {p['title']}\n")
            f.write(f"- **作者:** {', '.join(p['authors'])}\n")
            f.write(f"- **分类:** {', '.join(p['categories'])}\n")
            f.write(f"- **链接:** {p['url']}\n")
            f.write(f"- **摘要:** {p['summary']}\n\n")

    print(f"Successfully saved {len(papers)} papers for {latest_date} to {md_filename}.")

    data = {
        "date": latest_date,
        "total": len(papers),
        "subjects_counter": dict(subjects_counter.most_common()),
        "papers": papers
    }
    with open(json_filename, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

    print(f"Successfully saved JSON data to {json_filename}.")

    index_filename = os.path.join('public', 'latest.json')
    with open(index_filename, 'w', encoding='utf-8') as f:
        json.dump({"latest_file": rel_json}, f)

    print("\n" + "="*50)
    print("【下一步操作指南】")
    print(f"数据已保存至 {md_filename} 以及 {json_filename}。")
    print("你可以通过启动本地服务器，在网页中查看并使用 AI 进行深度阅读！")
    print("="*50 + "\n")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--date', type=str, default=None, help='YYYYMMDD, e.g. 20260429')
    ap.add_argument('--max-papers', type=int, default=None)
    ap.add_argument('--delay', type=float, default=None)
    ap.add_argument('--delay-base', type=float, default=1.2)
    ap.add_argument('--delay-jitter', type=float, default=0.8)
    ap.add_argument('--no-api', action='store_true', help='Disable arXiv API batching; fall back to per-paper /abs scraping')
    ap.add_argument('--api-batch-size', type=int, default=100)
    ap.add_argument('--api-delay', type=float, default=3.2)
    ap.add_argument('--max-retries', type=int, default=6)
    ap.add_argument('--timeout', type=int, default=30)
    ap.add_argument('--cache-dir', type=str, default='.cache_raven_arxiv')
    ap.add_argument('--no-cache', action='store_true')
    ap.add_argument('--no-resume', action='store_true')
    ap.add_argument('--ca-bundle', type=str, default=None)
    ap.add_argument('--insecure', action='store_true')
    args = ap.parse_args()

    target_date = parse_cli_date_yyyymmdd(args.date)
    if args.date and not target_date:
        raise SystemExit("Invalid --date. Expected YYYYMMDD, e.g. 20260429")

    if target_date:
        if outputs_exist(target_date):
            print(f"Skip: outputs already exist for {target_date}.")
            return
    else:
        ca_bundle = resolve_ca_bundle_path(args.ca_bundle)
        opener = create_opener(ca_bundle, args.insecure)
        try:
            html = fetch_bytes(opener, 'https://arxiv.org/list/astro-ph/new?show=2000', max_retries=args.max_retries, timeout=args.timeout).decode('utf-8', errors='replace')
            parser = ArxivListParser()
            parser.feed(html)
            latest_guess = parser.current_date or datetime.datetime.now().strftime('%Y-%m-%d')
            if outputs_exist(latest_guess):
                print(f"Skip: outputs already exist for {latest_guess}.")
                return
        except Exception as e:
            print(f"Warning: failed to detect latest date before fetching: {e}")

    delay_base_s = args.delay_base
    if args.delay is not None:
        delay_base_s = args.delay

    ca_bundle = resolve_ca_bundle_path(args.ca_bundle)
    papers, counter, latest_date = fetch_latest_from_list(
        target_date=target_date,
        max_papers=args.max_papers,
        delay_base_s=delay_base_s,
        delay_jitter_s=args.delay_jitter,
        use_api=not args.no_api,
        api_batch_size=args.api_batch_size,
        api_delay_s=args.api_delay,
        max_retries=args.max_retries,
        timeout=args.timeout,
        cache_dir=args.cache_dir,
        use_cache=not args.no_cache,
        resume=not args.no_resume,
        ca_bundle=ca_bundle,
        insecure=args.insecure,
    )
    save_to_markdown_and_json(papers, counter, latest_date)


if __name__ == '__main__':
    main()
