#!/bin/bash
# =============================================================================
# 清理 RAVEN 抓取缓存（不会删除已归档的论文数据）
#
#   bash automation/clean_cache.sh            # 清理 7 天前的摘要/续传缓存
#   bash automation/clean_cache.sh --days 0   # 只保留今天的缓存
#   bash automation/clean_cache.sh --all      # 清空整个 .cache_raven_arxiv（推荐，最省空间）
#
# 说明：
#   .cache_raven_arxiv 只用于抓取时的摘要缓存与断点续传，删除后不影响已经生成的
#   public/archive/... 数据，下次抓取会按需重新下载；因此定期清理是安全的。
# =============================================================================

set -u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_DIR" || { echo "ERROR: 无法进入项目目录 $PROJECT_DIR"; exit 1; }

DAYS=7
ALL=0
while [ "$#" -gt 0 ]; do
    case "$1" in
        --all) ALL=1; shift ;;
        --days)
            [ "$#" -ge 2 ] || { echo "ERROR: --days 需要一个数字参数"; exit 2; }
            DAYS="$2"; shift 2 ;;
        --days=*) DAYS="${1#--days=}"; shift ;;
        -h|--help)
            echo "用法: bash automation/clean_cache.sh [--days N | --all]"
            exit 0
            ;;
        *) echo "未知参数: $1"; exit 2 ;;
    esac
done
case "$DAYS" in ''|*[!0-9]*) DAYS=7 ;; esac

[ "$DAYS" -eq 0 ] && DAYS=1   # 保留今天：用 1 天阈值（-mtime +0 即昨天及更早）

CACHE_DIR="$PROJECT_DIR/.cache_raven_arxiv"
BEFORE=0
[ -d "$CACHE_DIR" ] && BEFORE="$(du -sk "$CACHE_DIR" 2>/dev/null | awk '{print $1}')"
BEFORE_TOTAL="$(du -sk . 2>/dev/null | awk '{print $1}')"
echo "清理前：项目 $(awk -v k="${BEFORE_TOTAL:-0}" 'BEGIN{printf "%.1f MB", k/1024}')，缓存 $(awk -v k="${BEFORE:-0}" 'BEGIN{printf "%.1f MB", k/1024}')"

if [ "$ALL" = "1" ]; then
    rm -rf "$CACHE_DIR" && echo "已清空 .cache_raven_arxiv"
else
    if [ -d "$CACHE_DIR" ]; then
        find "$CACHE_DIR/abs" -type f -mtime +"$DAYS" -delete 2>/dev/null || true
        find "$CACHE_DIR" -maxdepth 1 -name 'resume_*.json' -mtime +"$DAYS" -delete 2>/dev/null || true
        find "$CACHE_DIR" -type d -empty -delete 2>/dev/null || true
        echo "已清理 ${DAYS} 天前的缓存（保留最近 ${DAYS} 天，便于断点续传）"
    else
        echo "没有缓存目录，跳过"
    fi
fi

# 顺手清理 Python 字节码、.DS_Store 与过期通知去重状态
find "$PROJECT_DIR" -name '__pycache__' -type d -prune -exec rm -rf {} + 2>/dev/null || true
find "$PROJECT_DIR" -maxdepth 2 -name '.DS_Store' -delete 2>/dev/null || true
find "$PROJECT_DIR/logs" -maxdepth 1 -name '.notify_state_*' -mtime +90 -delete 2>/dev/null || true

AFTER=0
[ -d "$CACHE_DIR" ] && AFTER="$(du -sk "$CACHE_DIR" 2>/dev/null | awk '{print $1}')"
AFTER_TOTAL="$(du -sk . 2>/dev/null | awk '{print $1}')"
echo "清理后：项目 $(awk -v k="${AFTER_TOTAL:-0}" 'BEGIN{printf "%.1f MB", k/1024}')，缓存 $(awk -v k="${AFTER:-0}" 'BEGIN{printf "%.1f MB", k/1024}')"
echo "已归档数据不受影响：public/archive/ 目录未改动。"
exit 0
