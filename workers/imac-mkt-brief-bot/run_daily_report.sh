#!/bin/bash
# 매일 오전 10시(KST)에 전날 광고 효율 리포트를 만들어 마케팅효율봇 방에 올린다.
# LaunchAgent 는 PATH 를 물려주지 않으므로 node 를 절대경로로 부른다.
set -u

cd /Users/pola/day1design-mkt-bot || exit 1

NODE=/Users/pola/.local/bin/node
LOG=/Users/pola/day1design-mkt-bot/logs/daily-report.log
mkdir -p "$(dirname "$LOG")" report

echo "[$(date '+%F %T %Z')] 리포트 시작" >>"$LOG"
"$NODE" daily-report.mjs >>"$LOG" 2>&1
code=$?
echo "[$(date '+%F %T %Z')] 종료코드 $code" >>"$LOG"

# 30일이 지난 이미지는 지운다 — 매일 한 장씩 쌓인다
find /Users/pola/day1design-mkt-bot/report -name 'daily-*.png' -mtime +30 -delete 2>/dev/null

exit $code
