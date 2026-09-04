#!/bin/bash

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
APP_PATH="$SCRIPT_DIR/Inspiration Drawer.app"
EXECUTABLE_PATH="$APP_PATH/Contents/MacOS/inspiration-drawer"

if [ ! -d "$APP_PATH" ]; then
  echo "未找到 Inspiration Drawer.app"
  echo "请保持“第一次打开.command”和 App 在同一文件夹。"
  read -n 1 -s -r -p "按任意键退出..." || true
  echo ""
  exit 1
fi

if [ ! -f "$EXECUTABLE_PATH" ]; then
  echo "Inspiration Drawer.app 的主程序不完整，无法启动。"
  echo "请重新下载并解压 Preview ZIP。"
  read -n 1 -s -r -p "按任意键退出..." || true
  echo ""
  exit 1
fi

echo "正在准备 Inspiration Drawer..."

xattr -dr com.apple.quarantine "$APP_PATH" || true
chmod +x "$EXECUTABLE_PATH"

if open "$APP_PATH"; then
  echo ""
  echo "已尝试启动 Inspiration Drawer。"
  echo "以后可以直接双击 App 打开。"
  echo ""
  sleep 2
else
  echo ""
  echo "未能启动 Inspiration Drawer，请重新下载 Preview ZIP 后再试。"
  read -n 1 -s -r -p "按任意键退出..." || true
  echo ""
  exit 1
fi
