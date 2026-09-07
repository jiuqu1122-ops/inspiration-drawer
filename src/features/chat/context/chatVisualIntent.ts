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
