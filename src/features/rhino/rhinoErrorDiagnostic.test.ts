import { describe, expect, it } from 'vitest';
import { readableRhinoMcpFailure, rhinoDiagnosticText } from './rhinoErrorDiagnostic';
import { rhinoScriptFailureExplanation } from './rhinoScriptPreflight';
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
