#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
VENV_DIR="/tmp/workspaces/.venv-flare-bypasser"

if [ ! -d "$VENV_DIR" ]; then
  echo "未找到 flare-bypasser 虚拟环境：$VENV_DIR" >&2
  echo "可先运行：" >&2
  echo "python3 -m venv \"$VENV_DIR\" && source \"$VENV_DIR/bin/activate\" && pip install 'git+https://github.com/yoori/flare-bypasser.git'" >&2
  exit 1
fi

export FLARE_BYPASSER_SKIP_XVFB=1
export FLARE_BYPASSER_BROWSER_PATH=/usr/bin/google-chrome

source "$VENV_DIR/bin/activate"
exec flare_bypass_server --headless --disable-gpu -b 127.0.0.1:8191 "$@"
