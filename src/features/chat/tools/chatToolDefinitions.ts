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
  { type: 'function', function: { name: 'generate_image', description: '使用灵感抽屉现有生图系统生成图片，结果显示在聊天中并自动加入画布。', parameters: objectSchema({ prompt: { type: 'string' }, model: { type: ['string', 'null'] }, aspectRatio: { type: ['string', 'null'] }, resolution: { type: ['string', 'null'] }, referenceImages: { type: 'array', items: { type: 'string' } }, count: { type: ['number', 'null'], minimum: 1, maximum: 4 } }, ['prompt']) } },
  { type: 'function', function: { name: 'edit_image', description: '继续编辑本轮或此前聊天生成的图片。', parameters: objectSchema({ prompt: { type: 'string' }, sourceImageId: { type: ['string', 'null'] }, referenceImages: { type: 'array', items: { type: 'string' } }, model: { type: ['string', 'null'] }, aspectRatio: { type: ['string', 'null'] }, resolution: { type: ['string', 'null'] } }, ['prompt']) } },
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

export const shouldExposeChatTools = (text: string, hasRecentGeneratedMedia = false) => (
  EXPLICIT_TOOL_INTENT.test(text) || (hasRecentGeneratedMedia && FOLLOWUP_EDIT_INTENT.test(text))
);

const WEB_SEARCH_INTENT = /(联网|上网|网上|网络搜索|网页搜索|搜索网络|搜索网页|查一下最新|查查最新|(最新|实时|今天|当前).{0,18}(新闻|消息|情况|信息|数据|行情|价格|汇率|天气|赛程|政策|法规|版本|发布)|搜索.{0,16}(新闻|资料|论文|网站|网页))/i;

export const shouldExposeWebSearch = (text: string) => WEB_SEARCH_INTENT.test(text);

export const getChatToolDefinitions = (
  text: string,
  hasRecentGeneratedMedia = false,
  webSearchEnabled = false,
  webSearchBlocked = false,
) => {
  const exposeLocalTools = shouldExposeChatTools(text, hasRecentGeneratedMedia);
  const exposeFileCreation = FILE_CREATION_INTENT.test(text);
  const exposeWebSearch = !webSearchBlocked && (webSearchEnabled || shouldExposeWebSearch(text));
  return CHAT_TOOL_DEFINITIONS.filter(tool => (
    tool.function.name === 'web_search'
      ? exposeWebSearch
      : tool.function.name === 'create_file'
        ? exposeFileCreation
        : exposeLocalTools
  ));
};

export const shouldDirectGenerateImage = (text: string) => DIRECT_IMAGE_INTENT.test(text);
