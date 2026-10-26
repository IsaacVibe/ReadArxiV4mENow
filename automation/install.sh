#!/bin/bash
# =============================================================================
# 安装 RAVEN 自动抓取任务（macOS launchd LaunchAgent）
#
#   bash automation/install.sh               # 安装并启用：工作日 10:30（北京时间）自动抓取
#   bash automation/install.sh --run-now     # 安装后立刻触发一次，并等待日志验证链路
#   bash automation/install.sh --dry-run     # 只打印将要安装的 plist，不做任何修改
#   bash automation/install.sh --rebuild-app # 重新生成启动器 Applet（权限可能需要重新允许）
#
# 安装位置：
#   ~/Library/LaunchAgents/com.raven.arxiv.daily.plist      （定时任务）
#   ~/Library/Application Support/RAVEN/RAVENAutomation.app （启动器 Applet）
# 卸载：bash automation/uninstall.sh
#
# 关于启动器 Applet：
#   macOS 隐私保护（TCC）不允许 launchd 后台任务直接访问「桌面」目录。
#   因此定时任务通过 open 启动一个专用 Applet，由它执行 automation/run_daily.sh。
#   第一次运行时会弹出「RAVENAutomation 想要访问你的桌面文件夹」，
#   点「允许」之后即可每天静默自动抓取（只需授权一次）。
#   启动器自己的启动/错误记录在 ~/Library/Logs/RAVENAutomation.log。
# =============================================================================

set -u

LABEL="com.raven.arxiv.daily"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
TEMPLATE="$SCRIPT_DIR/com.raven.arxiv.daily.plist.template"
RUN_SCRIPT="$SCRIPT_DIR/run_daily.sh"
DEST_DIR="$HOME/Library/LaunchAgents"
DEST="$DEST_DIR/$LABEL.plist"
APP_DIR="$HOME/Library/Application Support/RAVEN"
APP_PATH="$APP_DIR/RAVENAutomation.app"
APP_MARKER="$APP_DIR/.project_dir"
LAUNCHER_LOG="$HOME/Library/Logs/RAVENAutomation.log"
UID_NUM="$(id -u)"
DOMAIN="gui/$UID_NUM"

usage() {
    cat <<'EOF'
用法: bash automation/install.sh [选项]

选项:
  --run-now      安装并启用后立即触发一次抓取，并等待日志验证整条链路
  --dry-run      只打印将要安装的 plist 内容，不做任何修改（无副作用）
  --rebuild-app  重新生成启动器 Applet（会改变 Applet 内容，TCC 权限可能需要重新允许）
  -h, --help     显示本帮助

说明:
  任务标签: com.raven.arxiv.daily
  触发时间: 每周一至周五 10:30（跟随系统时区，当前系统为 Asia/Shanghai）
  实际执行: automation/run_daily.sh（由启动器 Applet 调用）
EOF
}

DRY_RUN=0
RUN_NOW=0
REBUILD_APP=0
for arg in "$@"; do
    case "$arg" in
        --dry-run) DRY_RUN=1 ;;
        --run-now) RUN_NOW=1 ;;
        --rebuild-app) REBUILD_APP=1 ;;
        -h|--help) usage; exit 0 ;;
        *) echo "未知参数: $arg"; echo; usage; exit 2 ;;
    esac
done

if [ "$(uname -s)" != "Darwin" ]; then
    echo "ERROR: install.sh 仅支持 macOS launchd；Linux 请参考 automation/crontab.example"
    exit 1
fi

if [ ! -f "$TEMPLATE" ]; then
    echo "ERROR: 找不到 LaunchAgent 模板: $TEMPLATE"
    exit 1
fi

if [ ! -f "$RUN_SCRIPT" ]; then
    echo "ERROR: 找不到抓取脚本: $RUN_SCRIPT"
    exit 1
fi

# ---------------------------------------------------------------------------
# 生成启动器 Applet（首次安装时生成；已存在且路径一致则复用，避免 TCC 授权失效）
# ---------------------------------------------------------------------------
build_launcher() {
    local applescript_tmp="$APP_DIR/RAVENAutomation.applescript"
    local app_tmp="$APP_DIR/RAVENAutomation.build.app"
    local info_plist

    mkdir -p "$APP_DIR" || {
        echo "ERROR: 无法创建 $APP_DIR"
        return 1
    }

    cat > "$applescript_tmp" <<EOF
-- 由 automation/install.sh 自动生成 $(date '+%Y-%m-%d %H:%M:%S')
-- 用途：作为 launchd 任务与「桌面」目录之间的启动器，首次运行请求一次桌面访问权限。
-- 启动/错误记录：~/Library/Logs/RAVENAutomation.log
on run
    set logPath to (POSIX path of (path to library folder from user domain)) & "Logs/RAVENAutomation.log"
    set stamp to do shell script "date '+%Y-%m-%d %H:%M:%S'"
    try
        do shell script "printf '%s\\n' " & quoted form of (stamp & " launcher start") & " >> " & quoted form of logPath
    end try
    try
        do shell script "cd '$PROJECT_DIR' && /bin/bash automation/run_daily.sh"
    on error errMsg number errNum
        try
            do shell script "printf '%s\\n' " & quoted form of (stamp & " launcher error: " & errMsg & " (code " & errNum & ")") & " >> " & quoted form of logPath
        end try
        try
            display notification (errMsg as text) with title "RAVEN 自动抓取启动失败"
        end try
    end try
end run
EOF

    rm -rf "$app_tmp"
    if ! osacompile -o "$app_tmp" "$applescript_tmp" >/dev/null 2>&1; then
        echo "ERROR: osacompile 生成启动器失败"
        rm -f "$applescript_tmp"
        return 1
    fi
    rm -f "$applescript_tmp"

    info_plist="$app_tmp/Contents/Info.plist"
    /usr/libexec/PlistBuddy -c "Add :CFBundleIdentifier string com.raven.arxiv.automation" "$info_plist" >/dev/null 2>&1 \
        || /usr/libexec/PlistBuddy -c "Set :CFBundleIdentifier com.raven.arxiv.automation" "$info_plist" >/dev/null 2>&1 || true
    /usr/libexec/PlistBuddy -c "Add :CFBundleName string RAVENAutomation" "$info_plist" >/dev/null 2>&1 \
        || /usr/libexec/PlistBuddy -c "Set :CFBundleName RAVENAutomation" "$info_plist" >/dev/null 2>&1 || true
    # 不在 Dock / 应用切换器中显示（后台静默运行）
    /usr/libexec/PlistBuddy -c "Add :LSUIElement bool true" "$info_plist" >/dev/null 2>&1 \
        || /usr/libexec/PlistBuddy -c "Set :LSUIElement true" "$info_plist" >/dev/null 2>&1 || true

    rm -rf "$APP_PATH"
    if ! mv "$app_tmp" "$APP_PATH"; then
        echo "ERROR: 无法安装启动器到 $APP_PATH"
        return 1
    fi
    # 修改 Info.plist 后重新做 ad-hoc 签名，避免原签名失效导致无法启动
    codesign --force --deep --sign - "$APP_PATH" >/dev/null 2>&1 || true
    # 记录生成时内嵌的项目路径，用于检测项目是否被移动
    printf '%s' "$PROJECT_DIR" > "$APP_MARKER" 2>/dev/null || true
    return 0
}

# plist 是 XML：插入的值需要做 XML 转义（& < >），否则路径含 & 时 plist 会失效
xml_escape() {
    local s="$1"
    s="${s//&/&amp;}"
    s="${s//</&lt;}"
    s="${s//>/&gt;}"
    printf '%s' "$s"
}

render_plist() {
    local content project_xml app_xml home_xml
    content="$(cat "$TEMPLATE")" || return 1
    project_xml="$(xml_escape "$PROJECT_DIR")"
    app_xml="$(xml_escape "$APP_PATH")"
    home_xml="$(xml_escape "$HOME")"
    content="${content//__PROJECT_DIR__/$project_xml}"
    content="${content//__APP_PATH__/$app_xml}"
    content="${content//__HOME__/$home_xml}"
    printf '%s\n' "$content"
}

RENDERED="$(mktemp -t raven-launchagent)" || {
    echo "ERROR: 无法创建临时文件"
    exit 1
}
trap 'rm -f "$RENDERED"' EXIT

render_plist > "$RENDERED" || {
    echo "ERROR: 渲染 plist 失败"
    exit 1
}

if ! plutil -lint "$RENDERED" >/dev/null 2>&1; then
    echo "ERROR: 生成的 plist 未通过 plutil 校验："
    plutil -lint "$RENDERED"
    exit 1
fi

# --dry-run：到此为止，保证零副作用（不建目录、不改权限、不装 Applet）
if [ "$DRY_RUN" = "1" ]; then
    # 说明信息走 stderr，stdout 只输出 plist，便于重定向/校验
    echo "以下内容将安装到: $DEST" >&2
    echo "启动器 Applet: $APP_PATH" >&2
    echo "任务标签: $LABEL | 触发: 周一至周五 10:30（系统时区 $(date +%Z)）" >&2
    cat "$RENDERED"
    exit 0
fi

mkdir -p "$PROJECT_DIR/logs" 2>/dev/null || {
    echo "ERROR: 无法创建日志目录 $PROJECT_DIR/logs"
    exit 1
}

# 安装时顺手确保脚本可执行（正常 git clone 后也有执行位）
chmod +x "$RUN_SCRIPT" "$SCRIPT_DIR/install.sh" "$SCRIPT_DIR/uninstall.sh" 2>/dev/null || true

# ---------------------------------------------------------------------------
# 1) 安装启动器 Applet
# ---------------------------------------------------------------------------
NEED_BUILD=0
if [ "$REBUILD_APP" = "1" ]; then
    echo "重新生成启动器 Applet（现有 TCC 授权可能需要重新允许）..."
    rm -rf "$APP_PATH"
    NEED_BUILD=1
elif [ ! -d "$APP_PATH" ]; then
    NEED_BUILD=1
elif [ -f "$APP_MARKER" ] && [ "$(cat "$APP_MARKER" 2>/dev/null)" != "$PROJECT_DIR" ]; then
    echo "⚠ 检测到项目目录已变化（$(cat "$APP_MARKER" 2>/dev/null) → ${PROJECT_DIR}），重新生成启动器"
    rm -rf "$APP_PATH"
    NEED_BUILD=1
elif [ ! -f "$APP_MARKER" ]; then
    echo "⚠ 启动器缺少路径记录（可能是旧版本安装），重新生成以免路径错配"
    rm -rf "$APP_PATH"
    NEED_BUILD=1
fi

if [ "$NEED_BUILD" = "1" ]; then
    echo "生成启动器 Applet: $APP_PATH"
    if ! build_launcher; then
        exit 1
    fi
else
    echo "复用已有启动器 Applet: $APP_PATH"
fi

# ---------------------------------------------------------------------------
# 2) 安装并加载 launchd 任务
# ---------------------------------------------------------------------------
mkdir -p "$DEST_DIR" || {
    echo "ERROR: 无法创建 $DEST_DIR"
    exit 1
}

cp "$RENDERED" "$DEST" || {
    echo "ERROR: 无法写入 $DEST"
    exit 1
}
chmod 644 "$DEST" 2>/dev/null || true

# 先卸载旧任务（不存在时忽略报错），再注册新任务
launchctl bootout "$DOMAIN/$LABEL" >/dev/null 2>&1 || true

if ! launchctl bootstrap "$DOMAIN" "$DEST"; then
    echo "ERROR: launchctl bootstrap 失败。"
    echo "       可尝试注销并重新登录后再次运行，或手动执行："
    echo "       launchctl bootstrap $DOMAIN $DEST"
    exit 1
fi

launchctl enable "$DOMAIN/$LABEL" >/dev/null 2>&1 || true

if launchctl print "$DOMAIN/$LABEL" >/dev/null 2>&1; then
    echo "✅ 已安装并启用 launchd 任务: $LABEL"
else
    echo "WARN: plist 已写入 ${DEST}，但 launchctl 暂未显示该任务（可能需要重新登录）"
fi

echo "    plist:    $DEST"
echo "    启动器:   $APP_PATH"
echo "    项目目录: $PROJECT_DIR"
echo "    计划:     每周一至周五 10:30（系统时区: $(date +%Z)）"
echo "    抓取日志: $PROJECT_DIR/logs/raven_YYYYMMDD.log"
echo "    启动器日志: $LAUNCHER_LOG"
echo "    （launchd 的 stdout/stderr 日志只记录 /usr/bin/open 触发本身，抓取输出看上面的抓取日志）"
echo
echo "⚠ 首次运行授权：第一次抓取时会弹出系统提示"
echo "   「RAVENAutomation」想要访问你的「桌面」文件夹 → 请点击「允许」（只需一次）。"
echo "   如未弹出或误点拒绝，可运行：open -a \"$APP_PATH\" 再试一次，"
echo "   或到 系统设置 → 隐私与安全性 → 文件与文件夹 中开启 RAVENAutomation 的桌面访问权限。"

if [ "$RUN_NOW" = "1" ]; then
    TODAY_YMD="$(TZ=Asia/Shanghai date +%Y%m%d)"
    TODAY_LOG="$PROJECT_DIR/logs/raven_${TODAY_YMD}.log"
    BEFORE_LINES=0
    [ -f "$TODAY_LOG" ] && BEFORE_LINES="$(wc -l < "$TODAY_LOG" 2>/dev/null | tr -d ' ')"
    echo "▶ 立即触发一次并等待日志验证（首次请留意并允许桌面访问弹窗）..."
    launchctl kickstart -k "$DOMAIN/$LABEL" || true
    VERIFIED=0
    for _ in $(seq 1 20); do
        sleep 2
        if [ -f "$TODAY_LOG" ]; then
            NOW_LINES="$(wc -l < "$TODAY_LOG" 2>/dev/null | tr -d ' ')"
            if [ "${NOW_LINES:-0}" -gt "${BEFORE_LINES:-0}" ]; then
                VERIFIED=1
                break
            fi
        fi
    done
    if [ "$VERIFIED" = "1" ]; then
        echo "✅ 链路验证成功：抓取脚本已由启动器触发，日志：$TODAY_LOG"
    else
        echo "⚠ 40 秒内未看到抓取日志。可能正在等待「桌面访问」授权弹窗，或授权被拒绝。"
        echo "   请检查：$LAUNCHER_LOG 与 系统设置 → 隐私与安全性 → 文件与文件夹。"
    fi
    echo "   查看日志：tail -f \"$TODAY_LOG\""
fi

echo "提示: Mac 休眠时错过的任务会在唤醒后补跑；如需定时唤醒，见 README 的 pmset 一节。"
exit 0
