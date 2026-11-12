# Inspiration Drawer Rhino Beta.32

Release date: 2026-11-12  
Desktop: `8.0.27-beta.32`  
Rhino plugin: `0.1.0-beta.32`

## Prompt text is not authorization to render an image

Desktop Chat and Rhino-panel Chat share the same request policy. Requests to write,
improve, translate, or explain an image-generation prompt now remain text tasks.
Recognized prompt-only requests omit image-generation/edit tools. The dispatch
router also blocks erroneous image calls before invoking the executor. A separate
request such as "write the prompt, then generate the image" retains image tools.
The word "generate" alone does not authorize paid image output.

Also included: preserve an omitted server model catalog as omitted rather than
serializing it as an authoritative empty array. An explicitly empty catalog stays
empty; this does not restore deleted server routes or change provider protocols.

## Rhino host layout

Retains the Beta.31 Rhino 8 fix: no fixed WebView Size; Eto expanding host layout;
compact minimum 340 x 420 logical pixels. Rhino 9's direct WebView host-layout path
remains unchanged. Live docking/floating resize acceptance on the user's Rhino
8.0.23 machine is still pending.

## Install / update

1. Save your Rhino files, exit Rhino, and close the older desktop beta.
2. Run `Inspiration Drawer Rhino Beta_8.0.27-beta.32_x64-setup.exe`.
3. In the desktop app, choose Settings > Rhino Plugin > Install / Update.
4. Restart Rhino and open InspirationDrawer. Confirm the badge reads `BETA.32`.
5. Test prompt-only wording and a separate image-output request as distinct tasks.

The installer embeds the matching Rhino 8 and Rhino 9 plugin payloads. Manual ZIP
packages are also supplied for net7.0 (Rhino 8) and net8.0 (Rhino 9). Do not mix the
framework folders; keep the RHP, deps, runtimeconfig, RUI, and SVG files together.
No Yak package is supplied in this build; use the desktop plugin updater or ZIP.

## Verification scope

See TESTS.json, VERIFY.json, and SHA256SUMS.txt beside the release artifacts.
Checks cover automated regressions, both plugin builds, current embedded resources,
installer/portable agreement, and archive integrity. Synthetic model replies do
not prove arbitrary live model behavior. No paid cloud image tasks or target
Rhino 8.0.23 GUI acceptance were performed for this release. This is an unsigned
beta build and does not publish a stable auto-update or change the wallet backend.
