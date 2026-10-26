#!/bin/bash
# =============================================================================
# 在新 Mac（例如 Mac mini）上快速部署 RAVEN 自动抓取
#
#   bash automation/setup_new_mac.sh            # 只部署自动抓取
#   bash automation/setup_new_mac.sh --with-web # 同时安装网页依赖（npm install）
#
# 它会：
#   1. 检查 macOS / Python 3.9+；
#   2. 按需安装 requirements.txt（certifi）；
#   3. 调用 automation/install.sh 生成启动器 Applet 并注册 launchd 任务；
#   4. 重新编译 ArxivExplorer.app（自动定位本机项目路径，不写死用户名）；
#   5. 可选：--with-web 安装前端依赖；
#   6. 打印首次授权与后续使用说明。
#
# 只做抓取不需要 Node.js / node_modules；需要网页界面时加 --with-web 或手动 npm install。
# =============================================================================

set -u

WITH_WEB=0
for arg in "$@"; do
    case "$arg" in
        --with-web) WITH_WEB=1 ;;
        -h|--help)
            echo "用法: bash automation/setup_new_mac.sh [--with-web]"
            echo "  --with-web  同时执行 npm install 安装网页依赖（需要 Node.js 20.19+ 或 22.12+）"
            exit 0
            ;;
        *) echo "未知参数: $arg"; exit 2 ;;
    esac
done

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_DIR" || { echo "ERROR: 无法进入项目目录 $PROJECT_DIR"; exit 1; }

echo "=========================================================="
echo "RAVEN 自动抓取部署（新 Mac）"
echo "项目目录: $PROJECT_DIR"
echo "=========================================================="

if [ "$(uname -s)" != "Darwin" ]; then
    echo "ERROR: 本脚本只支持 macOS；Linux 请参考 automation/crontab.example"
    exit 1
fi

PY="${RAVEN_PYTHON:-python3}"
if ! command -v "$PY" >/dev/null 2>&1; then
    if [ -x /usr/bin/python3 ]; then
        PY="/usr/bin/python3"
    else
        echo "ERROR: 未找到 python3，请先安装 Python 3.9+"
        exit 1
    fi
fi
if ! "$PY" -c 'import sys; sys.exit(0 if sys.version_info >= (3, 9) else 1)' 2>/dev/null; then
    echo "ERROR: Python 版本过低（需要 3.9+）：$PY"
    exit 1
fi
echo "Python: $PY ($("$PY" --version 2>&1))"

if ! "$PY" -c 'import certifi' 2>/dev/null; then
    echo "提示: 未检测到 certifi，尝试安装 requirements.txt ..."
    "$PY" -m pip install --user -q -r requirements.txt 2>/dev/null \
        || echo "WARN: 自动安装失败，可稍后手动执行：$PY -m pip install -r requirements.txt"
fi

echo
echo ">>> 安装 launchd 任务与启动器 Applet"
if ! bash "$SCRIPT_DIR/install.sh"; then
    echo "ERROR: 安装失败，请查看上面的错误信息"
    exit 1
fi

echo
echo ">>> 重新生成 ArxivExplorer.app（自动定位本机项目目录）"
if command -v osacompile >/dev/null 2>&1; then
    rm -rf "$PROJECT_DIR/ArxivExplorer.app"
    if osacompile -o "$PROJECT_DIR/ArxivExplorer.app" "$PROJECT_DIR/ArxivExplorer.applescript" >/dev/null 2>&1; then
        echo "    已生成: $PROJECT_DIR/ArxivExplorer.app"
    else
        echo "    WARN: 生成失败，可手动执行：osacompile -o ArxivExplorer.app ArxivExplorer.applescript"
    fi
else
    echo "    WARN: 未找到 osacompile，跳过启动器生成"
fi

if [ "$WITH_WEB" = "1" ]; then
    echo
    echo ">>> 安装网页依赖（npm install）"
    if command -v npm >/dev/null 2>&1; then
        if ( cd "$PROJECT_DIR" && npm install ); then
            echo "    网页依赖安装完成（node $(node -v 2>/dev/null || echo '?')）"
        else
            echo "    WARN: npm install 失败，请在本目录手动执行 npm install 查看报错"
        fi
    else
        echo "    WARN: 未找到 node/npm，请先安装 Node.js 20.19+ 或 22.12+：https://nodejs.org/"
    fi
fi

echo
echo "=========================================================="
echo "下一步："
echo "1. 第一次触发（10:30 或手动 bash automation/install.sh --run-now）时，"
echo "   系统会询问「RAVENAutomation 想要访问你的桌面文件夹」，点「允许」即可。"
echo "2. 以后每个工作日 10:30 自动抓取，完成后弹出系统通知汇报结果。"
if [ "$WITH_WEB" = "1" ]; then
    echo "3. 网页依赖已安装：双击 ArxivExplorer.app 即可抓取（如需要）+ 启动网页。"
else
    echo "3. 网页需要 Node.js 20.19+ 或 22.12+ 与前端依赖：先 bash automation/setup_new_mac.sh --with-web，"
    echo "   或在本目录执行 npm install；只抓取可忽略。"
fi
echo "4. 双击 ArxivExplorer.app 可打开网页；启动器会自动定位项目目录（已不再写死用户名）。"
echo "5. 缓存清理：bash automation/clean_cache.sh --all"
echo "=========================================================="
exit 0
