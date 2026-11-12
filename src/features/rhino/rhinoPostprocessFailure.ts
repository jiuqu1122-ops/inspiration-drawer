import type { ChatToolCall } from '../chat/model/chatTypes';
import { SAFE_PROFILE_TOOL } from './rhinoSafeModeling';

const viewActions: Record<string, string> = {
  rhino_native_zoom_to_layer: '缩放到目标图层',
  rhino_native_zoom_to_object: '缩放到目标对象',
  rhino_native_set_camera: '调整相机',
  rhino_native_get_viewport_image: '读取视口图片',
};
/** Only verified geometry from this same turn can qualify. Never infer success
 * from the tool name, stdout, another turn, or a successful geometry-free script. */
export function rhinoPostprocessFailure(calls: ChatToolCall[], failed: ChatToolCall) {
  const action = viewActions[failed.toolName];
  if (!action || failed.status !== 'error') return undefined;
  const failedIndex = calls.findIndex(call => call.id === failed.id);
  if (failedIndex < 0) return undefined;
  const preceding = calls.slice(0, failedIndex);
  let verified: ChatToolCall | undefined;
  for (const call of preceding) {
    const geometryCall = ['rhino_native_run_python','rhino_native_run_csharp','rhino_native_run_command',SAFE_PROFILE_TOOL].includes(call.toolName);
    if (!geometryCall) continue;
    // A later unchecked/failed mutation invalidates an older success claim.
    verified = undefined;
    if (call.status !== 'completed') continue;
    try {
      const result = JSON.parse(call.resultJson || '{}');
      const report = result.geometryVerification;
      if (report?.status === 'passed' && report.documentChanged === true && report.structuralOnly === true && !report.writeFailed
        && (Number(report.addedCount) > 0 || Number(report.changedCount) > 0)) verified = call;
      else if (call.toolName === SAFE_PROFILE_TOOL && result.status === 'committed' && result.stage === 'commit' && result.documentChanged === true
        && result.valid === true && result.solid === true && Array.isArray(result.objectIds) && result.objectIds.length > 0) verified = call;
    } catch { /* An opaque tool receipt is not proof of geometry completion. */ }
  }
  return verified ? { action, geometryCallId: verified.id,
    summary: '模型几何已写入，并通过结构检查；后续“' + action + '”未完成。现有模型已保留，不会重新建模。',
    limitation: '这不是建模写入失败，也不代表整个请求已全部完成；尚未完成的视图操作保留为失败记录。结构检查不等于外观或尺寸符合要求。',
  } : undefined;
}
