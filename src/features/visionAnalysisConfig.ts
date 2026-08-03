export type AiAnalysisConfig = {
  provider: string;
  endpoint: string;
  apiKey: string;
  model: string;
  proxy?: string;
};

export const SILICONFLOW_DEFAULT_ENDPOINT = 'https://api.siliconflow.cn/v1';
export const SILICONFLOW_DEFAULT_MODEL = 'Qwen/Qwen3-VL-32B-Instruct';
export const SILICONFLOW_VISION_MODEL_FALLBACKS = [
  { value: 'Qwen/Qwen3-VL-32B-Instruct', label: 'Qwen3-VL-32B-Instruct（推荐：视觉 CMF）' },
  { value: 'Qwen/Qwen3-VL-32B-Thinking', label: 'Qwen3-VL-32B-Thinking（视觉推理）' },
  { value: 'Qwen/Qwen3-Omni-30B-A3B-Instruct', label: 'Qwen3-Omni-30B-Instruct（图像/视频/音频）' },
  { value: 'Qwen/Qwen3-Omni-30B-A3B-Thinking', label: 'Qwen3-Omni-30B-Thinking（多模态推理）' },
  { value: 'THUDM/GLM-4.1V-9B-Thinking', label: 'GLM-4.1V-9B-Thinking（视觉理解）' },
  { value: 'deepseek-ai/DeepSeek-OCR', label: 'DeepSeek-OCR（OCR / 文档视觉）' },
  { value: 'Qwen/Qwen2.5-VL-7B-Instruct', label: 'Qwen2.5-VL-7B（旧模型，若可用再选）' },
];

export const SILICONFLOW_VISION_MODEL_LABELS: Record<string, string> = Object.fromEntries(
  SILICONFLOW_VISION_MODEL_FALLBACKS.map(model => [model.value, model.label]),
);

export const isSiliconFlowProvider = (provider: string) => provider === 'siliconflow';

export const isSiliconFlowVisionModel = (model: string) => (
  /(?:qwen\/?(?:2(?:\.5)?|3)[-_]?vl|qvq|qwen3[-_]?omni|glm.*(?:v|vision)|deepseek[-_]?vl|deepseek[-_]?ocr|step3|paddleocr[-_]?vl|vision|\bvl\b|omni|ocr)/i.test(model)
);
