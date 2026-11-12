/** Use only the user's request, never appended scene data, to pick a workflow. */
export function rhinoUserRequest(text: string) {
  return text.split(/\n\n\[Rhino \u53ea\u8bfb\u4e0a\u4e0b\u6587\uff1b/)[0].trim();
}

/** Explicit geometry creation/editing must not become image editing merely
 * because a reference image is attached or the request contains "image". */
export function isRhinoGeometryOnlyRequest(text: string) {
  const request = rhinoUserRequest(text);
  const positive = request.replace(/(?:\u4e0d\u8981|\u4e0d\u7528|\u65e0\u9700|\u4e0d\u9700\u8981|\u5148\u522b|\u5148\u4e0d|don'?t|do not)\s*(?:\u5e2e\u6211|\u8fdb\u884c)?\s*(?:\u5efa\u6a21|model(?:ing)?)/gi, ' ');
  const geometry = /(?:\u5efa\u6a21|\u5efa.{0,16}\u6a21\u578b|\u5efa\u6210.{0,12}(?:\u6a21\u578b|\u4e09\u7ef4|3d)|(?:\u521b\u5efa|\u751f\u6210|\u642d\u5efa|\u91cd\u5efa|\u505a|\u8f6c\u6210|\u8f6c\u4e3a).{0,24}(?:\u4e09\u7ef4|3d|\u6a21\u578b|\u51e0\u4f55)|\b(?:build|create|rebuild|reconstruct|make|convert|model|modify|edit)\b.{0,60}\b(?:3[ -]?d|geometry|cad|rhino|model)\b|\b(?:grasshopper|gh)\b|\u8349\u8722)/i.test(positive);
  // A combined modeling-and-rendering request still needs the visual path.
  const explicitImage = /(?:\u6e32\u67d3|\u6548\u679c\u56fe|\u751f\u56fe|\u51fa\u56fe|\u751f\u6210.{0,12}(?:\u56fe\u7247|\u56fe\u50cf)|\b(?:render(?:ing)?|visuali[sz]ation)\b|\b(?:generate|edit)\b.{0,12}\b(?:image|picture)\b)/i.test(request);
  return geometry && !explicitImage;
}

/** Requests that need Rhino document/GH write tools, not read-only context. */
export function isRhinoDocumentWriteRequest(text: string) {
  const request = rhinoUserRequest(text).replace(/(?:不要|不用|无需|不需要|先别|先不|don't|do not)\s*(?:帮我|进行)?[^，。；;\n]*/gi, ' ');
  // Preflight stays conservative; questions/analysis are not document mutations.
  if (/(?:如何|怎么|为什么|解释|说明|教程|步骤|分析|查询|查看|读取|列出|检查|\b(?:how|why|explain|describe|list|inspect|analy[sz]e|check)\b)/i.test(request) && !/(?:直接|立即|现在|马上).{0,8}(?:执行|创建|建模|修改|删除)|\b(?:execute|apply)\b/i.test(request)) return false;
  if (!request) return false;
  if (isRhinoGeometryOnlyRequest(request)) return true;

  const visualOnly = /(?:\b(?:render|rendering|visuali[sz]ation|generate|create|edit)\b.{0,32}\b(?:image|picture|render)\b|(?:\u6e32\u67d3|\u6548\u679c\u56fe|\u751f\u56fe|\u51fa\u56fe|\u751f\u6210.{0,12}(?:\u56fe\u7247|\u56fe\u50cf)))/i.test(request);
  const explicitModeling = /(?:\b(?:model|modeling|build|rebuild|reconstruct|create|make|convert)\b.{0,48}\b(?:3d|geometry|cad|rhino|model|object|part)\b|(?:\u5efa\u6a21|\u5efa.{0,12}(?:\u6a21\u578b|\u7269\u4f53|\u5bf9\u8c61|\u96f6\u4ef6)|\u65b0\u5efa.{0,12}(?:\u6a21\u578b|\u7269\u4f53|\u5bf9\u8c61|\u96f6\u4ef6)|\u521b\u5efa.{0,12}(?:\u6a21\u578b|\u7269\u4f53|\u5bf9\u8c61|\u96f6\u4ef6)|\u751f\u6210.{0,12}(?:\u6a21\u578b|\u7269\u4f53|\u5bf9\u8c61|\u96f6\u4ef6)))/i.test(request);
  if (visualOnly && !explicitModeling) return false;

  const mutation = /(?:\u5220\u9664|\u79fb\u9664|\u6e05\u7a7a|\u79fb\u52a8|\u65cb\u8f6c|\u7f29\u653e|\u53d8\u6362|\u4fee\u6539|\u7f16\u8f91|\u66f4\u6539|\u66ff\u6362|\u5408\u5e76|\u62c6\u5206|\u5012\u89d2|\u5012\u5706|\u5e03\u5c14|\u653e\u6837|\u626b\u63a0|\u62c9\u4f38|\u9690\u85cf|\u663e\u793a|\u4fdd\u5b58|\u53e6\u5b58|\u5bfc\u51fa|\u5bfc\u5165|\u8bbe\u7f6e|\u8d4b\u4e88|\u4e0a\u8272|\u7740\u8272|\u6539\u6210|\u5efa\u4e00\u4e2a|\u505a\u4e00\u4e2a|\u6dfb\u52a0|\u63d2\u5165|\u521b\u5efa|\u65b0\u5efa|\u751f\u6210|\u8c03\u6574|\u91cd\u547d\u540d|\u70b8\u5f00|\u5206\u89e3|\u590d\u5236|\u955c\u50cf|\u9635\u5217|\u4fee\u526a|\u5ef6\u4f38|\u5706\u89d2|\u504f\u79fb|\u6295\u5f71|\b(?:change|modify|edit|create|make|build|add|insert|delete|remove|clear|move|rotate|scale|transform|join|split|fillet|boolean|loft|sweep|extrude|hide|show|save|export|import|set|assign|color|rename|duplicate|mirror|array|trim|extend|offset)\b)/i.test(request);
  const target = /(?:rhino|grasshopper|\bgh\b|\b3d\b|\bcad\b|\u6a21\u578b|\u5efa\u6a21|\u7269\u4f53|\u5bf9\u8c61|\u5b9e\u4f53|\u51e0\u4f55|\u66f2\u7ebf|\u66f2\u9762|\u7f51\u683c|\u56fe\u5c42|\u6750\u8d28|\u573a\u666f|\u6587\u6863|\u89c6\u7a97|\u89c6\u53e3|\u9009\u4e2d|\u6240\u9009|\u5f53\u524d\u5bf9\u8c61|\u96f6\u4ef6|\u7ec4\u4ef6|\u5b83|\u8fd9\u4e2a)/i.test(request);
  return mutation && (target || /\u5efa.{0,8}\u4e00\u4e2a|\u505a.{0,8}\u4e00\u4e2a|\u521b\u5efa|\u65b0\u5efa|\u6dfb\u52a0|\u751f\u6210|\b(?:create|build|make|add)\b/i.test(request));
}

/** Concise explanation for the Rhino panel when native document writes are unavailable. */
export function rhinoWriteCapabilityNotice(hostVersion: string, nativeConnected: boolean) {
  const match = hostVersion.match(/^(\d+)\.(\d+)/);
  const major = match ? Number(match[1]) : 0;
  const minor = match ? Number(match[2]) : 0;
  if (major === 8 && minor < 19) {
    return `\u68c0\u6d4b\u5230 Rhino ${hostVersion}\u3002\u5f53\u524d\u7248\u672c\u4f4e\u4e8e RhinoAI/Rhino-MCP-Platform \u652f\u6301\u7684 Rhino 8 \u57fa\u7ebf 8.19\uff0c\u672c\u6b21\u8bf7\u6c42\u65e0\u6cd5\u5728 Rhino \u4e2d\u81ea\u52a8\u5efa\u6a21\u3002\u8bf7\u5347\u7ea7 Rhino 8 \u81f3 8.19 \u6216\u66f4\u65b0\u7248\u672c\uff0c\u7136\u540e\u5b89\u88c5/\u66f4\u65b0 Rhino-MCP-Platform\u3002`;
  }
  const connection = nativeConnected
    ? '\u5f53\u524d\u539f\u751f MCP \u53ea\u58f0\u660e\u4e86\u8bfb\u53d6\u5de5\u5177\uff0c\u672a\u63d0\u4f9b\u6a21\u578b\u5199\u5165\u80fd\u529b\u3002\u8bf7\u66f4\u65b0/\u5b89\u88c5 Rhino-MCP-Platform\uff0c\u786e\u8ba4\u63d2\u4ef6\u5df2\u52a0\u8f7d\uff0c\u91cd\u542f Rhino \u540e\u8fd0\u884c MCPStart\u3002'
    : '\u672a\u8fde\u63a5\u5230 RhinoAI/Rhino-MCP-Platform \u7684\u6a21\u578b\u5199\u5165\u670d\u52a1\u3002\u8bf7\u68c0\u67e5\u63d2\u4ef6\u5df2\u5b89\u88c5\u5e76\u52a0\u8f7d\uff0c\u91cd\u542f Rhino \u540e\u8fd0\u884c MCPStart\u3002';
  return `\u5f53\u524d Rhino ${hostVersion || '\u7248\u672c\u672a\u77e5'} \u6ca1\u6709\u53ef\u7528\u7684\u5efa\u6a21/\u6587\u6863\u5199\u5165\u5de5\u5177\u3002${connection}\u672c\u6b21\u5df2\u963b\u6b62\u53d1\u9001\uff1b\u4e0d\u4f1a\u53ea\u8fd4\u56de\u624b\u52a8\u811a\u672c\uff0c\u4e5f\u4e0d\u4f1a\u8c0e\u79f0\u6a21\u578b\u5df2\u5efa\u597d\u3002`;
}

export const isRhinoBlankViewportError = (error: unknown) => /Rhino (?:Rendered )?viewport capture is blank/i.test(String(error));

/** A surface is valid geometry too; require a closed Brep only when explicit. */
export const isRhinoClosedSolidRequest=(text:string)=>/(?:\u5b9e\u4f53|\u95ed\u5408.{0,4}(?:\u66f2\u9762|brep|\u6a21\u578b)|\u5c01\u95ed.{0,6}(?:\u5b9e\u4f53|brep|\u6a21\u578b)|\bclosed\s+(?:solid|brep)\b|\bsolid(?:\s+brep)?\b)/i.test(rhinoUserRequest(text));

