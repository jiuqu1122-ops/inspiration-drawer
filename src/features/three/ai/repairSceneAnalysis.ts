import { requestChatCompletion, type ChatProviderResult } from '../../chat/runtime/chatStream';
import {
  parseSceneAnalysisResponse,
  type SceneAnalysisResponseError,
} from '../model/threeSceneAnalysisSchema';
import type { SceneAnalysisV1 } from '../model/threeSceneAnalysisTypes';

const createRepairRequestId = () => `three-analysis-repair-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

const responseValue = (result: ChatProviderResult) => (
  result.toolCalls.find(call => call.name === 'submit_three_scene_analysis')?.arguments
  || result.content
);

export const repairSceneAnalysis = async (input: {
  rawResponse: unknown;
  parseError: SceneAnalysisResponseError;
  model?: string;
  requestCompletion?: (request: Parameters<typeof requestChatCompletion>[0]) => Promise<ChatProviderResult>;
}): Promise<SceneAnalysisV1> => {
  const raw = typeof input.rawResponse === 'string'
    ? input.rawResponse
    : JSON.stringify(input.rawResponse ?? null);
  const request = input.requestCompletion || requestChatCompletion;
  const result = await request({
    requestId: createRepairRequestId(),
    model: input.model,
    stream: false,
    messages: [
      {
        role: 'system',
        content: '你只负责修复 JSON 结构，使其符合 SceneAnalysisV1。不要重新分析图片，不要改变已有合理视觉判断，不要添加 Three.js 世界坐标、FOV、相机位置或灯光数值。只返回修复后的 JSON，不要 Markdown、解释或代码。',
      },
      {
        role: 'user',
        content: `待修复内容：\n${raw.slice(0, 16000)}\n\n校验问题：\n${input.parseError.details.slice(0, 4000)}`,
      },
    ],
    tools: [],
  });
  return parseSceneAnalysisResponse(responseValue(result));
};
