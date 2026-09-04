# macOS Preview manual test checklist

Target: Apple Silicon (`aarch64-apple-darwin`), macOS 12 or newer. Test the unsigned CI artifact before adding signing or notarization.

## Install and launch

- [ ] Mount the DMG and copy Inspiration Drawer to `/Applications`.
- [ ] Launch the app with Gatekeeper's explicit Open action for the unsigned Preview build.
- [ ] Confirm the main window appears, is focusable, resizes, minimizes, and quits with Command+Q.
- [ ] Confirm standard Edit actions use Command+C, Command+V, Command+A, Command+Z, and Command+Shift+Z.
- [ ] Quit and relaunch; confirm the same local database and machine ID are used.

## Local data and imports

- [ ] Import images with the system file picker, including names containing spaces, Chinese text, `#`, `%`, and Unicode characters.
- [ ] Drag image, video, audio, and supported template files from Finder into the drawer.
- [ ] Drag supported files from Finder directly onto the Canvas and verify their drop position.
- [ ] Browse, search, tag, move, and delete library assets.
- [ ] Save a project, quit, relaunch, and verify Canvas and library state from SQLite.

## Canvas

- [ ] Create, select, box-select, move, connect, copy, paste, undo, and redo nodes.
- [ ] Pan with a two-finger trackpad gesture and a mouse wheel.
- [ ] Zoom with trackpad pinch and verify zoom is neither excessively sensitive nor inverted.
- [ ] Open context menus and verify right-click/control-click behavior.
- [ ] Generate an image, save the result, and reopen it from the local library.

## Chat and AI

- [ ] Open Chat, create a conversation, attach an image, and receive a streamed response.
- [ ] Run image generation with an API/BYOK or wallet configuration.
- [ ] Restart and verify conversations, messages, attachments, and generated files persist.
- [ ] If a system Codex CLI is installed, verify the custom executable path; confirm managed Codex installation is not offered.

## Platform integrations

- [ ] Register and trigger the global shortcut using a Command-based combination.
- [ ] Manually load the browser extension in Chrome or Edge and verify it connects to the localhost bridge.
- [ ] Send a web image from the extension to the macOS app.
- [ ] Confirm automatic browser-extension installation is not offered.
- [ ] Confirm app-to-Finder native drag and Virtual Drop are shown as unavailable and never produce a Rust panic.
- [ ] Confirm automatic updater installation and `cloudflared.exe` execution are not attempted.
- [ ] Confirm tray/menu-bar initialization does not block the main window.

## Deferred validation

- [ ] Signed Developer ID build.
- [ ] Notarization with `notarytool` and ticket stapling.
- [ ] Intel (`x86_64-apple-darwin`) build.
- [ ] Native app-to-Finder drag via `NSDraggingSource`/`NSPasteboard`.
