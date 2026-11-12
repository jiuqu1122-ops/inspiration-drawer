# Rhino Beta 开发交接（2026-11-05）

## 本分支的目标与现状

用户需要在 Rhino 9 的原生停靠窗口使用灵感抽屉 Chat，同时保留抽屉的画布、生图模型与账号体系。Beta 已实现原生窗口、本机 MCP 传输和桌面 Chat 复用。用户已经在本机实际使用并完成一次生图。

当前插件使用自行实现的 MCP 服务，直接通过 RhinoCommon 读取文档，不是 Rhino 官方 AI router 的完整 MCP 接入。详情见 [MCP 能力核查](MCP-AUDIT.md)。

## 已完成

- Rhino 9 C# / Eto 原生面板，提供聊天、新建/切换会话、模型选择、停止和结果预览。
- 只监听 127.0.0.1 的随机端口，本次实例令牌鉴权；桌面端通过固定用途 Rust 命令直连，绕过系统 HTTP 代理。
- 复用桌面 Chat runtime、生成工具、画布输出和存储。发送时可附带真实视口 PNG 与画布选中图片。
- 四个模型可调用的只读工具：rhino_get_context、rhino_list_objects、rhino_list_layers、rhino_list_parts；rhino_capture_viewport 由发送前桥接调用。
- rhino_list_parts 返回所选对象及 `InstanceObject.Explode` 得到的块内分件、面级材质分件，含稳定路径 ID、完整图层路径、Rhino 简单材质与来源、实例路径/变换和估算世界包围盒。父级继承在无法解析时明确标记。面板低频轮询分件端点，发送 Chat 时携带最多 60 条分件记录。
- 视口采用 Rhino `ViewCaptureSettings` 捕获，避免采入屏幕选择高亮与 Gumball。Mask 来源可选当前选择或可见图层；Mask 捕获暂时切到 Shaded，并恢复原显示模式。按图层时只临时修改对象选择并在 `finally` 恢复；子对象选择或超大图层会拒绝导出。
- Mask 为同相机栅格轮廓，透明选中/图层区域作为编辑区，不是逐部件 ID 色彩图。透明区语义仍依赖上游；云钱包须服务端回执 `maskApplied=true`，否则客户端拒绝结果。
- 分件清单仍只读，不改材质；没有区域外像素合成保护，不能描述为逐部件 ID 分割或像素级保形。
- 会话绑定 Rhino 实例、文档与画布；任务去重、执行前确认接收、接受后不自动重放；执行期间保护画布切换。
- 桌面 Beta 使用独立应用标识 com.inspirationdrawer.rhino.beta 和数据目录，禁用其更新源及部分会与正式版争用的服务。

## Chat mode and history isolation

Desktop Chat and the Rhino native panel now use independent Chat runtimes, conversation lists, active-conversation keys, and history scopes. Rhino-panel conversations are stored with a separate `rhino-chat-conversation-` ID namespace; legacy `Rhino ??` entries are also kept out of desktop history. Both modes still use the same canvas, image generation, rendering, and other desktop services.

## Next: verify the native modeling loop before more split-render work

beta.7 adds automatic execution of native RhinoAI MCP tools from Rhino plugin Chat, while keeping desktop Chat isolated from Rhino MCP. Native calls still require a unique current-process and bound-document match. Source and isolated transport tests pass; real modeling should be verified in an undoable Rhino document.

Manual validation order:

1. Run `MCPStart` in the target Rhino document and accept the default port. Send a read-only request and confirm that the listener and document match uniquely.
2. In an empty or undoable document, ask Chat to create a box. Verify the real Rhino object and returned tool result, then use Rhino Undo. Native Rhino MCP calls run directly from the sent Chat request. Do not test in the user's current design document.
3. Verify that multiple Rhino processes, multiple documents, duplicate fingerprints, oversized object sets, listener restarts, and tool-list changes all fail closed.
4. After that loop passes, return to the selection/layer Mask GUI checks and per-part ID-color work.
## 关键源码入口

- integrations/rhino/InspirationDrawer.Rhino：插件、面板、BetaServer、RhinoTools。
- integrations/rhino/Bridge.Tests：不依赖 Rhino 的真实 TCP/HTTP 集成检查。
- src/features/rhino：协议、MCP 客户端、共享 Chat 适配与绑定。
- src/features/chat/components/ChatHost.tsx：挂载桥接和附加工具。
- src/features/chat/runtime/useChatRuntime.ts：追加模型工具定义、生成结果携带源会话。
- src-tauri/src/rhino_beta.rs：固定端点、鉴权、回环传输。
- src-tauri/tauri.rhino-beta.conf.json：独立 Beta 配置。
- scripts/build-rhino-beta.ps1：统一构建、测试和打包。

## 回家电脑继续

克隆仓库后切换本分支：

```powershell
git fetch origin
git switch --track origin/feat/rhino-beta-20261105
npm ci
```

需要 Windows、Node/npm、.NET 8 SDK、Rust MSVC、Visual Studio C++ Build Tools（含 Windows SDK）和 Rhino 9。在 VS 开发者 PowerShell 中构建；RhinoSystemDir 按实际安装目录填写：

```powershell
npm run typecheck
npm run test -- src/features/chat src/features/rhino --maxWorkers=4
dotnet run -c Release --project integrations/rhino/Bridge.Tests/Bridge.Tests.csproj
powershell -ExecutionPolicy Bypass -File scripts/build-rhino-beta.ps1 -RhinoSystemDir 'C:/Program Files/Rhino 9/System'
```

构建脚本输出到 integrations/rhino/artifacts，目录已被 Git 忽略。桌面输出为便携 EXE，插件输出为 YAK，详见 [使用说明](README.md)。只构建插件时加 -SkipDesktop。

## 已验证与待验证

- Chat/Rhino 回归：50 个测试文件，660 项测试通过。
- 本机传输：20 项 TCP/HTTP 集成检查通过。
- TypeScript/Vite 前端构建与一个桌面 Rust release 构建曾成功；成功的桌面 EXE 早于最后一轮绑定/画布锁改动。最后改动后的桌面 release 尚未确认完成，换电脑请从本分支完整重建。
- 实际 Rhino 9（9.0.26300.09401）加载、原生面板、对象/图层读取和真实 PNG 导出已验证；当前 MCP 查询实测成功。
- 模型记录中已有一次 generate_image 成功，但尚未完成分件/遮罩编辑验收或所有渠道验证。
- 新建/切换会话的最终面板同步仍需回归；此前请求状态 completed，但即时快照尚未反映新会话，不能仅凭请求完成认定界面同步已验收。
- 调试时加入 WebView2 远程调试环境参数曾出现 Rhino 崩溃，去掉后可以运行。避免沿用该参数；插件长期稳定性与完整 GUI 回归仍需验证。

## 不在仓库中的内容

本机连接令牌、API Key、登录/授权、聊天数据库、素材、模型文件、依赖工具链与编译缓存均不随分支上传。Beta 默认不会导入正式版设置，换电脑需要正常配置。原有工作目录中另有未提交的 src/index.css 修改，本分支没有混入该修改。

## beta.8 follow-up (2026-11-07)

- Added current Rhino conversation deletion with an explicit inline confirmation, scoped runtime/transport validation, busy-run protection, and binding cleanup.
- Deletion affects stored chat records only, not Rhino objects or canvas assets. Do not validate this by deleting the user's real conversations without explicit selection and confirmation.
- Added synthetic tests for the actual panel script, runtime deletion, bridge commands, and the loopback server. No real user conversations were removed during these tests.
- Completed `run_command` display filters known temporary meshing prompts; original native receipts and failed history stay intact.

## Desktop beta.9 GH continuation fix (2026-11-08)

- Root cause of the reported GH startup-only run: continueToolCalls finalized every all-native batch, so g1_start ended the user turn before search/place/connect/solve tools could run.
- Removed that shortcut. Successful native receipts feed back to the model; intermediate tool success stays separate from final task completion. A Rhino/Grasshopper instruction asks for graph construction, solve, and read-only verification before claiming modeling success.
- Rhino turns have a finite 24-round budget; desktop Chat keeps its existing 8-round limit and cannot use Rhino MCP. Native tool failures still stop without blindly replaying writes. If model continuation fails after successful steps, report the incomplete workflow rather than hiding the error behind a preparatory assistant sentence.
- Live read-only checks on the reported session found the native tools online and GH objects=[] / wires=[]. No modeling writes or graph clearing were performed while diagnosing.
- Synthetic regression tests cover startup -> component search -> apply_graph -> solve -> graph inspection -> final model answer, waiting for continuation, more than 8 steps, the finite cap, and provider failure after startup.
- This patch changes only the desktop runtime. The beta.8 Rhino plugin remains compatible; Rhino/GH need not be closed or reinstalled to load the new desktop app.

- Desktop beta.9 workflow policy also validates native MCP schemas at router/runtime boundaries and labels all native tools with workflow phase/recovery semantics.

## Rhino visual generation capture (2026-11-08)

- Rhino-panel requests that are clearly visual-generation/appearance/render requests now force the canvas image route context instead of treating the request as Rhino-only MCP work.
- The bridge captures the reference viewport with `includeMask=true`; RhinoTools temporarily switches the active viewport to Shaded for the same-camera capture, then restores the original display mode. The selected-object or layer mask is sent as a separate attachment with `role=mask`.
- The Chat runtime recognizes a Rhino mask attachment for `generate_image`/`edit_image`, forces mask-capable image settings, attaches `maskImage`, and keeps the mask out of ordinary reference images. This also works when the panel Mask checkbox was not manually enabled.
- The model receives an explicit instruction to call `generate_image` or `edit_image` for this request. Read-only Rhino context remains available for geometry/material context, but it is not the image-generation route.
- Synthetic tests cover the shaded viewport + same-camera mask bridge and canvas image-tool mask routing. No extra Rhino model write was performed by this fix.


## RhinoAI MCP document rebind repair (2026-11-09)

- The RhinoAI MCP listener is process-scoped while Rhino documents are document-scoped. Rebind `_MCPStart` on active-document changes, new documents, and after the initial view update for an opened document.
- Native tool discovery now matches only listener announcements owned by the current Rhino PID, collapses duplicate ports, and retries once after a document-scoped rebind when the context fingerprint does not match. This covers all proxied native MCP tools, not only material writes.
- Fixed object-ID fingerprint comparison to accept Rhino's local inventory as a string array as well as native MCP object records. Without this, valid document matches could be rejected even after rebind.
- Bridge tests include a stale-document context that becomes a matching model context after rebind; the material tool is exposed only after the fingerprint matches.

## 2026-11-09 Rendered blank-capture hotfix (pending RHP deployment)

The Rendered screenshot bug was reproduced against the open user model: vector ViewCaptureSettings plus wire suppression rendered only the background. Set RasterMode=true and added near-uniform image rejection before reference upload or Chat generation. Do not fall back to Shaded.

Compiled plugin: outputs/rhino-raster-capture-fix-20261109/plugin/net8.0/InspirationDrawer.Rhino.rhp. Verification: outputs/rhino-raster-capture-fix-20261109/VERIFICATION.md. Actual model capture evidence: outputs/rhino-capture-20261109/production-rpc-reference.png. The exact production C# source was validated through an isolated diagnostic assembly in the current Rhino process; both Shaded and Rendered starting modes produced Rendered material images, and model/camera/selection/display state was restored. No paid generation was replayed.

55 bridge checks, 35 frontend Rhino checks, typecheck and plugin build passed. The fixed RHP has NOT replaced the currently loaded plugin: wait until Rhino exits, back up the desktop RHP, copy the new RHP, and verify hashes before restarting. Desktop is already updated and does not need a rebuild/restart for this change.

## 2026-11-09 beta.10: image output settings and offline Rhino 8/9 installer

- Rhino panel now receives model-supported imageAspectRatio/imageResolution/imageQuality options via heartbeat. The new controls send dedicated validated setting commands and reuse ChatHost/App generation callbacks (including persistent aspect-ratio/resolution settings). Unsupported/stale values fail before inference; supported quality is shown only when available.
- Desktop Settings has a Rhino Plugin accordion with one-click install/update. Native backend detects local Rhino 8/9 registrations and embeds separate offline payloads (8=.NET 7, 9=.NET 8). It writes immutable hash-versioned directories under LOCALAPPDATA/InspirationDrawer/RhinoPlugin and registers the current-user Plug-Ins GUID/PlugIn/FileName plus command/startup entries. No admin, SDK, external download, or manual Desktop RHP path is needed on an end user's machine. Existing registration paths are backed up; loaded RHPs, model files, chats and canvas data are not overwritten. Restart Rhino to activate an update. RhinoAI native MCP remains a separate dependency.
- Rhino 8 compilation uses the actual installed 8.0 SDK. Newer Rhino 9 display flags use optional reflection; JSON clone/equality is .NET 7 compatible. Rendered raster capture and blank-reference rejection remain intact.
- scripts/build-rhino-plugin-payload.ps1 refreshes both src-tauri/resources/rhino payloads; build-rhino-beta.ps1 invokes it before desktop compilation to avoid version skew.
- Verification: 61 frontend image-setting/installer/generation checks; 60 bridge checks; 3 native installer checks; TypeScript and frontend build passed. Rhino 8/9 builds each had zero warnings/errors. Native read-only installer probe correctly detected both local 8 and 9. No registry install or Rhino 8 GUI load was performed yet.
- Paired release build completed: release-assets/rhino-beta10-installer-settings-20261109. BUILD-MANIFEST.json records EXE and both RHP hashes. The running desktop and Rhino instances were not replaced. Need user to save/close all Rhino windows and exit the desktop app before deploying the paired desktop. The new Settings button can then install the appropriate new RHP automatically. Do not repeat paid generations.

## 2026-11-10 Beta.11 paired packaging completed

New output: release-assets/rhino-beta11-chat-model-fix-20261110. Includes NSIS installer Inspiration Drawer Rhino Beta_8.0.27-beta.11_x64-setup.exe, portable desktop/inspiration-drawer.exe, plugin/net8.0 (Rhino 9), plugin-rhino8/net7.0 (Rhino 8), plus Rhino8-Plugin-Beta11.zip and Rhino9-Plugin-Beta11.zip. Both embedded plugin payloads were verified byte-for-byte in the portable EXE. ZIPs and SHA256 hashes are verified; BUILD-MANIFEST.json, BUILD-INPUTS.json, VERIFICATION.json and SHA256SUMS.txt record exact artifacts and test scope.

This package includes independent Rhino image preference state, stable serialized model selection (including old-label migration and canonical identity remapping), server-driven model capabilities shared with the generator card, plus desktop Chat settings grid/unsupported-mask-notice layout repair. Paired versions: desktop 8.0.27-beta.11 / plugins 0.1.0-beta.11. Tests: 89 targeted frontend, TypeScript passed, 60 C# bridge checks, each Rhino plugin built with zero errors/warnings; Vite and NSIS builds succeeded. No running desktop/Rhino files or registry were updated, no paid generation was replayed. Runtime visual UI verification is not claimed. User requested actual packaged output, so deliver exact new paths instead of asking to close apps again.

## 2026-11-10 Beta.12 final paired release completed

Output: release-assets/rhino-beta12-reference-modeling-chat-settings-20261110. Desktop 8.0.27-beta.12 / plugins 0.1.0-beta.12. Includes the NSIS installer, desktop/inspiration-drawer.exe, Rhino8-Plugin-Beta12.zip, Rhino9-Plugin-Beta12.zip and complete unpacked .NET 7/.NET 8 plugin payloads. README.md contains current Chinese installation and acceptance instructions; it supersedes older release-specific instructions.

Fixes: explicit Rhino geometry/modeling requests use selected canvas references and document context without requiring a viewport capture, even with attachViewport enabled. Geometry turns expose native MCP tools instead of image/video tools and do not auto-fallback to paid generation. Actual visual requests still require valid Rendered raster captures and retain blank-image rejection; no Shaded/wireframe fallback. Desktop Chat image settings use one compact primary row (icon/model, ratio, resolution), visible dropdown overflow, and optional capability-based extra controls. The unsupported-mask sentence is removed.

Verification: 145 targeted frontend tests across 16 files and TypeScript passed; 60 C# bridge checks passed; both Rhino plugin builds had zero warnings/errors. Final Vite, Cargo and NSIS builds succeeded (Rust/Vite advisory warnings recorded in VERIFICATION.json). Build session 55369 completed with BETA12_FINAL_PACKAGE_BUILT. All 11 recorded production-input hashes remain unchanged. Delivered desktop EXE and installer exactly match final target outputs; all six plugin payload files match src-tauri/resources and are embedded byte-for-byte in the final desktop EXE. Both ZIP archives were opened and all three members each verified by SHA256. BUILD-INPUTS.json, BUILD-MANIFEST.json, SHA256SUMS.txt and VERIFICATION.json record the final package.

No live app files, registry, models, canvas content or conversation data were changed. No paid generation was replayed. Runtime desktop/Rhino visual QA and real geometry modeling were not performed this run; browser backend was unavailable and a native probe launch did not run. Do not claim those validations. Earlier intermediate Beta.12 desktop/installer artifacts were preserved only in outputs/beta12-before-final-compact-ui-20261110; do not deliver those.

Delivery should give the exact final package path and recommend installing the paired desktop followed by Settings > Rhino plugin > one-click update; do not ask the user to close apps merely to receive files.

## 2026-11-10 Beta.13 native argument recovery — final paired release

User screenshot: rhino_native_run_python failed with Missing required Rhino MCP argument(s): script. A read-only query of the matching Beta tool receipt confirmed arguments_json was {} and the failure was raised before executor dispatch. No replay of that user modeling task was attempted. The persisted normalized receipt cannot prove the original upstream argument representation.

Implemented typed local preflight errors (rhinoArgumentRecovery.ts) for malformed JSON, missing required arguments and basic type errors across all registered native MCP tools. A locally rejected call receives exact inputSchema feedback and one model correction using a forced named tool and non-streaming completion, without a user approval. Later dependent calls in the same batch are not dispatched. Successful identical writes within that repair continuation reuse prior receipts instead of replaying. Remote/dispatched write failures remain terminal, even if their error text resembles local argument errors. Text-only replies and reused-receipt-only continuations cannot falsely mark a rejected modeling call successful. Workflow instructions explicitly require complete run_python/run_csharp script strings.

Rust provider parser now preserves object-valued function.arguments rather than ignoring them; normal JSON string streaming remains supported. A focused Rust test covers both representations. This is compatibility hardening, not a claim that object arguments caused this exact user failure.

Verification: 158 targeted frontend tests across 16 files, TypeScript, 1 Rust argument-parser test and 60 C# bridge checks passed. Both Rhino 8 (.NET 7) and Rhino 9 (.NET 8) plugins built with 0 warnings/errors. Final Cargo release/Vite/NSIS build succeeded in session 90747 with BETA13_FINAL_REPAIR_GUARD_RETRY_PACKAGE_BUILT. A prior final-build attempt (63941) crashed rustc with STATUS_ACCESS_VIOLATION; retry of unchanged sources/profile succeeded. This is documented in VERIFICATION.json. The first Beta.13 build is intermediate and backed up in outputs/beta13-before-final-repair-guard-20261110; do not deliver it.

Final output: release-assets/rhino-beta13-native-argument-recovery-20261110. Desktop 8.0.27-beta.13 / plugins 0.1.0-beta.13; installer Inspiration Drawer Rhino Beta_8.0.27-beta.13_x64-setup.exe; desktop/inspiration-drawer.exe; Rhino8-Plugin-Beta13.zip; Rhino9-Plugin-Beta13.zip. All 13 final production-input hashes remain unchanged. Delivered EXE and NSIS installer match final target files byte-for-byte and are newer than final BUILD-INPUTS.json. All six plugin resource files match the embedded desktop bytes; ZIP members were opened and hashes checked. BUILD-MANIFEST.json, SHA256SUMS.txt, BUILD-INPUTS.json, FIX-VERIFICATION.json and VERIFICATION.json record delivery integrity and scope. outputs/verify-beta13-release.mjs can recheck the final manifest/checksums.

No live app files, RhinoAI RHP, registry, models, canvas or chat data were modified. No paid image generation or real modeling was executed, and GUI runtime validation is not claimed. User should upgrade the paired desktop and use Settings > Rhino plugin > one-click update; do not imply that building replaced their current app or repaired old failed history automatically.

## 2026-11-10 Beta.14 controlled profile geometry — completed

User requested an actual fix after a dispatched run_python failed with 01_Perforated_front_arm planar region failed. Exact script/receipt were read from Beta chat DB read-only. A static diagnostic identified x=±18/y=36/r=1.8 circles crossing the outline; native RhinoCommon validation of the actual post-fillet curves subsequently confirmed these exact two conflicts (zero-based holes 12 and 13). No raw failed user script was replayed.

New production files: src/features/rhino/rhinoSafeModeling.ts and modeling/profile_solids.py. The safe_profile_solids helper is registered only when discovered native run_python is compatible, and compiles a fixed trusted geometry program with base64 JSON input. It still uses the official native proxy with document fingerprint binding; no replacement arbitrary-code executor. Fixed program validates closed/planar/valid/self-intersection-free actual filleted curves, strict hole containment and non-overlap/nesting, min walls/webs, region count, and valid closed Breps for every part entirely in memory. Only then does it add named independent solids. It does not create layers/materials or alter existing geometry, cameras, selections, unit systems or GH. It does not silently remove holes or change hole radii. A commit-stage failure removes only known newly added object IDs and remains terminal even after cleanup. It never uses global Undo to repair. Separate solids are not claimed as a boolean-unioned assembly.

Rhino client discovers and exposes the controlled helper, withRhinoTools parses unique structured receipts, router redirects common raw Python/C# CreatePlanarBreps+AddBrep patterns before dispatch to the safe declarative route. Other native tools remain available; this is reliability routing, not an arbitrary script sandbox. Runtime permits one correction only for this trusted helper when native preflight reports documentChanged=false; commit/transport/raw-script failures still stop. Geometry failures show geometry-specific status, not falsely “not sent to Rhino.” A validated-only plan cannot be called modeling complete: one bounded forced-helper continuation requests commit, otherwise reports incomplete. Existing no-replay rules and successful-write receipt reuse during repair remain.

Native verification: scripts/verify-rhino-safe-profile.py was executed with the exact production program through bound RhinoAI run_python. Original failed profile was validated without document writes. Changing only the two circular-hole center x values from ±18 to ±16, preserving radii and all other holes, made all three reference parts validate as closed solids. Actual additive commits, through-hole volume, second-part rejection before any write, and injected commit failure cleanup were tested in a disposable RhinoDoc.CreateHeadless document and disposed. 24/24 native Rhino 9 kernel checks passed. User current document stayed 0 objects / 2 layers / 1 material, modified flag unchanged; camera and selection before/after also identical. Evidence and program/harness SHA256 provenance are in outputs/rhino-safe-profile-20261110 and copied into release verification/. The corrected fixture is a geometry test, not photo-fidelity validation or a claim the user model was modified. Rhino 8 runtime kernel execution is not tested.

Automated verification: 176 frontend checks across 18 files, TypeScript, 60 C# transport checks, and both plugin builds passed (0 warnings/errors for Rhino builds). Final Vite/Cargo/NSIS build in session 89392 completed with BETA14_VALIDATED_GEOMETRY_PACKAGE_BUILT. Desktop 8.0.27-beta.14 / RHP 0.1.0-beta.14. Packaging script now recopies the final NSIS-patched EXE after bundling rather than shipping the earlier cargo EXE.

Final output: release-assets/rhino-beta14-validated-geometry-20261110. Contains Inspiration Drawer Rhino Beta_8.0.27-beta.14_x64-setup.exe, desktop/inspiration-drawer.exe, Rhino8-Plugin-Beta14.zip, Rhino9-Plugin-Beta14.zip and complete unpacked .NET 7/.NET 8 payloads. All 18 recorded production-input hashes unchanged; desktop/installer identical to final target bytes, all six embedded plugin files verified byte-for-byte, ZIP member contents/hashes verified. BUILD-MANIFEST.json, BUILD-INPUTS.json, SHA256SUMS.txt, VERIFICATION.json and verification/NATIVE-KERNEL-TESTS.json record scope. Root/integration README updated with current installation and limitations.

No running app/RHP files were replaced, no installation registry was written, no chat/canvas data or current user document geometry was changed, no paid generation occurred. Real chat-provider tool choice/correction, Rhino 8 kernel, GUI visuals and photo-fidelity are not claimed tested. Advise paired desktop upgrade plus Settings > Rhino plugin > one-click update. Do not tell the user this only changed prompts; explain the controlled geometry path and the actual native kernel regression evidence.


## 2026-11-10 Beta.19: raw extrusion type preflight

User screenshot: native Python plate_xz fails because BrepFace was supplied to Surface.CreateExtrusion(Curve, Vector3d). Added conservative local Python/C# type/arity preflight at router, bound executor and client boundaries. A new typed local rejection feeds the existing one-correction flow with source line and exact official overload guidance; skips dependent calls and reuses completed writes. Unknown dynamic types are not guessed; no scripts are rewritten or executed by the checker. Preserve trimmed-face holes, dimensions and curved/3D intent; do not replace arbitrary modeling with flat plates.

Structured MCP errors now have a typed error class. Recognizable settled Python tracebacks may trigger one read-only bound-document geometry readback; partial object deltas and original error are kept. Transport failures/timeouts do not trigger another queued request. Raw remote errors still NEVER authorize replay, even with unchanged geometry (not proof of zero metadata/other side effects). stderr tracebacks cannot masquerade as success. UI gives a short diagnosis, keeps full technical receipts, and separates local script correction from argument completion.

Retains Beta.18 multi-process discovery, instance+document+canvas task/conversation identity and independent heartbeats. New package target: release-assets/rhino-beta19-script-type-preflight-20261110, desktop 8.0.27-beta.19 / plugin 0.1.0-beta.19. No installed/running binaries overwritten and no live document/modeling calls executed during this revision. Automated tests are synthetic local/loopback regression checks, not reference-photo fidelity or real provider repair verification. Check VERIFICATION.json for final build/integrity results; never claim an earlier failed task was resumed.


## 2026-11-10 Beta.20 work

User requires general root-cause-based modeling fixes, not model-specific geometry, and requested careful native RhinoAI.rhp comparison. Static audit completed on the supplied signed file; report docs/rhino-native-audit-2026-11-10.md. Do not copy decompiled vendor implementation or claim native cannot fail. Actual latest failed plans (read-only DB) changed only minWall 6 -> 3; all crossing holes/outer coords unchanged. Production contains no fixture coords. Added bounded two-correction zero-write diagnostics/progress checks, no hole deletion shortcut, no native write replay, and clearer specialized-tool capability guidance. Real provider/model/photo-fidelity validation remains pending.

Additional user requests: implied image-edit intent should not require a second output keyword; reference-supply replies inherit the preceding USER task, explicit no-generation/analysis/wait instructions take precedence. New attached image overrides older sources. Conversation title should be first sentence of opening user request, not random IDs. Added read-only earliest-user-message projection for legacy placeholder labels and removed panel suffixes; IDs/bindings/custom titles untouched.

Versions desktop 8.0.27-beta.20 / plugin 0.1.0-beta.20; release-assets/rhino-beta20-contextual-chat-20261110. Build with installed Rust 1.98.0, isolated target-beta9, CARGO_BUILD_JOBS=1 and RAYON_NUM_THREADS=1 (older/compiler-parallel settings crashed previously). Packaging script now bundles the exact already-built EXE instead of compiling twice. Check final VERIFICATION.json before claiming a package delivered.


## 2026-11-11 Beta.21 semantic visual intent

User correction: do not hard-code steering-wheel/domain terms; many visual requests do not contain the words image/render/generate. Reworked image capability routing around actual attachment/recent-media context plus a small domain-neutral visual-intent classifier. The model receives generic semantic instructions; image tools are not exposed for ordinary desktop chat unless current visual context or explicit visual-capability intent exists. Router blocks actual image calls for explicit analysis/wait/no-generation text. Current user attachments override older references; explicit new-topic/reset prevents carryover. Tests should be treated as behavior proofs, not subject templates.

No live provider or paid generation used. Before rebuilding Beta.21, full test suite was 2311/2311 and typecheck passed. Release target: release-assets/rhino-beta21-semantic-visual-intent-20261111.
