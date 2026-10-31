import { PRESENTATION_DESIGN_STYLES, PRESENTATION_THEMES } from './presentationArtDirection';

// The native writer accepts up to 40 requested slides and may paginate to 60.
export const CHAT_PRESENTATION_SCHEMA = {
  type: ['object', 'null'],
  description: '仅 PPTX 使用，format=pptx 时必须提供。使用可编辑的结构化幻灯片，不要传整页图片或 Markdown 大纲。',
  properties: {
    title: { type: 'string' },
    subtitle: { type: ['string', 'null'] },
    theme: { type: 'string', enum: [...PRESENTATION_THEMES] },
    designStyle: { type: 'string', enum: [...PRESENTATION_DESIGN_STYLES] },
    accentColor: { type: ['string', 'null'], pattern: '^#[0-9A-Fa-f]{6}$', description: '可选强调色，仅接受 #RRGGBB 十六进制颜色。' },
    slides: {
      type: 'array',
      minItems: 1,
      maxItems: 40,
      description: '按顺序提供 1–40 张幻灯片；默认约 10 页，用户指定页数时遵从，内容少时可更短。每页必须显式给出适合该页任务的 layout，避免依赖原生端猜测版式。每张输入页按真实排版容量拟合，极长正文可分页且保留全部内容，不应依赖自动分页规划故事。',
      items: {
        type: 'object',
        properties: {
          layout: {
            type: ['string', 'null'],
            description: '逐页分镜必填，明确选择本页构图；根据内容在 cover/statement/insight/comparison/grid/process/metrics/image-left/image-right/two-column/content/section/canvas 中变化，不要整份重复一种版式。metrics 仅用于有来源的真实数字；image-left/image-right 需要实际图片 ID。',
            enum: ['cover', 'section', 'content', 'two-column', 'image-left', 'image-right', 'statement', 'insight', 'metrics', 'process', 'comparison', 'grid', 'canvas', null],
          },
          title: { type: 'string' },
          subtitle: { type: ['string', 'null'] },
          body: { type: ['string', 'null'] },
          bullets: { type: 'array', items: { type: 'string' }, default: [], description: '简短要点；没有要点时省略或传 []，不要传 null。' },
          leftTitle: { type: ['string', 'null'] },
          leftBody: { type: ['string', 'null'] },
          rightTitle: { type: ['string', 'null'] },
          rightBody: { type: ['string', 'null'] },
          imageAttachmentId: { type: ['string', 'null'], description: '仅使用已提供的图片 attachmentId 或当前会话工具结果中明确提供的图片 ID；无图时省略或传 null。禁止本地路径、URL、Base64 或编造的 ID。' },
          imageCaption: { type: ['string', 'null'] },
          notes: { type: ['string', 'null'] },
          eyebrow: { type: ['string', 'null'] },
          takeaway: { type: ['string', 'null'] },
          items: {
            type: 'array',
            maxItems: 6,
            default: [],
            description: '结构化内容项；comparison 恰好 2 项，process 3–5 项，grid 3–6 项，metrics 2–4 项且 value 仅填有来源的真实数据。无内容项时省略或传 []，不要传 null。',
            items: {
              type: 'object',
              properties: {
                title: { type: 'string' },
                body: { type: ['string', 'null'] },
                value: { type: ['string', 'null'] },
              },
              required: ['title'],
              additionalProperties: false,
            },
          },
          backgroundColor: { type: ['string', 'null'], pattern: '^#[0-9A-Fa-f]{6}$', description: '可选逐页背景色，仅接受 #RRGGBB；与整份演示文稿的强调色协调并保持文字对比度。' },
          elements: {
            type: 'array',
            maxItems: 40,
            default: [],
            description: '可选的原生可编辑矢量图元与文字标签；坐标及尺寸为页面百分比，须在页面内且不遮挡正文。仅支持限定图元，不接受 SVG、原始 HTML、脚本或外部 URL；颜色仅接受 #RRGGBB。无需图元时省略或传 []，不要传 null。',
            items: {
              type: 'object',
              properties: {
                kind: { type: 'string', enum: ['rect', 'ellipse', 'line', 'text'] },
                x: { type: 'number', minimum: 0, maximum: 100 },
                y: { type: 'number', minimum: 0, maximum: 100 },
                width: { type: 'number', minimum: 0, maximum: 100 },
                height: { type: 'number', minimum: 0, maximum: 100 },
                fill: { type: ['string', 'null'], pattern: '^#[0-9A-Fa-f]{6}$' },
                stroke: { type: ['string', 'null'], pattern: '^#[0-9A-Fa-f]{6}$' },
                strokeWidth: { type: 'number', minimum: 0, maximum: 8 },
                opacity: { type: 'number', minimum: 0, maximum: 1 },
                text: { type: ['string', 'null'] },
                fontSize: { type: 'number', minimum: 12, maximum: 72 },
                color: { type: ['string', 'null'], pattern: '^#[0-9A-Fa-f]{6}$' },
              },
              required: ['kind', 'x', 'y', 'width', 'height'],
              additionalProperties: false,
            },
          },
        },
        required: ['title'],
        additionalProperties: false,
      },
    },
  },
  required: ['title', 'theme', 'designStyle', 'slides'],
  additionalProperties: false,
};

export const CHAT_PRESENTATION_SYSTEM_RULES = [
  '用户明确要求制作演示文稿、生成 PPT、PowerPoint、PPTX 或承接前文演示文稿请求要求导出文件时，必须调用 create_file 创建真实、可编辑的 .pptx 文件：format="pptx"，fileName 以 .pptx 结尾，并提供 presentation（title、theme、designStyle、slides；subtitle/accentColor 可选），不要只给大纲、把内容贴在聊天里或伪造下载链接。',
  '先做逐页分镜（storyboard）；检索型任务在分镜前必须先做信息综合：从检索结果中合并重复事实、提炼结论、证据、差异和待验证项，禁止整段复制网页或搜索摘要。根据用户目标、受众、行业和资料决定每页的结论、证据、视觉任务与构图，再填内容；slides 中每页都必须显式填写 layout、title，洞见页用 takeaway，比较/步骤/分类页优先用结构化 items；不要留空 layout 让生成器猜测，也不必把内部计划输出给用户。默认 8–12 页，用户指定页数时遵从，内容少时可更短；不要把少量内容拆成 24 页或用空洞章节凑页数。每次最多请求 40 张幻灯片；每个 slides[i] 应是一张完整的叙事页，不依赖自动分页；每页正文保持短小，证据和细节完整放入 notes，不把半句拆成下一页。有效证据不足时缩短为研究启动稿并说明边界，不硬凑 10 页。最终最多 60 页，不要靠堆积长文规避限制。',
  'PPTX 的 slides 使用 cover、section、content、two-column、image-left、image-right、statement、insight、metrics、process、comparison、grid 布局，但布局只是起点，不是逐页固定模板。文本、标题、要点、图示标签和几何形状必须使用原生可编辑内容，不能把整页做成图片。默认使用简洁自然的中文（用户指定其他语言时遵从），每页聚焦一个主题，标题精炼、正文简短，bullets 使用简短字符串数组，无要点时省略或传 [] 而非 null。',
  '封面 cover 需要强标题层级、充足留白和与主题相关的视觉锚点；研究具体产品或界面时优先用获准图片或相关原生矢量轮廓/示意，而不是无关几何装饰；可用获准的图片或原生矢量构图，不靠密集正文撑满。用 statement 表达关键主张，用 insight 配合 takeaway 表达有依据的结论；metrics 只展示来自用户资料或已核实来源的数据，在 imageCaption 或 notes 中注明来源，不编造 KPI。metrics 使用 2–4 项且每项 value 有真实来源；comparison 的 items 恰好 2 项，原生契约为双侧比较，不要传 3 项冒充三栏；process 使用 3–5 项，grid 使用 3–6 项，所有 items 最多 6 项且每项含 title，可选 body/value，无内容项时省略或传 [] 而非 null。',
  '按叙事节奏交替使用结论、证据、图像、流程与比较，避免连续 3 页 content，也不要全篇 two-column。每页按内容安排重心、比例和留白，保持图文均衡，不要只是白底蓝色短横线加文字列表。eyebrow 仅在确实帮助定位章节时使用，不要每页堆叠 kicker；takeaway 应是可验证的洞见或行动建议，少用夸张宣传语和空泛口号。',
  '每份演示都必须重新做视觉决策，并显式填写 designStyle 与 theme：editorial（叙事/研究）、technical（系统）、minimal（克制）、cinematic（视觉叙事）、brutalist（高对比几何）、soft（柔和生活方式）、custom（按用户给出的方向自定义）；theme 选 light/dark/warm/mono/vivid/pastel。先遵循用户本轮明确指定的风格、品牌色、色彩与版式；没有指定时根据受众、主题和素材自主挑选，不要总选 editorial/light/蓝色，也不要把历史作品风格当成默认。custom 应用逐页背景、强调色和有意义的可编辑 elements 实现。backgroundColor 可逐页选择，并保证正文对比度。',
  'canvas 是原生可编辑的自由排版页：用 elements 自行放置标题、短正文、图形与来源；title 仅为页名，必须另有一个 text 图元显示同一标题。不自动加标题、页码或装饰。canvas 不混用 body/items/bullets/imageAttachmentId；需要图片时用现有图片版式。非对称封面、海报式章节和不同标题位置可用 canvas 实现。',
  '每页构图独立服务内容：不要固定左文右图封面、固定标题位置、固定右侧装饰区或整套重复同一网格；没有用户约束时可探索非对称、通栏、上图下文、分割色块等安全构图。需要更自由的逐页构图时，可选用 elements 添加原生可编辑的示意图、流程连线、几何色块和文字标签，而不局限于固定模板；矢量用于解释内容或支撑视觉层级，不是每页必加的装饰，也不能代替真实研究证据。每页最多 40 个图元，kind 仅 rect/ellipse/line/text；x/y/width/height 为 0–100 的页面百分比，并满足 x+width≤100、y+height≤100；strokeWidth 为 0–8 磅，opacity 为 0–1，fontSize 为 12–72 磅，canvas 每个 text 图元必须显式设置 color 并与背景保持对比，正文应简短且足够大；长证据放 notes。fill/stroke/color/backgroundColor/accentColor 仅用 #RRGGBB，省略不需要的属性；禁止传入任意 SVG 字符串、原始 HTML、脚本或外部 URL。为标题、正文和图片保留安全区域，图元和标签不得遮挡内容或相互意外重叠；无需图元时省略 elements 或传 []，不要为了装饰强行填满。',
  '产品、工业或设计研究类演示，在用户允许且有可用来源时，应有真实产品/案例参考图或明确标注的 AI 概念视觉，不要默认做成全篇纯文字。真实参考须来自用户资料或已核实且可用的工具结果；AI 生成插图只能标作概念/示意，不是竞品证据，也不是真实产品照片；在用户需要时也可生成方案板、拼版或排版方向作为视觉素材，但它仍不能替代 PPT 中可编辑的文本、图形、表格和事实数据，不得虚构产品、照片或数据。用户禁用图片、附件已足够或没有获准的视觉来源时，不强制寻找或生成新图片；用户只要纯文字或确实没有可用且获准的视觉来源时，制作纯文字演示文稿即可，仍用原生排版保持层级。',
  '检索型 PPT 每页只保留一个主结论、2～4 条短证据和必要来源；来源写入 notes 或简短括号，不把 URL、JSON、网页原文或搜索卡片整段放入正文。PPTX 配图仅能在 imageAttachmentId 中引用实际提供的图片 attachmentId（包括本轮重新提供的历史图片附件）或当前会话工具结果中明确提供的图片 ID；绝不填写本地路径、URL、Base64 或编造的 ID。不得声称已看过加载失败的图片。制作 PPT 不必每份都生图。优先复用用户附件及当前会话已完成的参考图片；根据用户要求和内容需要，自行决定是否调用 generate_image 或 generate_image_variants 制作有帮助的 AI 插图。不设置整份演示文稿的生图总量或调用次数上限；每次调用仍须遵守工具的数量限制，不要重复生成已有合适配图；用户明确不用 AI 生图、只要纯文字或只用附件时不得生图。生图完成后继续调用 create_file 制作 PPTX，imageAttachmentId 使用已完成工具结果明确提供的图片 ID，不要仅交付图片。',
  'AI 生图可用于示意插图、方案板或排版方向素材，但不得把事实数据、图表或整页幻灯片交给生图伪造或替代原生可编辑内容。演示文稿仅使用用户资料及已核实的信息，不得编造事实、数据、引用或业绩；缺失的信息明确标为待确认。完成后以 create_file 的真实结果为准，沿用现有文件卡片的打开、下载和另存为入口，不要编造交付链接。',
].join('\n');

// A presentation artifact is not an image of a cover, an outline, or a tutorial.
const PRESENTATION_SUBJECT = String.raw`(?:演示文稿|幻灯片|\b(?:power\s*point|pptx?|presentations?|slide[ -]?decks?|slides?)\b)`;
const PRESENTATION_ARTIFACT = String.raw`${PRESENTATION_SUBJECT}(?!\s*(?:的\s*)?(?:封面图|背景图|缩略图|图标|配图|插图|风格|大纲|提纲|讲稿|提示词|教程|(?:cover|background|thumbnail)\s+(?:images?|pictures?)|style|outline|script|prompt|tutorial))`;
const PRESENTATION_ACTION = String.raw`(?:生成|创建|制作|导出|输出|出|整理成|写成|保存为|做成|做|写|设计|转换成|转成|改成|改为|换成|需要|想要|给我|我要|\b(?:create|generate|make|build|design|prepare|write|export|save|download|convert|produce|need|want)\b|would\s+like|i['’]d\s+like|\bturn\b)`;
const PRESENTATION_CREATION = new RegExp(String.raw`${PRESENTATION_ACTION}[^。；;!?\n]{0,120}${PRESENTATION_ARTIFACT}`, 'i');
const PRESENTATION_DELIVERY = new RegExp(String.raw`${PRESENTATION_ARTIFACT}\s*(?:文件|格式)?\s*(?:制作|生成|创建|导出|下载|please\b)`, 'i');
const PRESENTATION_FORMAT_REPLY = new RegExp(String.raw`^(?:(?:就|用|要|请用|换成|改成)\s*)?\.?${PRESENTATION_SUBJECT}\s*(?:文件|格式)?$`, 'i');
const PRESENTATION_ADVICE = /^(?:(?:请问|请|帮我|我想知道|我想了解|能不能教我|can you explain|please explain)\s*)?(?:如何|怎么|怎样|什么是|介绍|讲解|解释|how\b|what\b|explain\b|tell me about\b)/i;
const NEGATED_PRESENTATION = /(?:不要|不用|无需|不需要|暂不|先别|先不|取消|don['’]t|do not|no need to)\s*(?:再|立即|现在|马上)?\s*(?:(?:生成|创建|制作|导出|输出|出|做|写|create|generate|make|export)\s*)?(?:一份|一个|一套|a\b|the\b)?\s*$/i;
const OUTLINE_ONLY = /(?<!不要)(?<!别)(?<!不用)(?<!不)(?:只要|只需要|只写|只给|仅需).{0,12}(?:大纲|提纲|讲稿|提示词)|(?:only|just)\s+(?:(?:an?|the)\s+)?(?:outline|script|prompt)\b/i;

export const isChatPresentationRequest = (text: string) => {
  if (OUTLINE_ONLY.test(text)) return false;
  return text.split(/[，,。；;！？!?\n]/).some(part => {
    const clause = part.trim();
    if (!clause || PRESENTATION_ADVICE.test(clause)) return false;
    const subject = clause.search(new RegExp(PRESENTATION_SUBJECT, 'i'));
    if (subject < 0 || NEGATED_PRESENTATION.test(clause.slice(0, subject))) return false;
    if (/(?:图片?|图像|插画|插图|海报|封面|images?|pictures?|illustrations?|posters?)\s*(?:用于|用作|作为|for(?:\s+the)?)\s*$/i.test(clause.slice(0, subject))) return false;
    return PRESENTATION_CREATION.test(clause)
      || PRESENTATION_DELIVERY.test(clause)
      || PRESENTATION_FORMAT_REPLY.test(clause);
  });
};

// A short request to deliver the file, not to discuss or create a cover image.
export const isChatPresentationExportRequest = (text: string) => isChatPresentationRequest(text) && (
  /^(?:(?:请|帮我|现在|那就|那|就|直接|给我)\s*)*(?:出|输出|导出|生成|制作|做)\s*(?:(?:一份|一个|一套|可编辑的|可下载的|真的)\s*)*\.?(?:pptx?|power\s*point|演示文稿|幻灯片)\s*(?:文件|格式)?\s*(?:吧|please)?[。.!！\s]*$/i.test(text.trim())
);

// Follow-ups need not repeat the file format; the provider still sees the history.
export const isChatFileDeliveryRequest = (text: string) => text.split(/[，,。；;！？!?\n]/).some(part => (
  /(?:给我|发我|提供|导出|下载|保存|需要|想要|我要|要|做成|改成).{0,20}(?:可下载(?:的)?(?:文件|版本)?|文件)|\b(?:give|send|provide|export|save|download|make)\b.{0,60}\b(?:downloadable|files?)\b/i.test(part)
  && !/^(?:(?:请|please)\s*)?(?:不要|不用|无需|不需要|先别|先不|don['’]t\b|do not\b)/i.test(part.trim())
));

// Optional illustration tools are model-selected, never a forced image fallback.
const PRESENTATION_IMAGE_OPT_OUT = /(?:不(?:要|用|需(?:要)?|使用|再|额外)|无需|禁止|别)\s*(?:(?:再|额外|使用|调用|进行)\s*)*(?:AI\s*)?(?:生图|生成\s*(?:AI\s*)?(?:图片?|图像)|画图|绘图|配图|图片?|图像|插图|插画|照片)|(?:纯文字|纯文本|只要文字)|(?:只|仅)(?:用|使用|采用|保留).{0,12}(?:附件|现有(?:图片|配图|素材)|已有(?:图片|配图|素材)|上传的?(?:图片|配图|素材))|(?:no|without)\s+(?:AI[ -]?(?:generated\s+)?)?(?:images?|illustrations?|image generation)|(?:do not|don['’]t|never)\s+(?:use\s+)?(?:AI\s+)?(?:generate\s+(?:any\s+)?images?|image generation|images?)|text[ -]only|(?:only\s+(?:use|reuse)|use\s+only).{0,24}(?:attach(?:ed|ments?)|existing\s+(?:images?|pictures?|media))/i;

export const canGenerateChatPresentationImages = (text: string) => (
  isChatPresentationRequest(text) && !PRESENTATION_IMAGE_OPT_OUT.test(text)
);
