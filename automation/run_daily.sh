#!/bin/bash
# =============================================================================
# RAVEN arXiv 每日自动抓取包装脚本
#
# 由 macOS launchd 任务 com.raven.arxiv.daily 在工作日（周一至周五）
# 北京时间 10:30 自动调用；也可以随时手动执行：
#
#   bash automation/run_daily.sh
#
# 行为要点：
#   1. 幂等：当天数据已存在且完整时直接跳过，不会覆盖历史文件；
#   2. 数据源：优先抓 arXiv 列表页（fetch_arxiv_list.py），因为 RSS 每天只在
#      美东时间午夜（北京时间 12:00/13:00）刷新，上午 10:30 时 RSS 还是前一天的；
#      若列表页没拿到当天数据，再快速尝试一次 RSS（fetch_arxiv.py）兜底；
#   3. 重试：默认最多 3 次、间隔 15 分钟（应对 arXiv 延迟发布 / 网络抖动）；
#   4. 只认「当天的数据」为成功：抓不到就会继续重试；
#   5. 抓取成功后同步 public/latest.json，保证前端总是指向最新数据；
#   6. 全程写入 logs/raven_YYYYMMDD.log，并自动清理过期日志。
#
# 可选环境变量：
#   RAVEN_PYTHON          指定 Python 解释器（默认自动探测 3.9+）
#   RAVEN_MAX_ATTEMPTS    最多尝试次数，默认 3
#   RAVEN_RETRY_DELAY_S   每次失败后的等待秒数，默认 900（15 分钟）
#   RAVEN_FALLBACK_RSS    列表页没拿到时，是否再用 RSS 兜底（1=启用，0=关闭），默认 1
#   RAVEN_FETCH_MAX_RETRIES  传给 fetch_arxiv_list.py 的网络重试次数，默认 6
#   RAVEN_FETCH_TIMEOUT      传给 fetch_arxiv_list.py 的单次网络超时秒数，默认 30
#   RAVEN_LOG_KEEP_DAYS   自行清理的日志保留天数，默认 90
#   RAVEN_NOTIFY          通知总开关（1=启用，0=全部关闭），默认 1
#   RAVEN_NOTIFY_SUCCESS  抓取成功时通知，默认 1
#   RAVEN_NOTIFY_SKIP     当天数据已存在（跳过）时通知，默认 1
#   RAVEN_NOTIFY_DEDUPE   同一天同一状态只通知一次，默认 1
#   RAVEN_NOTIFY_DRY_RUN  1=只把通知内容写进日志、不弹系统通知（测试用），默认 0
#   RAVEN_TZ              日期/时区，默认 Asia/Shanghai
# =============================================================================

set -u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_DIR" || { echo "ERROR: 无法进入项目目录 $PROJECT_DIR"; exit 1; }

# ---------------------------------------------------------------------------
# 时区与日期（始终按北京时间计算「今天」）
# ---------------------------------------------------------------------------
export TZ="${RAVEN_TZ:-Asia/Shanghai}"
TODAY_YMD="$(TZ="$TZ" date +%Y%m%d)"
TODAY_YMD_DASH="$(TZ="$TZ" date +%Y-%m-%d)"
TODAY_YM="$(TZ="$TZ" date +%Y%m)"

# ---------------------------------------------------------------------------
# 日志
# ---------------------------------------------------------------------------
LOG_DIR="$PROJECT_DIR/logs"
mkdir -p "$LOG_DIR" || { echo "ERROR: 无法创建日志目录 $LOG_DIR"; exit 1; }
LOG_FILE="$LOG_DIR/raven_${TODAY_YMD}.log"

log() {
    local line
    line="[$(TZ="$TZ" date '+%Y-%m-%d %H:%M:%S')] $*"
    printf '%s\n' "$line" >> "$LOG_FILE" 2>/dev/null || true
    printf '%s\n' "$line"
}

# ---------------------------------------------------------------------------
# 参数清洗
# ---------------------------------------------------------------------------
sanitize_int() { # $1=变量名(仅用于提示) $2=值 $3=默认值
    case "${2:-}" in
        ''|*[!0-9]*) printf '%s' "$3" ;;
        *) printf '%s' "$2" ;;
    esac
}

MAX_ATTEMPTS="$(sanitize_int RAVEN_MAX_ATTEMPTS "${RAVEN_MAX_ATTEMPTS:-3}" 3)"
[ "$MAX_ATTEMPTS" -lt 1 ] 2>/dev/null && MAX_ATTEMPTS=1
RETRY_DELAY_S="$(sanitize_int RAVEN_RETRY_DELAY_S "${RAVEN_RETRY_DELAY_S:-900}" 900)"
LOG_KEEP_DAYS="$(sanitize_int RAVEN_LOG_KEEP_DAYS "${RAVEN_LOG_KEEP_DAYS:-90}" 90)"
FETCH_MAX_RETRIES="$(sanitize_int RAVEN_FETCH_MAX_RETRIES "${RAVEN_FETCH_MAX_RETRIES:-6}" 6)"
FETCH_TIMEOUT="$(sanitize_int RAVEN_FETCH_TIMEOUT "${RAVEN_FETCH_TIMEOUT:-30}" 30)"

FALLBACK_RSS=1
[ "${RAVEN_FALLBACK_RSS:-1}" = "0" ] && FALLBACK_RSS=0

# 通知行为（默认成功/跳过/失败都提示；RAVEN_NOTIFY=0 全部关闭）
NOTIFY_SUCCESS="${RAVEN_NOTIFY_SUCCESS:-1}"
NOTIFY_SKIP="${RAVEN_NOTIFY_SKIP:-1}"
NOTIFY_DEDUPE="${RAVEN_NOTIFY_DEDUPE:-1}"
NOTIFY_DRY_RUN="${RAVEN_NOTIFY_DRY_RUN:-0}"
START_EPOCH="$(date +%s)"
ATTEMPTS_USED=0
RESULT_REASON=""
NOTIFIED=0
NOTIFY_STATE_FILE="$LOG_DIR/.notify_state_${TODAY_YMD}"
LAST_RUN_FILE="$LOG_DIR/last_run.json"

# ---------------------------------------------------------------------------
# 抓取结果通知（成功 / 跳过 / 失败都提示，尽力而为、不阻塞）
# ---------------------------------------------------------------------------
paper_stats() { # 输出 "总数|非空摘要数"；无数据时 "0|0"
    local f
    f="$(today_json_path)"
    [ -s "$f" ] || f="$(legacy_json_path)"
    [ -s "$f" ] || { printf '0|0'; return 0; }
    "${PYTHON:-/usr/bin/python3}" - "$f" 2>/dev/null <<'PY' || printf '0|0'
import json
import sys

try:
    with open(sys.argv[1], encoding='utf-8') as fh:
        data = json.load(fh)
except Exception:
    print('0|0')
    sys.exit(0)

papers = data.get('papers') or []
filled = sum(1 for p in papers if (p.get('summary') or '').strip())
print(f"{len(papers)}|{filled}")
PY
}

format_duration() { # $1=秒数 -> "15 秒" / "2 分 5 秒"
    local s="${1:-0}"
    case "$s" in ''|*[!0-9]*) s=0 ;; esac
    if [ "$s" -lt 60 ]; then
        printf '%s 秒' "$s"
    elif [ "$s" -lt 3600 ]; then
        printf '%s 分 %s 秒' "$((s / 60))" "$((s % 60))"
    else
        printf '%s 时 %s 分' "$((s / 3600))" "$(((s % 3600) / 60))"
    fi
}

diagnose_failure() { # 根据当天日志尾部给出简短失败原因
    local tail_text=""
    tail_text="$(tail -n 200 "$LOG_FILE" 2>/dev/null || true)"
    case "$tail_text" in
        *"HTTP 429"*) printf 'arXiv API 限流（HTTP 429）' ;;
        *"nodename nor servname"*|*"Errno 8"*|*"timed out"*) printf '网络/DNS 异常' ;;
        *"No papers found"*) printf 'arXiv 尚未发布当天列表（可能延迟）' ;;
        *"摘要缺失过多"*) printf '摘要不完整' ;;
        *) printf '详见日志' ;;
    esac
}

notify_result() { # $1=success|skip|failure  $2=正文
    local status="$1" body="$2" title="" last=""
    [ "${RAVEN_NOTIFY:-1}" = "0" ] && return 0
    case "$status" in
        success) [ "$NOTIFY_SUCCESS" = "0" ] && return 0 ;;
        skip)    [ "$NOTIFY_SKIP" = "0" ] && return 0 ;;
    esac

    # 同一天同一状态只通知一次；已通知过 success 时，后续 skip 不再重复提示
    if [ "$NOTIFY_DEDUPE" = "1" ] && [ -f "$NOTIFY_STATE_FILE" ]; then
        last="$(cat "$NOTIFY_STATE_FILE" 2>/dev/null || true)"
        if [ "$last" = "$status" ]; then
            log "通知去重：今天已发送过「${status}」通知，本次不再重复"
            return 0
        fi
        if [ "$status" = "skip" ] && [ "$last" = "success" ]; then
            log "通知去重：今天已发送过成功通知，跳过提示不再重复"
            return 0
        fi
    fi

    case "$status" in
        success) title="✅ RAVEN arXiv 抓取完成" ;;
        skip)    title="✅ RAVEN arXiv 今日数据已就绪" ;;
        *)       title="⚠️ RAVEN arXiv 抓取失败" ;;
    esac

    if [ "$NOTIFY_DRY_RUN" = "1" ]; then
        log "NOTIFY(DRY-RUN) [${title}] ${body}"
        return 0
    fi
    if ! command -v osascript >/dev/null 2>&1; then
        log "WARN：未找到 osascript，无法发送系统通知"
        return 0
    fi
    # 净化双引号/换行，避免 AppleScript 解析失败
    local clean_title clean_body
    clean_title="$(printf '%s' "$title" | tr '"' "'" | tr '\n' ' ')"
    clean_body="$(printf '%s' "$body" | tr '"' "'" | tr '\n' ' ')"
    if osascript -e "display notification \"${clean_body}\" with title \"${clean_title}\"" >/dev/null 2>&1; then
        NOTIFIED=1
        printf '%s\n' "$status" > "$NOTIFY_STATE_FILE" 2>/dev/null || true
        log "已发送系统通知：[${title}] ${body}"
    else
        log "WARN：系统通知发送失败（不影响抓取结果）"
    fi
}

write_last_run() { # $1=status  $2=reason（结果快照，供排查/后续集成）
    local status="$1" reason="${2:-}" stats total filled duration
    stats="$(paper_stats)"
    total="${stats%%|*}"
    filled="${stats##*|}"
    duration=$(( $(date +%s) - START_EPOCH ))
    "${PYTHON:-/usr/bin/python3}" - "$LAST_RUN_FILE" "$TODAY_YMD_DASH" "$status" "$total" "$filled" \
        "$ATTEMPTS_USED" "$duration" "logs/raven_${TODAY_YMD}.log" "$reason" "$NOTIFIED" <<'PY' 2>/dev/null || true
import datetime
import json
import sys

(path, date, status, total, filled, attempts, duration,
 log_file, reason, notified) = sys.argv[1:11]

data = {
    "timestamp": datetime.datetime.now().astimezone().isoformat(timespec="seconds"),
    "date": date,
    "status": status,
    "total": int(total or 0),
    "summary_filled": int(filled or 0),
    "attempts": int(attempts or 0),
    "duration_s": int(duration or 0),
    "log_file": log_file,
    "reason": reason,
    "notified": notified == "1",
}
with open(path, "w", encoding="utf-8") as fh:
    json.dump(data, fh, ensure_ascii=False, indent=2)
    fh.write("\n")
PY
}

# ---------------------------------------------------------------------------
# 单实例锁（mkdir 原子创建；崩溃后按 pid/时间判断是否为遗留锁）
# ---------------------------------------------------------------------------
LOCK_DIR="$PROJECT_DIR/.raven_automation.lock"
LOCK_HELD=0

release_lock() {
    if [ "$LOCK_HELD" = "1" ]; then
        rm -rf "$LOCK_DIR" 2>/dev/null || true
        LOCK_HELD=0
    fi
}
trap 'release_lock' EXIT
trap 'release_lock; exit 130' INT
trap 'release_lock; exit 143' TERM

acquire_lock() {
    if mkdir "$LOCK_DIR" 2>/dev/null; then
        printf '%s\n' "$$" > "$LOCK_DIR/pid" 2>/dev/null || true
        LOCK_HELD=1
        return 0
    fi

    local holder_pid=""
    [ -f "$LOCK_DIR/pid" ] && holder_pid="$(cat "$LOCK_DIR/pid" 2>/dev/null || true)"

    # 锁目录超过 6 小时视为失效（正常单次运行最多约 35 分钟，超时基本是 pid 被复用）
    local age_stale=0
    if [ -d "$LOCK_DIR" ] && [ -n "$(find "$LOCK_DIR" -maxdepth 0 -mmin +360 2>/dev/null)" ]; then
        age_stale=1
    fi

    if [ -n "$holder_pid" ] && kill -0 "$holder_pid" 2>/dev/null && [ "$age_stale" = "0" ]; then
        return 1   # 确实有另一个实例在运行
    fi

    # pid 不存在 / 进程已退出 / 锁超时：视为遗留锁并清理
    local stale=0
    if [ -n "$holder_pid" ] || [ "$age_stale" = "1" ]; then
        stale=1
    fi

    if [ "$stale" = "1" ]; then
        log "检测到遗留锁（pid=${holder_pid:-unknown}），自动清理"
        rm -rf "$LOCK_DIR" 2>/dev/null || true
        if mkdir "$LOCK_DIR" 2>/dev/null; then
            printf '%s\n' "$$" > "$LOCK_DIR/pid" 2>/dev/null || true
            LOCK_HELD=1
            return 0
        fi
    fi
    return 1
}

# ---------------------------------------------------------------------------
# 过期日志清理（只清理本脚本的 raven_*.log，不碰 launchd 日志）
# ---------------------------------------------------------------------------
prune_old_logs() {
    case "$LOG_KEEP_DAYS" in 0) return 0 ;; esac
    find "$LOG_DIR" -maxdepth 1 -name 'raven_*.log' -mmin +$((LOG_KEEP_DAYS * 1440)) \
        -exec rm -f {} \; 2>/dev/null || true
    find "$LOG_DIR" -maxdepth 1 -name '.notify_state_*' -mmin +$((LOG_KEEP_DAYS * 1440)) \
        -exec rm -f {} \; 2>/dev/null || true
}

# ---------------------------------------------------------------------------
# Python 探测（项目内优先，支持 conda；要求 >= 3.9）
# ---------------------------------------------------------------------------
python_ok() { # $1=解释器路径
    "$1" -c 'import sys; sys.exit(0 if sys.version_info >= (3, 9) else 1)' >/dev/null 2>&1
}

resolve_python() {
    local candidates="" candidate
    [ -n "${RAVEN_PYTHON:-}" ] && candidates="$RAVEN_PYTHON"
    candidates="$candidates $PROJECT_DIR/.venv/bin/python3"
    candidates="$candidates ${HOME:-}/anaconda3/bin/python3"
    candidates="$candidates ${HOME:-}/miniconda3/bin/python3"
    if command -v python3 >/dev/null 2>&1; then
        candidates="$candidates $(command -v python3)"
    fi
    candidates="$candidates /usr/bin/python3"

    for candidate in $candidates; do
        [ -n "$candidate" ] || continue
        [ -x "$candidate" ] || continue
        if python_ok "$candidate"; then
            printf '%s' "$candidate"
            return 0
        fi
    done
    return 1
}

PYTHON=""
resolve_python_into_global() {
    PYTHON="$(resolve_python)" || PYTHON=""
}

# ---------------------------------------------------------------------------
# 今日数据完整性判断（优先看 public/archive/YYYYMM/RAVEN_YYYYMMDD.json）
# ---------------------------------------------------------------------------
today_json_path() {
    printf '%s' "$PROJECT_DIR/public/archive/$TODAY_YM/RAVEN_${TODAY_YMD}.json"
}

today_md_path() {
    printf '%s' "$PROJECT_DIR/public/archive/$TODAY_YM/astroph_${TODAY_YMD_DASH}.md"
}

legacy_json_path() {
    printf '%s' "$PROJECT_DIR/public/RAVEN_${TODAY_YMD}.json"
}

json_is_valid() { # $1=文件路径：存在、可解析、papers 非空
    local f="$1"
    [ -s "$f" ] || return 1
    "$PYTHON" - "$f" <<'PY' >/dev/null 2>&1
import json
import sys

try:
    with open(sys.argv[1], encoding='utf-8') as fh:
        data = json.load(fh)
except Exception:
    sys.exit(1)

papers = data.get('papers') if isinstance(data, dict) else None
sys.exit(0 if papers else 1)
PY
}

today_output_ok() {
    local f
    f="$(today_json_path)"
    json_is_valid "$f" && return 0
    f="$(legacy_json_path)"
    json_is_valid "$f" && return 0
    return 1
}

# 摘要完整度：非空摘要比例 >= 80% 才算完整（arXiv API 限流时曾出现大量空摘要）
today_summary_coverage_ok() {
    local f
    f="$(today_json_path)"
    [ -s "$f" ] || f="$(legacy_json_path)"
    [ -s "$f" ] || return 1
    "$PYTHON" - "$f" <<'PY' >/dev/null 2>&1
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

# 清理当天不完整/损坏的输出（只清理「今天」的，绝不触碰历史数据）
purge_incomplete_today() {
    local json_file md_file legacy_file legacy_md_file
    json_file="$(today_json_path)"
    md_file="$(today_md_path)"
    legacy_file="$(legacy_json_path)"
    legacy_md_file="$PROJECT_DIR/astroph_${TODAY_YMD_DASH}.md"

    if [ -f "$json_file" ] || [ -f "$md_file" ] || [ -f "$legacy_file" ] || [ -f "$legacy_md_file" ]; then
        log "WARN：检测到不完整/损坏的今日数据，删除后重新抓取（只影响 ${TODAY_YMD_DASH}）"
        rm -f "$json_file" "$md_file" "$legacy_file" "$legacy_md_file" 2>/dev/null || true
        return 0
    fi
    return 1
}

# ---------------------------------------------------------------------------
# 同步 public/latest.json（保证前端指向最新文件）
# ---------------------------------------------------------------------------
sync_latest() {
    log "同步 public/latest.json ..."
    if "$PYTHON" "$PROJECT_DIR/automation/sync_latest.py"; then
        log "public/latest.json 已同步"
    else
        log "WARN：sync_latest.py 执行失败（不影响当日数据文件）"
    fi
}

# ---------------------------------------------------------------------------
# 主流程
# ---------------------------------------------------------------------------
main() {
    prune_old_logs

    log "================================================================"
    log "RAVEN 自动抓取启动 | 目标日期(北京): $TODAY_YMD_DASH | TZ=$TZ"
    log "工作目录: ${PROJECT_DIR}（数据/日志/缓存都在项目目录内）"
    log "主机: $(hostname 2>/dev/null || echo unknown) | 最多尝试 $MAX_ATTEMPTS 次 | 间隔 ${RETRY_DELAY_S}s | 网络重试 ${FETCH_MAX_RETRIES}x/${FETCH_TIMEOUT}s"

    if ! acquire_lock; then
        log "已有另一个抓取实例在运行，本次跳过（正常现象，稍等即可）"
        exit 0
    fi

    resolve_python_into_global
    if [ -z "$PYTHON" ]; then
        log "ERROR：未找到可用的 Python 3.9+ 解释器"
        RESULT_REASON="未找到 Python 3.9+ 解释器"
        notify_result failure "${TODAY_YMD_DASH} · ${RESULT_REASON} · 详见 logs/raven_${TODAY_YMD}.log"
        write_last_run failure "$RESULT_REASON"
        exit 1
    fi
    log "Python: $PYTHON ($("$PYTHON" --version 2>&1))"

    # 当天数据已完整：幂等跳过（不覆盖已有文件）
    if today_output_ok && today_summary_coverage_ok; then
        log "跳过：$TODAY_YMD_DASH 的数据已存在且完整，不覆盖"
        sync_latest
        log "完成（幂等跳过）"
        stats="$(paper_stats)"
        total="${stats%%|*}"
        filled="${stats##*|}"
        notify_result skip "${TODAY_YMD_DASH} · ${total} 篇 · 摘要 ${filled}/${total}（已存在，跳过抓取）"
        write_last_run skip ""
        exit 0
    fi

    # 存在当天文件但不完整（摘要缺失过多 / 写到一半被中断）：清理后重抓，避免坏数据被永久跳过
    if purge_incomplete_today; then
        sync_latest
    fi

    local attempt=1 rc=0 rc_rss=0
    while [ "$attempt" -le "$MAX_ATTEMPTS" ]; do
        # 主数据源：列表页（fetch_arxiv_list.py --date 今天）。
        # RSS 要到北京时间 12:00/13:00 才刷新，所以不适合作为 10:30 的首选。
        log "第 $attempt/$MAX_ATTEMPTS 次尝试：fetch_arxiv_list.py --date ${TODAY_YMD}（arXiv 列表页）"
        # 子进程输出同时写入日志文件（tee），便于事后排查
        "$PYTHON" "$PROJECT_DIR/fetch_arxiv_list.py" --date "$TODAY_YMD" --max-retries "$FETCH_MAX_RETRIES" --timeout "$FETCH_TIMEOUT" 2>&1 | tee -a "$LOG_FILE"
        rc=${PIPESTATUS[0]}
        log "列表页尝试结束，退出码 $rc"

        # 兜底：RSS（fetch_arxiv.py）。若 RSS 已刷新（例如手动在下午触发）也能凑效。
        if ! today_output_ok && [ "$FALLBACK_RSS" = "1" ]; then
            log "列表页未取到当天数据，兜底尝试 fetch_arxiv.py（arXiv RSS）"
            "$PYTHON" "$PROJECT_DIR/fetch_arxiv.py" 2>&1 | tee -a "$LOG_FILE"
            rc_rss=${PIPESTATUS[0]}
            log "RSS 兜底尝试结束，退出码 $rc_rss"
        fi

        if today_output_ok; then
            if ! today_summary_coverage_ok; then
                log "WARN：当天数据摘要缺失过多（arXiv API 可能被限流），删除后重试"
                if purge_incomplete_today; then
                    sync_latest
                fi
            else
                ATTEMPTS_USED="$attempt"
                log "SUCCESS：已生成 $TODAY_YMD_DASH 的论文数据"
                sync_latest
                log "完成，所用尝试次数：$attempt/$MAX_ATTEMPTS"
                stats="$(paper_stats)"
                total="${stats%%|*}"
                filled="${stats##*|}"
                duration_text="$(format_duration $(( $(date +%s) - START_EPOCH )))"
                notify_result success "${TODAY_YMD_DASH} · ${total} 篇 · 摘要 ${filled}/${total} · 第 ${attempt} 次尝试 · ${duration_text}"
                write_last_run success ""
                exit 0
            fi
        fi

        if [ "$attempt" -lt "$MAX_ATTEMPTS" ]; then
            log "尚未获得 $TODAY_YMD_DASH 的数据（arXiv 可能延迟发布 / 网络异常），${RETRY_DELAY_S}s 后重试 ..."
            sleep "$RETRY_DELAY_S"
        fi
        attempt=$((attempt + 1))
    done

    ATTEMPTS_USED="$MAX_ATTEMPTS"
    RESULT_REASON="$(diagnose_failure)"
    log "FAILED：$MAX_ATTEMPTS 次尝试后仍未获得 $TODAY_YMD_DASH 的数据（原因：${RESULT_REASON}）"
    log "排查建议：查看本日志中的网络报错；若 arXiv 当日休市（节假日）可忽略；也可手动运行 bash automation/run_daily.sh 复现"
    notify_result failure "${TODAY_YMD_DASH} · 未取到数据 · ${RESULT_REASON} · 详见 logs/raven_${TODAY_YMD}.log"
    write_last_run failure "$RESULT_REASON"
    exit 1
}

main "$@"
