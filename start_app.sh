#!/usr/bin/env bash

# 获取当前脚本所在目录
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$DIR" || exit 1

RAVEN_PYTHON=python3
if [ -x "$DIR/.venv/bin/python3" ]; then
    RAVEN_PYTHON="$DIR/.venv/bin/python3"
fi

# 1. 安全抓取最新数据（若已存在则跳过，不覆盖）
echo "Fetching latest arXiv papers (safe mode)..."
"$RAVEN_PYTHON" fetch_arxiv_list.py

# 2. 启动前主动扫描已爬取数据，写入 public/latest.json 指向最新文件（避免 latest.json 失效）
"$RAVEN_PYTHON" - <<'PY'
import json
import os
import re

root = os.path.join('public')
paths = []

for dirpath, dirnames, filenames in os.walk(root):
    for fn in filenames:
        m = re.match(r'^RAVEN_(\d{8})\.json$', fn)
        if not m:
            continue
        full = os.path.join(dirpath, fn)
        rel = os.path.relpath(full, root).replace(os.sep, '/')
        paths.append((m.group(1), rel))

if paths:
    paths.sort()
    latest = paths[-1][1]
    with open(os.path.join(root, 'latest.json'), 'w', encoding='utf-8') as f:
        json.dump({'latest_file': latest}, f, ensure_ascii=False, indent=2)
PY

# 3. 检查是否有已经运行的 Vite 开发服务器，如果没有则启动
if ! lsof -i :5173 > /dev/null; then
    echo "Starting Vite dev server..."
    npm run dev &
    # 等待服务器启动
    sleep 2
else
    echo "Vite dev server is already running on port 5173."
fi

# 4. 使用默认浏览器打开网页
echo "Opening arXiv LLM Explorer in your browser..."
open http://localhost:5173/
