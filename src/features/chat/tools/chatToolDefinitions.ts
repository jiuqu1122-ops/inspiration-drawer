import { isShortVisualFollowup, isVisualRevisionFollowup } from '../context/chatVisualIntent';
import type { ChatMessage } from '../model/chatTypes';
import { MAX_WEB_SEARCH_QUERIES_PER_TURN } from '../runtime/chatTurnPolicy';

type ChatToolDefinition = {
  type: 'function';
  function: { name: string; description: string; parameters: Record<string, unknown> };
};

const objectSchema = (properties: Record<string, unknown>, required: string[] = []) => ({
  type: 'object', properties, required, additionalProperties: false,
});

export const CHAT_TOOL_DEFINITIONS: ChatToolDefinition[] = [
  { type: 'function', function: { name: 'web_search', description: `通用互联网搜索，可查询新闻、网页、资料、行情等公开信息，并返回摘要、正文摘录、发布时间和来源链接。同一条用户消息最多使用 ${MAX_WEB_SEARCH_QUERIES_PER_TURN} 个不同关键词。`, parameters: objectSchema({ query: { type: 'string', description: '完整、具体的搜索词；涉及相对日期时必须写成明确日期。' }, limit: { type: ['number', 'null'], minimum: 1, maximum: 8 } }, ['query']) } },
  { type: 'function', function: { name: 'create_file', description: '创建一个可打开、下载和另存为的真实文件。仅当用户明确要求生成文件、文档、报告、表格或可下载内容时调用。DOCX/PDF 的 content 使用 Markdown；XLSX 使用 sheets；不要返回 Base64、XML 或伪造下载链接。', parameters: objectSchema({ fileName: { type: 'string', description: '用户可见的文件名，包含对应扩展名。' }, format: { type: 'string', enum: ['txt', 'md', 'csv', 'json', 'docx', 'xlsx', 'pdf'] }, content: { type: ['string', 'null'], description: 'TXT/MD/CSV/JSON 的文件正文；DOCX/PDF 使用 Markdown 正文；XLSX 可为 null。' }, sheets: { type: ['array', 'null'], description: '仅 XLSX 使用。第一行应为表头。', items: { type: 'object', properties: { name: { type: 'string' }, rows: { type: 'array', items: { type: 'array', items: { type: ['string', 'number', 'boolean', 'null'] } } } }, required: ['name', 'rows'], additionalProperties: false } } }, ['fileName', 'format']) } },
  { type: 'function', function: { name: 'create_agent', description: '当用户用普通对话明确要求新建可复用的 Chat 智能体、技能、skill、skills（也兼容 skllis）时调用，真实保存到智能体列表。根据用户需求生成具体的名称、适用场景、触发关键词和可执行的 Markdown 技能指令。指令应写清角色、步骤、输出格式及成功标准；涉及软件操作时仅使用灵感抽屉 Chat 已提供的画布、素材、图片、视频、工作流和文件工具，不要编造脚本、插件或不存在的能力。默认只创建不启用；用户明确要求立即使用时才传 activate=true。', parameters: objectSchema({ name: { type: 'string', maxLength: 80, description: '简洁的智能体名称，不超过 80 字。' }, description: { type: 'string', maxLength: 240, description: '智能体适用场景和职责，不超过 240 字。' }, triggers: { type: 'array', minItems: 1, maxItems: 12, items: { type: 'string' }, description: '3 到 8 个具体任务关键词或短语，用于在 Chat 中推荐启用。' }, instructions: { type: 'string', maxLength: 16000, description: '完整的 Markdown 技能指令：角色、工作步骤、输出要求、边界和画布工具使用方式；仅写当前客户端支持的能力。' }, activate: { type: ['boolean', 'null'], description: '仅当用户明确要求创建后立即使用时为 true，否则为 false 或 null。' } }, ['name', 'description', 'triggers', 'instructions']) } },
  { type: 'function', function: { name: 'get_canvas_selection', description: '读取当前画布选中项的精简信息。仅在用户提到当前画布、当前节点或选中内容时使用。', parameters: objectSchema({}) } },
  { type: 'function', function: { name: 'search_assets', description: '在本地素材库中搜索少量相关素材。', parameters: objectSchema({ query: { type: 'string' }, limit: { type: ['number', 'null'], minimum: 1, maximum: 8 }, filter: { type: ['object', 'null'], additionalProperties: true } }, ['query']) } },
  { type: 'function', function: { name: 'generate_image', description: '使用灵感抽屉现有生图系统执行一个图片任务，结果显示在聊天中并自动加入画布。count>1 只表示同一提示词的随机候选，不得用它承载多个独立任务；如果用户明确要求把多个方向放进同一张对比图、拼版或方案板，也使用本工具并固定 count=1，在 prompt 中描述同图布局。当前附件默认自动作为共同参考；只有用户明确说不要使用附件时才传 useAttachedImages=false。只参考部分当前附件时传 attachmentIds，不要猜测本地路径。模型、比例和清晰度默认来自用户的图片设置，只有用户在对话里明确指定新值时才填写对应参数。', parameters: objectSchema({ prompt: { type: 'string' }, model: { type: ['string', 'null'], description: '仅当用户在对话里明确指定模型时填写，否则为 null。' }, aspectRatio: { type: ['string', 'null'], description: '仅当用户明确指定比例时填写，例如 16:9；否则为 null。' }, resolution: { type: ['string', 'null'], description: '仅当用户明确指定清晰度或分辨率时填写，否则为 null。' }, referenceImages: { type: 'array', items: { type: 'string' } }, attachmentIds: { type: ['array', 'null'], items: { type: 'string' } }, useAttachedImages: { type: ['boolean', 'null'], description: '仅当用户明确要求忽略、不参考当前或历史附件时传 false；其他情况为 null。' }, count: { type: ['number', 'null'], minimum: 1, maximum: 4 } }, ['prompt']) } },
  { type: 'function', function: { name: 'generate_image_variants', description: '当用户要求同一个参考对象产生多个语义不同的设计方向、方案、版本、风格或概念，并且每个方向要独立出图时调用。适用于任何视觉领域，不限于产品或 CMF。每个 variants 项会成为一个独立并行任务且固定只生成一张图；禁止把所有方向合进一个 prompt，也禁止用 generate_image 的 count 代替。如果用户明确要求一张图同时展示多个方案、并排比较或做成方案板，不得调用本工具，应使用 generate_image 且 count=1。当前或历史续接图片会自动作为所有任务的共同参考。', parameters: objectSchema({ sharedRequirements: { type: 'string', description: '所有独立方案共同遵守的要求，包括必须保持的主体身份、结构、比例、视角、构图或其他连续性约束。' }, variants: { type: 'array', minItems: 2, maxItems: 4, items: { type: 'object', additionalProperties: false, properties: { name: { type: 'string', description: '用户可识别的方案名称。' }, prompt: { type: 'string', description: '只描述当前这一个方案的完整、可执行生图指令，不得混入其他方案。' } }, required: ['name', 'prompt'] } }, model: { type: ['string', 'null'], description: '仅当用户明确指定模型时填写，否则为 null。' }, aspectRatio: { type: ['string', 'null'], description: '仅当用户明确指定比例时填写，否则为 null。' }, resolution: { type: ['string', 'null'], description: '仅当用户明确指定清晰度或分辨率时填写，否则为 null。' }, referenceImages: { type: 'array', items: { type: 'string' } }, attachmentIds: { type: ['array', 'null'], items: { type: 'string' } }, useAttachedImages: { type: ['boolean', 'null'], description: '仅当用户明确要求忽略、不参考当前或历史附件时传 false；其他情况为 null。' } }, ['sharedRequirements', 'variants']) } },
  { type: 'function', function: { name: 'edit_image', description: '继续编辑本轮或此前聊天生成的图片。只有用户明确说不要使用附件时才传 useAttachedImages=false。只编辑部分当前附件时传 attachmentIds，不要猜测本地路径。模型、比例和清晰度默认来自用户的图片设置，只有用户在对话里明确指定新值时才填写对应参数。', parameters: objectSchema({ prompt: { type: 'string' }, sourceImageId: { type: ['string', 'null'] }, referenceImages: { type: 'array', items: { type: 'string' } }, attachmentIds: { type: ['array', 'null'], items: { type: 'string' } }, useAttachedImages: { type: ['boolean', 'null'], description: '仅当用户明确要求忽略、不参考当前或历史附件时传 false；其他情况为 null。' }, model: { type: ['string', 'null'], description: '仅当用户明确指定模型时填写，否则为 null。' }, aspectRatio: { type: ['string', 'null'], description: '仅当用户明确指定比例时填写，否则为 null。' }, resolution: { type: ['string', 'null'], description: '仅当用户明确指定清晰度或分辨率时填写，否则为 null。' } }, ['prompt']) } },
  { type: 'function', function: { name: 'batch_image_operation', description: '仅当正常对话中确认用户希望对多张图片分别执行同一种图像任务时调用。任务可以是排版、换背景、增加或移除元素、修复增强、风格转换、改色、扩图或其他编辑，不得预设任务类型。该调用先形成与用户目标匹配的具体方案并等待自然语言确认，不会立即执行。必须逐张查看图片；不要只复述原话或输出泛化摘要。每张图片会成为相互隔离的并发任务，不会合并成一张参考图。', parameters: objectSchema({ taskUnderstanding: { type: 'string', description: '结合对话说明真正的任务目标、任务类型和成功标准；不要默认写成排版任务。' }, sourceAssessment: { type: 'string', description: '按“图片 1、图片 2…”逐张说明看到了什么、当前差异、处理重点和风险；使用 Markdown 列表。' }, executionPlan: { type: 'string', description: '说明后续工具会对每张图执行哪些步骤、先后关系以及如何根据不同原图自适应。' }, specificChanges: { type: 'string', description: '写清所有图片共同需要增加、移除、替换、调整或修复的内容及目标效果。只有任务涉及排版时才写版式、标题、文案、网格与字体；其他任务写对应的背景、颜色、元素、光影、边缘、清晰度等具体处理。' }, perImageInstructions: { type: 'array', minItems: 1, description: '为当前每张附件各写一条可直接执行的专属指令，数量必须与图片数一致，imageIndex 从 1 开始且不得重复。排版任务要在这里写明该页的实际标题、文案和位置；其他任务写明该图特有的处理区域、难点和目标。', items: { type: 'object', additionalProperties: false, properties: { imageIndex: { type: 'number', minimum: 1 }, instruction: { type: 'string' } }, required: ['imageIndex', 'instruction'] } }, preservationRules: { type: 'string', description: '明确必须保留的主体身份、造型、构图、材质或其他信息，以及禁止出现的变化。' }, deliveryPlan: { type: 'string', description: '只说明独立处理数量、结果顺序和自动编组方式。不要规划或推荐模型、宽高比、分辨率、清晰度。' }, analysisSummary: { type: ['string', 'null'], description: '可选补充说明，不要用它替代上述具体方案字段。' }, instruction: { type: 'string', description: '概括用户本次真实任务。运行时会把完整结构化方案自动编译进最终提示词，因此这里不得套用固定模板。' }, mode: { type: 'string', enum: ['one_per_image'] }, attachmentIds: { type: ['array', 'null'], items: { type: 'string' }, description: '只处理指定附件时填写稳定 attachmentId；省略或 null 时使用当前消息的全部图片。' }, outputCountPerImage: { type: ['number', 'null'], minimum: 1, maximum: 4 }, model: { type: ['string', 'null'], description: '仅当用户在对话里明确指定模型时填写，否则为 null。' }, aspectRatio: { type: ['string', 'null'], description: '仅当用户明确指定比例时填写，否则为 null，运行时将使用图片设置。' }, resolution: { type: ['string', 'null'], description: '仅当用户明确指定清晰度或分辨率时填写，否则为 null，运行时将使用图片设置。' } }, ['taskUnderstanding', 'sourceAssessment', 'executionPlan', 'specificChanges', 'perImageInstructions', 'preservationRules', 'deliveryPlan', 'instruction', 'mode']) } },
  { type: 'function', function: { name: 'generate_video', description: '使用灵感抽屉现有视频生成系统生成新视频，结果显示在聊天中。不要把已有视频补帧或增强请求路由到这里。引用能力和数量由所选模型的现有能力校验决定；不要猜测本地文件路径。', parameters: objectSchema({ prompt: { type: 'string' }, model: { type: ['string', 'null'] }, aspectRatio: { type: ['string', 'null'] }, resolution: { type: ['string', 'null'] }, referenceImages: { type: 'array', items: { type: 'string' } }, referenceVideos: { type: 'array', items: { type: 'string' } }, referenceAudios: { type: 'array', items: { type: 'string' } }, inputMode: { type: ['string', 'null'], enum: ['REF', 'FLF', null] }, duration: { type: ['number', 'null'] }, count: { type: ['number', 'null'], minimum: 1, maximum: 4 } }, ['prompt']) } },
  { type: 'function', function: { name: 'interpolate_video', description: '对一个已有视频执行补帧。优先使用用户明确指定的视频；否则使用当前画布选中的单个视频或最近明确引用的视频。', parameters: objectSchema({ inputId: { type: ['string', 'null'], description: '画布视频节点 ID；不要填写本地文件路径。' }, mediaId: { type: ['string', 'null'], description: 'Chat 已生成视频的媒体 ID；不要填写本地文件路径。' } }) } },
  { type: 'function', function: { name: 'enhance_image', description: '使用灵感抽屉现有图片增强工具提高图片清晰度。', parameters: objectSchema({ inputId: { type: ['string', 'null'], description: '画布图片节点 ID；不要填写本地文件路径。' }, mediaId: { type: ['string', 'null'], description: 'Chat 已生成图片的媒体 ID；不要填写本地文件路径。' } }) } },
  { type: 'function', function: { name: 'enhance_video', description: '使用灵感抽屉现有视频增强工具提高视频清晰度。', parameters: objectSchema({ inputId: { type: ['string', 'null'], description: '画布视频节点 ID；不要填写本地文件路径。' }, mediaId: { type: ['string', 'null'], description: 'Chat 已生成视频的媒体 ID；不要填写本地文件路径。' } }) } },
  { type: 'function', function: { name: 'fuse_images', description: '使用灵感抽屉现有溶图工具融合正好两张图片。第一张保持主体，第二张作为风格参考；不要填写本地文件路径。', parameters: objectSchema({ baseImageId: { type: ['string', 'null'], description: '主体图片的画布节点 ID 或 Chat 媒体 ID。' }, styleImageId: { type: ['string', 'null'], description: '风格参考图片的画布节点 ID 或 Chat 媒体 ID。' }, inputIds: { type: ['array', 'null'], minItems: 2, maxItems: 2, items: { type: 'string' }, description: '按主体、风格顺序提供正好两个画布节点 ID 或 Chat 媒体 ID。' } }) } },
  { type: 'function', function: { name: 'add_to_canvas', description: '把聊天生成的媒体明确发送到画布。没有用户明确要求时禁止调用。', parameters: objectSchema({ mediaId: { type: ['string', 'null'] }, assetId: { type: ['string', 'null'] } }) } },
  { type: 'function', function: { name: 'create_canvas_generator', description: '在画布上创建但不自动运行一个图片或视频生成节点。', parameters: objectSchema({ mediaType: { type: 'string', enum: ['image', 'video'] }, prompt: { type: ['string', 'null'] }, model: { type: ['string', 'null'] }, aspectRatio: { type: ['string', 'null'] }, resolution: { type: ['string', 'null'] } }, ['mediaType']) } },
  { type: 'function', function: { name: 'create_workflow', description: '用户明确要求在灵感抽屉里创建可复用工作流时调用。规划有顺序的文字分析或生图步骤，创建工作流模块并保存到工作流列表；不会自动运行或产生费用。至少包含一个生图步骤。不要只返回文字方案来冒充已创建。', parameters: objectSchema({ label: { type: 'string', description: '工作流名称，最多 32 字。' }, hint: { type: ['string', 'null'], description: '简短说明工作流用途。' }, steps: { type: 'array', minItems: 1, items: { type: 'object', additionalProperties: false, properties: { id: { type: 'string', description: '步骤唯一英文 ID，供后续步骤引用。' }, type: { type: 'string', enum: ['text', 'image-generator'] }, label: { type: 'string' }, prompt: { type: 'string', description: '该步骤可直接执行的完整指令。' }, inputStepIds: { type: 'array', items: { type: 'string' }, description: '依赖的前序步骤 ID；留空时自动连接上一可连接步骤。' }, aspectRatio: { type: ['string', 'null'], description: '仅生图步骤使用，默认采用客户端设置。' }, count: { type: ['number', 'null'], minimum: 1, maximum: 4, description: '仅生图步骤使用。' } }, required: ['id', 'type', 'label', 'prompt'] } }, inputIds: { type: 'array', items: { type: 'string' }, description: '用户明确指定的现有画布输入节点 ID。' } }, ['label', 'steps']) } },
  { type: 'function', function: { name: 'list_workflows', description: '列出灵感抽屉中可用的工作流。', parameters: objectSchema({ query: { type: ['string', 'null'] }, limit: { type: ['number', 'null'], minimum: 1, maximum: 20 } }) } },
  { type: 'function', function: { name: 'run_workflow', description: '运行指定工作流。可能产生费用，继续使用现有确认机制。', parameters: objectSchema({ workflowId: { type: 'string' }, inputIds: { type: 'array', items: { type: 'string' } }, projectBrief: { type: ['string', 'null'] } }, ['workflowId']) } },
];

const EXPLICIT_TOOL_INTENT = /((当前|我的|这个|这块|现有).{0,4}画布|画布.{0,8}(选中|节点|内容|添加|放入|放进|创建|运行|有什么|看看|读取|操作)|素材库|(生成|做|画|绘制|制作|渲染).{0,40}(图|图片|视频|照片|风景照|海报|插画|封面|头像|壁纸)|(?:generate|create|render|make).{0,40}(?:images?|pictures?|photos?|posters?|illustrations?|covers?|wallpapers?|videos?)|生图|放进画布|发送到画布|选中.{0,4}(图|节点)|当前节点|(列出|查看|运行|执行|有哪些|使用).{0,8}(工作流|workflow)|(工作流|workflow).{0,8}(列表|运行|执行|有哪些)|查找.{0,8}素材|搜索.{0,8}素材|补帧|插帧|视频补帧|帧率提升|图片增强|图增强|提高清晰度|超清|视频增强|视频.{0,6}清晰|溶图|图.{0,4}溶|融合图片|融合两张图)/i;
const WORKFLOW_CREATION_INTENT = /(?:创建|新建|设计|搭建|制作|生成|保存(?:为|成)?).{0,20}(?:工作流|workflow)|(?:工作流|workflow).{0,10}(?:创建|新建|搭建|设计|生成|保存)|(?:create|build|design|make|save).{0,20}workflow/i;
const AGENT_CREATION_INTENT = /(?:创建|新建|新增|制作|做|定制|设计|生成|建立|搭建|写|配置|添加)[^，,。；;！？!?\n]{0,80}(?:智能体|技能|agents?|skills?|skllis)(?!\s*(?:的)?(?:图标|头像|界面|页面))|(?:create|build|make|add|write|set up)[^,.!?;\n]{0,80}(?:agents?|skills?|skllis)/i;
export const isChatAgentCreationRequest = (text: string) => (
  AGENT_CREATION_INTENT.test(text)
  && !/(?:如何|怎么|怎样|教程|步骤|方法|how\s+to|explain).{0,12}(?:创建|新建|制作|做|create|build)/i.test(text)
  && !/(?:创建|新建|新增|制作|做).{0,24}(?:智能体|技能|agents?|skills?|skllis).{0,12}(?:怎么|如何|步骤|方法|要怎么|how)/i.test(text)
  && !/(?:需要什么信息|需要哪些信息|先讨论|先规划|暂不创建|先不要创建)/i.test(text)
);
export const shouldForceChatAgentCreation = (text: string) => (
  isChatAgentCreationRequest(text)
  && !/(?:用|让|通过|使用|启用|切换到)(?:现有|已有|这个|那个)?(?:智能体|技能|agents?|skills?|skllis)/i.test(text)
  && /(?:创建|新建|新增|制作|做|定制|设计|生成|建立|搭建|写|配置|添加)[^，,。；;！？!?\n]{0,32}(?:智能体|技能|agents?|skills?|skllis)|(?:create|build|make|add|write|set up)[^,.!?;\n]{0,32}(?:agents?|skills?|skllis)/i.test(text)
  && !/^(?:(?:请|帮我|给我|我想|我要|我需要|可以|能不能)\s*)?(?:创建|新建|新增|做)(?:一个|个|一位|位)?\s*(?:智能体|技能|agents?|skills?|skllis)\s*[。！？!?，,]?$/i.test(text.trim())
);

export const isChatAgentCreationFollowup = (messages: ChatMessage[], currentText: string) => {
  if (!currentText.trim() || /^(?:算了|取消|不用|不要|先不|没事|不知道|还没想好)/.test(currentText.trim())) return false;
  const history = messages.filter(message => (
    (message.role === 'user' || message.role === 'assistant') && message.status === 'completed'
  )).slice(-10);
  if (history[history.length - 1]?.role === 'user'
    && history[history.length - 1]?.content.trim() === currentText.trim()) history.pop();
  const lastAssistant = history[history.length - 1];
  if (lastAssistant?.role !== 'assistant'
    || lastAssistant.toolCalls.some(call => call.toolName === 'create_agent' && call.status === 'completed')
    || !/(?:智能体|技能|agents?|skills?|skllis|用途|职责|名称|名字|适用场景|希望它|想让它)/i.test(lastAssistant.content)
    || !/(?:[？?]|请告诉|请提供|需要了解|想让它|希望它)/.test(lastAssistant.content)) return false;
  const prior = history.slice(0, -1);
  const lastCreationIndex = prior.reduce((index, message, current) => (
    message.role === 'user' && isChatAgentCreationRequest(message.content) ? current : index
  ), -1);
  const lastCompletedIndex = prior.reduce((index, message, current) => (
    message.toolCalls.some(call => call.toolName === 'create_agent' && call.status === 'completed') ? current : index
  ), -1);
  return lastCreationIndex > lastCompletedIndex;
};
const FOLLOWUP_EDIT_INTENT = /(再|继续|刚才|这张|上一张).{0,12}(冷|暖|亮|暗|改|修改|编辑|调整|换|增加|减少)|颜色再|构图再/i;
const DIRECT_IMAGE_INTENT = /(?:生成|做|画|绘制|制作|渲染|设计).{0,40}(?:图|图片|照片|风景照|海报|插画|封面|头像|壁纸)|(?:出|产出|输出)(?:[一二两三四五六七八九十\d]+)?(?:张|幅)?(?:图|图片|图像)|(?:generate|create|render|make).{0,40}(?:images?|pictures?|photos?|posters?|illustrations?|covers?|wallpapers?)|生图/i;
// `别` is a negation only when it is not the final character of `分别`.
// Without this guard, requests such as “三个方案分别出图” lose their image
// intent before tool routing runs.
const NEGATED_IMAGE_GENERATION_INTENT = /(?:先\s*)?(?:不要|不用|无需|不需要|暂不|暂时不|(?<!分)别)(?:再|立即|现在|马上|先)?\s*(?:出图|生图|做图|画图|生成(?:图片?|图像)|渲染)(?:了|啦|吧)?/gi;
const FILE_CREATION_INTENT = /(?:生成|创建|制作|导出|整理|写成|保存为|做成|做).{0,28}(?:文件|文档|报告|表格|电子表格|下载|Word|Excel|PDF|DOCX|XLSX|CSV|JSON|Markdown|TXT)|(?:给我|需要|要).{0,12}(?:Word|Excel|PDF|DOCX|XLSX|CSV|JSON|Markdown|TXT)|(?:Word|Excel|PDF|DOCX|XLSX|CSV|JSON|Markdown|TXT).{0,20}(?:文件|文档|报告|表格|生成|创建|导出|下载)/i;
const BATCH_IMAGE_INTENT = /(?:全部|每张|每一张|每个|分别|逐张|各自|一个个|所有(?:图|图片)|这些(?:图|图片)|(?:这|那)几张.{0,8}(?:图|图片)|多张.{0,8}(?:图|图片)|(?:图|图片).{0,8}都|all\s+(?:images?|pictures?)|each\s+(?:image|picture)|every\s+(?:image|picture)|separately|one\s+per\s+image)/i;
const COMBINED_REFERENCE_INTENT = /(?:(?:融合|综合|结合).{0,40}(?:生成|做|设计|创作)|参考.{0,20}(?:这些|这几张|多张|所有|全部).{0,20}(?:生成|做|设计|创作).{0,12}(?:一个|一张|一款|新(?:的)?))/i;
const EXPLICIT_SEPARATE_IMAGE_INTENT = /(?:(?:不要|无需|别)(?:再)?(?:把)?.{0,8}(?:合并|融合|整合)|(?:每张|每一张|逐张|分别|各自).{0,16}(?:单独|独立|各自))/i;
const ATTACHED_IMAGE_OPERATION_INTENT = /(?:参考|融合|综合|基于|按照).{0,24}(?:图|图片|设计|视觉).{0,24}(?:生成|做|设计|改|制作|排版)|(?:生成|做|设计|修改|编辑|整理|排版|重排|换|增强|去掉|添加).{0,32}(?:图|图片|背景|设计|视觉|版面|作品集|说明)/i;
const GENERAL_IMAGE_EDIT_INTENT = /(?:去掉|删除|移除|消除|清除|替换|抠图|换背景|改背景|改色|调色|修图|精修|增强|修复|扩图|去水印|加字|加上|变清晰|提高清晰度|放大).{0,24}(?:背景|水印|文字|元素|颜色|画面|图像|图片|主体|清晰度)?/i;
const INDEPENDENT_IMAGE_VARIANT_INTENT = /(?:(?:[二两三四2-4]|几)\s*(?:个|种|款|套|组)?\s*(?:方案|方向|版本|款式|设计|风格|配色|材质|造型|形态|外观|场景|情境|环境|空间|视角|机位|镜头|构图|布局|氛围|叙事|概念|效果)|(?:[二两三四2-4]\s*(?:个|种|款|套|组|幅|张))?.{0,8}(?:不同|差异化|有区别|各不相同|多种|多个|几种|若干).{0,10}(?:方案|方向|版本|款式|设计|风格|配色|材质|造型|形态|外观|场景|情境|环境|空间|视角|机位|镜头|构图|布局|氛围|叙事|概念|效果|options?|variants?|directions?|versions?|styles?|scenes?|settings?|compositions?)|(?:方案|方向|版本|款式|设计|风格|配色|材质|造型|形态|外观|场景|情境|环境|空间|视角|机位|镜头|构图|布局|氛围|叙事|概念).{0,8}(?:分别|各自|每个|每种|每款|独立|单独).{0,16}(?:生成|出图|做图|图|图片|图像)|(?:separate|distinct|different|multiple).{0,12}(?:options?|variants?|directions?|versions?|styles?|scenes?|settings?|compositions?))/i;
const COMPOSITE_VARIANT_OUTPUT_INTENT = /(?:(?:一|同一)(?:张图|张图片|个画面|个版面).{0,18}(?:有|包含|放入|放进|放下|展示|呈现|对比|排版|容纳|分成|分为).{0,18}(?:多个|多种|几个|不同|方案|方向|版本|场景|环境|空间|镜头)|(?:一张|单张).{0,8}(?:包含|展示|呈现|容纳|表现).{0,16}(?:多个|多种|几个|两种|三种|四种|不同).{0,10}(?:方案|方向|版本|款式|设计|风格|场景|环境|空间|镜头).{0,8}(?:图|图片|画面)|(?:(?:[二两三四2-4]\s*(?:个|种|款|套))|多个|多种|几个|不同|所有|全部).{0,18}(?:方案|方向|版本|款式|设计|风格|配色|材质|造型|形态|外观|场景|情境|环境|空间|视角|机位|镜头|构图|布局|氛围|叙事|概念).{0,18}(?:一张图|同一张图|一个画面|同一画面|一个版面|同一版面)|(?:拼在|放在|排在|组合在|做在|画在).{0,8}(?:一起|一张图|同一张图|同一画面|同一版面)|(?:并排|拼图|拼版|组图|九宫格|分屏|分栏|分区|左右分割|上下分割|双联画|三联画|四联画|方案板|对比图|对照图|contact\s*sheet|comparison\s*(?:board|sheet|image)|split[ -]?screen))/i;
const EXPLICIT_INDEPENDENT_VARIANT_DELIVERY = /(?:(?:每(?:个|种|款|套)(?:方案|方向|版本|款式|设计|风格)?|分别|各自|独立|单独).{0,16}(?:各自|分别|独立|单独)?.{0,8}(?:出|生成|制作|做).{0,4}(?:一张|一幅|图片|图像)|(?:one|single)\s+(?:image|picture)\s+(?:per|for each)\s+(?:option|variant|direction|version))/i;

export const shouldExposeChatTools = (text: string, hasRecentGeneratedMedia = false) => (
  EXPLICIT_TOOL_INTENT.test(text)
  || WORKFLOW_CREATION_INTENT.test(text)
  || shouldDirectGenerateImage(text)
  || (hasRecentGeneratedMedia && (
    FOLLOWUP_EDIT_INTENT.test(text)
    || isShortVisualFollowup(text)
    || isVisualRevisionFollowup(text)
  ))
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
  skillEnabled = false,
  agentCreationFollowup = false,
) => {
  const exposeBatch = shouldExposeBatchImageOperation(text, imageAttachmentCount);
  const exposeAttachedImageTools = imageAttachmentCount > 0 && (
    ATTACHED_IMAGE_OPERATION_INTENT.test(text)
    || isShortVisualFollowup(text)
    || isVisualRevisionFollowup(text)
  );
  const exposeLocalTools = shouldExposeChatTools(text, hasRecentGeneratedMedia)
    || shouldUseIndependentImageVariants(text)
    || exposeBatch
    || exposeAttachedImageTools
    || skillEnabled;
  const exposeFileCreation = FILE_CREATION_INTENT.test(text) || skillEnabled;
  const exposeAgentCreation = isChatAgentCreationRequest(text) || agentCreationFollowup;
  const exposeWebSearch = !webSearchBlocked && (webSearchEnabled || shouldExposeWebSearch(text));
  return CHAT_TOOL_DEFINITIONS.filter(tool => (
    tool.function.name === 'web_search'
      ? exposeWebSearch
      : tool.function.name === 'create_file'
        ? exposeFileCreation
        : tool.function.name === 'create_agent'
          ? exposeAgentCreation
        : tool.function.name === 'batch_image_operation'
          ? exposeBatch
          : exposeLocalTools
  ));
};

export const shouldDirectGenerateImage = (text: string) => (
  !WORKFLOW_CREATION_INTENT.test(text)
  && DIRECT_IMAGE_INTENT.test(text.replace(NEGATED_IMAGE_GENERATION_INTENT, ' '))
);

export type DirectVisualToolName = 'generate_image' | 'edit_image';

export const resolveDirectVisualTool = (
  text: string,
  hasRecentGeneratedMedia = false,
  imageAttachmentCount = 0,
): DirectVisualToolName | null => {
  if (shouldDirectGenerateImage(text)) return 'generate_image';
  if (!isShortVisualFollowup(text) && !isVisualRevisionFollowup(text)) return null;
  if (hasRecentGeneratedMedia) return 'edit_image';
  return imageAttachmentCount > 0 ? 'generate_image' : null;
};

export const shouldUseIndependentImageVariants = (text: string) => (
  !WORKFLOW_CREATION_INTENT.test(text)
  && INDEPENDENT_IMAGE_VARIANT_INTENT.test(text)
  && (EXPLICIT_INDEPENDENT_VARIANT_DELIVERY.test(text) || !COMPOSITE_VARIANT_OUTPUT_INTENT.test(text))
  && (shouldDirectGenerateImage(text) || /(?:做成|制成|产出|输出|生成|制作|渲染|create|generate|render|make)/i.test(text.replace(NEGATED_IMAGE_GENERATION_INTENT, ' ')))
);

export const shouldComposeImageVariants = (text: string) => (
  !WORKFLOW_CREATION_INTENT.test(text)
  && INDEPENDENT_IMAGE_VARIANT_INTENT.test(text)
  && COMPOSITE_VARIANT_OUTPUT_INTENT.test(text)
  && !EXPLICIT_INDEPENDENT_VARIANT_DELIVERY.test(text)
  && (shouldDirectGenerateImage(text) || /(?:做成|制成|产出|输出|生成|制作|渲染|放在|放进|放到|展示|呈现|拼成|create|generate|render|make|show|place)/i.test(text.replace(NEGATED_IMAGE_GENERATION_INTENT, ' ')))
);
