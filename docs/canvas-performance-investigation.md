# 两百多张图片的画布性能排查

日期：2026-10-09。本地客户端 8.0.21；保留此前工作流、原生诊断和鉴权修改。本轮没有修改服务端，没有推送、发布或部署。

## 确认的开销与本轮优化

1. `CanvasNodeLayer` 原先把画布缩放值、模型目录、AI 设置等作为每个图片节点的渲染依赖。缩放提交时，普通图片也会重跑完整 `CanvasNode`/ViewModel 的模型能力、选项与预览计算。现在仅独立普通图片和已成功的独立生成图片忽略这些无关依赖。文字、视频、工作流、展开槽位、桥接节点、处理中/错误节点保持原来的依赖。图片内容、位置、旋转、输入引用与构图分析变化仍会失效。
2. 缓存节点中的事件函数可能来自较早的父级渲染。新增的动作转发保持渲染数据和只读 getter 快照，同时让事件调用当前的拖动、选择、菜单与编辑动作，避免缩放缓存后使用旧闭包。动作引用仅在 React 提交后的 layout effect 中更新，避免把尚未提交或中断的 transition 暴露给旧 UI。
3. `getCanvasItemElement` 原来在每个拖动帧为每张被移动的图片执行一次 DOM 选择器查询。现按画布 DOM 根节点缓存实际元素；命中时检查它仍在当前画布、ID 相同。卸载、重新挂载、画布切换和先前查询未命中均会重新查询；缓存有数量上限，避免长期保留大量脱离 DOM 的节点。
4. 连接按钮遮挡检查原来为每个按钮扫描其他全部节点。现每次从当前世界坐标边界建立空间索引，只检查所在网格及少量超大节点。保留原选中优先级、节点顺序、包含边缘及受影响节点判断。索引每次重建，位置、尺寸、输出和槽位高度变化不会沿用旧几何数据。

本轮生产代码修改仅涉及上述只读渲染依赖和查找。没有改生成并发、网络行为、计费、移动提交、输入延迟提交、保存格式、撤销快照或工作流执行实例，也没有全局禁用 GPU 或给所有节点强制建层。

## Windows/WebView2 实测

通过隔离的原生测试程序运行真实 `CanvasNodeLayer`、`CanvasNode` 和遮挡/拖动绘制控制器。240 张各自不同的本地 SVG 测试图、1 个文字节点；不访问用户图片、数据库、服务器或付费生成。全部图片在缩小的视图内挂载。

相同代码场景在优化前与优化后运行，均使用本机开发版 React/WebView2。P95 为测试中 95% 分位的 JavaScript/React 操作耗时，**不是完整画面的 GPU 帧耗时或真实用户 FPS**。

| 指标 | 优化前 PID 54296 | 优化后 PID 28908 |
| --- | ---: | ---: |
| 30 次缩放的图片节点计算次数 | 7,200 | 0 |
| 缩放提交 P95 | 38.7 ms | 5.9 ms |
| React 缩放渲染 P95 | 24.1 ms | 1.3 ms |
| 20 次文字提交带来的图片节点计算 | 0 | 0 |
| 50 张图移动 90 帧的节点 DOM 查询 | 4,500 | 50 |
| 拖动绘制 P95 | 0.5 ms | 0.3 ms |
| 全部连接按钮遮挡检查 P95 | 3.0 ms | 1.0 ms |

较早的一次优化后运行 PID 34076：缩放提交 4.5 ms、遮挡 0.9 ms、拖动 0.2 ms。最终表格使用添加回归检查和提交阶段动作转发后的运行，避免只选最快结果。

最终检查通过：

- 缩放和移动之后 240 个图片元素及来源保持不变，无额外来源切换；节点数量保持 241，50 个移动节点位置正确。
- 20 次文字提交保留最终内容；通过真实 React 文本框派发组合输入/输入事件，并在期间缩放，900 ms 后文字数据和 DOM 内容一致。这是程序模拟组合事件，未人工测试所有 Windows 输入法。
- 缓存图片的按钮/指针事件调用新渲染中的动作；没有使用旧动作版本。
- 普通遮挡、选中节点优先及遮挡节点移开后露出连接按钮均通过。
- 没有前端 error/unhandledrejection；原生窗口可见且未最小化。

工作流 fixture 改为通过真实 `CanvasNodeLayer` 渲染后另行验证：实际等待 100 秒、返回前后各 90 次缩放、卸载节点时返回结果，再挂载继续缩放。PID 52916，总计约 103.3 秒；提交/执行实例均为 1，预览/尺寸缓存未变化时失效次数均为 0，结果保持 success，工作流和普通生图图片解码正常、图片元素和来源稳定。

最终把动作引用更新移到提交阶段、保留只读 getter 的渲染快照后，再执行同一交错场景的 `-Quick` 验证（省略 100 秒等待）。PID 51068，总计约 3.3 秒；提交/执行实例仍为 1，预览/尺寸缓存失效仍为 0，结果、图片来源和元素均保留，窗口可见，无前端异常。最终代码的长等待不再重复运行；完整 100 秒运行发生在这两处小调整之前。

## 自动化与构建验证

- 10 个相关测试文件、41 项通过：新增渲染依赖/动作/DOM 缓存/空间索引回归，加上节点渲染门、工作流缩放、画布交互、持久化、分组、缩放尺寸、副本隔离和原生诊断前端测试。
- 空间索引通过固定种子的多节点/多测试点与完整扫描对比，覆盖交叠、边缘、负坐标、超大节点、移动和选中条件。
- `npm run build` 通过。保留现有 Browserslist、依赖注释及大 chunk 警告；本轮没有更新依赖或调整打包方案。
- 最终两处小调整后，重新运行 3 个相关文件的 13 项测试、`npx tsc --noEmit` 和 `npx vite build` 均通过；本轮没有因此重复扩大测试范围。
- 本次没有改变保存和撤销逻辑。既有持久化/序列化测试通过，但没有对真实用户数据库进行写入或恢复测试。

复现命令：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/run-workflow-render-probe.ps1 -Performance
# 工作流长等待验证单独执行，不和性能 fixture 同时运行
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/run-workflow-render-probe.ps1
```

## 仍有空间，但本轮未改变的路径

- 图片首次挂载仍会经过完整的节点 ViewModel 计算。现在先消除缩放与模型设置引起的重复计算，没有拆分所有图片节点 UI，以控制功能回归范围。
- 缩略图未准备好时可能使用原图；导航缩略图代码会同时启动多个解码/缩图任务。大量高分辨率原图可能造成额外解码或内存压力，这是静态风险，本次 SVG fixture 没有验证它是用户卡顿根因，也未改变图片加载队列。
- 全量状态保存仍把全部节点送入原生 `save_canvas_state`，原生命令会同步整理、序列化和写文件。含大量内嵌图片数据或很大的工作流时可能在保存阶段停顿；本轮没有改变保存顺序、备份/恢复或持久化协议。
- 未测量 GPU/显存峰值，也未在用户实际的两百多张高分辨率 JPEG/PNG 画布或其他用户硬件上验证。因此可确认减少了重复渲染和扫描，不能保证所有画布卡顿已经消失。

## 2026-10-30 isolated high-resolution native WebView2 measurements

### Scope and startup fix

This task changed only the isolated high-resolution probe TSX, runner, native example, and this dated report. Production App/controllers/image presentation code was not modified or launched by this task. No user images/database/profile, paid model calls, or remote images were used. All inputs were generated in Canvas. Each run used a fresh PID-specific temporary WebView2 user-data directory.

The original 0xC0000139/STATUS_ENTRYPOINT_NOT_FOUND was resolved by adding the CommonControls manifest to the disposable example executable, matching the working workflow probe. The runner now separately builds with Rust 1.98.0, retains the native process handle, captures stdout/stderr and actual exit status, and explicitly fails incomplete/failed JSON. Latest runs exit 0; the intentionally failing frozen control exits 1. Native entrypoint failure did not recur.

App::run previously exited the process before profile cleanup. The example now uses run_return; when WebView2 still holds files, the runner removes only the verified PID-specific disposable profile after the process exits, without touching any other browser/process/profile.

### Corpus and instrumentation changes

The original gradient corpus produced 226,797,007 encoded bytes for 100 images. Two 250-image attempts failed during generation with WebView2 NotReadableError, before any canvas timing; the diagnostic attempt completed 231 images. Full-Blob fingerprint copies were replaced by bounded head/tail/size fingerprints, but this alone did NOT fix the failure. The exact backing-store error cause is not established.

To obtain safe measurements, quantized-raster-v2 uses flat raster bands/detail instead of the original gradients/diagonals. Every JPEG/PNG still has independent encoded pixels at 2560x1920; 100/250/500 distinct sample fingerprints passed. Encoded bytes are 31,846,185 / 79,246,628 / 158,818,120, split evenly between JPEG and PNG. This is NOT a photographic or very-large-encoded-file I/O benchmark, and v1/v2 results must not be compared as equivalent workloads.

Added explicit decode attempt/success counters and img.decode promise timing. The promise starts after load/complete, so it is NOT total source-to-visible latency or the full first-decode CPU cost. Existing frame, long-task, DOM mount/source, missing-image, React commit and instrumentation CPU measurements remain available in JSON.

### Results (single runs, no statistical performance guarantee)

All measured native windows were visible and not minimized, DPR 1.5, surface 1249x680 CSS pixels. Default zoom-out target was 0.56, with fixed 480 WORLD-pixel overscan and per-transform live fixture membership updates. No forced GC, tracing or user app interaction was performed.

| Corpus count | Transform | Phase | RAF P50 ms | RAF P95 ms | RAF P99 ms | RAF max ms | Peak mounted | decode-promise P95 ms |
|---:|---|---|---:|---:|---:|---:|---:|---:|
|100|stable|zoom-out|6.9|14.0|41.7|76.4|63|31.3|
|100|stable|reverse|7.0|20.8|62.4|90.3|63|39.5|
|250|stable|zoom-out|7.0|13.8|69.5|111.2|80|44.4|
|250|stable|reverse|6.9|13.8|69.4|111.2|80|50.2|
|500|stable|zoom-out|6.9|13.8|62.5|277.8|80|62.1|
|500|stable|reverse|7.0|27.8|180.7|256.9|80|197.8|
|100|legacy|zoom-out|6.9|7.1|27.8|55.6|63|45.5|
|100|legacy|reverse|6.9|7.1|41.6|76.3|63|45.7|

All default live runs passed the DOM/decode checks; **this does not mean smoothness or flicker passed**. Stable 100/250/500 image mount totals were 90/121/135, remounts 27/41/55, successful explicit decodes 90/121/135. Each had zero load/decode errors, assigned-src changes/clears and retained-visible-image losses. Newly exposed images during zoom-out were 23/28/30, all decoded while zoom remained active. Final settle/idle P95 was about 7ms. The stable 500 run still had 5 long tasks during zoom-out and 11 during reverse, and two extra begin/finish transitions: event-loop stalls exceeded the production settle debounce even during a scripted continuous burst.

Legacy 100 was faster by RAF in this one run than stable 100. This does not establish that legacy fixes visual flicker, nor that stable is preferable by speed. There were no repeated randomized trials, and cache/host load and GPU presentation were not controlled/measured. The synthetic wheel loop is timer-driven, so a stalled main thread also produces fewer wheel events; the event stream is not OS input and not identical frame-for-frame between runs.

### Frozen viewport control and parent scheduler boundary

Added `-Viewport live|frozen` / `viewport=live|frozen` and `-ZoomOut` / `zoomOut`.

At 0.56 the frozen 100-image run passed because the visible area was still covered by pre-mounted overscan. That is not evidence the frozen scheduler is correct. At 0.28 the control crossed the pre-mounted boundary:

- Live: zoom-out P95 41.6ms/P99 125ms/max 291.7ms, 88 newly exposed images decoded while zooming, zero unresolved visible images at burst end. Missing-mounted samples=0; transient missing-decoded samples=15. Peak mounted=100 only because this zoom reveals nearly the whole 100-item fixture, not because culling was disabled.
- Frozen: zoom-out P95 7ms/P99 7.1ms, but missing-mounted samples=13,379 and missing-decoded samples=13,379, peak missing-mounted=58. At the burst check 58 currently-visible images remained unresolved; 58 mounts happened only during settle. Settle P99=180.6ms/max=215.3ms. This intentionally fails newlyExposedLoadedBeforeSettle and exits 1; final images eventually decode, which must not be mistaken for a pass during wheel.

**Critical limitation:** fixture live mode calls its own visual-world refreshViewport on every transform and bypasses the App scheduler. It therefore bypassed the parent-discovered frozen production viewport bug. The frozen option models that symptom only; it is not a copy/test of App logic. Parent reports a new 80ms visual-world scheduler and screen-pixel overscan, but this task did NOT validate that integration. Fixed fixture world-pixel overscan and per-transform updates differ from it.

RAF frame intervals are scheduling/presentation PROXIES, not GPU frame times. DOM continuity and img.decode cannot detect GPU/compositor tile flashes with intact DOM. Production cache/upgrades, thumbnail-original swaps, navigation, persistence and real App scheduling are not measured. Do not claim GPU flicker fixed from these results.

### Reproduction and artifacts

```powershell
# Default live production-helper fixture, 100 first; 250/500 separately if safe.
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/run-canvas-highres-probe.ps1 -Counts 100
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/run-canvas-highres-probe.ps1 -Counts 250 -SkipBuild
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/run-canvas-highres-probe.ps1 -Counts 500 -SkipBuild
# Symptom controls; frozen below is EXPECTED to fail the loading check.
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/run-canvas-highres-probe.ps1 -Counts 100 -ZoomOut 0.28 -Viewport live -SkipBuild
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/run-canvas-highres-probe.ps1 -Counts 100 -ZoomOut 0.28 -Viewport frozen -SkipBuild
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/run-canvas-highres-probe.ps1 -Counts 100 -Transform legacy -SkipBuild
```

Every directory below is under `D:\Temp\canvas-highres-probe-logs-<id>\result.json`:

|Run|Log-directory ID|
|---|---|
|stable 100, v2|d977fef8918e4f88930eb3e204227161|
|stable 250, v2|fb69fa04ba544c0e992bc3d356fb3372|
|stable 500, v2|e66678ce459445c189a0330b80fd635f|
|legacy 100, v2|23b47291a2104fef9003ee469cbce0b4|
|live 100 / 0.28|c1350b5a9b8b485ab7fef9dff5e59831|
|frozen 100 / 0.28, intentional fail|a2bab2a7953b469bb7c633cd9023b8fc|
|initial gradient 100, NOT comparable v2|1740648bd4e8469d87e15e58e44f4ce0|
|gradient 250 generation failure|504be1faedce41d998776423ed1adc81|
|gradient 250 diagnostic failure at 231|04157bfb552b4cf7b65a1cd0f074ed65|

Validation: strict fixture TypeScript (es2022/dom/dom.iterable, vite/client) passed; PowerShell AST parse has zero errors; Rust 1.98.0 cargo build --locked --example canvas_highres_probe passed. No new dependency or production-source change was made by this task. Chromium emits a post-measurement unregister-class warning (1412); latest runs still return their actual 0/1 result and remove their disposable profiles. Early-run retained profiles may remain under the dedicated probe temp base; logs/results are intentionally retained.
## 2026-10-30 scheduled viewport helper verification

### What was added

The isolated fixture now supports `viewport=scheduled`. This mode imports the production helpers:

- `createCanvasViewportScheduler(80)` from `src/features/canvas/canvasViewportScheduler.ts`;
- `readCanvasVisualViewport(...)` from the same module;
- App-like screen-pixel overscan: `480 / liveScale` world pixels for the non-drag viewport path.

Membership updates are coalesced by the production 80ms scheduler while zooming instead of running on every transform. The existing `viewport=live` and `viewport=frozen` modes remain available as fixture baselines. The native runner accepts `-Viewport scheduled|live|frozen`.

This is an **App-like production-helper adapter**, not a full App scheduler test. It does not run App's React lifecycle, sidebar width, source-upgrade queue, persistence, selection/drag overscan, or production image cache.

### Bounded run

Only one new native run was performed, as requested:

- 100 synthetic independent 2560x1920 JPEG/PNG images;
- stable transform only;
- zoom-out target `0.28`, which crosses the fixed overscan boundary;
- native WebView2, visible window, DPR 1.5;
- no production app, user data, paid calls, or extra tooling.

Result JSON: `D:\Temp\canvas-highres-probe-logs-b450a0d278a2461fa2c8f6bba28dc05d\result.json`.

### Scheduled-mode measurements

| Phase | RAF P50 | RAF P95 | RAF P99 | Max | Scheduled updates during zoom | Missing-mounted samples |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| continuous zoom-out | 7.0ms | 41.6ms | 277.8ms | 555.6ms | 27 | 0 |
| continuous zoom-in | 7.0ms | 20.9ms | 347.3ms | 548.5ms | 21 | 0 |
| reversed zoom | 7.0ms | 14.0ms | 97.3ms | 222.1ms | 32 | 0 |

The run recorded 284 scheduler requests and 82 completed scheduled viewport updates while zooming. It mounted 188 images over the complete scripted sequence, with 88 remounts, zero load/decode errors, zero assigned-source clears, and zero retained-visible-image losses. These frame values are RAF/main-thread scheduling proxies, not GPU frame times.

### Did nodes appear before wheel stopped?

**Yes, in this bounded fixture sense:** the scheduled path performed membership updates while zoom was active, and the zoom-out phase recorded zero missing-mounted samples. It exposed 74 new items during zoom-out; all 74 decoded while zoom was still active, and no exposed item remained unresolved at the burst boundary.

The fixture's scripted wheel phase is 2600ms followed by a 1000ms reveal-grace interval that continues small wheel events while zoom remains active. Of the 74 zoom-out exposures, 58 had decoded by the 2600ms boundary and the remaining 16 decoded during the continued reveal-grace interval. Therefore the result supports “nodes begin appearing before the scripted wheel phase ends,” but does **not** support “all newly exposed images are decoded before wheel input stops.”

### Comparison with existing baselines at zoomOut=0.28

| Adapter | Zoom-out RAF P95/P99 | Missing-mounted samples during zoom | Newly exposed | Decoded while zooming | Result |
| --- | ---: | ---: | ---: | ---: | --- |
| live every transform | 41.6ms / 125.0ms | 0 | 88 | 88 | pass |
| frozen during zoom | 7.0ms / 7.1ms | 13,379 | 88 | 30 | intentional fail |
| scheduled production helpers, 80ms | 41.6ms / 277.8ms | 0 | 74 | 74 | pass |

The scheduled run computed filtered viewport membership; it did not force cull=all. Its peak mounted count was 100 in this particular 0.28 viewport because the zoom revealed nearly the entire 100-item fixture; this is not evidence that culling was disabled.

### Interpretation and limits

The scheduled mode confirms that the imported production scheduler and visual-viewport reader can update fixture membership during an active zoom and avoid the frozen-control blank-node symptom in this scenario. It also shows that this membership update path does not remove large main-thread stalls: the scheduled zoom-out P99 was 277.8ms and its maximum observed RAF interval was 555.6ms.

The run recorded 11 begin/finish transitions across the three scripted wheel phases, so main-thread stalls also allowed intermediate settle/restart cycles; it is not proof of uninterrupted zoom state for the entire gesture. The actual 80ms delay is a timer target, not a bound under those stalls.

No claim is made about the full App, the parent's complete integration, actual GPU/compositor flicker, or production image/cache behavior. RAF intervals and DOM/image decode checks cannot establish GPU presentation smoothness or rule out a compositor flash with intact DOM. Full App validation remains a separate manual/runtime task after the parent integration.

Validation after this addition: fixture strict TypeScript passed; Rust 1.98.0 locked example build passed; the native scheduled run exited 0; the isolated profile was verified and removed after exit; no 250/500 run or alternate transform was performed for this final verification.

## 2026-10-30 08:58 CST - frozen-source BEFORE / combined-patch AFTER

### Scope and run validity

This bounded comparison used the existing isolated native WebView2 fixture without changing its source, native host, runner, parameters, corpus, or image instrumentation. It did not launch or control the production application, read user files, or call models. No Cargo build was needed (`-SkipBuild`). Only 100-image cases were run; no 250/500-image expansion or alternate transform was performed.

Identical command for the primary BEFORE, first AFTER, and one confirmation AFTER:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/run-canvas-highres-probe.ps1 -Counts 100 -Viewport scheduled -Transform stable -ZoomOut 0.28 -SkipBuild
```

Common environment: 100 distinct synthetic 2560x1920 images (50 JPEG, 50 PNG), 31,846,185 encoded bytes, DPR 1.5, 1249x680 CSS-pixel canvas surface, scheduled-production-80ms, 480 screen-pixel overscan divided by live scale, 2600ms wheel phase, 1000ms continued-wheel reveal grace, 1200ms idle, sampleEvery=1. The complete config and environment objects match in all three results.

| Run | Completed (Asia/Shanghai) | Native exit | Visible / minimized at result | Source verification | All fixture checks |
| --- | --- | ---: | --- | --- | --- |
| BEFORE `a033...` | 08:42:10 | 0 | true / false | 556 captured source/config files unchanged | pass |
| AFTER 1 `fbab...` | 08:54:50 | 0 | true / false | 560 captured source/config files unchanged | pass |
| AFTER confirmation `8e0...` | 08:58:20 | 0 | true / false | 560 captured files unchanged; zero differences from AFTER 1 source manifest | pass |

Earlier preliminary runs are not substituted into the numerical comparison: `8e5...` was minimized at result and is excluded; `609...` was non-minimized but failed newly-exposed-before-settle and is retained only as separate failure evidence. A failing loading assertion does not inherently invalidate a source-stable, non-minimized performance measurement. The selected primary `a033...` additionally passed every assertion.

The parent wired a standalone-image early return in `CanvasNode` and imported non-inheriting transform `@property` registrations through `index.css`. A persistence occlusion empty-handle return was already present in the primary BEFORE. Captured revisions also include navigator/render-identity work. This is a combined-revision comparison, not a CSS-only or fast-path-only attribution experiment; the fixture does not run App's viewport-update islands.

### RAF intervals: all phases

Values are P95 / P99 / maximum, in milliseconds. A dash means no sample, not zero. RAF intervals are scheduling/presentation proxies, **not GPU frame times**.

| Phase | BEFORE | AFTER 1 | AFTER confirmation |
| --- | --- | --- | --- |
| Initial visible decode | 55.5 / 55.5 / 55.5 | 83.4 / 83.4 / 83.4 | 62.4 / 62.4 / 62.4 |
| Idle baseline | 7.0 / 20.8 / 69.4 | 7.0 / 7.1 / 7.1 | 7.0 / 7.1 / 20.8 |
| Continuous zoom out | 48.7 / 340.3 / 375.1 | 13.9 / 55.6 / 208.3 | 13.9 / 90.2 / 437.6 |
| Zoom-out settle/idle | 7.0 / 7.1 / 7.1 | 7.0 / 7.1 / 7.1 | 7.0 / 7.1 / 7.1 |
| Continuous zoom in | 13.9 / 132.0 / 666.6 | 7.1 / 62.5 / 208.4 | 7.1 / 263.9 / 507.0 |
| Zoom-in settle/idle | 7.0 / 7.1 / 20.9 | 7.0 / 7.1 / 7.2 | 7.0 / 7.1 / 7.1 |
| Reversed zoom | 48.6 / 125.0 / 229.2 | 13.9 / 187.6 / 430.5 | 7.1 / 97.2 / 319.3 |
| Reversed-zoom settle/idle | 7.0 / 7.1 / 7.1 | 7.0 / 7.0 / 7.1 | 7.0 / 7.1 / 7.2 |
| Final idle | 7.0 / 7.1 / 13.8 | 7.0 / 7.1 / 7.1 | 7.0 / 7.1 / 7.1 |

### React Profiler actualDuration

The fixture names this field `reactCommitDuration`, but its Profiler callback records React's `actualDuration` argument. It measures React render work associated with a commit, not browser style/layout/paint, the commit phase alone, or total main-thread time.

Values: P95 / P99 / maximum milliseconds; sample count in parentheses.

| Phase | BEFORE | AFTER 1 | AFTER confirmation |
| --- | --- | --- | --- |
| Initial visible decode | 16.9 / 16.9 / 16.9 (2) | 12.4 / 12.4 / 12.4 (2) | 12.1 / 12.1 / 12.1 (2) |
| Continuous zoom out | 2.7 / 2.7 / 2.7 (12) | 3.7 / 3.7 / 3.7 (7) | 2.6 / 2.6 / 2.6 (10) |
| Continuous zoom in | 2.1 / 2.1 / 2.1 (16) | 1.6 / 1.6 / 1.6 (15) | 1.5 / 1.6 / 1.6 (20) |
| Reversed zoom | 4.8 / 4.8 / 4.8 (18) | 3.8 / 3.8 / 3.8 (7) | 2.8 / 2.8 / 2.8 (12) |

Initial-render duration decreased in both AFTER runs, and zoom-in/reverse React render durations also decreased. Zoom-out render P95 was mixed (3.7ms, then 2.6ms against 2.7ms); the data do not support claiming all React costs fell.

### Main-thread long tasks

Values: count / maximum milliseconds / total milliseconds. No long tasks were reported in idle/settle phases.

| Phase | BEFORE | AFTER 1 | AFTER confirmation |
| --- | --- | --- | --- |
| Initial visible decode | 1 / 50 / 50 | 1 / 79 / 79 | 1 / 50 / 50 |
| Continuous zoom out | 6 / 377 / 1360 | 3 / 212 / 338 | 5 / 443 / 799 |
| Continuous zoom in | 6 / 449 / 1094 | 4 / 210 / 546 | 5 / 505 / 1579 |
| Reversed zoom | 8 / 224 / 929 | 6 / 432 / 1251 | 5 / 324 / 686 |

The unchanged fixture collects only each long task's `startTime` and `duration`, then reports `supported`, `count`, `totalMs`, and duration distributions. It does **not** retain `attribution[]`, task name, script URL, function, container type, or call stack. These measurements cannot establish that the remaining stalls are caused specifically by style invalidation, decoding, layout, or compositing.

### Decode and instrumentation overhead

Values: P95 / P99 / maximum milliseconds. `explicitImageDecodePromise` starts after load/complete; it is **not** full source-to-visible latency or first-decode CPU cost. Decoder work may already have finished, and main-thread blocking can delay promise delivery.

| Metric / phase | BEFORE | AFTER 1 | AFTER confirmation |
| --- | --- | --- | --- |
| Post-load decode, zoom out | 410.2 / 410.3 / 410.3 | 93.6 / 93.6 / 93.6 | 94.2 / 94.2 / 94.2 |
| Post-load decode, zoom in | 41.2 / 51.5 / 51.5 | 36.7 / 43.6 / 43.6 | 31.3 / 38.2 / 38.2 |
| Post-load decode, reversed zoom | 160.8 / 160.9 / 160.9 | 54.1 / 149.7 / 149.7 | 36.3 / 49.1 / 49.1 |
| Image-sampling CPU, zoom out | 0.2 / 1.2 / 1.2 | 0.2 / 1.0 / 1.9 | 0.2 / 1.3 / 1.8 |
| Image-sampling CPU, zoom in | 0.2 / 1.0 / 1.1 | 0.1 / 0.3 / 1.0 | 0.2 / 1.0 / 1.0 |
| Image-sampling CPU, reversed zoom | 0.2 / 1.4 / 3.2 | 0.1 / 1.8 / 2.7 | 0.1 / 1.2 / 2.2 |

### Lifecycle continuity and workload identity

| Whole-run counter | BEFORE | AFTER 1 | AFTER confirmation |
| --- | ---: | ---: | ---: |
| Image mounts | 230 | 188 | 202 |
| Image unmounts | 183 | 134 | 155 |
| Image remounts | 130 | 88 | 102 |
| Source getter calls | 230 | 188 | 202 |
| Loads / successful explicit decodes | 230 / 230 | 188 / 188 | 202 / 202 |
| Scheduled viewport updates during zoom | 85 | 94 | 88 |
| Wheel events | 349 | 425 | 373 |
| Applied zoom updates | 299 | 380 | 329 |
| Begin / finish transitions | 7 / 7 | 4 / 4 | 8 / 8 |

In every run, source getter calls equal mounts, mounts equal loads/successful decodes, and source clears, source changes, load errors, decode errors and retained-visible losses are zero. Both AFTER runs recorded zero missing-mounted or missing-decoded samples throughout the three zoom phases; newly exposed images were ready before settle checks. The initial load phase naturally contains predecode samples.

The time-driven wheel loop produces different event counts and intermediate viewports under different stalls. Therefore equal parameters and corpus do **not** imply identical event trajectories or mount/unmount totals. Lower remount totals are an observation, not proof that the patch directly changed lifecycle identity or culling. The fast path did not add an extra source getter call for each existing mounted image.

### Interpretation and remaining work

- P95 improved in all three zoom phases in **both** AFTER runs: zoom out 48.7 -> 13.9ms; zoom in 13.9 -> 7.1ms; reversed zoom 48.6 -> 13.9/7.1ms. This supports a repeated improvement in the common-case frame-interval distribution for this isolated scenario.
- P99, maximum intervals and long-task totals remain mixed. AFTER confirmation zoom-in P99 was 263.9ms versus 132.0ms BEFORE, with a 507.0ms maximum and 1579ms of long tasks. AFTER 1 reverse P99/maximum also regressed. Worst-case stalls are **not fixed**.
- This combined revision is not an experiment isolating non-inheriting CSS registrations from the image fast path. The parent separately reported a native DOM registration check (fallback .45, live .75, offsets 14/23, child live variable empty and offsets 0px); that check was not run by this benchmark task and did not mutate the high-resolution fixture. No separate CSS check was injected into these measurements.
- Do not infer App-wide update-island performance, production thumbnail/original behavior, photo-file I/O performance, GPU time/memory, or absence of compositor flicker. Those require separate profiling/visual validation. A CSS-only mechanism explanation remains a hypothesis without browser tracing or a controlled single-change test.
- No additional performance runs were started after the one confirmation AFTER. Source freeze may be released.

### Evidence artifacts

All JSON artifacts are local temporary outputs, intentionally retained:

| Artifact | Location |
| --- | --- |
| Primary BEFORE | `D:\Temp\canvas-highres-probe-logs-a0332405293c457c9ed6fc4cebef169b\result.json` |
| Primary BEFORE manifests / summary | `D:\Temp\canvas-highres-final-before-63a1503301894c9eb6aa77bcc33d47d0\` |
| AFTER 1 | `D:\Temp\canvas-highres-probe-logs-fbab583316364631958edb25a6787c1a\result.json` |
| AFTER 1 manifests / first comparison | `D:\Temp\canvas-highres-after-ca6e6f1f1e254e12854e23b7655b5375\` |
| AFTER confirmation | `D:\Temp\canvas-highres-probe-logs-8e0ff029fa914c23b011cc816a420fe9\result.json` |
| Confirmation manifests / complete comparison | `D:\Temp\canvas-highres-after-confirm-6e3da762e45a47fd9375c40e73f0e9ab\final-comparison.json` |

Native profiles were safely checked and removed after their processes exited. The familiar post-measurement WebView2 shutdown class-unregister warning (1412) appeared; it did not prevent exit 0 or successful profile cleanup. This benchmark task changed no production or fixture code and appended only this documentation after the final run.


## 2026-10-30：多图快照缩放的第二轮热路径修复

用户确认滚轮缩放恢复，但多图缩放仍卡。本轮没有修改 wheel 路由、复制或业务数据模型，重点纠正首版快照在密集场景实际退回 live DOM 的条件。

### 从代码与确定性测试确认的问题

1. 首版只给前 80 个候选图片资源发起快照请求。第 81 张起并非缓存快照，普通图片元素依然参与浏览器渲染。
2. 缩小视图的固定 768 世界单位网格超过 48 格时，规划返回空集合，整个 run 回退普通节点；混合 run 数超过 6 时也曾全局回退。
3. Tile effect 依赖原始 scale，同一量化分辨率内也会清空、重画已有像素，并读取 computed style；分辨率变化时还会同时重分配大量 backing store。
4. 快照图像 hitbox 未使用现有 render gate。缓存完成／viewport 发布后，所有简单图片节点再次执行，静态节点还会再次解析图片 source。

### 本轮实现

- 对至多 1024 个独立资源按密度选择 512／256／128 像素预览；96MiB bitmap 硬预算不变。1000 个 128² RGBA bitmap 上限约 62.5MiB（不含解码临时对象、GPU 和画布合成内存）。相同资源的多个节点只占一份缓存；超容量时优先当前 viewport，未缓存图片保留 live fallback。
- 不再只请求前 80 个；按 24 个的批次逐步暖缓存，解码并发仍为 2，代际串行，批次间让出执行。滚轮交互期间暂停后续冷解码批次，不会取消已显示像素。缓存完成事件按 80ms 合批发布，避免每两张解码完成就提交整个 React 场景。
- 世界网格按 2 的倍数扩大，保持原点锚定和稳定的尺寸／坐标 tile ID，始终把正常大范围视图控制在 48 个世界 tile 内。像素 backing store 仍独立受预算约束，**不是分配整个无限画布的大图**。
- 混合内容超过 6 段时保留收益最大的完整 run，其余正常 live；绝不跨越 text／video／workflow／交互节点合并而改变遮挡关系。同一 tile 的成员取所有与 tile box 相交的有效候选，避免仅因 viewport 在格内移动就重画。
- 简单图像节点复用 `CanvasNodeRenderGate`，稳定的静态节点不随普通 scale 变化重渲染，也不解析图片 source；选择／hover／drag 仍保留原始节点交互及原始复制来源。交互大图继续有原始 image renderer，不用低分辨率快照替代导出或原图。
- Tile 分辨率按量化结果比较；已有正确像素在相同尺寸下不重绘。需要的分辨率更新统一排队、停止缩放后逐 tile 分摊，而不是滚轮帧全体重分配；内容变动、主题变化、预算缩减保持及时更新。

### 证据与限制

- 真实 `CanvasNodeLayer` 组件的服务器渲染测试（mock 已暖 bitmap cache）验证 100／500／1000 图全量 raster、live 图片为 0、tile 不超过 48，静态 source getter 调用为 0；缺失 bitmap 或单张选择仅该图 live。
- 实际 bitmap cache 逻辑配确定性假 decoder 验证 100／500／1000 图全部留存、无批次容量失败、重复请求不重新解码、内存估算低于硬预算。这不是浏览器图片解码速度测试。
- 纯规划测试覆盖密集／稀疏／负坐标／大视图、局部 mixed-run 保留、稳定 world tile 成员；不能把测试运行时长解释为用户帧耗时。
- 当前 IAB 浏览器连接不可用，未获得本轮完整 App 的真实物理滚轮、GPU trace 或 P95 对照。因此本轮只确认代码热路径与回归测试，不宣称用户大画布已经全部流畅，也不复用上轮旧 renderer 的性能数字为本轮背书。此前原生快照运行阻断未被绕过。
- 已有未提交改动全部保留；无版本升级、安装包发布或用户原文件改写。


### 本轮最终自动化结果

- `npm run typecheck`：通过；`npm run build`：通过，保留既有依赖注释／大 chunk 警告。
- `npx vitest run --reporter=dot --maxWorkers=4`：**189 个文件、1687 项全部通过**。包括上一轮普通滚轮缩放回归测试，未改变 Ctrl 修饰键或输入区滚动语义。
- 实际 `CanvasSnapshotTile` 组件的确定性 hook／timer 测试：同一分辨率 tier 的 **300 次 scale 提交仅绘制 1 次**，没有额外 backing store 分配／bitmap pin／computed-style 读取；12 个 tile 的跨 tier 更新保留旧像素，停止更新 150ms 后按 16ms 间隔逐个执行。另覆盖 zoom 标记、取消、失败、预算缩减和 StrictMode replay。这是绘制／调度次数证据，**不是实际 GPU 帧率**。
- 日志：`outputs/snapshot-density-tests.log`、`outputs/snapshot-density-build.log`。


## 2026-10-30：选中图片后缩放明显变慢

用户实机反馈：不选图片时已有改善，选中某张图片再缩放特别卡。本轮专门处理选中图的导航表示，不改变 wheel 路由、选择状态、原图数据或导出／复制来源。

### 已确认代码路径

- `CanvasNodeLayer` 把选中、hover、按下的图保持 live，避免扁平快照破坏拖动和层序；但首版 `CanvasStandaloneImageNode` 仅在显示边长不超过 bitmap tier 时使用缓存。密集场景 tier 为 128／256，稍放大就会把选中图完全切成原始 image renderer。
- 原始 source 调度用通用 `[data-canvas-main-media]` 查询。live 节点若同时有预览 canvas 和原图，查询可能取得 canvas 并写入无效 `src`，而不是更新真正的 image。
- 世界节点在静止鼠标下面移动会触发 enter/leave；如果每次都更换 hover，raster run 可能在滚轮过程中反复分段／重建。

### 本轮修复

1. `CanvasSnapshotImage` 保留一个有预算的缓存 canvas（按当前 128／256／512 tier），需要静止高质量查看时同时保留原始 image。现有 surface `data-canvas-zooming` 属性通过 CSS 同步在二者间切换，滚轮开始即用缓存，不等待 React 的 scale commit；停止后恢复原始图。未成功绘制或缓存丢失则正常回退原图，不隐藏空 canvas 下的原图。
2. 缓存像素只在 bitmap／source／tier 变化时复制，静止／缩放外观切换不解码、不重新分配 bitmap、不在每个节点安装 wheel 监听。原始交互 root、旋转、复制／删除等动作保持。
3. `applyCanvasMediaSourceToNode` 只允许 `img`／`video` 作为 source 目标；canvas-only 快照不启动原图解码。
4. 滚轮期间冻结由 pointer enter/leave 引起的快照 hover 变更，避免静止鼠标造成 raster 成员抖动；不清除用户选择。

### 本轮新增证据

- 选中大图超出概览 tier 时实际组件仍同时有缓存预览和静止原图，且保留复制按钮和选中标记。
- 组件确定性 hook 测试：300 次外观／静止原图开关提交，128×96 的缓存 canvas 只复制 1 次，pin／release 各 1 次，无 per-node wheel listener。覆盖 source/tier 变化、缓存失效、绘制失败、lease 释放及 CSS readiness 保护。
- 真实 source helper 测试：即使 canvas 在原图前面也只处理真正的媒体节点，canvas-only 不创建 decoder。
- 这些是代码／调用计数证据，不是低配电脑 GPU 帧率。上一个交付测试安装包不包含本轮尚未重新打包的代码，不能据此要求用户用旧包确认新修复。


### 选中缩放：控制器补充与最终验证

选中 source 调度现在在 source 不变时幂等，迟到的异步普通 preview 不覆盖 original；getter 与 ≤3 项选中原图预算一致。选框无实际 DOM／无变化时跳过测量和重复写入；只测量有挂载 frame 的 group。受影响遮挡检查采用第二个空间索引，不再逐 handle × affected box 扫描。600 节点稀疏合成用例旧实现出现 182,400 次 x 读取，新实现通过线性读取预算；这是操作数而非毫秒／GPU 对照。

控制器新 16 项测试全过（修复前 11 项失败），包括 120 次连续 zoom 仅 setup 一次、idle 后 settle 一次。最终与记忆修复整合：193 文件／1734 项前端测试、TypeScript、前端生产构建通过。未重新打包、未发布，旧测试安装包不含本轮代码；低配实机帧率仍需新包复验。


## 2026-10-30：新增图片及缩放收尾阻塞

### 增量快照而非新增即全量重建

生产快照开关移除，默认常开，不读取旧关闭偏好。图片 density tier 变更时保留现有 resident bitmap；新图只请求未驻留 source。世界 tile 内容及 backing budget 均保持稳定，新增 tile 优先占用剩余预算，必要时局部缩容，不因 tile 数跨 2 次幂就给全部旧 tile 换预算。实际 NodeLayer 测试覆盖 80→81、256→257、500→501：新 source 仅 1 decode，旧 gate／未受影响 tile 及预算不变。若新增图位于同一 tile、遮挡／run 层序改变或预算触发 LRU，相应区域仍需重绘，不能承诺永不更新。

### 整窗冻结的保存链路

用户报告缩放停止后一两秒连窗口拖动／最小化最大化都卡。源码确认原生同步保存含完整 payload compaction、serde JSON、磁盘写入，节点 SQL 更新也同步；现改 blocking pool、有序后台任务。前端纯视图变化使用轻量 sidecar，不反复传全部缩略图；完整节点保存仍权威，合法同画布较新 sidecar 只合并视图数据，失败／跨画布／空节点不合并。

清晰度恢复候选选择由同步 N 个几何＋排序，改 ≤64／idle 批，固定 top-3；新交互取消过期扫描。单次任务不等于 GPU 合成，仍需用户低配机实测窗口响应。

验证：204 文件1989前端测试，328原生通过／2 ignored，类型检查及构建通过。保存传输测试100次纯视图更新仅1次完整payload；原生顺序队列在错误／panic后仍继续，sidecar不改节点。详见修复验证文档的本轮节。无新安装包／发布，旧测试包不能代表本轮结果。
