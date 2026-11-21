import { test, expect } from 'vitest';
import { spawnSync } from 'node:child_process';

test('shipped GH2 label transactions preserve data and reject or roll back failed batches',()=>{
  const result=spawnSync('python',['scripts/tests/fixtures/gh2_labels_probe.py'],{encoding:'utf8'});
  expect(result.status,result.stderr+result.stdout).toBe(0);
  expect(JSON.parse(result.stdout.trim())).toEqual({passed:10,failures:0,errors:0});
});
