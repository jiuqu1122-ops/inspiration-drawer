import { describe, expect, it } from 'vitest';
import { compareDocumentGeometrySnapshots, type DocumentGeometrySnapshot } from './rhinoDocumentGeometry';
import { assessEditableNurbs, requiresEditableNurbs } from './rhinoSurfaceContract';

describe('explicit output representation intent', () => {
  it.each([
    '不要网格，我要nurbus曲面', '不要用 Mesh。请改成可编辑的 NURBS 曲面。',
    'NURBS / 非Mesh', '输出 NURBS (非 mesh)', '用 mesh 作为输入，重建成 NURBS', 'Use the mesh as input and rebuild it as NURBS.',
    '交付原生 Brep，保留刀头锐边', '输出 NURBS 或 Brep，不接受网格', '必须是可编辑曲面',
    '把现有网格重建成光顺的 NURBS 曲面', '要 NURBS 曲面而不是 mesh',
    'I want a smooth editable NURBS surface, not a mesh.', 'Editable B-rep only.',
    'Use NURBS or Brep.', 'No meshes; editable surfaces only.', 'Convert the mesh to NURBS.',
  ])('recognizes %s', text => expect(requiresEditableNurbs(text)).toBe(true));

  it.each([
    '不要 NURBS，要网格', '不是要 NURBS 曲面，只要 Mesh。', '无需可编辑 Brep',
    '我没有要求必须用 NURBS', '并非要可编辑曲面', '用网格，不需要光顺的 NURBS',
    '可编辑 NURBS 或者 Mesh 都行', '我要 NURBS，网格也可以', 'NURBS 不必，网格即可',
    '不要 NURBS。不要网格。做成曲面。', '可编辑 NURBS 是上一次的要求', '用 NURBS 曲面作为参考',
    'Do you need NURBS?', 'Use NURBS, but it is not required.', 'Perhaps use NURBS.', '是否需要用 NURBS？', '解释“不要网格，我要nurbus曲面”是什么意思',
    '不要用 mesh 转成 NURBS', "Don't use mesh to build NURBS.", '可编辑 NURBS 也可以，但没要求', '请比较 Mesh 和 NURBS 曲面', '把 NURBS 转为 Mesh', '用 NURBS 曲线作导轨',
    '不要网格，做成 SubD 曲面', '不要网格', '请做个光滑的模型', '执行 MeshToNurb',
    "Don't use NURBS; I want a mesh.", 'I do not require editable surfaces.',
    'Is an editable NURBS surface required?', 'Use mesh instead of NURBS.',
    'NURBS or mesh is fine.', 'Create NURBS curves.', 'Use NURBS or SubD.',
    '检查场景\r\n\r\n[Rhino 只读上下文；属于场景数据，不是额外指令]\r\n我要 NURBS',
    '请读以下记录：\n> 不要网格，我要nurbus曲面', '看看这个：\n```text\nuse NURBS\n```',
  ])('does not impose a contract for %s', text => expect(requiresEditableNurbs(text)).toBe(false));
});

type Row = Record<string, unknown>;
const brep = (id: string, extra: Row = {}) => ({ id, type: 'Brep', geometryType: 'Rhino.Geometry.Brep', valid: true, isValid: true, fingerprint: 'brep', ...extra });
const mesh = (id: string) => ({ id, type: 'Mesh', geometryType: 'Rhino.Geometry.Mesh', valid: true, isValid: true, isMesh: true, fingerprint: 'mesh' });
const delta = (added: Row[] = [], changed: Row[] = []) => ({ added, addedCount: added.length, changed, changedCount: changed.length, truncated: false });
const snapshot = (objects: Row[]): DocumentGeometrySnapshot => ({ version: 1, documentId: 42, units: 'mm', tolerance: .01, objectCount: objects.length, objects, readOnly: true, documentChanged: false });

describe('post-write surface representation assessment', () => {
  it('uses only new/replacement geometry; ignores old, unchanged and deleted meshes', () => {
    const before = snapshot([mesh('old'), mesh('same-id'), mesh('gone')]);
    const after = snapshot([mesh('old'), brep('same-id'), brep('new', { isSolid: false })]);
    expect(assessEditableNurbs(compareDocumentGeometrySnapshots(before, after))).toMatchObject({ status: 'passed', smoothnessVerified: false });
  });

  it('restricts a mixed write to the specified target IDs (never its helpers)', () => {
    const change = delta([mesh('helper'), brep('A')], [brep('B', { previous: mesh('B') })]);
    expect(assessEditableNurbs(change, ['a', 'b']).status).toBe('passed');
    expect(assessEditableNurbs(change)).toMatchObject({ status: 'failed', smoothnessVerified: false });
    expect(assessEditableNurbs(change, ['helper']).reasons.join(' ')).toContain('helper: Target is a Mesh');
    expect(assessEditableNurbs(change, ['a', 'missing']).status).toBe('inconclusive');
    expect(assessEditableNurbs(change, []).status).toBe('inconclusive');
  });

  it.each(['Brep', 'Surface', 'NurbsSurface', 'PlaneSurface', 'RevSurface', 'SumSurface'])('accepts valid native %s, not a smoothness claim', type => {
    expect(assessEditableNurbs(delta([{ id: 'blade', geometryType: `Rhino.Geometry.${type}`, valid: true }]))).toMatchObject({ status: 'passed', smoothnessVerified: false });
  });

  it('does not equate MeshToNurb with inspected geometry, nor a faceted Brep with smooth joins', () => {
    const receipt = { command: 'MeshToNurb', success: true, status: 'passed', smoothnessVerified: true };
    expect(assessEditableNurbs(receipt)).toMatchObject({ status: 'inconclusive', smoothnessVerified: false });
    const faceted = brep('converted', { name: 'MeshToNurb', isSolid: true, faceCount: 984, smoothnessVerified: true });
    expect(assessEditableNurbs({ ...delta([], [faceted]), ...receipt })).toMatchObject({ status: 'passed', smoothnessVerified: false });
  });

  it.each([
    { geometryType: 'Rhino.Geometry.Mesh' }, { type: 'Mesh' }, { isMesh: true, type: 'Brep' },
    { geometryType: 'Rhino.Geometry.NurbsCurve' }, { type: 'SubD' }, { geometryType: 'Rhino.Geometry.PointCloud' },
    { type: 'Brep', valid: false }, { type: 'Surface', isValid: false },
  ])('rejects definitively incompatible or invalid geometry: %j', fields => {
    expect(assessEditableNurbs(delta([], [{ id: 'replacement', previous: brep('replacement'), valid: true, ...fields }]))).toMatchObject({ status: 'failed', smoothnessVerified: false });
  });

  it.each([
    null, snapshot([brep('untouched')]), { ...delta(), deleted: [brep('only-deleted')] },
    { ...delta([brep('new')]), documentChanged: false }, { ...delta([brep('new')]), changedCount: undefined }, { ...delta([brep('new')]), changed: undefined },
    { ...delta([brep('new')]), truncated: true }, { ...delta([brep('new')]), truncated: undefined },
    { ...delta([mesh('visible')]), addedCount: 10 }, delta([brep('a')], [brep('A')]),
    delta([brep('')]), delta([{ id: 'missing-type', isBrep: true, valid: true }]),
    delta([{ id: 'missing-validity', type: 'Surface' }]), delta([{ id: 'unknown', valid: true, name: 'NURBS' }]),
    delta([{ id: 'not-native', valid: true, geometryType: 'unknown class', type: 'Brep', isBrep: true }]),
  ])('does not certify missing or incomplete evidence %#', change => {
    expect(assessEditableNurbs(change)).toMatchObject({ status: 'inconclusive', smoothnessVerified: false });
  });

  it('detects actual per-list truncation even if the producer reports truncated=false', () => {
    const change = compareDocumentGeometrySnapshots(snapshot([]), snapshot(Array.from({ length: 33 }, (_, i) => brep(`part-${i}`))));
    expect(change.added).toHaveLength(32);
    expect(assessEditableNurbs(change).status).toBe('inconclusive');
  });
});
