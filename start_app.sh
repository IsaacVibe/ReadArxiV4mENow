#!/usr/bin/env bash

# 获取当前脚本所在目录
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$DIR"

# 1. 运行 Python 脚本抓取最新数据
echo "Fetching latest arXiv papers..."
python fetch_arxiv.py

# 2. 检查是否有已经运行的 Vite 开发服务器，如果没有则启动
if ! lsof -i :5173 > /dev/null; then
    echo "Starting Vite dev server..."
    npm run dev &
    # 等待服务器启动
    sleep 2
else
    echo "Vite dev server is already running on port 5173."
fi

# 3. 使用默认浏览器打开网页
echo "Opening arXiv LLM Explorer in your browser..."
open http://localhost:5173/
