type ChatToolDefinition = {
  type: 'function';
  function: { name: string; description: string; parameters: Record<string, unknown> };
};

const objectSchema = (properties: Record<string, unknown>, required: string[] = []) => ({
  type: 'object', properties, required, additionalProperties: false,
});

export const CHAT_TOOL_DEFINITIONS: ChatToolDefinition[] = [
  { type: 'function', function: { name: 'web_search', description: '通用互联网搜索，可查询新闻、网页、资料、行情等公开信息，并返回摘要、正文摘录、发布时间和来源链接。同一条用户消息最多使用两个不同关键词。', parameters: objectSchema({ query: { type: 'string', description: '完整、具体的搜索词；涉及相对日期时必须写成明确日期。' }, limit: { type: ['number', 'null'], minimum: 1, maximum: 8 } }, ['query']) } },
  { type: 'function', function: { name: 'create_file', description: '创建一个可打开、下载和另存为的真实文件。仅当用户明确要求生成文件、文档、报告、表格或可下载内容时调用。DOCX/PDF 的 content 使用 Markdown；XLSX 使用 sheets；不要返回 Base64、XML 或伪造下载链接。', parameters: objectSchema({ fileName: { type: 'string', description: '用户可见的文件名，包含对应扩展名。' }, format: { type: 'string', enum: ['txt', 'md', 'csv', 'json', 'docx', 'xlsx', 'pdf'] }, content: { type: ['string', 'null'], description: 'TXT/MD/CSV/JSON 的文件正文；DOCX/PDF 使用 Markdown 正文；XLSX 可为 null。' }, sheets: { type: ['array', 'null'], description: '仅 XLSX 使用。第一行应为表头。', items: { type: 'object', properties: { name: { type: 'string' }, rows: { type: 'array', items: { type: 'array', items: { type: ['string', 'number', 'boolean', 'null'] } } } }, required: ['name', 'rows'], additionalProperties: false } } }, ['fileName', 'format']) } },
  { type: 'function', function: { name: 'get_canvas_selection', description: '读取当前画布选中项的精简信息。仅在用户提到当前画布、当前节点或选中内容时使用。', parameters: objectSchema({}) } },
  { type: 'function', function: { name: 'search_assets', description: '在本地素材库中搜索少量相关素材。', parameters: objectSchema({ query: { type: 'string' }, limit: { type: ['number', 'null'], minimum: 1, maximum: 8 }, filter: { type: ['object', 'null'], additionalProperties: true } }, ['query']) } },
  { type: 'function', function: { name: 'generate_image', description: '使用灵感抽屉现有生图系统生成图片，结果显示在聊天中并自动加入画布。当前附件默认自动作为共同参考；只参考部分当前附件时传 attachmentIds，不要猜测本地路径。模型、比例和清晰度默认来自用户的图片设置，只有用户在对话里明确指定新值时才填写对应参数。', parameters: objectSchema({ prompt: { type: 'string' }, model: { type: ['string', 'null'], description: '仅当用户在对话里明确指定模型时填写，否则为 null。' }, aspectRatio: { type: ['string', 'null'], description: '仅当用户明确指定比例时填写，例如 16:9；否则为 null。' }, resolution: { type: ['string', 'null'], description: '仅当用户明确指定清晰度或分辨率时填写，否则为 null。' }, referenceImages: { type: 'array', items: { type: 'string' } }, attachmentIds: { type: ['array', 'null'], items: { type: 'string' } }, count: { type: ['number', 'null'], minimum: 1, maximum: 4 } }, ['prompt']) } },
  { type: 'function', function: { name: 'edit_image', description: '继续编辑本轮或此前聊天生成的图片。只编辑部分当前附件时传 attachmentIds，不要猜测本地路径。模型、比例和清晰度默认来自用户的图片设置，只有用户在对话里明确指定新值时才填写对应参数。', parameters: objectSchema({ prompt: { type: 'string' }, sourceImageId: { type: ['string', 'null'] }, referenceImages: { type: 'array', items: { type: 'string' } }, attachmentIds: { type: ['array', 'null'], items: { type: 'string' } }, model: { type: ['string', 'null'], description: '仅当用户明确指定模型时填写，否则为 null。' }, aspectRatio: { type: ['string', 'null'], description: '仅当用户明确指定比例时填写，否则为 null。' }, resolution: { type: ['string', 'null'], description: '仅当用户明确指定清晰度或分辨率时填写，否则为 null。' } }, ['prompt']) } },
  { type: 'function', function: { name: 'batch_image_operation', description: '仅当正常对话中确认用户希望对多张图片分别执行同一种图像任务时调用。任务可以是排版、换背景、增加或移除元素、修复增强、风格转换、改色、扩图或其他编辑，不得预设任务类型。该调用先形成与用户目标匹配的具体方案并等待自然语言确认，不会立即执行。必须逐张查看图片；不要只复述原话或输出泛化摘要。每张图片会成为相互隔离的并发任务，不会合并成一张参考图。', parameters: objectSchema({ taskUnderstanding: { type: 'string', description: '结合对话说明真正的任务目标、任务类型和成功标准；不要默认写成排版任务。' }, sourceAssessment: { type: 'string', description: '按“图片 1、图片 2…”逐张说明看到了什么、当前差异、处理重点和风险；使用 Markdown 列表。' }, executionPlan: { type: 'string', description: '说明后续工具会对每张图执行哪些步骤、先后关系以及如何根据不同原图自适应。' }, specificChanges: { type: 'string', description: '写清所有图片共同需要增加、移除、替换、调整或修复的内容及目标效果。只有任务涉及排版时才写版式、标题、文案、网格与字体；其他任务写对应的背景、颜色、元素、光影、边缘、清晰度等具体处理。' }, perImageInstructions: { type: 'array', minItems: 1, description: '为当前每张附件各写一条可直接执行的专属指令，数量必须与图片数一致，imageIndex 从 1 开始且不得重复。排版任务要在这里写明该页的实际标题、文案和位置；其他任务写明该图特有的处理区域、难点和目标。', items: { type: 'object', additionalProperties: false, properties: { imageIndex: { type: 'number', minimum: 1 }, instruction: { type: 'string' } }, required: ['imageIndex', 'instruction'] } }, preservationRules: { type: 'string', description: '明确必须保留的主体身份、造型、构图、材质或其他信息，以及禁止出现的变化。' }, deliveryPlan: { type: 'string', description: '只说明独立处理数量、结果顺序和自动编组方式。不要规划或推荐模型、宽高比、分辨率、清晰度。' }, analysisSummary: { type: ['string', 'null'], description: '可选补充说明，不要用它替代上述具体方案字段。' }, instruction: { type: 'string', description: '概括用户本次真实任务。运行时会把完整结构化方案自动编译进最终提示词，因此这里不得套用固定模板。' }, mode: { type: 'string', enum: ['one_per_image'] }, attachmentIds: { type: ['array', 'null'], items: { type: 'string' }, description: '只处理指定附件时填写稳定 attachmentId；省略或 null 时使用当前消息的全部图片。' }, outputCountPerImage: { type: ['number', 'null'], minimum: 1, maximum: 4 }, model: { type: ['string', 'null'], description: '仅当用户在对话里明确指定模型时填写，否则为 null。' }, aspectRatio: { type: ['string', 'null'], description: '仅当用户明确指定比例时填写，否则为 null，运行时将使用图片设置。' }, resolution: { type: ['string', 'null'], description: '仅当用户明确指定清晰度或分辨率时填写，否则为 null，运行时将使用图片设置。' } }, ['taskUnderstanding', 'sourceAssessment', 'executionPlan', 'specificChanges', 'perImageInstructions', 'preservationRules', 'deliveryPlan', 'instruction', 'mode']) } },
  { type: 'function', function: { name: 'generate_video', description: '使用灵感抽屉现有视频生成系统生成视频，结果显示在聊天中。', parameters: objectSchema({ prompt: { type: 'string' }, model: { type: ['string', 'null'] }, aspectRatio: { type: ['string', 'null'] }, resolution: { type: ['string', 'null'] }, referenceImages: { type: 'array', items: { type: 'string' } }, duration: { type: ['number', 'null'] }, count: { type: ['number', 'null'], minimum: 1, maximum: 4 } }, ['prompt']) } },
  { type: 'function', function: { name: 'add_to_canvas', description: '把聊天生成的媒体明确发送到画布。没有用户明确要求时禁止调用。', parameters: objectSchema({ mediaId: { type: ['string', 'null'] }, assetId: { type: ['string', 'null'] } }) } },
  { type: 'function', function: { name: 'create_canvas_generator', description: '在画布上创建但不自动运行一个图片或视频生成节点。', parameters: objectSchema({ mediaType: { type: 'string', enum: ['image', 'video'] }, prompt: { type: ['string', 'null'] }, model: { type: ['string', 'null'] }, aspectRatio: { type: ['string', 'null'] }, resolution: { type: ['string', 'null'] } }, ['mediaType']) } },
  { type: 'function', function: { name: 'list_workflows', description: '列出灵感抽屉中可用的工作流。', parameters: objectSchema({ query: { type: ['string', 'null'] }, limit: { type: ['number', 'null'], minimum: 1, maximum: 20 } }) } },
  { type: 'function', function: { name: 'run_workflow', description: '运行指定工作流。可能产生费用，继续使用现有确认机制。', parameters: objectSchema({ workflowId: { type: 'string' }, inputIds: { type: 'array', items: { type: 'string' } }, projectBrief: { type: ['string', 'null'] } }, ['workflowId']) } },
];

const EXPLICIT_TOOL_INTENT = /((当前|我的|这个|这块|现有).{0,4}画布|画布.{0,8}(选中|节点|内容|添加|放入|放进|创建|运行|有什么|看看|读取|操作)|素材库|(生成|做|画|绘制|制作|渲染).{0,40}(图|图片|视频|照片|风景照|海报|插画|封面|头像|壁纸)|生图|放进画布|发送到画布|选中.{0,4}(图|节点)|当前节点|(列出|查看|运行|执行|有哪些|使用).{0,8}(工作流|workflow)|(工作流|workflow).{0,8}(列表|运行|执行|有哪些)|查找.{0,8}素材|搜索.{0,8}素材)/i;
const FOLLOWUP_EDIT_INTENT = /(再|继续|刚才|这张|上一张).{0,12}(冷|暖|亮|暗|改|修改|编辑|调整|换|增加|减少)|颜色再|构图再/i;
const DIRECT_IMAGE_INTENT = /(?:生成|做|画|绘制|制作|渲染|设计).{0,40}(?:图|图片|照片|风景照|海报|插画|封面|头像|壁纸)|生图/i;
const FILE_CREATION_INTENT = /(?:生成|创建|制作|导出|整理|写成|保存为|做成|做).{0,28}(?:文件|文档|报告|表格|电子表格|下载|Word|Excel|PDF|DOCX|XLSX|CSV|JSON|Markdown|TXT)|(?:给我|需要|要).{0,12}(?:Word|Excel|PDF|DOCX|XLSX|CSV|JSON|Markdown|TXT)|(?:Word|Excel|PDF|DOCX|XLSX|CSV|JSON|Markdown|TXT).{0,20}(?:文件|文档|报告|表格|生成|创建|导出|下载)/i;
const BATCH_IMAGE_INTENT = /(?:全部|每张|每一张|每个|分别|逐张|各自|一个个|所有(?:图|图片)|这些(?:图|图片)|(?:这|那)几张.{0,8}(?:图|图片)|多张.{0,8}(?:图|图片)|(?:图|图片).{0,8}都|all\s+(?:images?|pictures?)|each\s+(?:image|picture)|every\s+(?:image|picture)|separately|one\s+per\s+image)/i;
const COMBINED_REFERENCE_INTENT = /(?:(?:融合|综合|结合).{0,40}(?:生成|做|设计|创作)|参考.{0,20}(?:这些|这几张|多张|所有|全部).{0,20}(?:生成|做|设计|创作).{0,12}(?:一个|一张|一款|新(?:的)?))/i;
const EXPLICIT_SEPARATE_IMAGE_INTENT = /(?:(?:不要|无需|别)(?:再)?(?:把)?.{0,8}(?:合并|融合|整合)|(?:每张|每一张|逐张|分别|各自).{0,16}(?:单独|独立|各自))/i;
const ATTACHED_IMAGE_OPERATION_INTENT = /(?:参考|融合|综合|基于|按照).{0,24}(?:图|图片|设计|视觉).{0,24}(?:生成|做|设计|改|制作|排版)|(?:生成|做|设计|修改|编辑|整理|排版|重排|换|增强|去掉|添加).{0,32}(?:图|图片|背景|设计|视觉|版面|作品集|说明)/i;
const GENERAL_IMAGE_EDIT_INTENT = /(?:去掉|删除|移除|消除|清除|替换|抠图|换背景|改背景|改色|调色|修图|精修|增强|修复|扩图|去水印|加字|加上|变清晰|提高清晰度|放大).{0,24}(?:背景|水印|文字|元素|颜色|画面|图像|图片|主体|清晰度)?/i;

export const shouldExposeChatTools = (text: string, hasRecentGeneratedMedia = false) => (
  EXPLICIT_TOOL_INTENT.test(text) || (hasRecentGeneratedMedia && FOLLOWUP_EDIT_INTENT.test(text))
);

const WEB_SEARCH_INTENT = /(联网|上网|网上|网络搜索|网页搜索|搜索网络|搜索网页|查一下最新|查查最新|(最新|实时|今天|当前).{0,18}(新闻|消息|情况|信息|数据|行情|价格|汇率|天气|赛程|政策|法规|版本|发布)|搜索.{0,16}(新闻|资料|论文|网站|网页))/i;

export const shouldExposeWebSearch = (text: string) => WEB_SEARCH_INTENT.test(text);

export const shouldExposeBatchImageOperation = (text: string, imageAttachmentCount: number) => (
  imageAttachmentCount >= 2
  && (
    BATCH_IMAGE_INTENT.test(text)
    || ATTACHED_IMAGE_OPERATION_INTENT.test(text)
    || GENERAL_IMAGE_EDIT_INTENT.test(text)
  )
  && (EXPLICIT_SEPARATE_IMAGE_INTENT.test(text) || !COMBINED_REFERENCE_INTENT.test(text))
);

export const getChatToolDefinitions = (
  text: string,
  hasRecentGeneratedMedia = false,
  webSearchEnabled = false,
  webSearchBlocked = false,
  imageAttachmentCount = 0,
) => {
  const exposeBatch = shouldExposeBatchImageOperation(text, imageAttachmentCount);
  const exposeAttachedImageTools = imageAttachmentCount > 0 && ATTACHED_IMAGE_OPERATION_INTENT.test(text);
  const exposeLocalTools = shouldExposeChatTools(text, hasRecentGeneratedMedia) || exposeBatch || exposeAttachedImageTools;
  const exposeFileCreation = FILE_CREATION_INTENT.test(text);
  const exposeWebSearch = !webSearchBlocked && (webSearchEnabled || shouldExposeWebSearch(text));
  return CHAT_TOOL_DEFINITIONS.filter(tool => (
    tool.function.name === 'web_search'
      ? exposeWebSearch
      : tool.function.name === 'create_file'
        ? exposeFileCreation
        : tool.function.name === 'batch_image_operation'
          ? exposeBatch
          : exposeLocalTools
  ));
};

export const shouldDirectGenerateImage = (text: string) => DIRECT_IMAGE_INTENT.test(text);
