import { describe, expect, it } from 'vitest';
import type { BufferItem, Folder } from '../../types';
import {
  INDUSTRIAL_DESIGN_FULL_PROCESS_BUILT_IN_WORKFLOW,
  INDUSTRIAL_DESIGN_FULL_PROCESS_NODE_IDS,
  INDUSTRIAL_DESIGN_FULL_PROCESS_NO_EXTRA_REFERENCE,
  buildIndustrialDesignLocalInspirationContext,
  buildIndustrialDesignRuntimeContextText,
  shouldTolerateIndustrialDesignDependencyFailure,
} from './industrialDesignFullProcessWorkflow';
import { tokenizeDrawerSearchText } from '../appAgent/inspirationMemory/drawerSemanticRetrieval';

const makeImage = (id: string, profile: BufferItem['inspirationProfile']): BufferItem => ({
  id,
  type: 'image',
  name: profile?.summary || id,
  content: profile?.summary || id,
  createdAt: 1,
  inspirationProfile: profile,
});

const warmCoffeeReference = makeImage('warm-coffee-reference', {
  itemId: 'warm-coffee-reference',
  summary: '轻巧便携的暖白咖啡设备，圆润比例和克制的居家质感',
  objects: ['便携咖啡机', '旋钮'],
  category: '咖啡设备',
  form: {
    silhouette: ['圆润', '紧凑'],
    geometry: ['柔和圆角矩形'],
    proportion: ['轻巧', '便携'],
  },
  cmf: {
    colors: ['暖白', '米白'],
    materials: ['塑料', '金属'],
    finishes: ['磨砂表面'],
  },
  style: ['温暖', '复古', '极简'],
  interaction: ['顶部旋钮'],
  scene: ['年轻用户居家咖啡场景'],
  mood: ['温暖生活方式'],
  userTags: ['便携咖啡机', '暖白', '圆润'],
  userNotes: ['适合作为便携小家电的造型和 CMF 参考'],
});

describe('industrial design local inspiration context', () => {
  it('keeps concept development runnable when the review Agent times out', () => {
    const development = INDUSTRIAL_DESIGN_FULL_PROCESS_BUILT_IN_WORKFLOW.nodes.find(
      node => node.id === INDUSTRIAL_DESIGN_FULL_PROCESS_NODE_IDS.development,
    );

    expect(development?.inputs).toContain(INDUSTRIAL_DESIGN_FULL_PROCESS_NODE_IDS.concepts);
    expect(shouldTolerateIndustrialDesignDependencyFailure(
      INDUSTRIAL_DESIGN_FULL_PROCESS_NODE_IDS.development,
      INDUSTRIAL_DESIGN_FULL_PROCESS_NODE_IDS.review,
    )).toBe(true);
    expect(shouldTolerateIndustrialDesignDependencyFailure(
      INDUSTRIAL_DESIGN_FULL_PROCESS_NODE_IDS.delivery,
      INDUSTRIAL_DESIGN_FULL_PROCESS_NODE_IDS.review,
    )).toBe(true);
    expect(shouldTolerateIndustrialDesignDependencyFailure(
      INDUSTRIAL_DESIGN_FULL_PROCESS_NODE_IDS.development,
      INDUSTRIAL_DESIGN_FULL_PROCESS_NODE_IDS.strategy,
    )).toBe(false);
  });

  it('uses relevant local metadata candidates and caps references', () => {
    const context = buildIndustrialDesignLocalInspirationContext(
      [warmCoffeeReference],
      '为年轻用户设计温暖复古的便携咖啡机，使用暖白磨砂表面',
    );

    expect(context.usedExtraReferences).toBe(true);
    expect(context.references).toHaveLength(1);
    expect(context.references[0]?.itemId).toBe('warm-coffee-reference');
    expect(context.references[0]?.confidence).toBeGreaterThan(0.9);
    expect(context.metadataText).toContain('未重新分析图片');
    expect(context.metadataText).toContain('未把原图接入生成节点');
    expect(context.metadataText).toContain('itemId: warm-coffee-reference');
  });

  it('segments Chinese requests and returns multiple relevant drawer references', () => {
    const references = [
      makeImage('projector-stand', {
        itemId: 'projector-stand',
        summary: '带折叠支架的桌面投影仪',
        objects: ['桌面投影仪', '折叠支架'],
        category: '投影设备',
        form: { silhouette: ['紧凑'], geometry: ['支架转轴'], proportion: ['桌面尺度'] },
        cmf: { colors: ['白色'], materials: ['金属'], finishes: ['磨砂'] },
        style: ['极简'], interaction: ['俯仰调节'], scene: ['桌面'], mood: [], userTags: ['投影仪', '支架'], userNotes: [],
      }),
      makeImage('projector-compact', {
        itemId: 'projector-compact',
        summary: '紧凑桌面投影仪的圆角造型',
        objects: ['桌面投影仪'],
        category: '投影设备',
        form: { silhouette: ['圆润', '紧凑'], geometry: ['圆角矩形'], proportion: ['桌面尺度'] },
        cmf: { colors: ['灰色'], materials: ['塑料'], finishes: ['磨砂'] },
        style: ['极简'], interaction: [], scene: ['桌面'], mood: [], userTags: ['投影仪'], userNotes: [],
      }),
      makeImage('projector-hinge', {
        itemId: 'projector-hinge',
        summary: '投影设备支架与机身转轴结构',
        objects: ['投影仪', '支架'],
        category: '投影设备',
        form: { silhouette: ['一体化'], geometry: ['转轴'], proportion: ['紧凑'] },
        cmf: { colors: ['黑色'], materials: ['金属'], finishes: ['喷砂'] },
        style: ['克制'], interaction: ['支架角度调节'], scene: ['桌面'], mood: [], userTags: ['支架结构'], userNotes: [],
      }),
      makeImage('unrelated-phone', {
        itemId: 'unrelated-phone',
        summary: '户外按键电话机',
        objects: ['电话机'],
        category: '通信设备',
        form: { silhouette: ['厚重'], geometry: ['矩形'], proportion: ['手持'] },
        cmf: { colors: ['黑色'], materials: ['塑料'], finishes: ['高对比'] },
        style: ['硬核'], interaction: ['数字键盘'], scene: ['桌面'], mood: [], userTags: [], userNotes: [],
      }),
      makeImage('unrelated-router', {
        itemId: 'unrelated-router',
        summary: '白色网络路由器',
        objects: ['路由器'],
        category: '网络设备',
        form: { silhouette: ['扁平'], geometry: ['长方体'], proportion: ['低矮'] },
        cmf: { colors: ['白色'], materials: ['塑料'], finishes: ['磨砂'] },
        style: ['简洁'], interaction: ['指示灯'], scene: ['桌面'], mood: [], userTags: [], userNotes: [],
      }),
    ];

    expect(tokenizeDrawerSearchText('帮我设计一个带支架的桌面投影仪'))
      .toEqual(expect.arrayContaining(['支架', '桌面', '投影']));
    const context = buildIndustrialDesignLocalInspirationContext(
      references,
      '帮我设计一个带支架的桌面投影仪',
    );

    expect(context.references.map(reference => reference.itemId))
      .toEqual(expect.arrayContaining(['projector-stand', 'projector-compact', 'projector-hinge']));
    expect(context.references).toHaveLength(3);
    expect(context.references.map(reference => reference.itemId))
      .not.toEqual(expect.arrayContaining(['unrelated-phone', 'unrelated-router']));
  });

  it('uses curated folder names as semantic and reference-role evidence', () => {
    const folders: Folder[] = [
      { id: 'reference-library', name: '参考库', color: '#10b981' },
      { id: 'shape-references', name: '造型参考', color: '#10b981', parentId: 'reference-library' },
      { id: 'projector-references', name: '投影仪产品参考', color: '#10b981', parentId: 'reference-library' },
      { id: 'color-references', name: '色彩参考', color: '#10b981', parentId: 'reference-library' },
    ];
    const shapeReference = {
      ...makeImage('shape-reference', {
        itemId: 'shape-reference',
        summary: '带支撑转轴的紧凑悬臂造型',
        objects: ['支撑转轴'],
        category: '造型灵感',
        form: { silhouette: ['紧凑'], geometry: ['支架转轴'], proportion: ['低重心'] },
        cmf: { colors: ['灰色'], materials: ['金属'], finishes: ['喷砂'] },
        style: ['极简'], interaction: [], scene: [], mood: [], userTags: ['支架'], userNotes: [],
      }),
      folderId: 'shape-references',
    };
    const productReference = {
      ...makeImage('folder-projector-reference', {
        itemId: 'folder-projector-reference',
        summary: '简洁白色桌面设备',
        objects: ['桌面设备'],
        category: '影像设备',
        form: { silhouette: ['方圆'], geometry: ['圆角矩形'], proportion: ['紧凑'] },
        cmf: { colors: ['白色'], materials: ['塑料'], finishes: ['磨砂'] },
        style: ['简洁'], interaction: [], scene: ['桌面'], mood: [], userTags: [], userNotes: [],
      }),
      folderId: 'projector-references',
    };
    const colorReference = {
      ...makeImage('color-reference', {
        itemId: 'color-reference',
        summary: '暖白与浅灰的低对比配色',
        objects: ['色彩样本'],
        category: 'CMF',
        form: { silhouette: [], geometry: [], proportion: [] },
        cmf: { colors: ['暖白', '浅灰'], materials: [], finishes: ['磨砂'] },
        style: ['克制'], interaction: [], scene: [], mood: ['安静'], userTags: ['暖白'], userNotes: [],
      }),
      folderId: 'color-references',
    };

    const context = buildIndustrialDesignLocalInspirationContext(
      [shapeReference, productReference, colorReference],
      '设计一款暖白色、带支架的桌面投影仪',
      { folders },
    );

    expect(context.references.map(reference => reference.itemId))
      .toEqual(expect.arrayContaining(['shape-reference', 'folder-projector-reference', 'color-reference']));
    expect(context.references.find(reference => reference.itemId === 'shape-reference')?.recommendedRole)
      .toBe('FORM_REF');
    expect(context.references.find(reference => reference.itemId === 'color-reference')?.recommendedRole)
      .toBe('CMF_REF');
    expect(context.metadataText).toContain('Folder: 参考库 / 投影仪产品参考');
  });

  it('excludes explicit product references and emits the required no-reference marker', () => {
    const context = buildIndustrialDesignLocalInspirationContext(
      [warmCoffeeReference],
      '设计暖白磨砂的便携咖啡机',
      { excludeItemIds: ['warm-coffee-reference'] },
    );

    expect(context.references).toEqual([]);
    expect(context.usedExtraReferences).toBe(false);
    expect(context.metadataText).toContain(INDUSTRIAL_DESIGN_FULL_PROCESS_NO_EXTRA_REFERENCE);
    expect(context.metadataText).toContain('不要调用外部搜索或网页采集');

    const runtimeText = buildIndustrialDesignRuntimeContextText({
      projectRequest: '设计暖白磨砂的便携咖啡机',
      connectedInputLabels: ['用户产品参考图'],
      localInspirationContext: context,
    });
    expect(runtimeText).toContain('Original request:');
    expect(runtimeText).toContain('设计暖白磨砂的便携咖啡机');
    expect(runtimeText).toContain('用户产品参考图');
    expect(runtimeText).toContain(INDUSTRIAL_DESIGN_FULL_PROCESS_NO_EXTRA_REFERENCE);
  });

  it('does not adopt medium or low confidence metadata candidates', () => {
    const unrelated = makeImage('unrelated-tool', {
      itemId: 'unrelated-tool',
      summary: '黑色硬核电动工具',
      objects: ['电钻'],
      category: '工具',
      form: { silhouette: ['锐利'], geometry: ['折线'], proportion: ['厚重'] },
      cmf: { colors: ['黑色'], materials: ['橡胶'], finishes: ['高对比'] },
      style: ['硬核'],
      interaction: ['扳机'],
      scene: ['工地'],
      mood: ['力量'],
      userTags: [],
      userNotes: [],
    });
    const context = buildIndustrialDesignLocalInspirationContext(
      [unrelated],
      '设计儿童木制积木玩具',
    );

    expect(context.references).toEqual([]);
    expect(context.metadataText).toContain(INDUSTRIAL_DESIGN_FULL_PROCESS_NO_EXTRA_REFERENCE);
  });
});
