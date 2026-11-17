/** Synthetic regression fixture, never used as a task template or intent rule. */
import type { PrototypeDocument, PrototypeNode, PrototypeInteraction } from './prototypeSchema';
export function makePrototypeFixture(): PrototypeDocument {
  const nodes: PrototypeNode[] = [];
  const interactions: PrototypeInteraction[] = [];
  const text = (id: string, parentId: string, value: string, y: number, size = 18): PrototypeNode => ({ id, parentId, kind: 'text', x: 24, y, width: 342, height: 54, text: value, fontSize: size, color: '#2c3026' });
  const button = (id: string, parentId: string, value: string, y: number): PrototypeNode => ({ id, parentId, kind: 'button', x: 24, y, width: 342, height: 44, text: value, fontSize: 14, radius: 8, fill: '#dce9b7' });
  nodes.push(text('home-kicker', 'home', 'STUDIO / 交互设计', 36, 12), { ...text('home-title', 'home', '从一个想法，到可触碰的产品。', 90, 26), height: 88 }, text('home-body', 'home', '预览页面、弹窗和组件状态，再导入 Figma 继续编辑。', 190, 14), button('home-detail', 'home', '查看产品详情 →', 270), button('home-open', 'home', '选择规格', 326));
  interactions.push({ sourceId: 'home-detail', action: 'navigate', targetId: 'detail' }, { sourceId: 'home-open', action: 'openOverlay', targetId: 'dialog' });
  nodes.push(text('detail-title', 'detail', '轻量随行 · 产品详情', 50, 26), button('detail-back', 'detail', '← 返回首页', 140), button('detail-order', 'detail', '进入订单', 200));
  interactions.push({ sourceId: 'detail-back', action: 'back' }, { sourceId: 'detail-order', action: 'navigate', targetId: 'order' });
  nodes.push(text('order-title', 'order', '订单确认', 50, 26), text('order-body', 'order', '这是原型流程，不会创建真实订单。', 130, 14), button('order-home', 'order', '返回首页', 220));
  interactions.push({ sourceId: 'order-home', action: 'navigate', targetId: 'home' });
  nodes.push(text('dialog-title', 'dialog', '选择规格', 24, 22), text('dialog-body', 'dialog', '这里是原生弹窗流程。', 80, 14), { ...button('dialog-close', 'dialog', '完成并关闭', 144), width: 282 });
  interactions.push({ sourceId: 'dialog-close', action: 'closeOverlay' });
  nodes.push({ id: 'tabs', parentId: 'home', kind: 'stateGroup', name: '产品信息 Tab', x: 24, y: 420, width: 342, height: 230, initialStateId: 'tab-info' });
  for (const state of ['info', 'spec']) {
    const parentId = 'tab-' + state;
    nodes.push({ id: parentId, parentId: 'tabs', kind: 'state', width: 342, height: 230, fill: '#ffffff', radius: 12 });
    nodes.push({ id: parentId + '-bar', parentId, kind: 'frame', name: '标签栏 / Auto Layout', width: 342, height: 64, layout: 'horizontal', gap: 8, padding: 12 });
    for (const target of ['info', 'spec']) {
      nodes.push({ id: parentId + '-' + target, parentId: parentId + '-bar', kind: 'button', width: 150, height: 40, text: target === 'info' ? '介绍' : '参数', radius: 6, fill: target === state ? '#dce9b7' : '#f1f1ed' });
      if (target !== state) interactions.push({ sourceId: parentId + '-' + target, action: 'setState', targetId: 'tabs', stateId: 'tab-' + target });
    }
    nodes.push({ ...text(parentId + '-content', parentId, state === 'info' ? '一体成型，轻巧随身。' : '重量 128g · 铝合金外壳', 92), x: 18, width: 306 });
  }
  return { schemaVersion: 1, id: 'synthetic-product-flow', name: '产品交互原型验证', startScreenId: 'home', screens: [
    { id: 'home', name: '首页', width: 390, height: 844, background: '#f7f5ef' },
    { id: 'detail', name: '详情', width: 390, height: 844, background: '#f7f5ef' },
    { id: 'order', name: '订单', width: 390, height: 844, background: '#f7f5ef' },
    { id: 'dialog', name: '规格弹窗', width: 330, height: 230, background: '#ffffff', overlay: true },
  ], nodes, interactions };
}
