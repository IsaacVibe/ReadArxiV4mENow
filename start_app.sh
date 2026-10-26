#!/usr/bin/env bash
# =============================================================================
# RAVEN 一键启动脚本（被 ArxivExplorer.app / ArxivExplorer.applescript 调用）
#
# 逻辑：优先使用 launchd 已抓好的今日数据；只有今天的数据缺失/不完整时才自行抓取。
#   1. 检测 public/archive/YYYYMM/RAVEN_YYYYMMDD.json（北京日期）是否存在且摘要完整；
#   2. 若 launchd 正在抓取，最多等待 180 秒；
#   3. 仍然没有 → 调用 automation/run_daily.sh 做一次快速抓取（1 次尝试，短超时）；
#   4. 同步 public/latest.json，启动/复用 Vite，打开网页。
#
# 可选环境变量（主要用于调试/测试）：
#   RAVEN_NO_SERVER=1   不启动 Vite
#   RAVEN_NO_OPEN=1     不打开浏览器
# =============================================================================

set -u

DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$DIR" || exit 1

PY="${RAVEN_PYTHON:-python3}"
if [ -z "${RAVEN_PYTHON:-}" ] && [ -x "$DIR/.venv/bin/python3" ]; then
    PY="$DIR/.venv/bin/python3"
fi
command -v "$PY" >/dev/null 2>&1 || PY="/usr/bin/python3"

export TZ="${RAVEN_TZ:-Asia/Shanghai}"
TODAY_YMD="$(TZ=Asia/Shanghai date +%Y%m%d)"
TODAY_YM="$(TZ=Asia/Shanghai date +%Y%m)"
TODAY_JSON="public/archive/$TODAY_YM/RAVEN_${TODAY_YMD}.json"
LEGACY_JSON="public/RAVEN_${TODAY_YMD}.json"

# 今日数据是否已存在且摘要完整（>=80% 非空摘要）
today_data_ok() {
    local f="$TODAY_JSON"
    [ -s "$f" ] || f="$LEGACY_JSON"
    [ -s "$f" ] || return 1
    "$PY" - "$f" <<'PY' >/dev/null 2>&1
import json
import sys

try:
    with open(sys.argv[1], encoding='utf-8') as fh:
        data = json.load(fh)
except Exception:
    sys.exit(1)

papers = data.get('papers') if isinstance(data, dict) else None
if not papers:
    sys.exit(1)

filled = sum(1 for p in papers if (p.get('summary') or '').strip())
sys.exit(0 if filled / len(papers) >= 0.8 else 1)
PY
}

# 如果 launchd 的抓取正在进行，最多等 180 秒，避免重复抓取、也避免打开旧数据
wait_for_launchd_if_running() {
    local waited=0
    while [ "$waited" -lt 180 ]; do
        if ! pgrep -f "automation/run_daily.sh" >/dev/null 2>&1; then
            return 0
        fi
        if [ "$waited" -eq 0 ]; then
            echo "⏳ 检测到 launchd 正在抓取今日数据，最多等待 180 秒..."
        fi
        sleep 5
        waited=$((waited + 5))
        if today_data_ok; then
            return 0
        fi
    done
    echo "⚠️ launchd 抓取仍在进行，先打开最近一次数据（稍后刷新即可看到今天的结果）。"
    return 0
}

if today_data_ok; then
    echo "✅ 检测到 launchd 已抓取今日（${TODAY_YMD}）数据，跳过爬取。"
else
    wait_for_launchd_if_running
    if today_data_ok; then
        echo "✅ launchd 已完成今日（${TODAY_YMD}）抓取，跳过爬取。"
    else
        echo "⏳ 今日（${TODAY_YMD}）数据缺失或不完整，自行抓取一次（快速模式；失败则打开最近一次数据）..."
        RAVEN_MAX_ATTEMPTS=1 \
        RAVEN_RETRY_DELAY_S=0 \
        RAVEN_FETCH_MAX_RETRIES=2 \
        RAVEN_FETCH_TIMEOUT=20 \
        RAVEN_NOTIFY=0 \
            bash automation/run_daily.sh || true
        if today_data_ok; then
            echo "✅ 自行抓取今日数据完成。"
        else
            echo "⚠️ 未能获取今日数据（arXiv 可能尚未发布），将打开最近一次数据。"
        fi
    fi
fi

# 同步 public/latest.json，保证前端指向最新文件
if ! "$PY" automation/sync_latest.py; then
    echo "⚠️ 同步 latest.json 失败，继续尝试打开网页。"
fi

# 打印即将打开的数据版本，便于确认用的是 launchd 的结果
"$PY" - <<'PY' || true
import json
try:
    d = json.load(open('public/latest.json', encoding='utf-8'))
    print(f"📄 当前数据: {d.get('latest_file')}")
except Exception:
    print("📄 当前数据: (无 latest.json)")
PY

# 启动/复用 Vite 开发服务器
SERVER_READY=0
if [ "${RAVEN_NO_SERVER:-0}" = "1" ]; then
    echo "（RAVEN_NO_SERVER=1，跳过启动 Vite）"
elif ! command -v npm >/dev/null 2>&1; then
    echo "⚠️ 未找到 npm（网页需要 Node.js 20.19+ 或 22.12+）。抓取数据已准备好，但无法启动网页。"
    echo "   安装 Node.js 后在本目录执行：npm install"
elif [ ! -d node_modules ]; then
    echo "⚠️ 未找到 node_modules（前端依赖未安装），跳过启动网页。"
    echo "   请在本目录执行：npm install"
elif lsof -i :5173 >/dev/null 2>&1; then
    echo "Vite dev server is already running on port 5173."
    SERVER_READY=1
else
    echo "Starting Vite dev server..."
    npm run dev &
    for i in $(seq 1 20); do
        sleep 1
        if lsof -i :5173 >/dev/null 2>&1; then
            SERVER_READY=1
            break
        fi
    done
    if [ "$SERVER_READY" = "1" ]; then
        echo "Vite dev server is ready on port 5173."
    else
        echo "⚠️ Vite 启动失败（端口 5173 未监听）。请在本目录执行 npm run dev 查看具体报错。"
        echo "   Node: $(node -v 2>/dev/null || echo 未安装) | npm: $(npm -v 2>/dev/null || echo 未安装)"
    fi
fi

# 打开网页
if [ "${RAVEN_NO_OPEN:-0}" = "1" ]; then
    echo "（RAVEN_NO_OPEN=1，跳过打开浏览器）"
elif [ "$SERVER_READY" = "1" ]; then
    echo "Opening arXiv LLM Explorer in your browser..."
    open http://localhost:5173/
else
    echo "（网页服务未就绪，跳过打开浏览器；抓取数据不受影响）"
fi
