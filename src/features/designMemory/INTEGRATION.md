# Design Memory integration handoff

## Chat memory audit / deterministic fixes — 2026-10-30

Verified from source, not private history or a screenshot:

- Both switches default OFF. Enabling does not scan/import old sources. The settings importer is explicit and reuses analyzed-image metadata, completed explicit USER design statements and persisted design summaries; no extra model analysis and no image-byte reads.
- Live image analysis captures a lease before analysis and reuses its text result. Normal accepted Chat sends conservatively store explicit design statements. Existing Chat summarization reuses its result; memory does not create an extra model request.
- Automatic retrieval is bounded (6 candidates, at most 4200 escaped JSON characters of actual records). Same-project constraints require the same project ID; without host-supplied `designMemoryProjectId` it is `conversation:<id>`. Explicit long-term preferences work across sessions; old other-project summaries are historical examples only. Current conversation sources are excluded because ordinary context/summary covers them.
- Before this fix, `isDesignMemoryTask` blocked meta-questions such as “你能看聊天历史吗”. Recall intent now also recognizes memory/history/preference questions, without broadening the WRITE recognizer. Recall remains relevance/keyword-based, not a full-history browsing tool; a generic capability question may still legitimately have no matches.
- `drawer-image` is historical image-analysis TEXT, never proof that this request contains the original pixels. Provider reference data explicitly says `historical-image-analysis-text-only` / `originalImageAttached: false`; fixed instructions distinguish the available history text from unavailable original images. No source is automatically opened, read, attached or uploaded by this change.
- Each accepted Chat turn now receives a program-generated recall status: `skipped`, `disabled`, `unavailable`, `no-match`, `matched`, `stale`, or `omitted` (all candidates exceed the serialization budget). “No match / unavailable / skipped” must not be represented as “all history is absent”.
- Existing processing/context steps show a recall receipt: status, returned vs injected count, actual source IDs/labels, and actual vs unavailable image-attachment counts. Expand the existing processing panel to inspect it; no new history UI or tool. The existing message/thinking-step persistence path is reused.
- Receipts and invalidation dependencies track only records actually serialized, not every candidate. Escaped JSON and bounded attribution fields count toward the limit. Attachment failures, missing resolvers and oversized inline images do not count as supplied visual inputs.

Validation boundary: `src/features/chat/context/chatDesignMemoryPayload.test.ts` writes/recalls only synthetic in-memory fixtures and captures the mocked final `agent_openai_chat.request.messages` after normal request protection/JSON serialization. It proves actual text/provenance injection, independent vision attachments, visible existing-panel receipts, status differentiation, and revocation/serialization limits. It does not prove native ranking, a real user's switches/data, actual remote model behavior, or what was supplied in the screenshot's request. No private records, real model requests, builds, packages or native app launches were used for this audit.

Parent handoff: no new host hookup is required for receipts. For stable same-project constraints across conversations, the host may supply the existing optional `designMemoryProjectId`; this patch does not guess a project or change App/settings host/Rust.

## Integration update — 2026-10-30

Parent integration is now wired in the working tree:
- Native command registration in `commands.rs` / `main.rs`.
- Settings host in DrawerHeaderAndSettings, independent OFF-by-default switches.
- Explicit `src/features/drawer/indexExistingDesignMemory.ts` importer using existing analyzed metadata and Chat user statements/summaries; both archived and active conversations, keyset pagination by time+ID, no model calls.
- Source navigation to image preview or corresponding Chat conversation.
- Live drawer analysis wrapper captures the original ticket before analysis; failures in memory do not interrupt existing image analysis.
- SQLite asset and Chat deletion/restoration are now hooked in their original repository transactions with post-commit invalidation notifications.
- Compatibility JSON mode fails closed for drawer-image memory while preserving management rows; it does not pretend to provide atomic JSON/SQLite source lifecycle updates.

The handoff below documents the API design and historical ownership. It is not a statement that these parent items are still unwired. Actual native/UI runtime checks are recorded separately in the repair verification report; do not infer release readiness from this file.

## Ownership / status

Implemented here: additive native SQLite memory storage, opt-in switches, tickets/batches, source builders, bounded related retrieval, settings/management UI, Chat context/runtime integration and tests.

**Parent owns:** native command registration (reported wired), settings host mounting, `src/features/drawer/indexExistingDesignMemory.ts`, existing-source pagination/import, live drawer profile completion hooks, original-source deletion/restoration transactions and post-commit notification. The importer is now implemented in the parent-owned drawer module above; development validation does not inspect actual user history or images.

## Native registration (10 commands)

`pub mod design_memory;` in `src-tauri/src/commands.rs`; register these `commands::design_memory::*` functions in the existing invoke handler:

- `design_memory_get_settings()` -> `DesignMemorySettings`
- `design_memory_set_enabled({ kind, enabled })` -> `DesignMemorySettings`
- `design_memory_acquire_lease({ kind, sourceId })` -> `DesignMemoryLease | null`
- `design_memory_upsert({ lease, records })` -> `{ accepted: boolean, written: number }`
- `design_memory_recall({ query })` -> `{ settings, records }`
- `design_memory_list({ kind: kind | null, offset, limit })` -> `{ records, hasMore }`
- `design_memory_correct({ id, expectedRevision, content })` -> `DesignMemoryRecord`
- `design_memory_delete({ id, expectedRevision })` -> `boolean`
- `design_memory_clear({ kind })` -> deleted count
- `design_memory_delete_source({ kind, sourceId })` -> deleted memory count (memory-only fallback for non-transactional source paths)

All invoke argument objects use camelCase. Kind is `'drawer-image' | 'chat-design'`. Tables are initialized idempotently on the existing `crate::db::connection::open_connection`; no global schema version change, dependency addition, original/history update or scan. Both switches initially OFF. Existing memory rows are retained when disabled. Management list/correct/delete/clear remain available while OFF; model recall and automatic indexing do not.

## Atomic original-source deletion / restoration

The native module now exports:

```rust
pub fn ensure_memory_schema(conn: &rusqlite::Connection) -> Result<(), String>;
pub fn invalidate_source_in_transaction(
    conn: &rusqlite::Connection, kind: &str, source_id: &str,
) -> Result<usize, String>;
pub fn restore_source_in_transaction(
    conn: &rusqlite::Connection, kind: &str, source_id: &str,
) -> Result<bool, String>;
pub fn notify_source_changed(app: &tauri::AppHandle, kind: &str);
```

Call `ensure_memory_schema(&self.conn)` BEFORE opening the original source transaction. Within the SAME original delete/trash transaction, pass `&tx` to `invalidate_source_in_transaction`. For a batch, call for each source ID before the shared commit. This atomically removes derived memory, revokes pending source tickets, and records a source suppression even when no memory had completed yet. The helper rejects autocommit misuse; it does not commit or emit.

After the original transaction successfully commits, the service calls `notify_source_changed(&app_handle, kind)` once for that kind, broadcasting `design-memory-invalidated`. Never notify after rollback. This immediately invalidates recalled frontend snapshots and cancels Chat provider replies using the affected memory kind.

On original restoration from trash, call `restore_source_in_transaction(&tx, kind, source_id)` inside the restore transaction, and notify after commit. It permits a NEW explicit reindex/new analysis to acquire a new lease but restores NO old memory content and revives NO pending tickets. Explicitly deleted/cleared memory row IDs remain suppressed; restoring the original does not undo those user decisions.

Use asset IDs for drawer sources and conversation IDs for Chat sources. Integrate all relevant bulk-delete, soft-trash, hard-delete, restore and library/clear-history routes. Chat runtime deliberately does NOT perform a separate memory predelete: parent native repository transactions are the authoritative hook, avoiding memory deletion when original deletion fails.

## Settings host

```tsx
import { DesignMemorySettingsPanel } from '../designMemory';

<DesignMemorySettingsPanel
  onOpenSource={record => {
    // Use record.kind + sourceId; optional attribution.messageIds / throughMessageId.
  }}
  onIndexExisting={async kind => {
    // Parent-owned explicit local importer. NO model calls.
    return { processed, written };
  }}
/>
```

The optional explicit “整理已有资料” control is only enabled while its corresponding switch is ON. Turning ON does not automatically scan anything. The panel explains no new AI analysis/model call or import charge, allows switching OFF while an import is running, and shows processed/written counts. Clear requires a separate confirmation and never deletes originals/history. Corrections are revision-checked and protected from subsequent automatic sync.

## Explicit existing-data import

Use the public `designMemory` client and `types.ts` contracts. Capture one batch BEFORE reading source pages:

```ts
const batch = await designMemory.beginBatch(kind);
if (!batch) return { processed: 0, written: 0 };
for (/* parent-owned pages/sources */) {
  if (!await designMemory.checkBatch(batch)) break; // BEFORE reading the next private page/source
  const ticket = await designMemory.acquire(kind, sourceId, batch);
  if (!ticket) break;
  // Build drafts from already-read local records only.
  // For one conversation, reuse this ticket for its paginated drafts, <=100 records per put.
  const result = await designMemory.put(ticket, drafts);
  written += result.written;
  if (!result.accepted) break;
}
```

A disabled/re-enabled or cleared/corrected/deleted batch is permanently stale; do NOT replace its batch/ticket and continue the old job. `checkBatch` is async native settings reconciliation, `isBatchCurrent(batch)` is the immediate local guard (use before/after each awaited pagination call too). `put` also checks local revision and the native transaction atomically checks switch generation/source revision. A newly acquired source lease revokes older started jobs for the SAME source (latest-started wins), so do not acquire one new lease per chunk of a still-running source job.

Builders do not read originals or call AI:

```ts
buildDrawerImageMemory(profile: InspirationProfile, { title?, projectId? }?)
  -> DesignMemoryDraft | null;
buildExplicitChatDesignMemory(message: ChatMessage, { title?, projectId? }?)
  -> DesignMemoryDraft | null;
buildChatSummaryMemory(summary: ChatSummary, { title?, projectId? })
  -> DesignMemoryDraft | null;
```

Skip images without existing `analyzedAt`/summary; never backfill with new AI analysis. For old Chat, index only explicit design statements from USER messages, and persisted design summaries with a `throughMessageId`. Do not index assistant messages, generic approvals, hypothetical/quoted preferences or sweep on switch enable. Summaries are labeled unverified historical summaries, never promoted to accepted long-term preferences. A supplied stable project ID allows same-project constraints across sessions; otherwise project constraints use `conversation:<id>`.

## Live drawer analysis integration

```ts
const ticket = await beginDrawerImageMemory(itemId); // BEFORE asynchronous analysis
// Continue existing image analysis normally even if ticket is null / memory is OFF.
await syncAnalyzedDrawerProfile(ticket, analyzedProfile, { title, projectId });
```

Always complete with the original ticket. Do not reacquire at completion. For already-analyzed local data under explicit import, use the batch-aware client acquisition and `buildDrawerImageMemory` directly.

## Chat runtime integration already implemented

- Optional `UseChatRuntimeOptions.designMemoryProjectId?: string | null`.
- Conservative explicit user-design statements stored locally on normal accepted sends.
- Existing summary generation only: capture memory ticket before the existing request, reuse its persisted result; no extra AI request.
- Task-related native retrieval only, bounded to 6 records / ~4200 JSON characters of recalled data, not whole-library transport. Query uses local lexical Chinese bigrams/English tokens, not embeddings or another model.
- Explicit same-project constraints are isolated; global explicit preferences work across sessions. Related OLD design summaries can be recalled across sessions via `includeRelatedSummaries: true`, preserving old project provenance and marking `historical-project-reference-only`; those old project constraints must not be applied to a new project. Strict raw recall defaults to NOT including other-project summaries.
- Current conversation sources are excluded from recall because its regular context/summary is already present.
- Recalled content is user-level attributed reference DATA with a fixed higher-priority non-instruction guard. Each normal/retry provider call, returned result and tool continuation validates snapshot generations. Local/native invalidation cancels memory-dependent Chat responses/pending approvals; does not cancel existing image analysis or already-running paid tool work.
- The feature does not scan/import old conversations automatically; that requires the explicit parent importer above.

## Tests / validation

- Historical implementation validation: `npx vitest run src/features/designMemory src/features/chat --reporter=dot` originally passed 40 files / 359 tests; the current audit adds the synthetic final-payload test above. Use the current run output for current totals.
- Scoped strict TypeScript including ALL new memory files/tests, Chat context builder/test and runtime: passed.
- Native module compiled with the repo's existing Rust 1.98 dependencies using an isolated test harness; all tests use in-memory or synthetic temporary SQLite only, and the app connection stub panics if touched. Final native tests cover defaults, durable restart, independence, pending disable/re-enable, related/scope isolation, historical-only summaries, correction/deletion/clear suppression, latest-started source leases, original-delete rollback atomicity and restore/reindex behavior.
- After parent source hooks/settings integration, run normal registered native tests and app smoke/build. No real user data or paid models were exercised.

## Deliberate first-version limits

No embeddings, inference of taste from collecting, automatic acceptance of assistant proposals, new AI summarization, cloud sync or automatic all-history sweep. Conservative statement recognition can skip implicit preferences; the explicit existing-data importer and management correction UI remain the opt-in path. Source navigation and pagination/import progress/cancellation reporting are provided by the host callbacks. Atomic source hooks, original restore hooks and settings host/importer remain parent integration work; do not claim them complete until wired.
