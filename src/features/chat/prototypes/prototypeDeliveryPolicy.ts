export const PROTOTYPE_DELIVERY_RECOVERY = 'Prototype delivery continuation issued.';

// Tool visibility is broader than this bounded delivery check: the model still
// judges intent from the complete conversation, not a fixed list of UI subjects.
export const requestsPrototypeArtifact = (text: string) => {
  if (/(?:\bsvg\b|\bvector\b|矢量)/i.test(text) && !/(?:figma|sketch|交互原型|UI\s*原型)/i.test(text)) return false;
  if (!/(?:figma|sketch|\bfig\b|交互原型|可编辑.{0,8}(?:设计|图层)|UI\s*原型)/i.test(text)) return false;
  if (/(?:只(?:能|要)|必须).{0,12}\.?fig\b|(?:不要|不接受).{0,12}sketch|(?:only|must).{0,12}\.fig\b|(?:no|not|without).{0,8}sketch/i.test(text)) return false;
  if (/(?:不要|不需要|先别|暂不).{0,12}(?:生成|制作|导出|创建)|(?:只|仅).{0,6}(?:讲解|讨论|分析|提示词|代码)|(?:how\s+(?:can|do|to)|what\s+is|explain|能不能|是否可以|如何|怎么).{0,40}(?:figma|sketch|原型|导出)/i.test(text)) return false;
  return /(?:制作|生成|创建|导出|交付|给我|帮我|做一个|做一套|设计一个|设计一套|create|make|build|export|deliver)/i.test(text);
};

export const prototypeCapabilityInstruction = (toolNames: string[]) => {
  if (!toolNames.includes('create_ui_prototype')) return '';
  return [
    'Available application capability: create_ui_prototype is an actual callable tool in this request, not quoted conversation content. The host creates a real editable .sketch file and an interactive Canvas preview after a valid tool result.',
    'A user asking for a Figma file or .fig usually wants an editable design deliverable. Native .fig export is unavailable, but .sketch export for import into Figma is available. Briefly disclose this format substitution and use the real tool when the user requests creation. Do not reject the entire design task merely because the exact .fig extension is unavailable.',
    'General SVG/vector artwork belongs to create_svg, not create_ui_prototype. An editable vector illustration is not a Figma/UI prototype merely because it has editable layers.',
    'Do not claim a native .fig, Figma account access, lossless interactions or a completed download before a successful tool receipt. Respect requests that explicitly disallow Sketch alternatives. Questions, plans and prompt-only requests remain text; tool visibility is not permission to create files.',
  ].join('\n');
};
