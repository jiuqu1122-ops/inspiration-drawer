#!/bin/bash

set -u

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
APP_PATH="$SCRIPT_DIR/Inspiration Drawer.app"
EXECUTABLE_PATH="$APP_PATH/Contents/MacOS/inspiration-drawer"
CURRENT_TTY="$(tty 2>/dev/null || true)"

wait_for_key() {
  read -n 1 -s -r -p "按任意键退出..." || true
  echo ""
}

if [ ! -d "$APP_PATH" ]; then
  echo "未找到 Inspiration Drawer.app"
  echo "请保持 First Launch.command 和 App 在同一文件夹。"
  wait_for_key
  exit 1
fi

if [ ! -f "$EXECUTABLE_PATH" ]; then
  echo "Inspiration Drawer.app 的主程序不完整。"
  echo "请重新下载并解压 Preview ZIP。"
  wait_for_key
  exit 1
fi

echo "正在准备 Inspiration Drawer..."

/usr/bin/xattr -dr com.apple.quarantine "$APP_PATH" || true
/bin/chmod +x "$EXECUTABLE_PATH" || true

if ! /usr/bin/open "$APP_PATH"; then
  echo ""
  echo "未能启动 Inspiration Drawer，请重新下载 Preview ZIP 后再试。"
  wait_for_key
  exit 1
fi

echo ""
echo "Inspiration Drawer 已启动。以后可以直接双击 App 打开。"

# Only close the single-tab Terminal window whose tab owns this script's tty.
# If Terminal cannot be matched safely, leave it open and do not affect launch.
if [ -n "$CURRENT_TTY" ] && [ "$CURRENT_TTY" != "not a tty" ]; then
  (
    sleep 1
    /usr/bin/osascript - "$CURRENT_TTY" <<'APPLESCRIPT'
on run argv
  if (count of argv) is not 1 then return
  set targetTTY to item 1 of argv
  if targetTTY is "" or targetTTY is "not a tty" then return

  tell application "Terminal"
    repeat with candidateWindow in windows
      try
        repeat with candidateTab in tabs of candidateWindow
          if ((tty of candidateTab) as text) is targetTTY then
            if (count of tabs of candidateWindow) is 1 then
              close candidateWindow
            end if
            return
          end if
        end repeat
      end try
    end repeat
  end tell
end run
APPLESCRIPT
  ) >/dev/null 2>&1 &
fi

exit 0
