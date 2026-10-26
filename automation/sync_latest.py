#!/usr/bin/env python3
"""同步 public/latest.json：扫描 public/ 下最新的 RAVEN_YYYYMMDD.json 并写入索引。

前端启动时读取 public/latest.json 的 latest_file 字段来加载当天数据。
抓取脚本本身也会写这个文件；本脚本作为兜底，保证多来源/补抓数据后
latest.json 始终指向日期最新的那份数据。

用法：python3 automation/sync_latest.py
退出码：0 成功（含内容未变化的跳过）；1 未找到任何 RAVEN 数据文件。
"""

import json
import os
import re
import sys


def main() -> int:
    project_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    public_dir = os.path.join(project_dir, 'public')
    if not os.path.isdir(public_dir):
        print('WARN: public/ 目录不存在，latest.json 未修改')
        return 1

    pattern = re.compile(r'^RAVEN_(\d{8})\.json$')
    candidates = []
    for root, _dirs, files in os.walk(public_dir):
        for name in files:
            match = pattern.match(name)
            if not match:
                continue
            full_path = os.path.join(root, name)
            rel_path = os.path.relpath(full_path, public_dir).replace(os.sep, '/')
            candidates.append((match.group(1), rel_path))

    if not candidates:
        latest_path = os.path.join(public_dir, 'latest.json')
        if os.path.exists(latest_path):
            # 避免 latest.json 悬空指向已被删除的数据文件
            try:
                os.remove(latest_path)
                print('WARN: 未找到任何 RAVEN_*.json，已删除失效的 latest.json')
            except OSError:
                print('WARN: 未找到任何 RAVEN_*.json，且无法删除 latest.json')
        else:
            print('WARN: 未找到任何 RAVEN_*.json，latest.json 未修改')
        return 1

    candidates.sort()
    latest_date, latest_rel = candidates[-1]
    latest_path = os.path.join(public_dir, 'latest.json')
    desired = {'latest_file': latest_rel}

    current = None
    try:
        with open(latest_path, encoding='utf-8') as fh:
            current = json.load(fh)
    except Exception:
        current = None

    if current == desired:
        print(f'latest.json 已指向最新文件：{latest_rel}（{latest_date}）')
        return 0

    with open(latest_path, 'w', encoding='utf-8') as fh:
        json.dump(desired, fh, ensure_ascii=False, indent=2)
        fh.write('\n')
    print(f'latest.json -> {latest_rel}（{latest_date}）')
    return 0


if __name__ == '__main__':
    sys.exit(main())
