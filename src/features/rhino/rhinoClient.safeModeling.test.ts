import catalog from './rhinoAiToolCatalog.fixture.json';
import { beforeEach, describe, expect, it, vi } from 'vitest';
const invoke=vi.hoisted(()=>vi.fn());
vi.mock('@tauri-apps/api/core',()=>({invoke}));
import { callRhinoTool, discoverNativeRhino, discoverRhinoConnections, hasRhinoNativeWriteTools, isRhinoCSharpImmutableV9LoadFailure, rhinoNativeFunctionName } from './rhinoClient';
import { getRhinoNativeTools, type RhinoBinding } from './rhinoProtocol';
import { SAFE_PROFILE_TOOL } from './rhinoSafeModeling';
import { buildDocumentGeometrySnapshotScript,SNAPSHOT_DOCUMENT_GEOMETRY_TOOL } from './rhinoDocumentGeometry';
const binding:RhinoBinding={connection:{protocol:1,url:'http://127.0.0.1:19000/',token:'a'.repeat(64),instanceId:'b'.repeat(32)},documentId:12,canvasId:'canvas'};
beforeEach(()=>{
 invoke.mockReset();invoke.mockImplementation(async(_command,args)=>{
  const request=args.body;
  if(request.method==='initialize')return {result:{}};
  if(request.method==='notifications/initialized')return {};
  if(request.params.name==='rhino_list_native_tools')return {result:{content:[{type:'text',text:JSON.stringify({available:true,tools:[{name:'run_python',inputSchema:{type:'object',required:['script'],properties:{script:{type:'string'}}}}]})}]}};
  return {result:{content:[{type:'text',text:'{"stdout":"ok","stderr":""}'}]}};
 });
});
describe('controlled internal document snapshot transport',()=>{
 it('routes a read-only snapshot only through the bound native Python proxy',async()=>{
  await callRhinoTool(binding,SNAPSHOT_DOCUMENT_GEOMETRY_TOOL,{});
  const request=invoke.mock.calls.map(([,args])=>args.body).find(request=>request.params?.name==='rhino_call_native_tool');
  expect(request.params.arguments).toMatchObject({documentId:12,toolName:'run_python'});
  expect(request.params.arguments.arguments.script).toBe(buildDocumentGeometrySnapshotScript());
  expect(request.params.arguments.arguments.script).not.toMatch(/Objects\.(?:Add|Delete)|Layers\.Add|\.Transform\s*\(/);
 });
});

describe('safe geometry through actual native MCP transport adapter',()=>{
 it('registers the controlled helper only alongside a compatible discovered native Python tool',async()=>{
  const native=await discoverNativeRhino(binding,'safe-discovery');
  expect(native?.tools.map(tool=>tool.name)).toEqual(['rhino_native_run_python',SAFE_PROFILE_TOOL,'rhino_native_verify_gh_geometry']);
  expect(getRhinoNativeTools('safe-discovery').find(tool=>tool.name===SAFE_PROFILE_TOOL)?.inputSchema.required).toEqual(['mode','units','parts']);
 });
 it('sends only fixed compiled Python through the official document-bound run_python proxy',async()=>{
  const plan={mode:'validate',units:'millimeters',parts:[]};await callRhinoTool(binding,SAFE_PROFILE_TOOL,plan);
  const request=invoke.mock.calls.map(([,args])=>args.body).find(request=>request.params?.name==='rhino_call_native_tool');
  expect(request.params.arguments).toMatchObject({documentId:12,toolName:'run_python'});
  expect(request.params.arguments.arguments.script).toContain('_id_profiles_build');
  expect(request.params.arguments.arguments).not.toHaveProperty('parts');
 });
});

describe('internal bound Rhino geometry snapshot adapter',()=>{
 it('uses only fixed read-only code through the official run_python document proxy',async()=>{
  await callRhinoTool(binding,SNAPSHOT_DOCUMENT_GEOMETRY_TOOL,{});
  const request=invoke.mock.calls.map(([,args])=>args.body).find(request=>request.params?.name==='rhino_call_native_tool');
  expect(request.params.arguments).toMatchObject({documentId:12,toolName:'run_python'});
  const script=request.params.arguments.arguments.script;
  expect(script).toBe(buildDocumentGeometrySnapshotScript());
  expect(script).toContain('GetObjectList');expect(script).not.toMatch(/Objects\.(?:Add|Delete)|Layers\.Add|Transform\s*\(/);
 });
});

describe('native Rhino modeling write capability',()=>{
 it('requires an advertised non-read-only build/connect/solve/write tool',()=>{
  expect(hasRhinoNativeWriteTools(undefined)).toBe(false);
  expect(hasRhinoNativeWriteTools({tools:[{name:'rhino_native_get_context',description:'read',inputSchema:{},readOnly:true,destructive:false,workflowPhase:'context'}]})).toBe(false);
  expect(hasRhinoNativeWriteTools({tools:[{name:'rhino_native_run_python',description:'run',inputSchema:{},readOnly:false,destructive:true,workflowPhase:'write'}]})).toBe(true);
  expect(hasRhinoNativeWriteTools({tools:[{name:'rhino_native_g2_apply_graph',description:'build',inputSchema:{},readOnly:false,destructive:false,workflowPhase:'build'}]})).toBe(true);
 });
});

describe('Rhino C# runtime compatibility detection',()=>{
 it('recognizes only the exact System.Collections.Immutable v9 pre-execution loader failure',()=>{
  expect(isRhinoCSharpImmutableV9LoadFailure("FileLoadException: Could not load file or assembly 'System.Collections.Immutable, Version=9.0.0.0, Culture=neutral, PublicKeyToken=b03f5f7f11d50a3a'. Could not find or load a specific file. (0x80131621)")).toBe(true);
  expect(isRhinoCSharpImmutableV9LoadFailure(String.raw`Error: Could not load file or assembly \u0027System.Collections.Immutable, Version=9.0.0.0, Culture=neutral\u0027. Could not find or load a specific file (0x80131621)`)).toBe(true);
  expect(isRhinoCSharpImmutableV9LoadFailure('Could not load file or assembly System.Collections.Immutable, Version=8.0.0.0')).toBe(false);
  expect(isRhinoCSharpImmutableV9LoadFailure('Boolean operation failed')).toBe(false);
 });
});

describe('multiple Rhino connection discovery', () => {
 it('retains both instances and never collapses identical document serials into one host', async () => {
  const first=binding.connection;
  const second={...first, url:'http://127.0.0.1:19001/', instanceId:'c'.repeat(32)};
  invoke.mockResolvedValueOnce([first, second, first, {...first,url:'https://example.invalid/'}]);
  expect(await discoverRhinoConnections()).toEqual([first,second]);
  expect(invoke).toHaveBeenCalledWith('rhino_beta_get_connections');
 });
 it('rejects a malformed discovery response instead of choosing an arbitrary host', async () => {
  invoke.mockResolvedValueOnce({});
  await expect(discoverRhinoConnections()).rejects.toThrow('invalid list');
 });
});


describe('local extrusion type preflight at the transport boundary',()=>{
 it.each(['rhino_native_run_python','rhino_native_run_csharp'])('rejects %s before MCP initialization or a request',async name=>{
  await expect(callRhinoTool(binding,name,{script:'Rhino.Geometry.Surface.CreateExtrusion(brep.Faces[0], direction)'})).rejects.toMatchObject({name:'RhinoNativeScriptPreflightError'});
  expect(invoke).not.toHaveBeenCalled();
 });
});


describe('script failure receipts are not modeling success',()=>{
 it('recognizes a structured Python traceback even when the outer MCP result is not isError',async()=>{
  invoke.mockResolvedValue({result:{content:[{type:'text',text:JSON.stringify({stdout:'partial work',stderr:'Traceback (most recent call last):\nTypeError: invalid extrusion argument'})}]}});
  await expect(callRhinoTool(binding,'rhino_native_run_python',{script:'dynamic_model()'})).rejects.toMatchObject({name:'RhinoNativeMcpToolError'});
 });
 it('does not mistake a warning or arbitrary output for a completed script exception',async()=>{
  invoke.mockResolvedValue({result:{content:[{type:'text',text:JSON.stringify({stdout:'done',stderr:'RuntimeWarning: deprecated call'})}]}});
  await expect(callRhinoTool(binding,'rhino_native_run_python',{script:'dynamic_model()'})).resolves.toHaveLength(1);
 });
});

describe('complete RhinoAI catalog passthrough, not just modeling', () => {
  it('exposes all 42 public tools from the supplied RhinoAI metadata snapshot', async () => {
    const previous = invoke.getMockImplementation()!;
    invoke.mockImplementation(async (command,args) => args?.body?.params?.name === 'rhino_list_native_tools'
      ? {result:{content:[{type:'text',text:JSON.stringify({available:true,tools:catalog.map(tool=>({...tool,inputSchema:{type:'object',properties:{}},annotations:{readOnlyHint:tool.readOnlyHint,destructiveHint:tool.destructiveHint}}))})}]}}
      : previous(command,args));
    const discovered = await discoverNativeRhino(binding,'full-catalog');
    expect(catalog).toHaveLength(42);
    for (const item of catalog) expect(discovered?.tools.find(tool=>tool.rawName===item.name)).toMatchObject({readOnly:item.readOnlyHint,destructive:item.destructiveHint});
    for (const raw of ['set_camera','set_layer_material','set_selection','save_doc','open_doc','close_doc','manage_plugin_commands','get_commands']) {
      const nativeBinding={...binding,native:discovered!}; await callRhinoTool(nativeBinding,'rhino_native_'+raw,{fixture:raw});
      expect(invoke).toHaveBeenCalledWith('rhino_beta_request',expect.objectContaining({body:expect.objectContaining({params:expect.objectContaining({arguments:expect.objectContaining({toolName:raw,documentId:12,arguments:{fixture:raw}})})})}));
    }
  });
  it('does not hide future write tools because they lack a known phase', () => {
    expect(hasRhinoNativeWriteTools({tools:[{name:'rhino_native_set_camera',inputSchema:{},description:'camera',workflowPhase:'unknown',readOnly:false,destructive:false}]})).toBe(true);
  });
  it('maps names safely without colliding with local tools or exceeding provider limits', async () => {
    const names=['rhino_custom_inspect','future.capture', 'a'.repeat(100), 'safe_profile_solids','verify_gh_geometry'];
    const previous=invoke.getMockImplementation()!;
    invoke.mockImplementation(async(command,args)=>args?.body?.params?.name==='rhino_list_native_tools'
      ? {result:{content:[{type:'text',text:JSON.stringify({available:true,tools:[...names.map(name=>({name,inputSchema:{type:'object'}})),{name:'_router_hidden'}, {name:'future.capture',inputSchema:{}}]})}]}}
      : previous(command,args));
    const discovered=await discoverNativeRhino(binding,'future-catalog'); expect(discovered?.tools).toHaveLength(names.length);
    for(const rawName of names){const name=rhinoNativeFunctionName(rawName);expect(name).toMatch(/^[A-Za-z0-9_-]{1,64}$/);await callRhinoTool({...binding,native:discovered},name,{});expect(invoke).toHaveBeenCalledWith('rhino_beta_request',expect.objectContaining({body:expect.objectContaining({params:expect.objectContaining({arguments:expect.objectContaining({toolName:rawName})})})}));}
  });
});

it('rejects a missing System import before initialization or any native side effect',async()=>{
 await expect(callRhinoTool(binding,'rhino_native_run_python',{script:'import Rhino\n__rhino_doc__.Objects.AddBrep(solid)\nattrs.ObjectColor=System.Drawing.Color.Red'})).rejects.toMatchObject({name:'RhinoNativeScriptPreflightError',issues:expect.arrayContaining([expect.objectContaining({code:'rhino_python_missing_import',api:'System'})])});expect(invoke).not.toHaveBeenCalled();
});

it('accepts a self-contained corrected System import exactly once rather than silently editing code',async()=>{
 const script='import Rhino\nimport System\nattrs.ObjectColor = System.Drawing.Color.Red';
 await callRhinoTool(binding,'rhino_native_run_python',{script});
 const writes=invoke.mock.calls.map(([,args])=>args.body).filter(request=>request.params?.name==='rhino_call_native_tool');expect(writes).toHaveLength(1);expect(writes[0].params.arguments.arguments.script).toBe(script);
});
