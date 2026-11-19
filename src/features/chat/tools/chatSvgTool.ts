export const MAX_CHAT_SVG_LENGTH=500_000;
export const CREATE_SVG_TOOL={type:'function' as const,function:{name:'create_svg',description:'通用 Chat 矢量创作：用户要求 SVG、可编辑矢量图、矢量插画/图标/标志等实际图形时，生成真实可预览/另存的 .svg 文件。不限主题（动物、花草、标识等），不是交互原型，不调用付费图片模型输出 PNG，不把位图嵌入 SVG 冒充矢量。仅讨论或只要提示词时不执行。后续修改交付完整 SVG。',parameters:{type:'object',additionalProperties:false,properties:{fileName:{type:'string',maxLength:120,description:'真实文件名，以 .svg 结尾'},content:{type:'string',maxLength:MAX_CHAT_SVG_LENGTH,description:'完整静态 SVG XML，根 svg 必须带 xmlns="http://www.w3.org/2000/svg" 与 viewBox。用可编辑 path/circle/rect/g/text/defs/linearGradient/radialGradient 等和展示属性（fill/stroke 等）；不带 Markdown 围栏，不含 script、事件、style/CSS、image 位图、foreignObject、use、href、外部资源或动画。文本使用标准 XML 转义。'}} ,required:['fileName','content']}}};
export function validateSvgToolArguments(args:Record<string,unknown>){
  if(Object.keys(args).some(k=>!['fileName','content'].includes(k))||typeof args.fileName!=='string'||!args.fileName.trim()||args.fileName.length>120||!args.fileName.toLowerCase().endsWith('.svg')||typeof args.content!=='string'||!args.content.trim()||new TextEncoder().encode(args.content).length>MAX_CHAT_SVG_LENGTH)throw new Error('SVG 需要 .svg 文件名和不超过 500 KB 的完整矢量源码；原生端会再次校验安全性');
}
/** Preview as an image, never insert model XML into the application DOM. Native validation remains authoritative. */
export function svgPreviewDataUrl(source?:string){
  source=source?.replace(/^\s*<\?xml\s+version=["']1\.0["'](?:\s+encoding=["']UTF-8["'])?\s*\?>/i,'');
  if(!source||source.length>MAX_CHAT_SVG_LENGTH||!/<svg[\s>]/i.test(source)||/<(?:script|foreignObject|image|use|style|iframe|object|animate|set)\b|<!DOCTYPE|<\?|\s(?:on[a-z]+|href|[\w-]+:href|style)\s*=/i.test(source)||/url\(\s*(?!#)[^)]+\)/i.test(source))return undefined;
  return 'data:image/svg+xml;charset=utf-8,'+encodeURIComponent(source);
}
