import { describe, expect, it } from 'vitest';
import { readableRhinoMcpFailure, rhinoDiagnosticText, rhinoGeometryFailureExplanation } from './rhinoErrorDiagnostic';
import { isConfirmedRhinoScriptFailure, RhinoNativeMcpToolError, rhinoScriptFailureExplanation } from './rhinoScriptPreflight';
const receipt = 'RhinoNativeMcpToolError: '+JSON.stringify({error:'Failed',message:"name 'System' is not defined"})+'\n'+JSON.stringify({stdout:'',stderr:'Traceback (most recent call last):\r\n  File "file:///C:/fixture/script.py", line 65, in <module>\r\nNameError: name \'System\' is not defined\r\n'});
describe('readable native MCP diagnostics without changing raw receipts',()=>{
 it('decodes mixed JSON, escaping and nested exceptions from the reported failure',()=>{
  const original=receipt;const encoded=receipt.replace(/'/g,'\\u0027').replace(/</g,'\\u003C').replace(/>/g,'\\u003E');
  const result=rhinoDiagnosticText(encoded);expect(result).toContain("name 'System' is not defined");expect(result).not.toContain('\\u0027');expect(receipt).toBe(original);
  const readable=rhinoScriptFailureExplanation(encoded)!;expect(readable).toContain('System');expect(readable).toContain('import System');expect(readable).toContain('65');expect(readable).not.toContain('Traceback');expect(readable).not.toContain('C:/');
 });
 it('shows a concise exception and line, keeping raw stack paths out of the main reply',()=>{
  const result=readableRhinoMcpFailure(receipt);expect(result).toContain("NameError: name 'System' is not defined");expect(result).toContain('65');expect(result).not.toContain('file:///');expect(result).not.toContain('stdout');
 });
 it('handles nested content and malformed JSON without throwing or executing HTML',()=>{
  const result=rhinoDiagnosticText({error:{message:'Bad argument',details:[{text:'<script>never executed</script>'}]}});expect(result).toContain('Bad argument');expect(result).toContain('<script>');expect(()=>readableRhinoMcpFailure('broken {')).not.toThrow();
 });
 it('does not blame a missing import for timeouts or arbitrary text',()=>{
  expect(rhinoScriptFailureExplanation('Timeout: outcome unknown')).toBeUndefined();expect(readableRhinoMcpFailure(new Error('Timeout: outcome unknown'))).toContain('Timeout');
 });
});

it('explains the reported escaped PipeCapMode receipt with the Python 3 spelling and no replay', () => {
  const traceback = 'Traceback (most recent call last):\n  File "file:///C:/fixture/script.py", line 2, in <module>\nAttributeError: type object \'PipeCapMode\' has no attribute \'None\'';
  const receipt = 'RhinoNativeMcpToolError: ' + JSON.stringify({ error: 'Failed', message: "type object 'PipeCapMode' has no attribute 'None'" })
    + '\n' + JSON.stringify({ stdout: '', stderr: traceback });
  const encoded = receipt.replace(/'/g, '\\u0027');
  const explanation = rhinoScriptFailureExplanation(encoded)!;
  expect(explanation).toContain('rg.PipeCapMode.NONE');
  expect(explanation).toContain('compat.ENUM_NONE');
  expect(explanation).toContain('不能直接重放');
  expect(explanation).toContain('不要改成 Flat/Round');
  expect(explanation).not.toContain('file:///');
  expect(readableRhinoMcpFailure(encoded)).toContain('第 2 行');
  expect(isConfirmedRhinoScriptFailure(new RhinoNativeMcpToolError(traceback))).toBe(true);
});


describe('geometry assertion failures are not generic MCP or conversation failures',()=>{
 it('explains a failed solid with the actual part and source line, without allowing replay',()=>{
  const error='Traceback (most recent call last):\n  File "private.py", line 13, in build\nException: Open solid: Pendant leaf_0';
  const text=rhinoGeometryFailureExplanation(error)!;expect(text).toContain('Pendant leaf_0');expect(text).toContain('13');expect(text).toContain('裸边');expect(text).toContain('不能自动重放');expect(text).not.toContain('private.py');
 });
 it('distinguishes straight-wall validation from missing context',()=>{
  const text=rhinoGeometryFailureExplanation('Traceback:\n line 51\nAssertionError: External wall is curved')!;
  expect(text).toContain('曲率');expect(text).toContain('51');expect(text).toContain('不能跳过直壁约束');
 });
 it.each(['Timeout: completion unknown','NameError: missing namespace'])('does not misdiagnose unrelated errors: %s',error=>expect(rhinoGeometryFailureExplanation(error)).toBeUndefined());
});


describe('readable GH bake failures and real source locations',()=>{
 it('explains a Mesh/Brep intent mismatch without dropping the original part',()=>{
  const text=rhinoGeometryFailureExplanation('ValueError: Expected Brep/surface geometry for texture_001\nScript location: line 2')!;
  expect(text).toContain('texture_001');expect(text).toContain('网格不是 Brep');expect(text).toContain('不能自动重放');
 });
 it('reports the actual count without claiming GH output is invalid or allowing truncation/replay',()=>{
  const text=rhinoGeometryFailureExplanation('Unexpected output count: 225')!;expect(text).toContain('225');
  expect(text).toContain('不能凭猜测写死数量');expect(text).toContain('不能自动重放');
 });
 it('uses the original call site, not the generated exec wrapper or private helper line',()=>{
  const traceback='Traceback (most recent call last):\n  File "wrapper.py", line 2, in <module>\n  File "<drawer-user-script>", line 37, in <module>\n  File "<drawer-geometry-stage>", line 140, in _validate\nValueError: Geometry type/intent mismatch for texture: expected surface, actual Mesh';
  const text=readableRhinoMcpFailure(traceback);expect(text).toContain('第 37 行');expect(text).not.toContain('第 140 行');
  expect(rhinoGeometryFailureExplanation(traceback)).toContain('脚本第 37 行');
 });
});
