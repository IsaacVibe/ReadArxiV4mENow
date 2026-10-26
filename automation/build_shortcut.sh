#!/bin/bash
# =============================================================================
# 生成「RAVEN 抓取今日 arXiv」Apple 快捷指令（.shortcut 文件）
#
#   bash automation/build_shortcut.sh
#
# 产物：automation/RAVEN-抓取今日arXiv.shortcut
#   双击导入「快捷指令」App 后，可：
#     - 在快捷指令/菜单栏/聚焦/Siri 中一键触发抓取；
#     - 在「快捷指令 → 自动化 → 特定时间」里设为工作日 10:30 自动运行。
#
# 说明：快捷指令里的「运行 Shell 脚本」会调用 automation/run_daily.sh。
# 第一次运行时 macOS 会请求「访问桌面文件夹」的权限（与启动器 Applet 类似），
# 点「允许」即可，之后不会再问。
# =============================================================================

set -u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
OUT="$SCRIPT_DIR/RAVEN-抓取今日arXiv.shortcut"
# 注意：shortcuts sign 需要输入文件以 .shortcut 结尾，否则报 "not in the correct format"
UNSIGNED="$(mktemp -t raven-shortcut-unsigned).shortcut" || exit 1
trap 'rm -f "$UNSIGNED"' EXIT

/usr/bin/python3 - "$PROJECT_DIR" "$UNSIGNED" <<'PYEOF'
import plistlib
import sys
import uuid

project_dir, out_path = sys.argv[1], sys.argv[2]

shell_script = """#!/bin/bash
# RAVEN 今日 arXiv 抓取（由 Apple 快捷指令调用）
cd '__PROJECT_DIR__' || exit 1

RAVEN_NOTIFY=0 RAVEN_MAX_ATTEMPTS=2 RAVEN_RETRY_DELAY_S=60 \\
  /bin/bash automation/run_daily.sh > /tmp/raven-shortcut.log 2>&1
rc=$?

TODAY_YMD=$(TZ=Asia/Shanghai date +%Y%m%d)
TODAY_YM=$(TZ=Asia/Shanghai date +%Y%m)
FILE="public/archive/$TODAY_YM/RAVEN_$TODAY_YMD.json"

if [ -f "$FILE" ]; then
  PY=$(command -v python3 2>/dev/null || true)
  [ -n "$PY" ] || PY=/usr/bin/python3
  INFO=$("$PY" -c "import json; d=json.load(open('$FILE',encoding='utf-8')); p=d.get('papers',[]); print('%d 篇，摘要 %d 篇' % (len(p), sum(1 for x in p if (x.get('summary') or '').strip())))" 2>/dev/null || true)
  [ -n "$INFO" ] || INFO="已更新（详见日志）"
  /usr/bin/osascript -e "display notification \\"${TODAY_YMD}：$INFO\\" with title \\"RAVEN arXiv 已就绪\\""
else
  /usr/bin/osascript -e "display notification \\"未获取到 $TODAY_YMD 的数据，详见 logs/raven_$TODAY_YMD.log\\" with title \\"RAVEN arXiv 抓取失败\\""
fi
exit $rc
""".replace('__PROJECT_DIR__', project_dir)

workflow = {
    'WFWorkflowActions': [
        {
            'WFWorkflowActionIdentifier': 'is.workflow.actions.runshellscript',
            'WFWorkflowActionParameters': {
                'WFShellScript': shell_script,
                'UUID': str(uuid.uuid4()).upper(),
            },
        },
    ],
    'WFWorkflowClientVersion': '2700.0.4',
    'WFWorkflowClientRelease': '26A0000a',
    'WFWorkflowMinimumClientVersion': 900,
    'WFWorkflowMinimumClientVersionString': '900',
    'WFWorkflowIcon': {
        'WFWorkflowIconGlyphNumber': 61529,   # command / developer 图标
        'WFWorkflowIconStartColor': 431817727,  # teal
    },
    'WFWorkflowName': 'RAVEN 抓取今日 arXiv',
    'WFWorkflowHasOutputFallback': False,
    'WFWorkflowImportQuestions': [],
    'WFWorkflowOutputContentItemClasses': [],
    'WFWorkflowInputContentItemClasses': [],
    'WFWorkflowTypes': [],
}

with open(out_path, 'wb') as fh:
    plistlib.dump(workflow, fh, fmt=plistlib.FMT_BINARY)
print('unsigned workflow written:', out_path)
PYEOF

echo "=== 校验 plist ==="
plutil -lint "$UNSIGNED" || exit 1

echo "=== 签名（shortcuts sign） ==="
# anyone 模式需要联网校验；网络受限时回退到 people-who-know-me（本机/自己的设备可导入）
if ! /usr/bin/shortcuts sign --mode anyone --input "$UNSIGNED" --output "$OUT" 2>/dev/null; then
    echo "anyone 模式失败（可能无法联网校验），改用 people-who-know-me 模式重试..."
    if ! /usr/bin/shortcuts sign --mode people-who-know-me --input "$UNSIGNED" --output "$OUT"; then
        echo "ERROR: 快捷指令签名失败"
        exit 1
    fi
fi

echo "✅ 已生成: $OUT"
ls -l "$OUT"
file "$OUT"
echo
echo "下一步：双击该文件导入「快捷指令」App（或在快捷指令中「文件 → 导入」），"
echo "然后在快捷指令/菜单栏/聚焦/Siri 中一键运行；也可以到「快捷指令 → 自动化」里设为工作日 10:30 自动运行。"
