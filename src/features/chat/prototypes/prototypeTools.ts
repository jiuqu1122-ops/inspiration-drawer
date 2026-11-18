import { PROTOTYPE_JSON_SCHEMA } from './prototypeSchema';
export const CREATE_UI_PROTOTYPE_TOOL = {
  type: 'function' as const,
  function: {
    name: 'create_ui_prototype',
    description: '用户要求制作 UI/交互原型、可点击设计稿或可导入 Figma 的原型时，创建可直接导入 Figma 的 .sketch 设计文件并在 Canvas 预览。不是生图，也不是任意 HTML/JS 转 Figma。结构化 screens/nodes/interactions 驱动可交互预览；导出为文字/图片/分组等可编辑图层。Canvas/HTML 支持页面跳转、弹窗、返回、Tab；Figma 导入不承诺保留这些交互或原生 Auto Layout。用户只问方法/讨论/提示词时不调用。后续修改提交完整新版本，保持 prototype.id 和原节点 ID，不得编造 .fig 下载链接。',
    parameters: {
      type: 'object', additionalProperties: false, required: ['prototype'],
      properties: { prototype: PROTOTYPE_JSON_SCHEMA },
    },
  },
};
export const CHAT_PROTOTYPE_RULES = [
  '用户要求 Figma 文件或 .fig 时，不要因为无法原生输出 .fig 就拒绝整个需求；可交付真正的 .sketch 供 Figma 导入，简明告知格式替代后按需求制作。若用户明确只接受 .fig、不接受替代格式，则如实说明限制，不擅自创建。',
  '可导入 Figma 的交互原型使用 create_ui_prototype，不调用生图，也不能把整页图片、HTML、JSX 或改后缀的 .fig 冒充可编辑设计。纯 HTML 需求仍使用 create_file(format="html")。用户只讨论如何制作或只要提示词时不执行工具。',
  '原型 schemaVersion=1，id/name/startScreenId/screens/nodes/interactions 全部提供。nodes 是扁平数组，parentId 指向 screen 或 frame/state，顺序即同级绘制顺序。所有 screen/node ID 全局唯一，以字母开头，只含英文数字、下划线和短横线。先完整规划页面/节点/交互，再一次提交。不输出包内源码或伪造链接。',
  '布局：screen 给出 width/height/background；frame 支持 absolute/horizontal/vertical 布局，padding/gap/align/justify。节点 width/height 固定像素；absolute 布局下 x/y 相对于直接父容器，Auto Layout 下按 nodes 顺序排布。文字使用 text，color/fontFamily/fontSize/fontWeight/textAlign/lineHeight；颜色只支持 #RRGGBB 或 transparent；不要创建尺寸为零的节点。多行文字的 height 必须容纳换行与 lineHeight，检查文本裁切、节点重叠和页面边界后再提交。图像仅使用真实内嵌 PNG/JPEG imageData，不猜本地路径/URL/图片 base64，不用生图截图替代 UI。没有素材时用矢量矩形和文字构建设计。',
  '交互：每个 sourceId 仅一个点击动作。navigate.targetId 指向普通 screen，openOverlay.targetId 指向 overlay=true 的 screen，back/closeOverlay 不带 targetId/stateId。Tab/开关用 kind=stateGroup 容器，其直接子节点只能是 2～12 个 kind=state（状态尺寸与 group 一致），initialStateId 指定初态。每个 state 再包含按钮/文字/frame；内部按钮的 setState.targetId 指向自己的 group，stateId 指向同组状态。当前选中 Tab 不绑定到自身的 setState；禁止嵌套 stateGroup，或用外部按钮跨组 CHANGE_TO。',
  '导出文件是 .sketch，用户另存后直接拖入 Figma 文件列表或使用 Figma Import，无需安装插件、Sketch 软件或 MCP；不生成伪造 .fig。固定尺寸的预览布局会计算成静态坐标，不宣称原生 Figma Auto Layout。组件的各个状态另列静态画板；弹窗和 Tab 不转换为 Figma 原生交互/变体。基础跳转写入 Sketch flow 仍需在 Figma 核对；完整交互保留在 Canvas/HTML。必须简明说明导出限制。不能要求用户创建插件、编辑 manifest、运行脚本、提供 Token，也不能声称已在 Figma 中创建文件。',
  '修改已有原型时复用原型/节点 ID，提交完整新文档，保留未修改的页面和交互。不要只输出局部 JSON 补丁，也不要退回图片或普通 HTML。',
].join('\n');
