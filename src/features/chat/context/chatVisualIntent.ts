const EXPLICIT_VISUAL_CONTEXT_RESET = /(?:换个话题|另一个话题|新话题|从零开始|完全重新开始|(?:不要|不用|无需|别).{0,10}(?:参考|沿用|使用|基于).{0,12}(?:之前|前面|上面|历史|原图|附件|图片|设计))/i;

const SHORT_VISUAL_FOLLOWUP_INTENT = /^(?=.{1,100}$)(?:(?:(?:那|那么|然后|接着|现在|直接|就|好|好的|可以)[，,\s]*)?(?:你)?(?:帮我|给我)?(?:再)?(?:把|将)?(?:(?:开始|继续)?(?:出图|生图|做图|生成(?:图片?|图像)|渲染)(?:吧|了)?|(?:改|修改|调整|优化|完善|细化|深化|重做|重绘|换|替换|增加|减少|去掉|移除|保留|应用|执行).{0,40}(?:(?:然后|并且|并|再)[，,\s]*)?(?:出图|生图|做图|生成(?:图片?|图像)|渲染)?(?:吧|了)?|再(?:来|做|生成|出|画|渲染).{0,32}(?:图|图片|版本|方案|效果)?|(?:这样|这么)(?:做|来|生成|出图)(?:吧)?))[。！!，,\s]*$/i;

const VISUAL_SUBJECT_OR_ATTRIBUTE = /(?:视觉|画面|图像|图片|照片|效果|颜色|色彩|配色|色调|CMF|材质|质感|纹理|肌理|外观|造型|形态|轮廓|结构|比例|细节|场景|环境|空间|背景|建筑|产品|主体|角色|人物|服装|包装|海报|页面|版式|布局|构图|视角|机位|镜头|光影|灯光|氛围|风格|元素|文字|字体)/i;

// Visual follow-ups are often expressed as preferences and constraints instead
// of commands: “我想要更温暖的视觉效果”“保留上面的特点”“建筑不要太复杂”。
// Keep the detection domain-neutral and require visual vocabulary so ordinary
// wishes such as “我希望明天天气好” do not inherit an unrelated image.
const VISUAL_PREFERENCE_OR_CONSTRAINT = /(?:(?:我)?(?:想要|希望|想让|希望让|更喜欢|倾向于|需要).{0,36}(?:视觉|画面|图像|图片|效果|颜色|色彩|配色|色调|CMF|材质|质感|纹理|肌理|外观|造型|形态|轮廓|结构|比例|细节|场景|环境|空间|背景|建筑|产品|主体|角色|人物|服装|包装|海报|页面|版式|布局|构图|视角|机位|镜头|光影|灯光|氛围|风格|元素|文字|字体)|(?:改为|改成|变为|变成|换为|换成|调整为|做成|处理成|呈现为).{0,32}(?:视觉|画面|图像|图片|效果|颜色|色彩|配色|色调|CMF|材质|质感|纹理|肌理|外观|造型|形态|轮廓|结构|比例|细节|场景|环境|空间|背景|建筑|产品|主体|角色|人物|服装|包装|海报|页面|版式|布局|构图|视角|机位|镜头|光影|灯光|氛围|风格|元素|文字|字体|版本)|(?:视觉|画面|图像|图片|效果|颜色|色彩|配色|色调|CMF|材质|质感|纹理|肌理|外观|造型|形态|轮廓|结构|比例|细节|场景|环境|空间|背景|建筑|产品|主体|角色|人物|服装|包装|海报|页面|版式|布局|构图|视角|机位|镜头|光影|灯光|氛围|风格|元素|文字|字体).{0,24}(?:不要|别|避免|不能|无需|不需要|去掉|移除|减少|弱化|简化|增加|加强|突出|保留|保持|更|太|改|修改|调整|换|替换|变))/i;

const VISUAL_CONTEXT_CARRYOVER = /(?:(?:同样|同时|仍然|依然|还是|继续|并且|另外)?[，,\s]*(?:保留|保持|沿用|延续|继承|遵循|维持).{0,24}(?:以上|上述|上面|前面|之前|先前|原来|原有|刚才|已有|现有).{0,16}(?:对话|特点|特征|要求|约束|设计|方案|方向|风格|效果|元素|主体|内容|设定)|(?:以上|上述|上面|前面|之前|先前|原来|原有|刚才|已有|现有).{0,16}(?:对话|特点|特征|要求|约束|设计|方案|方向|风格|效果|元素|主体|内容|设定).{0,20}(?:保留|保持|沿用|延续|继承|遵循|维持))/i;

const ENGLISH_VISUAL_FOLLOWUP = /(?:(?:i\s+(?:want|would\s+like|prefer|hope)|please|let(?:'s| us)?|make|change|turn|keep|retain|preserve|continue).{0,48}(?:visual|image|picture|look|appearance|color|palette|material|texture|shape|form|structure|scene|setting|background|composition|camera|lighting|style|design|feature|character|product)|(?:visual|image|picture|look|appearance|color|palette|material|texture|shape|form|structure|scene|setting|background|composition|camera|lighting|style|design|feature|character|product).{0,32}(?:keep|retain|preserve|change|replace|remove|avoid|less|more|simpler|stronger))/i;

const latestTurnText = (value: string) => value
  .split(/\r?\n/)
  .map(part => part.trim())
  .filter(Boolean)
  .slice(-1)[0] || '';

export const explicitlyResetsVisualContext = (text: string) => (
  EXPLICIT_VISUAL_CONTEXT_RESET.test(latestTurnText(text))
);

export const isShortVisualFollowup = (text: string) => {
  const latest = latestTurnText(text);
  return Boolean(latest)
    && !explicitlyResetsVisualContext(latest)
    && SHORT_VISUAL_FOLLOWUP_INTENT.test(latest);
};

export const isVisualRevisionFollowup = (text: string) => {
  const latest = latestTurnText(text);
  if (!latest || explicitlyResetsVisualContext(latest)) return false;
  return (
    VISUAL_CONTEXT_CARRYOVER.test(latest)
    || (VISUAL_SUBJECT_OR_ATTRIBUTE.test(latest) && VISUAL_PREFERENCE_OR_CONSTRAINT.test(latest))
    || ENGLISH_VISUAL_FOLLOWUP.test(latest)
  );
};

/** Evaluate the latest user instruction, never a stale generation request above it. */
export const latestVisualInstruction = (text: string) => text.split(/\n\n\[Rhino /)[0].trim();

const PROMPT_WRITING_REQUEST_CLAUSE = /(?:(?:\u5e2e\u6211|\u7ed9\u6211|\u8bf7|\u4e3a\u6211)?(?:\u5199|\u64b0\u5199|\u751f\u6210|\u521b\u4f5c|\u7f16\u5199|\u4f18\u5316|\u6da6\u8272|\u6539\u5199|\u7ffb\u8bd1|\u6574\u7406|\u63d0\u4f9b|\u6784\u601d|\u8d77\u8349|\u5b8c\u5584|\u6539\u8fdb|write|draft|compose|generate|create|improve|polish|rewrite|translate|provide).{0,48}(?:\u63d0\u793a\u8bcd|\u63d0\u793a\u8bed|\b(?:image[\s-]?generation\s+)?prompts?\b)|(?:\u63d0\u793a\u8bcd|\u63d0\u793a\u8bed|\bprompts?\b).{0,24}(?:\u600e\u4e48\u5199|\u5982\u4f55\u5199|\u4f18\u5316|\u6da6\u8272|\u6539\u5199|\u7ffb\u8bd1|\u5b8c\u5584|\u89e3\u91ca|\u8bf4\u660e|\u68c0\u67e5|\u6539\u8fdb|improve|polish|rewrite|translate|explain|review))/i;
const EXPLICIT_IMAGE_OUTPUT_CLAUSE = /^(?:(?:\u5148|\u8bf7|\u5e2e\u6211|\u7ed9\u6211|\u73b0\u5728|\u76f4\u63a5|\u4e5f|\u518d|\u5e76(?:\u4e14)?|\u540c\u65f6|\u7136\u540e|\u63a5\u7740|\u53e6\u5916|\u987a\u4fbf|\u540e|please|help me|and then|then|also|and)\s*)*(?:(?:\u6309|\u7528)\s*(?:(?:\u8fd9\u4e2a|\u4e0a\u8ff0|\u8be5)?(?:\u63d0\u793a\u8bcd|\bprompt\b)|\u5b83)|(?:according to|using)\s*(?:this\s+prompt|the\s+prompt|it)\s*)?(?:\u51fa\u56fe|\u751f\u56fe|\u505a\u56fe|\u753b\u56fe|(?:\u751f\u6210|\u7ed8\u5236|\u6e32\u67d3|\u753b).{0,12}(?:\u56fe\u7247?|\u56fe\u50cf|\u7167\u7247|\u6d77\u62a5|\u63d2\u753b|\u6548\u679c\u56fe)|(?:generate|create|render|draw|make|output|show).{0,32}\b(?:images?|pictures?|photos?|posters?|illustrations?|it)\b|(?:\u56fe\u7247?|\u56fe\u50cf|\u7167\u7247|\u6548\u679c\u56fe)\s*(?:(?:\u4e5f|\u518d|\u4e00\u8d77|\u540c\u65f6)\s*)?(?:\u751f\u6210|\u753b|\u7ed8\u5236|\u6e32\u67d3|\u505a|generate|render|draw))/i;

/**
 * An image-generation prompt is still a text deliverable. Do not mistake the
 * prompt's described subject or intended use for permission to render it.
 * A separate image-output clause restores visual intent, e.g. "write a prompt,
 * then generate the image".
 */
export const isImagePromptTextRequest = (text: string): boolean => {
  const current = latestVisualInstruction(text).replace(/[\r\n]+/g, ' ').trim();
  if (!current) return false;
  const clauses = current.split(/(?:[\u3002\uff01\uff1f!?;\uff1b,\uff0c]+|\u7136\u540e|\u63a5\u7740|\u63a5\u4e0b\u6765|\u4e4b\u540e|\u540c\u65f6|\u5e76\u4e14|\u53e6\u5916|\u518d|\band then\b|\bthen\b|\balso\b|\band\b)/i)
    .map(clause => clause.trim())
    .filter(Boolean);
  const promptClauses = clauses.flatMap(clause => {
    const match = PROMPT_WRITING_REQUEST_CLAUSE.exec(clause);
    return match ? [{ clause, trailingText: clause.slice(match.index + match[0].length) }] : [];
  });
  if (promptClauses.length === 0) return false;
  return !clauses.some(clause => {
    const promptClause = promptClauses.find(prompt => prompt.clause === clause);
    return EXPLICIT_IMAGE_OUTPUT_CLAUSE.test(
      promptClause ? promptClause.trailingText.trim() : clause,
    );
  });
};

export const defersVisualGeneration = (text: string): boolean => {
  const current = latestVisualInstruction(text).replace(/[\r\n]+/g, ' ');
  if (stripReferenceWait(current) !== current || /\u7b49\u5f85.{0,12}(?:\u56fe|\u4e0a\u4f20|\u53c2\u8003)/.test(current)) return true;
  const noVisualAction = /(?:\u5148\u522b|\u5148\u4e0d|\u6682\u4e0d|\u6682\u65f6\u4e0d|\u4e0d\u8981|\u4e0d\u7528|\u65e0\u9700|\u4e0d\u9700\u8981|(?<!\u5206)\u522b)\s*(?:\u518d|\u5e2e\u6211|\u7ed9\u6211)?\s*(?:\u51fa\u56fe|\u751f\u56fe|\u505a\u56fe|\u753b\u56fe|\u751f\u6210(?:\u56fe\u7247?|\u56fe\u50cf)|\u6e32\u67d3|\u4fee\u6539(?:\u56fe\u7247?|\u539f\u56fe)|\u7f16\u8f91(?:\u56fe\u7247?|\u539f\u56fe))|(?:\u53ea|\u4ec5|\u6682\u65f6\u53ea|\u5148\u53ea)(?:\u9700\u8981|\u8981|\u505a|\u7ed9\u6211)?[^\u3002\uff01\uff1f!?\uff0c,\n]{0,12}(?:\u5206\u6790|\u8ba8\u8bba|\u89e3\u91ca|\u63cf\u8ff0|\u70b9\u8bc4|\u5efa\u8bae|\u6587\u5b57|\u601d\u8def|\u63d0\u793a\u8bcd)|(?:don'?t|do not|no need to)\s+(?:generate|render|edit|create)(?:\s+(?:an?\s+)?(?:images?|pictures?|visuals?|artwork))?|(?:wait(?:\s+(?:for|until))?|hold off)\s+(?:for\s+)?(?:the\s+)?(?:reference|image|upload|generation|rendering)|(?:analysis|text|advice|prompt)\s+only/i;
  return noVisualAction.test(current);
};

export const isVisualAnalysisQuestion = (text: string): boolean => /(?:怎么|如何|为什么|为何|能不能|是否|有什么|哪些|怎么样|好看吗|合适吗|评价一下|分析一下|看看.{0,12}(?:问题|特点)|\b(?:how|why|can you|could you|what|which)\b)/i.test(latestVisualInstruction(text));

/** Reference-grounded imperative edits do not require the magic word 出图. */
export const isReferenceImageEditDirective = (text: string): boolean => {
  const current = latestVisualInstruction(text);
  if (!current || defersVisualGeneration(current) || isVisualAnalysisQuestion(current)) return false;
  // A screenshot used to fix software is not a request to repaint the screenshot.
  if (/(?:代码|函数|数据库|脚本|报错|bug|MCP|插件|软件|程序|安装|接口|api|typescript|python|rust)/i.test(current)
    && !/(?:图片|图像|照片|海报|渲染图|效果图|image|picture|photo).{0,20}(?:改|换|优化|编辑|重绘|edit|change)/i.test(current)) return false;
  if (/(?:\u63a5\u987a|\u62c9\u76f4|\u5bf9\u9f50|\u5220\u9664|\u64e6\u9664)/.test(current)) return true;
  return /(?:改细|改薄|改宽|改窄|加粗|减薄|收细|加宽|缩小|放大|重新优化|重新设计|重新画|重绘|优化|细化|简化|调整|修改|改成|换成|换个|换背景|去掉|去除|移除|替换|增加|减少|变成|做成|转成|绘制|画成|上色|修复图片|remove|replace|redesign|refine|simplify|change|make|turn|repaint|recolor|restyle)/i.test(current);
};

/** A new reference can complete the previous visual task, rather than start a discussion. */
export const isReferenceSupplyFollowup = (text: string): boolean => {
  const current = latestVisualInstruction(text);
  const chinese = /^(?:\u8fd9\u4e2a|\u8fd9\u5f20|\u8fd9\u6b3e|\u5c31\u8fd9\u4e2a|\u5c31\u662f\u8fd9\u4e2a|\u7528\u8fd9\u4e2a|\u8fd9\u4e00\u4e2a)(?:[\s\uff0c,:\uff1a]+(?:(?:\u8981|\u9700\u8981)?(?:\u4fdd\u7559|\u4fdd\u6301|\u6cbf\u7528|\u7a81\u51fa|\u522b\u6539|\u4e0d\u8981\u6539).{0,90}|\u5176\u4ed6.{0,30}))?[\u3002\uff01!\s]*$/i;
  const english = /^(?:this(?:\s+one)?|that(?:\s+one)?)(?:[\s,;:]+(?:(?:please\s+)?(?:keep|preserve|retain|maintain).{0,100}|.{0,100}))?$/i;
  return chinese.test(current) || english.test(current);
};

// Waiting for the promised reference defers execution, but does not erase the
// requested task once that reference arrives in the following message.
export const stripReferenceWait = (text: string): string => text.replace(/(?:\u8bf7|\u5148)?(?:\u7b49\u6211|\u7b49\u7528\u6237)(?:\u628a|\u518d)?[^\u3002\uff01\uff1f!?\uff0c,\n]{0,12}(?:\u53d1\u56fe|\u4e0a\u4f20(?:\u56fe\u7247?|\u539f\u56fe|\u53c2\u8003\u56fe)|\u63d0\u4f9b(?:\u56fe\u7247?|\u53c2\u8003\u56fe))[^\u3002\uff01\uff1f!?\uff0c,\n]{0,8}|(?:please\s+)?(?:wait|hold)(?:\s+(?:for|until))?\s+(?:me\s+to\s+)?(?:upload|send|provide)?\s*(?:(?:the|a)\s+)?(?:reference|image|picture)(?:\s+(?:image|picture))?/gi, '');


/** Generic visual work intent; deliberately independent of any object/domain vocabulary. */
export const isVisualEditFollowup = (text: string) => {
 const value = latestVisualInstruction(text);
 if (defersVisualGeneration(value) || isVisualAnalysisQuestion(value)) return false;
 return /(?:\b(?:make|change|adjust|improve|refine|simplify|preserve|keep|retain|redesign|restyle|rework|try|show|create|design|draw|visualize)\b|(?:\u4f18\u5316|\u6539|\u8c03\u6574|\u7b80\u5316|\u4fdd\u7559|\u4fdd\u6301|\u6539\u6210|\u6362\u6210|\u91cd\u65b0|\u8bbe\u8ba1|\u7ed8|\u753b|\u8c03\u6210|\u505a\u6210|\u505a\u5f97|\u6539\u5f97))/i.test(value);
};

/** Intent-level visual creation, anchored in a visual deliverable rather than object/industry words. */
export const isVisualCreationIntent = (text: string) => {
  const value = latestVisualInstruction(text);
  if (!value || isImagePromptTextRequest(value) || defersVisualGeneration(value)) return false;
  const english = /\b(?:show|see|visuali[sz]e|create|make|design|draw|illustrate|render|generate)\b.{0,70}\b(?:look|visual|concept|image|picture|appearance|style|scene|artwork|version|design|illustration|rendering)\b|\b(?:look|visual|concept|image|picture|appearance|style|scene|artwork|version|design|illustration)\b.{0,55}\b(?:show|see|visuali[sz]e|create|make|design|draw|illustrate|render|generate)\b/i;
  const chinese = /(?:\u7ed9\u6211\u770b|\u60f3\u770b|\u6211\u60f3\u8981|\u6211\u5e0c\u671b|\u51fa\u4e00\u7248|\u6765\u4e00\u4e2a|\u505a\u6210\u4e00\u7248|\u505a\u51fa\u89c6\u89c9|\u5c55\u793a\u4e00\u4e0b|\u751f\u6210|\u521b\u4f5c|\u7ed8\u5236|\u753b\u4e00\u5f20|\u8bbe\u8ba1\u4e00\u4e2a).{0,32}(?:\u89c6\u89c9|\u753b\u9762|\u6548\u679c|\u65b0\u65b9\u6848|\u6982\u5ff5|\u98ce\u683c|\u7248\u672c|\u5916\u89c2|\u573a\u666f|\u63d2\u753b|\u65b9\u5411|\u8f6e\u5ed3|\u9020\u578b)|(?:\u628a|\u5c06).{0,32}(?:\u89c6\u89c9|\u753b\u9762|\u6548\u679c|\u65b9\u6848|\u98ce\u683c|\u5916\u89c2|\u9020\u578b|\u8f6e\u5ed3).{0,12}(?:\u505a\u5f97|\u6539\u5f97|\u8c03\u6574|\u53d8\u5f97)/;
  return english.test(value) || chinese.test(value);
};
