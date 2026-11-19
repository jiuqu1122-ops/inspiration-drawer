# Trusted convenience helper for existing run_python capability, NOT a Python sandbox.
# All of this helper's geometry checks run before its first document write.
import math as _drawer_math
import System as _drawer_system
import Rhino.Geometry as _drawer_rg
import Rhino.DocObjects as _drawer_objects
import scriptcontext as _drawer_sc


class DrawerGeometryStage(object):
    """Build on private copies, declare solid/surface/curve intent, then commit once.

    Does not authorize replay of arbitrary Python; code outside this helper may
    have side effects. Rollback only touches IDs written by this commit.
    """
    def __init__(self):
        self.doc = globals().get("__rhino_doc__", _drawer_sc.doc)
        self.tolerance = self.doc.ModelAbsoluteTolerance
        self.parts = []
        self.reads = {}
        self.finished = False

    def _id(self, value):
        return _drawer_system.Guid(str(value))

    def _object(self, object_id):
        obj = self.doc.Objects.FindId(self._id(object_id))
        if obj is None or obj.IsDeleted:
            raise ValueError("Replacement target no longer exists in the bound document: " + str(object_id))
        return obj

    def copy(self, object_id):
        obj = self._object(object_id)
        self.reads[str(obj.Id)] = obj.Geometry.DataCRC(0)
        return obj.Geometry.Duplicate()

    def add(self, name, geometry, kind="solid", replace_id=None, cap_planar=False, planar_faces=None):
        if self.finished:
            raise RuntimeError("This geometry stage has already been committed or attempted")
        if kind not in ("solid", "surface", "curve"):
            raise ValueError("Declare solid, surface or curve intent for " + str(name))
        if geometry is None:
            raise ValueError("Missing staged geometry: " + str(name))
        if cap_planar and kind != "solid":
            raise ValueError("Planar capping is only valid for an explicitly requested solid")
        self.parts.append((str(name), geometry.Duplicate(), kind, replace_id, bool(cap_planar), list(planar_faces or [])))

    def _validate(self, part):
        name, geometry, kind, replace_id, cap_planar, planar_faces = part
        if isinstance(geometry, _drawer_rg.Extrusion):
            geometry = geometry.ToBrep()
        if isinstance(geometry, _drawer_rg.Surface):
            geometry = geometry.ToBrep()
        if kind in ("solid", "surface") and not isinstance(geometry, _drawer_rg.Brep):
            raise ValueError("Expected Brep/surface geometry for " + name)
        if kind == "curve" and not isinstance(geometry, _drawer_rg.Curve):
            raise ValueError("Expected curve geometry for " + name)
        if cap_planar and not geometry.IsSolid:
            capped = geometry.CapPlanarHoles(self.tolerance)
            if capped is None or not capped.IsValid or not capped.IsSolid:
                raise ValueError("Planar capping could not produce the required solid: " + name)
            geometry = capped
        if not geometry.IsValid:
            raise ValueError("Invalid staged geometry: " + name)
        if kind == "solid":
            if not geometry.IsSolid:
                naked = geometry.DuplicateNakedEdgeCurves(True, False)
                raise ValueError("Open solid: " + name + "; naked edges=" + str(len(naked) if naked is not None else 0) + "; staged geometry not committed")
            if geometry.SolidOrientation == _drawer_rg.BrepSolidOrientation.Inward:
                geometry.Flip()
            if geometry.SolidOrientation != _drawer_rg.BrepSolidOrientation.Outward:
                raise ValueError("Indeterminate solid orientation: " + name)
            properties = _drawer_rg.VolumeMassProperties.Compute(geometry)
            try:
                volume = properties.Volume if properties is not None else 0
                if properties is None or _drawer_math.isnan(volume) or _drawer_math.isinf(volume) or volume <= 0:
                    raise ValueError("Invalid solid volume: " + name)
            finally:
                if properties is not None:
                    properties.Dispose()
        for index in planar_faces:
            if kind == "curve" or not isinstance(index, int) or index < 0 or index >= geometry.Faces.Count:
                raise ValueError("Invalid explicit planar-face constraint: " + name)
            if not geometry.Faces[index].IsPlanar(self.tolerance):
                raise ValueError("Required planar face is curved: " + name + "; face=" + str(index))
        bounds = geometry.GetBoundingBox(True)
        values = [bounds.Min.X, bounds.Min.Y, bounds.Min.Z, bounds.Max.X, bounds.Max.Y, bounds.Max.Z]
        if not bounds.IsValid or any(_drawer_math.isnan(n) or _drawer_math.isinf(n) for n in values):
            raise ValueError("Invalid staged bounds: " + name)
        return (name, geometry, kind, replace_id)

    def commit(self):
        if self.finished:
            raise RuntimeError("A geometry stage can be committed only once; never replay a failed write")
        self.finished = True
        if not self.parts:
            raise ValueError("No staged geometry to commit")
        prepared = [self._validate(part) for part in self.parts]
        targets = [str(self._id(part[3])) for part in prepared if part[3] is not None]
        if len(set(targets)) != len(targets):
            raise ValueError("A replacement target appears more than once")
        originals = {}
        for target in targets:
            obj = self._object(target)
            if target in self.reads and obj.Geometry.DataCRC(0) != self.reads[target]:
                raise ValueError("Target changed since it was read; inspect before editing: " + target)
            originals[target] = (obj.Geometry.Duplicate(), obj.Attributes.Duplicate())
        # No layers, materials, additions, replacements or deletions occurred above.
        added, replaced, receipt = [], [], []
        undo = self.doc.BeginUndoRecord("Inspiration Drawer staged geometry")
        try:
            for name, geometry, kind, target in prepared:
                if target is not None:
                    object_id = self._id(target)
                    replaced.append(str(object_id))
                    if not self.doc.Objects.Replace(object_id, geometry):
                        raise RuntimeError("Could not replace staged part: " + name)
                else:
                    attributes = _drawer_objects.ObjectAttributes()
                    attributes.Name = name
                    object_id = self.doc.Objects.Add(geometry, attributes)
                    if object_id == _drawer_system.Guid.Empty:
                        raise RuntimeError("Could not add staged part: " + name)
                    added.append(object_id)
                receipt.append({"name": name, "id": str(object_id), "kind": kind, "replaced": target is not None})
        except Exception as error:
            rollback_errors = []
            for object_id in reversed(added):
                try:
                    if not self.doc.Objects.Delete(object_id, True):
                        rollback_errors.append(str(object_id))
                except Exception:
                    rollback_errors.append(str(object_id))
            for target in reversed(replaced):
                try:
                    geometry, attributes = originals[target]
                    if not self.doc.Objects.Replace(self._id(target), geometry):
                        rollback_errors.append(target)
                    if not self.doc.Objects.ModifyAttributes(self._id(target), attributes, True):
                        rollback_errors.append(target)
                except Exception:
                    rollback_errors.append(target)
            if rollback_errors:
                raise RuntimeError(str(error) + "; rollback incomplete, inspect IDs: " + ", ".join(rollback_errors))
            raise RuntimeError(str(error) + "; tracked helper writes restored; inspect document, not proof of zero side effects; do not replay arbitrary script")
        finally:
            if undo:
                self.doc.EndUndoRecord(undo)
        result = {"parts": receipt, "structuralOnly": True, "photoFidelityVerified": False}
        try:
            self.doc.Views.Redraw()
        except Exception as error:
            result["redrawWarning"] = str(error)
        return result
