import type { BufferItem } from '../../../types';
import { test } from 'vitest';
import { CANVAS_AGENT_TOOL_DEFINITIONS, isCanvasAgentToolReadOnly } from '../../canvasAgentTools';
import { applyCreativeGeneratorDefaults, applyCreativeWorkflowDefaults, extractCreativeBrief } from '../skills/creativeProductDesignSkill';
import { searchDrawerInspirations } from './drawerSemanticRetrieval';
import { buildInspirationAnalysisPrompt, extractJsonObject, normalizeInspirationProfile } from './inspirationAnalysis';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const baseItem = (id: string, name: string): BufferItem => ({
  id,
  name,
  type: 'image',
  content: name,
  createdAt: 1,
});

const items: BufferItem[] = [
  {
    ...baseItem('warm-appliance', '暖白磨砂香氛设备'),
    folderId: 'lifestyle',
    inspirationProfile: {
      itemId: 'warm-appliance',
      summary: '暖白色生活方式小家电，表面克制柔和',
      objects: ['香氛设备'],
      category: '生活家电',
      form: { silhouette: ['圆润'], geometry: ['圆柱'], proportion: ['轻巧'] },
      cmf: { colors: ['暖白色'], materials: ['塑料'], finishes: ['细腻磨砂'] },
      style: ['温暖', '极简'],
      interaction: ['顶部旋钮'],
      scene: ['居家生活'],
      mood: ['温暖'],
      userTags: ['生活方式'],
      userNotes: ['适合参考高级小家电 CMF'],
    },
  },
  {
    ...baseItem('black-tool', '黑色硬核电钻'),
    inspirationProfile: {
      itemId: 'black-tool',
      summary: '黑色硬核工具',
      objects: ['电钻'],
      category: '工具',
      form: { silhouette: ['锐利'], geometry: ['折线'], proportion: ['厚重'] },
      cmf: { colors: ['黑色'], materials: ['橡胶'], finishes: ['高对比'] },
      style: ['硬核'], interaction: ['扳机'], scene: ['工地'], mood: ['力量'], userTags: [], userNotes: [],
    },
  },
];

const matches = searchDrawerInspirations(items, {
  query: '便携咖啡机，温暖、暖白、磨砂、轻巧',
  projectBrief: { productType: '咖啡机', styleKeywords: ['温暖'], materialPreferences: ['磨砂'] },
  referenceRole: 'CMF_REF',
  folderIds: ['lifestyle'],
  topK: 3,
});
assert(matches[0]?.itemId === 'warm-appliance', 'semantic retrieval should rank relevant drawer CMF first');
assert(matches[0]?.recommendedRole === 'CMF_REF', 'requested role should be preserved');
assert(matches[0]?.matchedFeatures.includes('暖白色'), 'matched features should explain retrieval');

const brief = extractCreativeBrief({ userText: '为年轻用户设计一个温暖复古的便携咖啡机，暖白磨砂，避免科技发光感' });
assert(brief.projectBrief.productType.length > 0, 'creative brief should include product type');
assert(brief.projectBrief.styleKeywords.includes('温暖'), 'creative brief should extract style');
assert(brief.projectBrief.materialPreferences.includes('磨砂表面'), 'creative brief should extract finish preference');

const repaired = applyCreativeGeneratorDefaults({
  inspirationReferences: [{
    itemId: 'warm-appliance',
    role: 'CMF_REF',
    reason: '暖白色和磨砂质感符合温暖生活方式定位',
  }],
}, '设计一个温暖复古的便携咖啡机');
const prompt = String(repaired.prompt || '');
assert(prompt.includes('Original Request:'), 'prompt should inject original request section');
assert(prompt.includes('Design Brief:'), 'prompt should inject design brief section');
assert(prompt.includes('Selected Inspiration References:'), 'prompt should inject selected references');
assert(prompt.includes('Role: CMF_REF'), 'prompt should inject reference role');

const workflow = applyCreativeWorkflowDefaults({
  inspirationReferences: [{ itemId: 'warm-appliance', role: 'CMF_REF', reason: '暖白磨砂符合定位' }],
  steps: [{ id: 'render', type: 'image_generator', prompt: '生成产品效果图' }],
}, '设计一个温暖复古的便携咖啡机');
const workflowPrompt = String((workflow.steps as Array<Record<string, unknown>>)[0]?.prompt || '');
assert(workflowPrompt.includes('Selected Inspiration References:'), 'workflow generator prompt should inject reference context');

assert(
  CANVAS_AGENT_TOOL_DEFINITIONS.some(tool => tool.function.name === 'drawer_search_inspirations'),
  'drawer semantic retrieval tool should be registered',
);
assert(isCanvasAgentToolReadOnly('drawer_search_inspirations'), 'drawer semantic retrieval must be read-only');

const analysisPrompt = buildInspirationAnalysisPrompt({
  itemId: 'warm-appliance',
  userTags: ['生活方式'],
  userNotes: ['保留用户备注'],
});
assert(analysisPrompt.includes('Required schema:'), 'LLM analysis prompt should require structured JSON');
const parsedAnalysis = extractJsonObject('```json\n{"summary":"暖白磨砂设备","category":"生活家电","cmf":{"colors":["暖白"]}}\n```');
const normalizedProfile = normalizeInspirationProfile(parsedAnalysis, {
  itemId: 'warm-appliance',
  userTags: ['生活方式'],
  userNotes: ['保留用户备注'],
});
assert(normalizedProfile.itemId === 'warm-appliance', 'profile normalization must preserve requested itemId');
assert(normalizedProfile.cmf.colors.includes('暖白'), 'profile normalization should preserve LLM CMF output');
assert(normalizedProfile.userNotes.includes('保留用户备注'), 'profile normalization should preserve user notes');

assert(
  ['analyze_inspiration', 'analyze_inspirations_batch', 'get_inspiration_analysis_job']
    .every(name => CANVAS_AGENT_TOOL_DEFINITIONS.some(tool => tool.function.name === name)),
  'phase 2 inspiration analysis tools should be registered',
);
assert(isCanvasAgentToolReadOnly('get_inspiration_analysis_job'), 'analysis job status must be read-only');

test('phase 1 inspiration memory assertions', () => {
  assert(matches.length > 0, 'phase 1 inspiration memory assertions should complete');
});
