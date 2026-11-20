import { test, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
test('shipped GH2 native audit and conversion repair enforce actual output invariants',()=>{
  const result=spawnSync('python',['scripts/tests/fixtures/gh2_model_verification_probe.py'],{encoding:'utf8'});
  expect(result.status,result.stderr+result.stdout).toBe(0);
  expect(JSON.parse(result.stdout.trim())).toEqual({passed:14,failures:0,errors:0});
});
