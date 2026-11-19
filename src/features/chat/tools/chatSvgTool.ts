import capabilities from './svgCapabilities.json';

export const MAX_CHAT_SVG_LENGTH = 500_000;
export const CHAT_SVG_RULES = '通用矢量创作：用户要 SVG 或可编辑矢量图时，使用 create_svg 交付真正的 SVG 文件，不是交互原型，不调用付费生图或把位图改后缀。参考图转 SVG 是矢量重绘：先读取本轮实际提供的图片像素，保持原图构图、轮廓、文字内容、比例、配色、渐变和描边，不得擅自重新设计或为绕过校验简化设计。没收到像素就明确说明，不能假装已看图。支持文字 text/tspan、paint-order、渐变及有界本地 filter；不要声称文字描边必须先转路径。字体依赖、低清细节或复杂位图效果无法准确还原时，明确说明近似和未验证项，不能声称无损自动描摹。禁止将参考位图嵌入 SVG 冒充可编辑矢量。只讨论或写提示词不生成；后续修改保留未要求改变的部分并交付完整 SVG。只有真实工具成功返回后才声称已保存文件；校验失败要按具体错误修正，不得编造下载地址。';

export const CREATE_SVG_TOOL = {
  type: 'function' as const,
  function: {
    name: 'create_svg',
    description: '通用 Chat 矢量创作及参考图矢量重绘，交付真实可预览、另存的 .svg 文件。不限主题，不是交互原型，不调用付费图片模型，不把位图嵌入 SVG 冒充矢量。参考图任务先看实际图片像素，保留构图、文字、配色和描边，不自由改版；不能精确还原时说明限制，不宣称自动无损描摹。仅讨论或只要提示词时不执行。后续修改交付完整 SVG。',
    parameters: {
      type: 'object', additionalProperties: false,
      properties: {
        fileName: { type: 'string', maxLength: 120, description: '真实文件名，以 .svg 结尾' },
        content: {
          type: 'string', maxLength: MAX_CHAT_SVG_LENGTH,
          description: `完整静态 SVG XML，根 svg 必须带 xmlns="http://www.w3.org/2000/svg" 与有效 viewBox。支持的元素：${capabilities.tags.join(', ')}。支持的属性：${capabilities.attributes.join(', ')}。文字可直接使用 fill/stroke/stroke-width/paint-order="stroke fill"，不要求转路径。有界静态滤镜定义在 defs 中，filter="url(#id)" 只引用本文件，最多 16 个滤镜、共 128 个滤镜步骤和 64 处滤镜引用，并受总渲染成本限制；stdDeviation/radius 每轴 0～32，偏移每轴 -256～256，滤镜区域最多 400%。保留参考图设计，不为绕过校验删效果。不带 Markdown 围栏；禁止 script、事件、style/CSS、image/feImage 位图、foreignObject、use、href、外部资源和动画。文本使用标准 XML 转义。`,
        },
      },
      required: ['fileName', 'content'],
    },
  },
};

export function validateSvgToolArguments(args: Record<string, unknown>) {
  if (Object.keys(args).some(key => !['fileName', 'content'].includes(key))
    || typeof args.fileName !== 'string' || !args.fileName.trim() || args.fileName.length > 120
    || !args.fileName.toLowerCase().endsWith('.svg')
    || typeof args.content !== 'string' || !args.content.trim()
    || new TextEncoder().encode(args.content).length > MAX_CHAT_SVG_LENGTH) {
    throw new Error('SVG 需要 .svg 文件名和不超过 500 KB 的完整矢量源码；原生端会再次校验安全性');
  }
}

/** Image-only preview: never insert untrusted XML into the application DOM. Native validation is authoritative. */
export function svgPreviewDataUrl(source?: string) {
  source = source?.replace(/^\s*<\?xml\s+version=["']1\.0["'](?:\s+encoding=["']UTF-8["'])?\s*\?>/i, '');
  if (!source || new TextEncoder().encode(source).length > MAX_CHAT_SVG_LENGTH || !/<svg[\s>]/i.test(source)
    || /<(?:script|foreignObject|image|feImage|use|style|iframe|object|animate\w*|set|a|audio|video)\b|<!DOCTYPE|<\?|\s(?:on[a-z]+|href|[\w-]+:href|style)\s*=/i.test(source)) return undefined;
  // Decode only to validate local url() references. Keep the exact original source in the exported file.
  const references = source.replace(/&#(?:x([0-9a-f]+)|(\d+));/gi, (_match, hex: string, decimal: string) => {
    const code = parseInt(hex || decimal, hex ? 16 : 10);
    return code <= 0x10ffff ? String.fromCodePoint(code) : '';
  }).replace(/&quot;/g, '"').replace(/&apos;/g, "'");
  if (references.includes('\\')) return undefined;
  for (const match of references.matchAll(/url\(([^)]*)\)/gi)) {
    if (!/^\s*(?:#[\w-]+|"#[\w-]+"|'#[\w-]+')\s*$/.test(match[1])) return undefined;
  }
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(source);
}

/** Native validation failures are editable-source failures, not a reason to invent a link or raster fallback. */
export function svgCreationFailure(error: unknown): Error {
  const detail = error instanceof Error ? error.message : String(error);
  return new Error(`SVG 文件未生成：${detail}。请根据具体回执修正 SVG XML，保留参考图构图、文字、描边和效果；支持 paint-order 和有界本地 filter，不要把文字描边误判为必须转路径。禁止删除关键设计、嵌入位图或伪造下载链接。写入/网络错误不能宣称是格式不支持。`);
}
