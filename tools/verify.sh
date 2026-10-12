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

# 端口占用自检：Windows 下 SO_REUSEADDR 允许多个进程绑同一端口而不报错，
# 端口一旦叠加，测试请求会随机落到旧进程上，产生「时好时坏」的假失败。
# 这里先明确判断，避免把环境问题误当成代码问题。
if "$PY_BIN" -c "import socket,sys; s=socket.socket(); s.settimeout(0.3); sys.exit(0 if s.connect_ex(('127.0.0.1',$PORT))==0 else 1)"; then
  echo "端口 $PORT 已被占用，请先结束占用进程："
  netstat -ano | grep ":$PORT" | grep LISTENING
  echo "  结束方式：MSYS_NO_PATHCONV=1 taskkill /PID <pid> /F"
  exit 1
fi

"$PY_BIN" tools/serve.py -p "$PORT" > tools/.cache/serve.log 2>&1 &
SRV=$!
trap 'kill $SRV 2>/dev/null' EXIT
sleep 2

HTTP="$(curl -s -o /dev/null -w "%{http_code}" "http://127.0.0.1:$PORT/index.html")"
echo "服务自检 http=$HTTP"
if [ "$HTTP" != "200" ]; then
  echo "静态服务未就绪，中止（详见 tools/.cache/serve.log）"
  exit 1
fi

NODE_OPTIONS= "$VENV_PY" -u tools/verify_site.py
