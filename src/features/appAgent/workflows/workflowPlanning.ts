import type { AgentCanvasContext, AgentProvider } from '../../agentModel';
import {
  detectWorkflowTemplate,
  parseWorkflowBuilderIntent,
  parseWorkflowGenerationSettings,
} from '../skills/workflowBuilderSkill';
import {
  detectUserLanguagePolicy,
} from './recipes/industrialDesignReviewRecipe';
import type {
  WorkflowLanguage,
  WorkflowOutputSpec,
  WorkflowRecipeDraft,
  WorkflowTextPolicy,
} from './workflowRecipeTypes';
import { normalizeDesignAgentConfig } from '../../designAgentNode';

export interface WorkflowPlanningRequest {
  userText: string;
  quickPlanRequested: boolean;
  activeWorkflowDraft?: WorkflowRecipeDraft;
}

export type WorkflowPlanningRoute =
  | 'remote_ai'
  | 'local_deterministic'
  | 'unavailable';

export interface WorkflowPlanningAvailability {
  canPlanWorkflow: boolean;
  provider: AgentProvider;
  modelLabel: string;
  reason?: string;
}

export interface WorkflowDraftProposal {
  name?: unknown;
  description?: unknown;
  inputs?: unknown;
  outputs?: unknown;
  strategy?: unknown;
  executionOrder?: unknown;
  languagePolicy?: unknown;
  assumptions?: unknown;
  imagePolicy?: unknown;
}

const createId = (prefix: string) => (
  `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
);

const isRecord = (value: unknown): value is Record<string, unknown> => (
  !!value && typeof value === 'object' && !Array.isArray(value)
);

const asString = (value: unknown, fallback = '') => {
  const text = typeof value === 'string' ? value.trim() : '';
  return text || fallback;
};

const asBoolean = (value: unknown, fallback = false) => (
  typeof value === 'boolean' ? value : fallback
);

const isWorkflowRedesignIntent = (userText: string) => (
  /重新.*(?:设计|规划).*(?:工作流|workflow)|(?:工作流|workflow).*重新.*(?:设计|规划)|深度分析.*(?:当前流程|流程|工作流|workflow)|优化.*(?:整个|整体).*(?:工作流|结构|workflow)|根据.*新目标.*重新规划|判断.*(?:当前节点|节点设计|节点).*(?:合理|是否合理)|redesign.*workflow|re[-\s]?plan.*workflow|deep.*analysis.*workflow|optimi[sz]e.*workflow|judge.*node.*design/i.test(userText)
);

const isActiveWorkflowDraftLocalIntent = (userText: string) => (
  /保存.*(?:工作流|草案|草稿)|保存草稿|save.*(?:workflow|draft)|运行.*(?:工作流|草案|草稿)|执行.*(?:工作流|草案|草稿)|run.*workflow/i.test(userText)
  || /改成\s*\d+\s*页|(?:修改|调整|改成|设置).*(?:比例|宽高比|尺寸|分辨率|模型)|(?:aspect.?ratio|ratio|size|resolution|model)/i.test(userText)
  || /(?:删除|去掉|不要|移除).*(?:输出|页面|页|图|节点|CMF|场景|细节|氛围|主视|故事板|分镜)|(?:增加|添加|加).*(?:输出|页面|页|图|节点|爆炸|分镜|故事板)/i.test(userText)
  || /CMF.*(?:中文|英文|双语)|(?:所有|全部|都).*(?:中文|英文)|改成(?:中文|英文)|关闭.*(?:strategy|策略|分析)|不要.*(?:strategy|策略|分析|文字节点)|skip.*strategy|disable.*strategy/i.test(userText)
);

export const detectWorkflowDesignIntent = (input: Pick<WorkflowPlanningRequest, 'userText' | 'activeWorkflowDraft'>) => {
  if (input.activeWorkflowDraft && isWorkflowRedesignIntent(input.userText)) return true;
  if (input.activeWorkflowDraft && isActiveWorkflowDraftLocalIntent(input.userText)) return false;
  const intent = parseWorkflowBuilderIntent(input.userText);
  return intent.createWorkflow === true;
};

export function resolveWorkflowPlanningRoute(input: {
  quickPlanRequested: boolean;
  aiAvailability: Pick<WorkflowPlanningAvailability, 'canPlanWorkflow'>;
}): WorkflowPlanningRoute {
  if (input.quickPlanRequested) {
    return 'local_deterministic';
  }

  if (input.aiAvailability.canPlanWorkflow) {
    return 'remote_ai';
  }

  return 'local_deterministic';
}

const sanitizeId = (value: unknown, fallback: string) => {
  const text = String(value || '').trim().toLowerCase();
  const sanitized = text
    .replace(/[^a-z0-9_-]+/gi, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 48);
  return sanitized || fallback;
};

const uniqueId = (raw: unknown, fallback: string, used: Set<string>) => {
  const base = sanitizeId(raw, fallback);
  let next = base;
  let index = 2;
  while (used.has(next)) {
    next = `${base}_${index}`;
    index += 1;
  }
  used.add(next);
  return next;
};

const asWorkflowLanguage = (value: unknown, fallback: WorkflowLanguage): WorkflowLanguage => {
  if (value === 'follow_user' || value === 'zh-CN' || value === 'en' || value === 'bilingual') return value;
  return fallback;
};

const normalizeLanguagePolicy = (
  value: unknown,
  fallback: WorkflowTextPolicy,
): WorkflowTextPolicy => {
  const record = isRecord(value) ? value : {};
  return {
    promptLanguage: asWorkflowLanguage(record.promptLanguage, fallback.promptLanguage),
    visibleTextLanguage: asWorkflowLanguage(record.visibleTextLanguage, fallback.visibleTextLanguage),
    imageTextLanguage: asWorkflowLanguage(record.imageTextLanguage, fallback.imageTextLanguage),
    allowEnglishTechnicalTerms: typeof record.allowEnglishTechnicalTerms === 'boolean'
      ? record.allowEnglishTechnicalTerms
      : fallback.allowEnglishTechnicalTerms,
  };
};

const normalizeInputs = (value: unknown) => {
  const used = new Set<string>();
  const rawInputs = Array.isArray(value) ? value : [];
  const inputs = rawInputs
    .map((item, index) => {
      const record = isRecord(item) ? item : {};
      const type: WorkflowRecipeDraft['inputs'][number]['type'] = record.type === 'text' || record.type === 'file' || record.type === 'image'
        ? record.type
        : 'image';
      return {
        id: uniqueId(record.id, index === 0 ? 'product_reference_image' : `input_${index + 1}`, used),
        label: asString(record.label, index === 0 ? '参考输入' : `输入 ${index + 1}`),
        type,
        required: asBoolean(record.required, true),
      };
    })
    .filter(input => input.id);

  if (inputs.length > 0) return inputs;
  used.add('product_reference_image');
  return [{
    id: 'product_reference_image',
    label: '参考图',
    type: 'image' as const,
    required: true,
  }];
};

const normalizeStrategy = (
  value: unknown,
  originalRequest: string,
): WorkflowRecipeDraft['strategy'] => {
  if (!isRecord(value)) {
    return {
      enabled: false,
      mode: 'disabled',
      title: '',
      prompt: '',
    };
  }
  const enabled = value.enabled === true;
  const prompt = withOriginalRequest(asString(value.prompt), originalRequest);
  return {
    enabled,
    mode: enabled ? 'enabled' : 'disabled',
    title: asString(value.title, enabled ? '工作流策略' : ''),
    prompt,
    designAgentConfig: normalizeDesignAgentConfig(
      isRecord(value.designAgentConfig)
        ? value.designAgentConfig
        : {
          agentRole: 'design_strategist',
          outputArtifactType: 'DesignStrategy',
          thinkingMode: 'analysis',
        },
    ),
  };
};

const withOriginalRequest = (prompt: string, originalRequest: string) => {
  const text = prompt.trim();
  const line = `Original request: "${originalRequest}"`;
  if (!text) return line;
  if (text.includes('Original request:')) return text;
  return `${text}\n\n${line}`;
};

const getRecordImagePolicy = (value: unknown) => (
  isRecord(value) ? value as WorkflowOutputSpec['imagePolicy'] : undefined
);

const normalizeOutputs = (input: {
  outputs: unknown;
  inputs: ReturnType<typeof normalizeInputs>;
  strategy: WorkflowRecipeDraft['strategy'];
  originalRequest: string;
  imagePolicy?: WorkflowOutputSpec['imagePolicy'];
}) => {
  if (!Array.isArray(input.outputs) || input.outputs.length === 0) {
    throw new Error('Workflow Draft Proposal 缺少 outputs');
  }
  const used = new Set<string>();
  const knownInputIds = new Set(input.inputs.map(item => item.id));
  const acceptedReferenceIds = new Set<string>(knownInputIds);
  if (input.strategy?.enabled) acceptedReferenceIds.add('strategy');

  return input.outputs.slice(0, 16).map((item, index) => {
    const record = isRecord(item) ? item : {};
    const id = uniqueId(record.id, `output_${index + 1}`, used);
    acceptedReferenceIds.add(id);
    const rawType = String(record.type || '').trim();
    const type: WorkflowOutputSpec['type'] = rawType === 'video_generator' || rawType === 'text_agent'
      ? rawType
      : 'image_generator';
    const rawInputRoles = Array.isArray(record.inputRoles)
      ? record.inputRoles.map(String).map(value => value.trim()).filter(Boolean)
      : [];
    const inputRoles = rawInputRoles.filter(role => acceptedReferenceIds.has(role) && role !== id);
    const fallbackInputRole = knownInputIds.has('product_reference_image')
      ? 'product_reference_image'
      : input.inputs[0]?.id;
    const prompt = withOriginalRequest(asString(record.prompt), input.originalRequest);
    return {
      id,
      title: asString(record.title, `输出 ${index + 1}`),
      type,
      enabled: record.enabled === false ? false : true,
      order: Number.isFinite(Number(record.order)) ? Number(record.order) : index + 1,
      aspectRatio: typeof record.aspectRatio === 'string' ? record.aspectRatio : null,
      targetSize: typeof record.targetSize === 'string' ? record.targetSize : null,
      resolution: typeof record.resolution === 'string' ? record.resolution : null,
      provider: typeof record.provider === 'string' ? record.provider : null,
      model: typeof record.model === 'string' ? record.model : null,
      prompt,
      inputRoles: inputRoles.length > 0 ? inputRoles : (fallbackInputRole ? [fallbackInputRole] : []),
      requiresReferenceImages: record.requiresReferenceImages === false ? false : type !== 'text_agent',
      editable: true,
      uniqueSellingPoint: typeof record.uniqueSellingPoint === 'string' ? record.uniqueSellingPoint : undefined,
      imagePolicy: getRecordImagePolicy(record.imagePolicy) || input.imagePolicy,
      designAgentConfig: type === 'text_agent'
        ? normalizeDesignAgentConfig(record.designAgentConfig)
        : undefined,
    } satisfies WorkflowOutputSpec;
  }).sort((a, b) => a.order - b.order);
};

const normalizeExecutionOrder = (value: unknown, knownIds: Set<string>) => {
  if (!Array.isArray(value)) return undefined;
  const groups = value
    .map(group => (
      Array.isArray(group)
        ? group.map(String).filter(id => knownIds.has(id))
        : []
    ))
    .filter(group => group.length > 0);
  return groups.length > 0 ? groups : undefined;
};

const normalizeAssumptions = (value: unknown) => (
  Array.isArray(value)
    ? value.map(String).map(item => item.trim()).filter(Boolean).slice(0, 12)
    : []
);

export function workflowDraftProposalToRecipeDraft(input: {
  proposal: WorkflowDraftProposal;
  userText: string;
}): WorkflowRecipeDraft {
  if (!isRecord(input.proposal)) {
    throw new Error('Workflow Draft Proposal 不是 JSON 对象');
  }
  const languagePolicy = normalizeLanguagePolicy(
    input.proposal.languagePolicy,
    detectUserLanguagePolicy(input.userText),
  );
  const generationSettings = parseWorkflowGenerationSettings(input.userText, {
    templateId: detectWorkflowTemplate(input.userText),
  });
  const inputs = normalizeInputs(input.proposal.inputs);
  const strategy = normalizeStrategy(input.proposal.strategy, input.userText);
  const globalImagePolicy = getRecordImagePolicy(input.proposal.imagePolicy);
  const outputs = normalizeOutputs({
    outputs: input.proposal.outputs,
    inputs,
    strategy,
    originalRequest: input.userText,
    imagePolicy: globalImagePolicy,
  }).map(output => ({
    ...output,
    aspectRatio: output.aspectRatio || generationSettings.aspectRatio || '16:9',
    targetSize: output.targetSize ?? generationSettings.targetSize ?? null,
    resolution: output.resolution ?? generationSettings.resolution ?? null,
    provider: output.provider ?? generationSettings.provider ?? null,
    model: output.model ?? generationSettings.model ?? null,
  }));
  const knownIds = new Set([
    ...inputs.map(item => item.id),
    ...(strategy?.enabled ? ['strategy'] : []),
    ...outputs.map(item => item.id),
  ]);
  const executionOrder = normalizeExecutionOrder(input.proposal.executionOrder, knownIds);
  const assumptions = normalizeAssumptions(input.proposal.assumptions);
  return {
    id: createId('workflow-draft'),
    name: asString(input.proposal.name, 'AI 工作流草案').slice(0, 80),
    description: asString(input.proposal.description, '由 AI 深度设计生成的可编辑工作流草案').slice(0, 240),
    templateId: detectWorkflowTemplate(input.userText),
    languagePolicy,
    inputs,
    strategy,
    outputs,
    metadata: {
      originalRequest: input.userText,
      createdBy: 'app-agent',
      editable: true,
      planningRoute: 'remote_ai',
      assumptions,
      executionOrder,
      imagePolicy: globalImagePolicy,
      workflowGenerationSettings: generationSettings,
      aspectRatio: generationSettings.aspectRatio,
      targetSize: generationSettings.targetSize,
      resolution: generationSettings.resolution,
      provider: generationSettings.provider,
      model: generationSettings.model,
      modelFamily: generationSettings.modelFamily,
      explicitModel: generationSettings.explicitModel,
    },
  };
}

export function parseWorkflowDraftProposal(raw: string): WorkflowDraftProposal {
  const text = raw.replace(/^\uFEFF/, '').trim();
  const candidates: string[] = [];
  const addCandidate = (candidate: string) => {
    const value = candidate.trim();
    if (value.startsWith('{') && value.endsWith('}') && !candidates.includes(value)) candidates.push(value);
  };
  addCandidate(text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, ''));

  // Models may add a short preamble or trailing note. Extract balanced JSON
  // objects while respecting braces inside quoted strings.
  for (let start = 0; start < text.length; start += 1) {
    if (text[start] !== '{') continue;
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let index = start; index < text.length; index += 1) {
      const char = text[index];
      if (inString) {
        if (escaped) escaped = false;
        else if (char === '\\') escaped = true;
        else if (char === '"') inString = false;
        continue;
      }
      if (char === '"') {
        inString = true;
        continue;
      }
      if (char === '{') depth += 1;
      if (char === '}') {
        depth -= 1;
        if (depth === 0) {
          addCandidate(text.slice(start, index + 1));
          break;
        }
      }
    }
  }

  for (const candidate of candidates) {
    const parseCandidates = [candidate, candidate.replace(/,\s*([}\]])/g, '$1')];
    for (const parseCandidate of parseCandidates) {
      try {
        const parsed = JSON.parse(parseCandidate);
        if (isRecord(parsed) && Array.isArray(parsed.outputs)) return parsed as WorkflowDraftProposal;
      } catch (_) {
        // Try the next JSON-looking candidate without another model request.
      }
    }
  }
  throw new Error('AI 规划结果不是可解析的 Workflow Draft Proposal JSON');
}

const summarizeContextForPlanner = (context?: AgentCanvasContext) => {
  if (!context) return {};
  return {
    surface: context.surface,
    selectedIds: context.selectedIds,
    visualReferences: (context.visualReferences || []).map(reference => ({
      nodeId: reference.nodeId,
      name: reference.name,
      mediaType: reference.mediaType,
    })),
    nodes: context.nodes.slice(0, 40).map(node => ({
      id: node.id,
      type: node.type,
      name: node.name,
      inputs: node.inputs,
      status: node.status,
    })),
    workflows: context.workflows.slice(0, 20),
    presets: context.presets.slice(0, 20),
  };
};

export function buildWorkflowDraftProposalMessages(input: {
  userText: string;
  context?: AgentCanvasContext;
  activeWorkflowDraft?: WorkflowRecipeDraft | null;
}) {
  const schema = {
    name: 'string',
    description: 'string',
    inputs: [{ id: 'string', label: 'string', type: 'image|text|file', required: true }],
    outputs: [{
      id: 'string',
      title: 'string',
      type: 'image_generator|video_generator|text_agent',
      enabled: true,
      order: 1,
      aspectRatio: 'string|null',
      targetSize: 'string|null',
      resolution: 'string|null',
      prompt: 'string',
      inputRoles: ['input_or_previous_output_id'],
      requiresReferenceImages: true,
      designAgentConfig: {
        agentRole: 'requirement_analyzer|inspiration_analyzer|design_strategist|design_reviewer|presentation_writer|seedance_video_analyzer|general',
        outputArtifactType: 'DesignBrief|ResearchReport|InspirationAnalysis|DesignStrategy|DesignReview|PromptPackage|SeedancePrompt|Document',
        thinkingMode: 'analysis|generation|review',
      },
    }],
    strategy: { enabled: false, mode: 'enabled|disabled', title: 'string', prompt: 'string' },
    executionOrder: [['input_id'], ['output_id']],
    languagePolicy: {
      promptLanguage: 'follow_user|zh-CN|en|bilingual',
      visibleTextLanguage: 'follow_user|zh-CN|en|bilingual',
      imageTextLanguage: 'follow_user|zh-CN|en|bilingual',
      allowEnglishTechnicalTerms: true,
    },
    assumptions: ['string'],
    imagePolicy: {},
  };
  return [
    {
      role: 'system',
      content: [
        'You are a workflow design planner inside Inspiration Drawer.',
        'Return only one JSON object. Do not use markdown. Do not call tools. Do not manipulate the canvas.',
        'Design a structured Workflow Draft Proposal for a local app to validate and convert into an editable draft.',
        'The app, not you, will validate schema, de-duplicate IDs, validate input references, append the original request to prompts, and create the draft UI.',
        'Use stable ASCII ids. Keep prompts specific, editable, and implementation-ready. Prefer the user language for visible copy policy.',
        'For industrial-design workflows, use text_agent outputs as Design Agent Nodes for requirement breakdown, inspiration analysis, strategy, review, and delivery writing. Image generators execute visual concepts; they do not replace analysis nodes.',
        'Set designAgentConfig on each text_agent. Preserve a clear dependency chain through inputRoles instead of flattening every stage into one prompt.',
        'Required JSON shape:',
        JSON.stringify(schema),
      ].join('\n'),
    },
    {
      role: 'user',
      content: JSON.stringify({
        request: input.userText,
        context: summarizeContextForPlanner(input.context),
        activeWorkflowDraft: input.activeWorkflowDraft || null,
      }),
    },
  ];
}
