#!/usr/bin/env bash
# 本地核验：启动静态服务 + 运行 Playwright 断言（tools/verify_site.py）。
#
# 说明：
#   - 服务与测试放在同一条命令里启动，避免「服务在一个网络命名空间、浏览器在另一个」
#     导致浏览器报 ERR_CONNECTION_REFUSED。
#   - 启动 Chromium 需要真实环境（本仓库用 Bash 工具跑时要关沙箱）。
#   - 本机 Playwright 需匹配已下载的 chromium_headless_shell 版本（见 verify_site.py 里的 EXE）。
#
# 用法：
#   bash tools/verify.sh
#   PORT=5200 bash tools/verify.sh
set -u
cd "$(dirname "$0")/.."

PORT="${PORT:-5173}"
PY_BIN="${PY_BIN:-$(command -v python || echo python)}"
VENV_PY="${VENV_PY:-C:/Users/Lenovo/.workbuddy/binaries/python/envs/default/Scripts/python.exe}"
[ -x "$VENV_PY" ] || VENV_PY="$PY_BIN"

mkdir -p tools/.cache docs/shots
"$PY_BIN" tools/serve.py -p "$PORT" > tools/.cache/serve.log 2>&1 &
SRV=$!
trap 'kill $SRV 2>/dev/null' EXIT
sleep 2
curl -s -o /dev/null -w "服务自检 http=%{http_code}\n" "http://127.0.0.1:$PORT/index.html"
NODE_OPTIONS= "$VENV_PY" -u tools/verify_site.py
