import urllib.request
from urllib.error import HTTPError
import xml.etree.ElementTree as ET
import collections
import datetime
import os
import time
import json
import email.utils
import ssl
import argparse
from typing import Optional

def parse_cli_date_yyyymmdd(s: Optional[str]) -> Optional[str]:
    if not s:
        return None
    t = s.strip()
    if not t.isdigit() or len(t) != 8:
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


def build_https_opener(ca_bundle_path: Optional[str], insecure: bool):
    ctx = create_ssl_context(ca_bundle_path, insecure)
    return urllib.request.build_opener(urllib.request.HTTPSHandler(context=ctx))


def fetch_latest_arxiv(opener):
    # 使用 arXiv RSS 获取最新的 astro-ph 每日更新论文
    url = 'https://rss.arxiv.org/rss/astro-ph'
    print(f"Fetching daily updates from arXiv RSS...")
    
    headers = {
        'User-Agent': 'DailyArxivBot/1.0 (Python/urllib)'
    }
    req = urllib.request.Request(url, headers=headers)
    
    max_retries = 3
    xml_data = None
    
    for attempt in range(max_retries):
        try:
            with opener.open(req) as response:
                xml_data = response.read()
            break
        except HTTPError as e:
            if e.code == 429:
                wait_time = (attempt + 1) * 3
                print(f"HTTP Error 429: Too Many Requests. Retrying in {wait_time} seconds (attempt {attempt+1}/{max_retries})...")
                time.sleep(wait_time)
            else:
                print(f"HTTP Error fetching data: {e}")
                return [], collections.Counter(), None
        except Exception as e:
            print(f"Error fetching data: {e}")
            return [], collections.Counter(), None
            
    if xml_data is None:
        print("Max retries exceeded. Failed to fetch data.")
        return [], collections.Counter(), None

    root = ET.fromstring(xml_data)
    channel = root.find('channel')
    
    # 提取发布日期
    pub_date_str = channel.find('pubDate').text
    parsed_tuple = email.utils.parsedate_tz(pub_date_str)
    if parsed_tuple:
        latest_date = datetime.datetime(*parsed_tuple[:6]).strftime('%Y-%m-%d')
    else:
        latest_date = datetime.datetime.now().strftime('%Y-%m-%d')
    
    papers = []
    subjects_counter = collections.Counter()
    
    for item in channel.findall('item'):
        # 过滤掉 replace 更新，只保留新发布 (new) 和跨领域发布 (cross) 的文章
        announce_type_elem = item.find('{http://arxiv.org/schemas/atom}announce_type')
        announce_type = announce_type_elem.text if announce_type_elem is not None else ''
        if announce_type not in ('new', 'cross'):
            continue
            
        title = item.find('title').text.replace('\n', ' ').strip()
        id_url = item.find('link').text.strip()
        
        # 提取摘要，移除 arXiv RSS 默认的前缀
        desc = item.find('description').text or ''
        summary = desc.split('Abstract:', 1)[-1].strip().replace('\n', ' ')
        
        # 提取作者
        creator_elem = item.find('{http://purl.org/dc/elements/1.1/}creator')
        if creator_elem is not None and creator_elem.text:
            # RSS 中的作者通常是逗号分隔的字符串，并且带有机构信息，例如: "Author Name (Institution)"
            authors = [a.strip() for a in creator_elem.text.split(',')]
        else:
            authors = []
            
        # 提取分类
        cats = [c.text for c in item.findall('category') if c.text and c.text.startswith('astro-ph')]
        
        for cat in cats:
            subjects_counter[cat] += 1
            
        papers.append({
            'title': title,
            'authors': authors,
            'summary': summary,
            'categories': cats,
            'url': id_url
        })
        
    return papers, subjects_counter, latest_date

def save_to_markdown_and_json(papers, subjects_counter, latest_date):
    if not papers:
        print("No papers found.")
        return

    # 保存为 Markdown
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
    
    # 保存为 JSON，供前端 Web App 使用
    data = {
        "date": latest_date,
        "total": len(papers),
        "subjects_counter": dict(subjects_counter.most_common()),
        "papers": papers
    }
    with open(json_filename, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
        
    print(f"Successfully saved JSON data to {json_filename}.")
    
    # 将最新的文件名写入一个索引文件，供前端应用启动时读取
    index_filename = os.path.join('public', 'latest.json')
    with open(index_filename, 'w', encoding='utf-8') as f:
        json.dump({"latest_file": rel_json}, f)

    print("\n" + "="*50)
    print("【下一步操作指南】")
    print(f"数据已保存至 {md_filename} 以及 {json_filename}。")
    print("你可以通过启动本地服务器，在网页中查看并使用 AI 进行深度阅读！")
    print("="*50 + "\n")

if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('--date', type=str, default=None, help='YYYYMMDD, e.g. 20260429')
    ap.add_argument('--ca-bundle', type=str, default=None)
    ap.add_argument('--insecure', action='store_true')
    args = ap.parse_args()

    ca_bundle = resolve_ca_bundle_path(args.ca_bundle)
    opener = build_https_opener(ca_bundle, args.insecure)

    target_date = parse_cli_date_yyyymmdd(args.date)
    if args.date and not target_date:
        raise SystemExit("Invalid --date. Expected YYYYMMDD, e.g. 20260429")

    if target_date and outputs_exist(target_date):
        print(f"Skip: outputs already exist for {target_date}.")
        raise SystemExit(0)

    if target_date:
        from fetch_arxiv_list import fetch_latest_from_list
        papers, counter, latest_date = fetch_latest_from_list(
            target_date=target_date,
            max_papers=None,
            delay_base_s=1.2,
            delay_jitter_s=0.8,
            max_retries=6,
            timeout=30,
            cache_dir='.cache_raven_arxiv',
            use_cache=True,
            resume=True,
            ca_bundle=ca_bundle,
            insecure=args.insecure,
        )
    else:
        papers, counter, latest_date = fetch_latest_arxiv(opener)
        if outputs_exist(latest_date):
            print(f"Skip: outputs already exist for {latest_date}.")
            raise SystemExit(0)
    save_to_markdown_and_json(papers, counter, latest_date)
