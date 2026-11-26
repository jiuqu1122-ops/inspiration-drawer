"""Kernel-free contract tests. Analytic circular cylinder + rectangular blind notch.

Only axis-parallel fixture rays are implemented. These check the production decision
and transaction path, NOT whether RhinoCommon's numerical intersections succeed.
Run: python -B -m unittest discover -s scripts/tests -p 'test_rhino_geometry*.py'
"""
import contextlib
import io
import json
import math
from types import SimpleNamespace as NS
import unittest
import uuid

import test_rhino_geometry_stage as fake


class XYZ:
    IsValid = True

    def __init__(self, x, y, z):
        self.X, self.Y, self.Z = x, y, z

    def __add__(self, v):
        return XYZ(self.X + v.X, self.Y + v.Y, self.Z + v.Z)

    def __sub__(self, v):
        return XYZ(self.X - v.X, self.Y - v.Y, self.Z - v.Z)

    def __mul__(self, v):
        if isinstance(v, XYZ):
            return self.X*v.X + self.Y*v.Y + self.Z*v.Z
        return XYZ(self.X*v, self.Y*v, self.Z*v)

    @property
    def Length(self):
        return math.sqrt(self*self)

    def Unitize(self):
        n = self.Length
        if n:
            self.X, self.Y, self.Z = self.X/n, self.Y/n, self.Z/n
        return n > 0

    def DistanceTo(self, p):
        return (p - self).Length


class Cylinder(fake.Brep):
    IsManifold = True

    def __init__(self, cut=None, y=0, has_components=False):
        super().__init__()
        self.cut, self.y, self.has_components = cut, y, has_components

    def GetConnectedComponents(self):
        return [fake.Brep(), fake.Brep()] if self.has_components else []

    def GetBoundingBox(self, accurate):
        return NS(IsValid=True, Min=XYZ(-10, self.y-10, 0), Max=XYZ(10, self.y+10, 20),
                  Center=XYZ(0, self.y, 10), Diagonal=XYZ(20, 20, 20))

    def volume(self):
        volume = math.pi * 100 * 20
        if self.cut:  # integral of the circular cross-section above the cutter floor
            w, floor, z0, z1 = self.cut
            volume -= (w*math.sqrt(100-w*w) + 100*math.asin(w/10) - 2*w*floor) * (z1-z0)
        return volume

    def interval(self, x, z):
        if abs(x) >= 10 or not 0 < z < 20:
            return None
        edge = math.sqrt(100 - x*x)
        lo, hi = self.y-edge, self.y+edge
        if self.cut:
            w, floor, z0, z1 = self.cut
            if abs(x) < w and z0 < z < z1:
                hi = min(hi, self.y+floor)
        return (lo, hi) if lo < hi else None

    def IsPointInside(self, p, tol, strict):
        interval = self.interval(p.X, p.Z)
        return bool(interval and interval[0] < p.Y < interval[1])

    def ClosestPoint(self, p):
        # Conservative lower bound to boundary clearance (distance to extended faces).
        distances = [abs(math.hypot(p.X, p.Y-self.y)-10), abs(p.Z), abs(20-p.Z)]
        if self.cut:
            w, floor, z0, z1 = self.cut
            distances += [abs(abs(p.X)-w), abs(p.Y-self.y-floor), abs(p.Z-z0), abs(p.Z-z1)]
        return p + XYZ(0, min(distances), 0)


class Ray:
    def __init__(self, a, b):
        self.a, self.b = a, b

    def Dispose(self):
        pass


def intersect(ray, solid, tol):
    a, b = ray.a, ray.b
    assert a.X == b.X and a.Z == b.Z
    ys = solid.interval(a.X, a.Z) or ()
    return True, [], [XYZ(a.X, y, a.Z) for y in ys if min(a.Y,b.Y) < y < max(a.Y,b.Y)]


class Objects(fake.Objects):
    def Add(self, geometry, attributes):
        raw = super().Add(geometry, attributes)
        row = self.rows.pop(raw)
        row.Id = fake.Guid(str(uuid.UUID(int=self.add_count)))
        self.rows[row.Id] = row
        self.writes[-1] = ("add", row.Id)
        return row.Id


class FeatureTests(unittest.TestCase):
    prefix = 'IDRAW_FEATURE_COMMIT_V1:'

    def setUp(self):
        self.doc = fake.Document()
        self.doc.Objects = Objects()
        self.ns = fake.execute_program(self.doc, 'src/features/rhino/rhinoGeometryStage.py')
        self.Stage = self.ns['DrawerGeometryStage']
        self.error = self.ns['DrawerFeatureAcceptanceError']
        self.rg = self.ns['_drawer_rg']
        self.rg.Point3d = self.rg.Vector3d = XYZ
        self.rg.LineCurve = Ray
        self.rg.Intersect = NS(Intersection=NS(CurveBrep=intersect))
        self.rg.GeometryBase = NS(GeometryEquals=lambda a, b: type(a) is type(b) and a.cut == b.cut and a.y == b.y)
        self.rg.VolumeMassProperties.Compute = lambda b: NS(Volume=b.volume(), VolumeError=1e-6, Dispose=lambda: None)
        self.base = Cylinder()
        self.cut = Cylinder((1, 8, 5, 11))
        self.wrong = Cylinder((1, 8, 13, 19))
        self.host, self.cap = (self.doc.Objects.Add(self.base, fake.Attributes()) for _ in range(2))
        for i, obj in enumerate(self.doc.Objects.rows.values(), 31):
            obj.RuntimeSerialNumber = i
        self.plan = [dict(point=[0,10,z], inward=[0,-1,0], across=[1,0,0],
                          flankDistance=2.5, minDepth=1.9, maxDepth=2.1) for z in (7,9)]
        self.log = io.StringIO()
        stdout = contextlib.redirect_stdout(self.log)
        stdout.__enter__()
        self.addCleanup(stdout.__exit__, None, None, None)
        self.undo = []
        self.doc.BeginUndoRecord = lambda name: self.undo.append(name) or 1

    def stage(self, candidate=None, name='body', target=None):
        s = self.Stage()
        s.require_groove(name, self.plan, source_id=self.host)
        s.add(name, candidate or self.cut, replace_id=target or self.host)
        s.require_preserved(self.cap)
        return s

    def rejected(self, stage, text):
        writes, undo = list(self.doc.Objects.writes), list(self.undo)
        a = stage.preview()['featureAcceptance']
        self.assertFalse(a['passed'], a)
        with self.assertRaisesRegex(self.error, text) as cm:
            stage.commit()
        self.assertEqual(dict(a, phase='precommit'), cm.exception.receipt)
        self.assertEqual(self.doc.Objects.writes, writes)
        self.assertEqual(self.undo, undo)
        self.assertEqual(self.log.getvalue(), '')
        return a

    def marker(self):
        lines = self.log.getvalue().splitlines()
        self.assertEqual(len(lines), 1)
        self.assertTrue(lines[0].startswith(self.prefix))
        self.assertLessEqual(len(lines[0].encode('ascii')), 8192)
        return json.loads(lines[0][len(self.prefix):])

    def test_curved_mother_retained_cap_evidence_and_success_marker(self):
        name = '圆柱\n"grooved"'
        s = self.stage(name=name)
        s.add('sibling', self.base)
        a = s.preview()['featureAcceptance']
        self.assertTrue(a['passed'], a)
        self.assertEqual(a['schema'], 'drawer.featureAcceptance.v1')
        self.assertEqual(self.log.getvalue(), '')
        self.assertEqual(self.undo, [])
        self.assertEqual(a['checks'][1]['objectId'], self.cap)
        for row in a['checks'][0]['samples']:
            self.assertTrue(row['passed'])
            self.assertEqual(row['center']['frontDelta'], 2)
            self.assertGreater(row['left']['beforeChord'][0], 0)  # curved, not a tangent plane
            self.assertEqual(row['right']['frontDelta'], 0)
            self.assertEqual(row['removedAt'][1], 9)
        r = s.commit()
        self.assertEqual(r['featureAcceptance'], dict(a, phase='precommit'))
        self.assertFalse(r['structuralOnly'] or r['photoFidelityVerified'])
        self.assertEqual(self.marker(), {'partIds':[self.host, r['parts'][1]['id']], 'checks':[
            {'type':'sampledGroove','passed':True,'part':name,'id':self.host},
            {'type':'preservedObject','passed':True,'id':self.cap}]})

    def test_private_baseline_and_plan_are_frozen_and_marker_uses_new_id(self):
        s = self.Stage()
        s.require_groove('new', self.plan, baseline=self.base)
        self.base.y = 100
        self.plan[0]['inward'][0] = 1
        s.add('new', self.cut)
        s.preview()['featureAcceptance']['checks'][0]['samples'][0]['request']['point'][1] = -800
        r = s.commit()
        new_id = r['parts'][0]['id']
        self.assertEqual(self.marker()['checks'][0]['id'], new_id)
        self.assertNotEqual(new_id, self.host)

    def test_applique_wrong_location_rigid_and_wrong_mother(self):
        s = self.stage(self.base)
        s.add('decorative solid', self.cut)
        self.rejected(s, 'volume uncertainty')
        a = self.rejected(self.stage(self.wrong), 'declared depth')
        self.assertGreater(a['checks'][0]['removedVolume'], 0)
        self.rejected(self.stage(Cylinder(y=-2)), 'volume uncertainty')
        self.rejected(self.stage(Cylinder(self.cut.cut, y=-1)), 'opposite wall')
        self.rejected(self.stage(target=self.cap), 'not bound')

    def test_all_stations_flanks_backing_and_independent_evidence_required(self):
        self.rejected(self.stage(Cylinder((4,8,5,11))), 'flank surface')
        self.rejected(self.stage(Cylinder((1,-10,5,11))), 'two isolated crossings')
        self.plan[1]['point'][2] = 15
        a = self.rejected(self.stage(), 'Sample 1')
        self.assertEqual([r['passed'] for r in a['checks'][0]['samples']], [True,False])
        self.plan[1]['point'][2] = 9
        self.rg.Intersect.Intersection.CurveBrep = lambda *args: (False, [], [XYZ(0,8,7),XYZ(0,-10,7)])
        self.rejected(self.stage(), 'crossings')  # partial output isn't evidence
        self.rg.Intersect.Intersection.CurveBrep = intersect
        self.cut.IsPointInside = lambda *args: True  # intersection claim contradicted by membership
        self.rejected(self.stage(), 'occupancy')

    def test_protected_removal_even_with_lookalike_or_same_crc_and_id(self):
        for action in ('change', 'replace', 'delete'):
            s = self.stage()
            self.assertTrue(s.preview()['featureAcceptance']['passed'])
            obj = self.doc.Objects.FindId(self.cap)
            if action == 'change':
                obj.Geometry.y += 1  # same fake CRC and serial; pure geometry comparison matters
            elif action == 'replace':
                obj.RuntimeSerialNumber += 1
            else:
                self.doc.Objects.Delete(self.cap, True)
                self.doc.Objects.Add(obj.Geometry, fake.Attributes())
            self.rejected(s, 'exists|changed')

    def test_commit_remeasures_without_a_second_preview(self):
        s = self.stage()
        self.assertTrue(s.preview()['featureAcceptance']['passed'])
        self.doc.Objects.Delete(self.cap, True)
        writes = self.doc.Objects.writes[:]
        with self.assertRaisesRegex(self.error, 'exists') as cm:
            s.commit()
        a = cm.exception.receipt
        self.assertTrue(a['checks'][0]['passed'])
        self.assertFalse(a['checks'][1]['passed'])
        self.assertEqual(self.doc.Objects.writes, writes)
        self.assertEqual(self.undo, [])
        self.assertEqual(self.log.getvalue(), '')

    def test_stale_host_and_conflicting_plans(self):
        s = self.stage()
        s.add('extra', self.cut, replace_id=self.host)
        self.rejected(s, 'Ambiguous')
        s = self.stage()
        s.add('body', self.cut)
        self.rejected(s, 'exactly one')
        s = self.stage()
        s.add('cap', self.base, replace_id=self.cap)
        self.rejected(s, 'protected object')
        s = self.stage()
        self.assertTrue(s.preview()['featureAcceptance']['passed'])
        self.doc.Objects.FindId(self.host).Geometry.y = 3
        self.rejected(s, 'changed')

    def test_unsupported_and_structurally_invalid_have_no_pass(self):
        self.rejected(self.stage(Cylinder(self.cut.cut, has_components=True)), 'connected')
        self.cut.IsSolid = False
        self.rejected(self.stage(), 'closed manifold')
        self.cut.IsValid = False
        self.rejected(self.stage(), 'Not measured: Invalid staged geometry')
        self.cut.IsSolid = self.cut.IsValid = True
        self.plan[0]['flankDistance'] = 0.02
        self.rejected(self.stage(), '8 tolerances')
        with self.assertRaisesRegex(ValueError, '1..128'):
            self.Stage().require_groove('x', [], baseline=self.base)

    def test_oversize_marker_rejected_before_writes_and_never_truncated(self):
        s = self.stage(name='x'*8192)
        self.rejected(s, '8192')

    def test_preservation_only_emits_no_groove_claim(self):
        s = self.Stage()
        s.require_preserved(self.cap)
        s.add('independent addition', self.base)
        r = s.commit()
        self.assertEqual(self.marker(), {'partIds': [r['parts'][0]['id']], 'checks': [
            {'type': 'preservedObject', 'passed': True, 'id': self.cap}]})

    def test_volume_below_error_and_absent_baseline_are_not_evidence(self):
        self.rg.VolumeMassProperties.Compute = lambda b: NS(Volume=b.volume(), VolumeError=1000, Dispose=lambda: None)
        self.rejected(self.stage(), 'volume uncertainty')
        with self.assertRaisesRegex(ValueError, 'exactly one'):
            self.Stage().require_groove('x', self.plan)
        with self.assertRaisesRegex(ValueError, 'exactly one'):
            self.Stage().require_groove('x', self.plan, baseline=self.base, source_id=self.host)

    def test_no_marker_without_features_or_on_write_rollback(self):
        s = self.Stage()
        s.add('legacy', self.base)
        self.assertNotIn('featureAcceptance', s.commit())
        s = self.stage()
        s.add('fails during write', self.cut)
        self.doc.Objects.failure_on_add = self.doc.Objects.add_count + 1
        with self.assertRaisesRegex(RuntimeError, 'writes restored'):
            s.commit()
        self.assertEqual(self.log.getvalue(), '')


if __name__ == '__main__':
    unittest.main()
