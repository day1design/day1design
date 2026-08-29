#!/bin/bash
# 마케팅효율봇 상주 래퍼.
#
# launchd 가 node 를 직접 띄우면 로그인 셸 PATH 가 없어 claude·codex 를 못 찾는다.
# 릴레이에서 같은 사고가 있었으므로 bash 를 한 겹 두고 환경을 얹어 실행한다.

set -u
cd /Users/pola/day1design-mkt-bot || exit 1

export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:/Users/pola/.local/bin"
export LANG="ko_KR.UTF-8"

mkdir -p logs state

NODE="$(command -v node || echo /usr/local/bin/node)"
exec "$NODE" bot.mjs
