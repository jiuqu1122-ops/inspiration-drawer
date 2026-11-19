# Rhino / reference-image SVG fixes — 2026-11-19

## Scope and baseline

Client only, branch `fix/rhino-focus-and-followup`, based on fetched `origin/main` at `0545a297` (desktop 8.0.32). No server repositories, prices, model mapping, credentials, update channels or signing keys changed. The initial repair made no push/tag/release. On explicit user authorization, prepare desktop 8.0.33 for push and signed release via the existing workflow. No user-data mutation or running-plugin replacement. Existing untracked repair notes and `%SystemDrive%/` remain untouched.

## Reference-image → SVG (not free-form redesign)

- The screenshots show genuine native SVG vocabulary rejections: `filter` and `paint-order` were missing from the validator. Added a shared checked-in vocabulary (`svgCapabilities.json`) used by the Rust validator and model tool schema, preventing drift between advertised and exportable elements/attributes.
- Added editable outlined text, text sizing, common accessibility/length attributes, local gradients, clip/mask and bounded static filters (shadow, blur, composition, color matrix/component transfer, morphology). Preserve the exact original SVG source on disk; do not strip effects or embed the reference bitmap.
- Local resource references are type-checked and cycle-checked; events, CSS/style, CSS-escaped URL bypasses, scripts, animation, feImage/image, external links, DTD/custom entities remain rejected. File/node/filter/count/region/aggregate-render limits remain enforced. This is not unrestricted SVG support.
- Reference vector-redraw messages request high-detail vision; unrelated image analysis still uses its existing setting. Tool choice remains semantic, not a regex router. Missing pixels remain explicitly marked unavailable.
- Context and errors require retaining source composition, text, colors and outlines, distinguishing approximate redraw from automatic lossless tracing. Fonts/small details are not guaranteed exact. Correcting XML retains the supplied image in the same runtime task. No successful file card without an actual native file receipt.
- The lettering fixture is synthetic. It tests editable text/outlines/gradients/shadows, not fidelity to a user's original source image. No paid AI request was made.

## Rhino focus / startup

- Startup logs show overlapping panel initialization and duplicate MCP warmups. This supports a focus-stealing hypothesis, but does not alone prove the complete cause of the new-window input problem.
- Coalesce in-flight/successful warmups while retaining automatic startup for newly activated documents and a later explicit request after failed warmup. Keep the existing native document call gate.
- Scope keyboard routing to the exact Eto WebView native host and its currently focused child, using a UI-thread-local WH_GETMESSAGE hook. Leave unrelated windows, inactive/peeked messages, OS Alt shortcuts and mouse input alone. Dispose/unhook with the panel. Restore only browser focus displaced synchronously by our own MCPStart command, without activating another app or interrupting an active command.
- Rhino 9 uses Eto messages; the older Rhino 8 Eto lacks MessageReceived, so use a non-navigating title signal there. No timers repeatedly steal input focus. IME composition/229 Enter must not submit a Chat message.
- Plugin marker/payloads rebuilt as `0.1.0-beta.34` for net7/Rhino8 and net8/Rhino9. Existing installed plugins remain unchanged. Fresh-window keyboard behavior still needs GUI reproduction/verification with the rebuilt plugin.

## Rhino geometry / follow-up

- `Open solid: Pendant leaf_0` and `External wall is curved` are geometry assertions, not sufficient evidence of conversation-memory loss or missing MCP capability. Targeted read-only searches of the local desktop/beta chat DBs did not find their original scripts/receipts; the exact geometry cause is not proven from the screenshots alone.
- Added optional `DrawerGeometryStage` on the existing native Python capability. Build on private geometry copies; distinguish required solids from intentional surfaces/curves; validate the full staged assembly before writing. Planar capping is explicit, never a blind tolerance relaxation. Check only explicitly constrained planar faces.
- Follow-up replacements preserve IDs and attributes/materials, reject changed/missing/duplicate targets, keep unrelated parts, and attempt rollback only of helper-owned writes if commit fails. Incomplete rollback reports exact IDs. Redraw failures are warnings after a successful helper commit.
- This helper is NOT a Python sandbox, mandatory schema for all modeling, or proof of zero side effects for surrounding raw code. Models must opt into the helper. It does not guarantee arbitrary geometry or photo fidelity. It never authorizes replay of an uncertain script.
- Completed native `Exception`/`AssertionError` tracebacks now qualify for one document read-back, including partial deltas; timeouts/disconnects remain uncertain. No automatic retry is introduced. Prior successful objects are not called failed because a later part failed.

## Verification

- `npm run typecheck`: passed.
- `npm test`: **266 files / 2770 tests passed**, including real Chat runtime reference pixels → mocked tool/file IPC → delivery and failed XML → corrected source continuation in custom/wallet modes.
- `npm run lint`: **0 errors / 48 existing warnings**. One temporary BOM-position lint error in a test was corrected and rerun.
- `npm run build`: passed; existing large-chunk/Browserslist warnings remain.
- `cargo +1.98.0 check --manifest-path src-tauri/Cargo.toml --locked --offline --bin inspiration-drawer`: passed with existing dead-code warnings.
- `cargo +1.98.0 test --manifest-path src-tauri/Cargo.toml --locked --offline --example chat_svg_smoke`: **12 passed**.
- `cargo +1.98.0 test --manifest-path src-tauri/Cargo.toml --locked --offline --bin inspiration-drawer commands::chat_`: **56 passed**, including actual exact-source SVG file writing, failed-content refusal and related file/prototype regressions. These include the SVG validator tests, not 56 additional SVG-only tests.
- `dotnet run -c Release --project integrations/rhino/Bridge.Tests/Bridge.Tests.csproj`: **145 passed**. One concurrent earlier run hit Windows socket 10053; subsequent standalone/final runs passed. No replay workaround was added.
- `python scripts/tests/test_rhino_geometry_stage.py -v`: **10 passed** using fake Rhino APIs; not native geometry execution.
- `python scripts/verify-rhino-panel-layout.py`: passed.
- Both SDK plugin builds: **0 warnings / 0 errors**. Embedded payload-version/feature checks passed in frontend suite.

## Unverified / delivery status

- Browser-use backend was unavailable; no browser screenshot/interactive SVG visual QA is claimed. Source, image-only data URL, React rendering and native exact-file tests passed.
- A local read-only Rhino context probe did not resolve a valid test binding. No live geometry script, user model edit, plugin installation, or original failing model replay was performed. Real native geometry/fresh-window/IME acceptance remains necessary.
- No precision automatic raster trace/font-to-path engine was added. Existing AI vector redraw now has a compatible export path and explicit limits, not a guarantee of exact reconstruction.
- Release target: desktop 8.0.33 / Rhino Beta.34. The user subsequently authorized push and publication. Actual workflow results, source commit and downloaded-asset signature/hash checks are recorded separately under outputs/release-8.0.33-*; this note does not assume publication succeeded.
