import type * as Sketch from '../../../../integrations/sketch/vendor/types';
import { parsePrototype, type PrototypeDocument, type PrototypeNode } from './prototypeSchema';

export const SKETCH_EXPORT_NOTICE = '导出 .sketch 后，拖入 Figma 文件列表即可导入，不用安装插件或 Sketch 软件。';
export const SKETCH_EXPORT_LIMITATIONS = '文字、图片和图层可继续编辑；布局按当前尺寸定位。弹窗和 Tab 各状态另列画板，不转换为 Figma 原生变体或弹窗交互；基础跳转也需在 Figma 中核对。完整交互请继续使用 Canvas / HTML 预览。';
export type SketchExportParts = {
  document: Omit<Sketch.Document, 'pages'> & { pages: Sketch.FileRef[] };
  meta: Sketch.Meta; user: Sketch.User;
  pages: { id: string; content: Sketch.Page }[];
  images: { name: string; data: string }[];
  warnings: string[];
};
type Bounds = { x: number; y: number; width: number; height: number };
type Layer = Sketch.Group | Sketch.Rectangle | Sketch.Text | Sketch.ShapePath;
/** Stable IDs are independent of node ordering and satisfy the published Sketch
 * UUID schema. Hash collisions are detected before writing any output. */
export function sketchId(key: string): string {
  const words = [0x811c9dc5, 0x9e3779b9, 0x85ebca6b, 0xc2b2ae35];
  for (let index = 0; index < key.length; index++) for (let seed = 0; seed < 4; seed++) {
    words[seed] = Math.imul(words[seed] ^ (key.charCodeAt(index) + seed * 131), 16777619);
  }
  const hex = words.map(word => (word >>> 0).toString(16).padStart(8, '0')).join('').toUpperCase();
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
const rect = (bounds: Bounds): Sketch.Rect => ({ _class: 'rect', constrainProportions: false, ...bounds });
const color = (value = '#000000'): Sketch.Color => {
  const hex = value === 'transparent' ? '#000000' : value;
  return { _class: 'color', alpha: value === 'transparent' ? 0 : hex.length === 9 ? parseInt(hex.slice(7,9),16)/255 : 1, red: parseInt(hex.slice(1, 3), 16) / 255, green: parseInt(hex.slice(3, 5), 16) / 255, blue: parseInt(hex.slice(5, 7), 16) / 255 };
};
const gradient = (): Sketch.Gradient => ({ _class: 'gradient', gradientType: 0, elipseLength: 0, from: '{0.5, 0}', to: '{0.5, 1}', stops: [{ _class: 'gradientStop', color: color(), position: 0 }, { _class: 'gradientStop', color: color('#ffffff'), position: 1 }] });
const context = (opacity = 1): Sketch.GraphicsContextSettings => ({ _class: 'graphicsContextSettings', blendMode: 0, opacity });
const fill = (value: string): Sketch.Fill => ({ _class: 'fill', isEnabled: value !== 'transparent', color: color(value), fillType: 0, noiseIndex: 0, noiseIntensity: 0, patternFillType: 1, patternTileScale: 1, contextSettings: context(), gradient: gradient() });
function style(id: string, node: Partial<PrototypeNode> = {}): Sketch.Style {
  return { _class: 'style', do_objectID: id, borderOptions: { _class: 'borderOptions', isEnabled: true, dashPattern: [], lineCapStyle: 0, lineJoinStyle: 0 },
    startMarkerType: 0, endMarkerType: 0, miterLimit: 10, windingRule: 1, innerShadows: (node.shadows || []).filter(s=>s.inset).map(s=>({ _class: 'innerShadow', isEnabled: true, blurRadius: s.blur, color: color(s.color), contextSettings: context(), offsetX:s.x, offsetY:s.y, spread:s.spread })),
    shadows: (node.shadows || []).filter(s=>!s.inset).map(s=>({ _class: 'shadow', isEnabled: true, blurRadius: s.blur, color: color(s.color), contextSettings: context(), offsetX:s.x, offsetY:s.y, spread:s.spread })),
    colorControls: { _class: 'colorControls', isEnabled: false, brightness: 0, contrast: 1, hue: 0, saturation: 1 }, contextSettings: context(node.opacity ?? 1),
    fills: node.gradient ? [{ ...fill('#ffffff'), fillType: 1, gradient: { _class:'gradient', gradientType:0, elipseLength:0, from: '{'+node.gradient.fromX+', '+node.gradient.fromY+'}', to: '{'+node.gradient.toX+', '+node.gradient.toY+'}', stops: node.gradient.stops.map(s=>({_class:'gradientStop',color:color(s.color),position:s.offset})) } }] : node.fill ? [fill(node.fill)] : [], borders: node.stroke && node.stroke !== 'transparent' && (node.strokeWidth ?? 1) > 0 ? [{ _class: 'border', isEnabled: true, color: color(node.stroke), fillType: 0, position: 1, thickness: node.strokeWidth ?? 1, contextSettings: context(), gradient: gradient() }] : [],
  };
}
const ruler = (): Sketch.RulerData => ({ _class: 'rulerData', base: 0, guides: [] });
const layerBase = (id: string, name: string, bounds: Bounds) => ({
  do_objectID: id, name, nameIsFixed: true, frame: rect(bounds), booleanOperation: -1 as const,
  exportOptions: { _class: 'exportOptions' as const, exportFormats: [], includedLayerIds: [], layerOptions: 0, shouldTrim: false },
  isFixedToViewport: false, isFlippedHorizontal: false, isFlippedVertical: false, isLocked: false, isTemplate: false,
  isVisible: true, layerListExpandedType: 2 as const, resizingConstraint: 63, resizingType: 0 as const, rotation: 0, shouldBreakMaskChain: false,
});
/** Resolve fixed-size flex layout once for Sketch's static import path. We do
 * not claim this becomes native Figma Auto Layout. Absolute coordinates remain
 * relative to the immediate parent, exactly as in our preview renderer. */
export function prototypeChildBounds(parent: Partial<PrototypeNode> & { width: number; height: number }, children: PrototypeNode[]): Map<string, Bounds> {
  const result = new Map<string, Bounds>();
  if (!parent.layout || parent.layout === 'absolute') {
    for (const child of children) result.set(child.id, { x: child.x || 0, y: child.y || 0, width: child.width, height: child.height });
    return result;
  }
  const vertical = parent.layout === 'vertical'; const padding = parent.padding || 0; const inset = (parent.stroke && parent.stroke !== 'transparent' ? parent.strokeWidth ?? 1 : parent.strokeWidth || 0);
  const edge = padding + inset;
  const available = (vertical ? parent.height : parent.width) - 2 * edge;
  const sizes = children.reduce((sum, child) => sum + (vertical ? child.height : child.width), 0);
  const gap = parent.gap || 0;
  const remaining = available - sizes - Math.max(0, children.length - 1) * gap;
  let cursor = edge + (parent.justify === 'center' ? remaining / 2 : parent.justify === 'end' ? remaining : 0);
  const actualGap = parent.justify === 'space-between' && children.length > 1 && remaining > 0 ? gap + remaining / (children.length - 1) : gap;
  const crossSize = (vertical ? parent.width : parent.height) - 2 * edge;
  for (const child of children) {
    const crossRemaining = crossSize - (vertical ? child.width : child.height);
    const cross = edge + (parent.align === 'center' ? crossRemaining / 2 : parent.align === 'end' ? crossRemaining : 0);
    result.set(child.id, { x: vertical ? cross : cursor, y: vertical ? cursor : cross, width: child.width, height: child.height });
    cursor += (vertical ? child.height : child.width) + actualGap;
  }
  return result;
}
function postscriptFont(node: PrototypeNode) {
  const family = node.fontFamily || 'Inter'; const weight = node.fontWeight || 400;
  const known: Record<string, string> = { 'Microsoft YaHei': weight >= 600 ? 'MicrosoftYaHei-Bold' : 'MicrosoftYaHei', 'PingFang SC': weight >= 600 ? 'PingFangSC-Semibold' : 'PingFangSC-Regular' };
  if (known[family]) return known[family];
  if (family === 'Arial') return weight >= 600 ? 'Arial-BoldMT' : 'ArialMT';
  return `${family.replace(/\s+/g, '')}-${({ 400: 'Regular', 500: 'Medium', 600: 'SemiBold', 700: 'Bold' })[weight]}`;
}
export function buildPrototypeSketch(input: PrototypeDocument): SketchExportParts {
  const doc = parsePrototype(input);
  const ids = new Map<string, string>(); const used = new Set<string>();
  const id = (key: string) => {
    if (ids.has(key)) return ids.get(key)!;
    const value = sketchId(`${doc.id}:${key}`);
    if (used.has(value)) throw new Error('导出图层 ID 冲突，请更换原型 ID 后重试');
    ids.set(key, value); used.add(value); return value;
  };
  const children = new Map<string, PrototypeNode[]>();
  for (const node of doc.nodes) children.set(node.parentId, [...(children.get(node.parentId) || []), node]);
  const actions = new Map(doc.interactions.map(action => [action.sourceId, action]));
  const images: SketchExportParts['images'] = []; const imageRefs = new Map<string, string>();
  const warnings = [SKETCH_EXPORT_NOTICE, SKETCH_EXPORT_LIMITATIONS, '字体不嵌入文件，Figma 缺少字体时需要替换；不同字体度量可能影响换行。'];
  if (doc.motions?.length) warnings.push('Canvas 动效基于同一设计数据运行；导出保留静态终态与可编辑图层，不转换为 Figma 原生动画。');
  const screenIds = new Map(doc.screens.map(screen => [screen.id, id(`screen:${screen.id}`)]));
  const makeRectangle = (key: string, name: string, bounds: Bounds, node: Partial<PrototypeNode>): Sketch.Rectangle => {
    const radius = Math.max(0, Math.min(node.radius || 0, bounds.width / 2, bounds.height / 2));
    return { ...layerBase(id(key), name, bounds), _class: 'rectangle', style: style(id(`${key}:style`), node),
      edited: false, fixedRadius: radius, hasConvertedToNewRoundCorners: true, needsConvertionToNewRoundCorners: false,
      isClosed: true, pointRadiusBehaviour: 1,
      points: ['{0, 0}', '{1, 0}', '{1, 1}', '{0, 1}'].map(point => ({ _class: 'curvePoint', cornerRadius: radius, cornerStyle: 0, curveFrom: point, curveTo: point, hasCurveFrom: false, hasCurveTo: false, curveMode: 1, point })),
    };
  };
  const makeText = (key: string, node: PrototypeNode, bounds: Bounds): Sketch.Text => {
    const text = node.text || ''; const size = node.fontSize || 14; const lineHeight = node.lineHeight || Math.round(size * 1.4);
    const attributes: Sketch.StringAttribute['attributes'] = {
      kerning: node.letterSpacing ?? 0,
      MSAttributedStringFontAttribute: { _class: 'fontDescriptor', attributes: { name: postscriptFont(node), size } },
      MSAttributedStringColorAttribute: color(node.color || '#262626'),
      paragraphStyle: { _class: 'paragraphStyle', alignment: (node.textAlign || (node.kind === 'button' ? 'center' : 'left')) === 'center' ? 2 : node.textAlign === 'right' ? 1 : 0, minimumLineHeight: lineHeight, maximumLineHeight: lineHeight, paragraphSpacing: 0 },
      textStyleVerticalAlignmentKey: node.kind === 'button' ? 1 : 0,
    };
    const appearance = style(id(`${key}:style`), { opacity: node.opacity });
    appearance.textStyle = { _class: 'textStyle', verticalAlignment: node.kind === 'button' ? 1 : 0, encodedAttributes: attributes };
    return { ...layerBase(id(key), node.name || text.slice(0, 60) || node.id, bounds), _class: 'text',
      attributedString: { _class: 'attributedString', string: text, attributes: [{ _class: 'stringAttribute', location: 0, length: text.length, attributes }] },
      style: appearance, automaticallyDrawOnUnderlyingPath: false, dontSynchroniseWithSymbol: false,
      glyphBounds: `{{0, 0}, {${bounds.width}, ${bounds.height}}}`, lineSpacingBehaviour: 2, textBehaviour: 2,
    };
  };
  let count = 0;
  const buildNodes = (parent: string, scope: string, parentNode: Partial<PrototypeNode> & { width: number; height: number }): Layer[] => {
    const nodes = children.get(parent) || []; const bounds = prototypeChildBounds(parentNode, nodes);
    return nodes.map(node => buildNode(node, `${scope}/${node.id}`, bounds.get(node.id)!));
  };
  const buildNode = (node: PrototypeNode, key: string, bounds: Bounds): Layer => {
    if (++count > 10000) throw new Error('导出图层过多，请减少页面和组件状态数量');
    let layer: Layer;
    if (node.kind === 'vector') {
      layer = { ...layerBase(id(key), node.name || node.id, bounds), _class:'shapePath', style:style(id(key+':style'),node), edited:false, isClosed:Boolean(node.closed), pointRadiusBehaviour:1,
        points:node.points!.map(p=>({_class:'curvePoint',cornerRadius:0,cornerStyle:0,point:'{'+p.x+', '+p.y+'}',curveFrom:'{'+(p.inX??p.x)+', '+(p.inY??p.y)+'}',curveTo:'{'+(p.outX??p.x)+', '+(p.outY??p.y)+'}',hasCurveFrom:p.inX!==undefined,hasCurveTo:p.outX!==undefined,curveMode:1})) };
    } else if (node.kind === 'text') layer = makeText(key, node, bounds);
    else if (node.kind === 'rect' || node.kind === 'image') {
      layer = makeRectangle(key, node.name || node.id, bounds, node);
      if (node.kind === 'image') {
        const data = node.imageData!;
        let ref = imageRefs.get(data);
        if (!ref) {
          const extension = data.startsWith('data:image/png;') ? 'png' : 'jpg';
          ref = `images/${id(`asset:${images.length}`)}.${extension}`;
          imageRefs.set(data, ref); images.push({ name: ref, data: data.split(',')[1] });
        }
        layer.style!.fills = [{ ...fill('#ffffff'), fillType: 4, image: { _class: 'MSJSONFileReference', _ref_class: 'MSImageData', _ref: ref } }];
      }
    } else {
      let background = node.kind === 'button' && !node.fill && !node.gradient ? { ...node, fill:'#e8e8e8' } : node;
      let descendants: Layer[];
      if (node.kind === 'stateGroup') {
        const state = children.get(node.id)!.find(state => state.id === node.initialStateId)!;
        background = { ...node, fill: state.fill || node.fill, stroke: state.stroke || node.stroke, radius: state.radius ?? node.radius };
        descendants = buildNodes(state.id, `${key}/${state.id}`, state);
      } else if (node.kind === 'button') {
        descendants = [makeText(`${key}/label`, { ...node, opacity: 1, name: '文字' }, { x: 0, y: 0, width: node.width, height: node.height })];
      } else descendants = buildNodes(node.id, key, node);
      const backdrop = makeRectangle(`${key}/background`, '背景 / 裁切边界', { x: 0, y: 0, width: bounds.width, height: bounds.height }, { ...background, shadows: [], opacity: 1 });
      // A shape clipping mask keeps fixed-size containers from leaking children.
      backdrop.hasClippingMask = node.clip !== false; backdrop.clippingMaskMode = 0;
      layer = { ...layerBase(id(key), node.name || node.text || node.id, bounds), _class: 'group', hasClickThrough: false,
        style: style(id(`${key}:style`), { opacity: node.opacity, shadows:node.shadows }), layers: [backdrop, ...descendants] };
    }
    const action = actions.get(node.id);
    layer.userInfo = { 'com.inspirationdrawer.prototype': { nodeId: node.id, ...(action ? { interaction: action } : {}) } };
    if (action?.action === 'navigate' || action?.action === 'back') {
      layer.flow = { _class: 'MSImmutableFlowConnection', destinationArtboardID: action.action === 'back' ? 'back' : screenIds.get(action.targetId!)!, animationType: 0, maintainScrollPosition: false };
    }
    return layer;
  };
  const artboard = (key: string, name: string, bounds: Bounds, layers: Layer[], fillColor = '#ffffff', home = false): Sketch.Artboard => ({
    ...layerBase(id(key), name, bounds), _class: 'artboard', hasClickThrough: false, horizontalRulerData: ruler(), verticalRulerData: ruler(),
    backgroundColor: color(fillColor), hasBackgroundColor: fillColor !== 'transparent', includeBackgroundColorInExport: true,
    isFlowHome: home, resizesContent: false, layers,
  });
  const pages: SketchExportParts['pages'] = [];
  const addPage = (key: string, name: string, boards: Sketch.Artboard[]) => {
    const pageId = id(key);
    pages.push({ id: pageId, content: { ...layerBase(pageId, name, { x: 0, y: 0, width: 0, height: 0 }), _class: 'page',
      hasClickThrough: true, horizontalRulerData: ruler(), verticalRulerData: ruler(), layers: boards } });
  };
  let x = 0;
  addPage('main-page', '界面设计', doc.screens.map(screen => {
    const board = artboard(`screen:${screen.id}`, `${screen.overlay ? '弹窗（静态） / ' : ''}${screen.name}`, { x, y: 0, width: screen.width, height: screen.height }, buildNodes(screen.id, `screen:${screen.id}`, screen), screen.background, screen.id === doc.startScreenId);
    x += screen.width + 100; return board;
  }));
  const stateBoards: Sketch.Artboard[] = []; x = 0;
  for (const group of doc.nodes.filter(node => node.kind === 'stateGroup')) for (const state of children.get(group.id) || []) {
    const name = `${group.name || group.id} / ${state.name || state.id}${state.id === group.initialStateId ? '（初始）' : ''}`;
    stateBoards.push(artboard(`state-board:${state.id}`, name, { x, y: 0, width: state.width, height: state.height }, buildNodes(state.id, `state-board:${state.id}`, state), state.fill || group.fill));
    x += state.width + 100;
  }
  if (stateBoards.length) addPage('states-page', '组件状态（静态可编辑）', stateBoards);
  const textLines = [doc.name, '', SKETCH_EXPORT_NOTICE, '', SKETCH_EXPORT_LIMITATIONS, '', '交互映射（在 Figma Prototype 面板核对或重连）',
    ...doc.interactions.map((action, index) => `${index + 1}. ${action.sourceId} → ${action.action}${action.targetId ? ` / ${action.targetId}` : ''}${action.stateId ? ` / ${action.stateId}` : ''}`)];
  const noteNode: PrototypeNode = { id: 'export-notes', parentId: 'notes', kind: 'text', name: '导入步骤与交互限制', width: 720, height: Math.max(500, textLines.length * 28), text: textLines.join('\n'), fontFamily: 'Microsoft YaHei', fontSize: 14, lineHeight: 24, color: '#333333' };
  addPage('notes-page', '导入说明与交互清单', [artboard('notes-artboard', '使用方法 / 导出限制', { x: 0, y: 0, width: 800, height: noteNode.height + 80 }, [makeText('notes-text', noteNode, { x: 40, y: 40, width: noteNode.width, height: noteNode.height })])]);
  const metadata: Sketch.Meta['created'] = { commit: '', appVersion: '59', build: 86127, app: 'com.bohemiancoding.sketch3' as Sketch.BundleId, compatibilityVersion: 99, version: 121, variant: 'NONAPPSTORE' };
  const pagesAndArtboards: Sketch.Meta['pagesAndArtboards'] = {};
  for (const page of pages) pagesAndArtboards[page.id] = { name: page.content.name, artboards: Object.fromEntries(page.content.layers.map(board => [board.do_objectID, { name: board.name }])) };
  return {
    document: { _class: 'document', do_objectID: id('document'), assets: { _class: 'assetCollection', do_objectID: id('assets'), colorAssets: [], gradientAssets: [], images: [], colors: [], gradients: [], exportPresets: [] }, colorSpace: 1, currentPageIndex: 0,
      foreignLayerStyles: [], foreignSymbols: [], foreignTextStyles: [], layerStyles: { _class: 'sharedStyleContainer', objects: [] }, layerTextStyles: { _class: 'sharedTextStyleContainer', objects: [] }, perDocumentLibraries: [],
      pages: pages.map(page => ({ _class: 'MSJSONFileReference', _ref_class: 'MSImmutablePage', _ref: `pages/${page.id}` })),
    },
    meta: { ...metadata, version: 121, compatibilityVersion: 99, autosaved: 0, pagesAndArtboards, created: metadata, saveHistory: [] },
    user: { document: { pageListHeight: 90, pageListCollapsed: 0 } }, pages, images, warnings,
  };
}
