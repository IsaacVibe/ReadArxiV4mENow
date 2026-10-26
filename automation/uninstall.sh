#!/bin/bash
# =============================================================================
# 卸载 RAVEN 自动抓取任务（macOS launchd LaunchAgent）
#
#   bash automation/uninstall.sh                # 停止并删除任务（保留日志）
#   bash automation/uninstall.sh --purge-logs   # 同时删除抓取日志
#   bash automation/uninstall.sh --keep-app     # 保留启动器 Applet
# =============================================================================

set -u

LABEL="com.raven.arxiv.daily"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
DEST="$HOME/Library/LaunchAgents/$LABEL.plist"
APP_DIR="$HOME/Library/Application Support/RAVEN"
APP_PATH="$APP_DIR/RAVENAutomation.app"
LAUNCHER_LOG="$HOME/Library/Logs/RAVENAutomation.log"
UID_NUM="$(id -u)"
DOMAIN="gui/$UID_NUM"

usage() {
    cat <<'EOF'
用法: bash automation/uninstall.sh [选项]

选项:
  --purge-logs  同时删除 logs/raven_*.log、logs/launchd.*.log 与 ~/Library/Logs/RAVENAutomation.log
  --keep-app    保留启动器 Applet（~/Library/Application Support/RAVEN）
  -h, --help    显示本帮助
EOF
}

PURGE_LOGS=0
KEEP_APP=0
for arg in "$@"; do
    case "$arg" in
        --purge-logs) PURGE_LOGS=1 ;;
        --keep-app) KEEP_APP=1 ;;
        -h|--help) usage; exit 0 ;;
        *) echo "未知参数: $arg"; echo; usage; exit 2 ;;
    esac
done

if [ "$(uname -s)" != "Darwin" ]; then
    echo "ERROR: uninstall.sh 仅支持 macOS launchd"
    exit 1
fi

launchctl bootout "$DOMAIN/$LABEL" >/dev/null 2>&1 || true

if [ -f "$DEST" ]; then
    rm -f "$DEST" && echo "已删除: $DEST"
else
    echo "未找到 plist（可能本就未安装）: $DEST"
fi

if launchctl print "$DOMAIN/$LABEL" >/dev/null 2>&1; then
    echo "WARN: launchd 中仍能看到该任务，建议注销并重新登录后再检查"
fi

# 删除启动器 Applet
if [ "$KEEP_APP" = "1" ]; then
    echo "按参数要求保留启动器: $APP_PATH"
elif [ -d "$APP_PATH" ]; then
    rm -rf "$APP_PATH" && echo "已删除启动器: $APP_PATH"
    rm -f "$APP_DIR/.project_dir" 2>/dev/null || true
    if [ -d "$APP_DIR" ] && [ -z "$(ls -A "$APP_DIR" 2>/dev/null)" ]; then
        rmdir "$APP_DIR" 2>/dev/null || true
    fi
fi

# 清理遗留锁（仅当没有活跃的抓取进程时）
LOCK_DIR="$PROJECT_DIR/.raven_automation.lock"
if [ -d "$LOCK_DIR" ]; then
    HOLDER_PID=""
    [ -f "$LOCK_DIR/pid" ] && HOLDER_PID="$(cat "$LOCK_DIR/pid" 2>/dev/null || true)"
    if [ -z "$HOLDER_PID" ] || ! kill -0 "$HOLDER_PID" 2>/dev/null; then
        rm -rf "$LOCK_DIR" && echo "已清理遗留锁: $LOCK_DIR"
    else
        echo "提示: 有抓取进程正在运行（pid=${HOLDER_PID}），未清理锁"
    fi
fi

if [ "$PURGE_LOGS" = "1" ]; then
    rm -f "$PROJECT_DIR"/logs/raven_*.log "$PROJECT_DIR"/logs/launchd.*.log 2>/dev/null || true
    rm -f "$LAUNCHER_LOG" 2>/dev/null || true
    echo "已删除日志文件"
fi

echo "✅ 已卸载自动抓取任务: $LABEL"
echo "   提示: 系统设置 → 隐私与安全性 中可能仍保留 RAVENAutomation 的授权记录，可手动移除。"
exit 0
