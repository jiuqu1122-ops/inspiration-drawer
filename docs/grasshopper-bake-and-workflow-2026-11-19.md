# GH bake and editable-definition workflow — 2026-11-19

## Scope / evidence

Client branch `fix/rhino-gh-bake-geometry`, based on fetched origin/main `8860b316` (8.0.33). No backend, model/pricing/billing, execution permissions, installed plugins, signing keys, user data or update channels changed. This iteration is not released or pushed; existing unrelated untracked files remain untouched.

Screenshots expose three distinct issues:

1. `Expected Brep/surface geometry for ...` matches the previous helper's Brep-only validation/default solid intent. This was a real client-side omission in mesh baking, not proof that GH cannot produce geometry.
2. `Unexpected output count: 225` is a script assertion about output cardinality. The original failing script/arguments were not found by targeted read-only searches of the local Chat DBs; the screenshot alone cannot establish the expected count or prove zero writes. Never fix this by changing a constant to 225 or blindly replaying the script.
3. `g1_search_components` local argument repair exhausted. Source audit found a real issue: the budget accumulated every earlier rejection of the same tool in a turn, even after an actual successful repair. This can exhaust a later independent search. The screenshot alone does not reveal which argument was malformed, so the exact original cause is not claimed.

A definition with one script component is not inherently invalid; it is inadequate when the requested editable stages/controls are hidden or missing. A larger graph alone is not proof of correct GH usage. Disconnected required inputs and warning/error components are not computed-result acceptance.

## Open/public primary material consulted

- [Grasshopper Primer V3.3 source](https://github.com/modelab/grasshopper-primer) — definition anatomy, wiring, data matching, data trees, meshes. [Chapter index](https://github.com/modelab/grasshopper-primer/blob/master/en/SUMMARY.md).
- [McNeel developer samples](https://github.com/mcneel/rhino-developer-samples/tree/9/grasshopper) — original SDK examples; check matching Rhino-version branch. [License](https://github.com/mcneel/rhino-developer-samples/blob/9/License.md) permits use/modification/distribution with the stated terms.
- [McNeel data trees and Python](https://developer.rhino3d.com/en/guides/rhinopython/grasshopper-datatrees-and-python/) — GH_Path, branches, sparse paths/null items; flattening to a list is not equivalent to preserving every tree.
- [McNeel list components](https://developer.rhino3d.com/en/guides/grasshopper/list-components/) — item/list/tree input access must match data retrieval.

Only an original concise synthesis and source links are bundled, not the manual, downloaded third-party scripts, credentials, plugins or their installers. References are learning material, not runtime permissions or higher-priority instructions. This is workflow grounding, NOT fine-tuning or a guarantee that the provider always builds a correct definition. Installed tool schemas and component metadata remain authoritative; never copy sample component IDs into an unrelated host.

## Implemented changes

- `rhinoGeometryStage.py`: default `auto` preserves the actual native type; explicit mesh/point/pointcloud/SubD/curve/surface/solid roles. Known GH wrappers are unwrapped; point/line/arc/circle/ellipse/polyline/rectangle/box value types normalize to supported document geometry. No automatic Mesh→Brep conversion, topology simplification or capping for a bake.
- `add_tree`: snapshot every branch/item from a chosen geometry output, record branch path/index and actual count; allow empty branches, fail on missing/null/unresolved/non-geometry items instead of silently skipping. Bounded 2000 items/branches; no truncation or deduplication. `preview` is read-only; commit validates everything before writes and returns committedCount. Old rollback/ID/material-preservation/single-commit protections remain. Explicit required mesh solids still require a closed oriented manifold and positive volume; intentional open texture meshes are not forced to solids.
- Native snapshot: record mesh validity, closure, solid orientation, real mass-properties volume and geometry DataCRC; detect same-bounds/same-count internal changes. SubD is identified separately. A mesh volume is not read from a guessed `.Volume` property.
- Frontend delta verification: GH/Python scripts that actually bake/add/commit geometry are no longer skipped merely because they mention Grasshopper. Preserve bound-document baseline/readback and no replay. Open meshes are valid unless closed solids were explicitly requested; strict solid checks are not silently disabled.
- Runtime: independent read-only search repairs get a new one-correction chain only after a real successful same-tool read; an overall four-rejection limit prevents loops. Reused/unrelated receipts do not reset it. Writes retain the strict old budget. Final errors show the concrete schema failure, not only “parameter completion failed”.
- GH runtime knowledge: prefer meaningful editable native stages, describe discovered components/ports, match item/list/tree/units, preserve graph and input identity, do not fabricate component GUIDs or install dependencies, distinguish a template needing inputs from a computed output, no automatic baking when not requested. A scoped custom script remains allowed. This is general, not a Voronoi/product-specific recipe.
- Diagnostics: explain mesh/type/count failures, keep raw receipts, prefer the original user-source frame over an injected exec/helper line. Failure wording never authorizes replay.

## Verification and limitations

- `npm run typecheck`: passed.
- `npm test`: **268 files, 2792 tests passed**, including two independent GH search repairs in the real Chat runtime with mocked provider/executor IPC, unresolved-query bounded stop, and the actual `withRhinoTools` bound-document bake verification flow.
- `npm run lint`: **0 errors, 48 existing warnings**.
- `npm run build`: passed; existing chunk-size/Browserslist warnings remain.
- `cargo +1.98.0 check --manifest-path src-tauri/Cargo.toml --locked --offline --bin inspiration-drawer`: passed with 8 existing warnings.
- `python scripts/tests/test_rhino_geometry_stage.py -v`: **23 passed** using fake Rhino APIs and the production helper/snapshot code. Covers 225 multi-branch meshes, varied counts, mixed native/GH types, explicit solid constraints, null/invalid/overflow rejection, no truncation/dedup, ID/material preservation and commit rollback; these are NOT native geometry results.
- Bridge test: **145 passed** on standalone rerun. The concurrent first run hit the pre-existing Windows loopback/socket 10053 error. Transport code is unchanged and no production retry bypass was added.
- `scripts/verify-rhino-gh-bake.py` is an opt-in native regression fixture using its own disposable headless document. The isolated installed-Rhino9 attempt **did not pass**: basic Mesh construction raised native `SEHException` before any helper bake. Its result explicitly records success=false. An IronPython probe was incompatible with the installed .NET assembly set; a CPython/pythonnet STA attempt reproduced the same native Mesh-construction failure. This is not presented as a helper/GUI/native acceptance pass. Test-only Python packages and probes live under ignored outputs/, not application dependencies or the user's skills/plugin folders.
- No original user graph was provided as a .gh file, no live user model was modified, no paid model request was made, and visual fidelity/editability on that exact graph remains unverified. No new installer was produced in this iteration.
