# Trusted convenience helper for existing run_python capability, NOT a Python sandbox.
# All of this helper's geometry checks run before its first document write.
import math as _drawer_math
import System as _drawer_system
import Rhino.Geometry as _drawer_rg
import Rhino.DocObjects as _drawer_objects
import scriptcontext as _drawer_sc


class DrawerGeometryStage(object):
    """Build on private copies, declare automatic or explicit geometry intent, then commit once.

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

    MAX_PARTS = 2000
    MAX_BRANCHES = 2000

    @staticmethod
    def _native(value):
        # Only unwrap actual GH types, never an arbitrary object with a Value attribute.
        # GH_Point/Line/Box often expose value types, not GeometryBase.
        for _ in range(8):
            if value is None:
                raise ValueError("Null GH geometry item; no bake performed")
            try:
                type_name = str(value.GetType().FullName)
            except AttributeError:
                type_name = ""
            if not type_name.startswith("Grasshopper.Kernel.Types."):
                break
            if not value.IsValid:
                raise ValueError("Invalid or unresolved GH geometry: " + type_name)
            next_value = value.ScriptVariable()
            if next_value is value:
                raise ValueError("GH geometry wrapper did not resolve: " + type_name)
            value = next_value
        if isinstance(value, _drawer_rg.Point3d):
            value = _drawer_rg.Point(value)
        elif isinstance(value, (_drawer_rg.Line, _drawer_rg.Arc, _drawer_rg.Circle, _drawer_rg.Ellipse, _drawer_rg.Rectangle3d)):
            value = value.ToNurbsCurve()
        elif isinstance(value, _drawer_rg.Polyline):
            value = value.ToPolylineCurve()
        elif isinstance(value, _drawer_rg.Box):
            value = value.ToBrep()
        supported = (_drawer_rg.Brep, _drawer_rg.Surface, _drawer_rg.Extrusion, _drawer_rg.Mesh,
                     _drawer_rg.Curve, _drawer_rg.Point, _drawer_rg.PointCloud, _drawer_rg.SubD)
        if not isinstance(value, supported):
            raise ValueError("Unsupported bake geometry type: " + type(value).__name__ + "; select a geometry output, not a text/data output")
        return value

    def _part(self, name, geometry, kind, replace_id, cap_planar, planar_faces, source=None):
        if self.finished:
            raise RuntimeError("This geometry stage has already been committed or attempted")
        if kind not in ("auto", "solid", "surface", "curve", "mesh", "point", "pointcloud", "subd"):
            raise ValueError("Unsupported geometry intent for " + str(name) + ": " + str(kind))
        if geometry is None:
            raise ValueError("Missing staged geometry: " + str(name))
        if cap_planar and kind != "solid":
            raise ValueError("Planar capping is only valid for an explicitly requested Brep solid")
        native = self._native(geometry)
        return {"name": str(name), "geometry": native.Duplicate(), "kind": kind, "target": replace_id,
                "cap": bool(cap_planar), "planar": list(planar_faces or []), "source": source}

    def add(self, name, geometry, kind="auto", replace_id=None, cap_planar=False, planar_faces=None):
        if len(self.parts) >= self.MAX_PARTS:
            raise ValueError("Staged bake exceeds 2000 objects; choose a smaller explicit subset")
        self.parts.append(self._part(name, geometry, kind, replace_id, cap_planar, planar_faces))

    def add_tree(self, name, tree, kind="auto"):
        """Snapshot every item of an explicitly chosen GH geometry output, no solve or write.

        Empty branches are allowed, null/invalid items are NOT silently discarded.
        Actual path and item index survive in the receipt; no guessed item count.
        If any item fails, none of this tree is appended to the stage.
        """
        if self.finished:
            raise RuntimeError("This geometry stage has already been committed or attempted")
        paths, branches = tree.Paths, tree.Branches
        if len(paths) != len(branches) or len(paths) > self.MAX_BRANCHES:
            raise ValueError("GH tree branch inventory is inconsistent or exceeds 2000 branches")
        pending, branch_summary = [], []
        for path, branch in zip(paths, branches):
            path_name = str(path)
            branch_summary.append({"path": path_name, "count": len(branch)})
            if len(self.parts) + len(pending) + len(branch) > self.MAX_PARTS:
                raise ValueError("Staged bake exceeds 2000 objects; choose a smaller explicit subset")
            for index, value in enumerate(branch):
                label = str(name) + " " + path_name + "[" + str(index) + "]"
                try:
                    pending.append(self._part(label, value, kind, None, False, None,
                                              {"path": path_name, "index": index}))
                except Exception as error:
                    raise ValueError("GH bake item " + path_name + "[" + str(index) + "]: " + str(error))
        if not pending:
            raise ValueError("Selected GH output contains no geometry; inspect output selection and solve state before baking")
        self.parts.extend(pending)
        return {"stagedCount": len(pending), "branches": branch_summary, "documentWrites": False}

    @staticmethod
    def _orientation(geometry):
        if isinstance(geometry, _drawer_rg.Mesh):
            return {1: "Outward", -1: "Inward"}.get(geometry.SolidOrientation(), "None")
        return str(geometry.SolidOrientation)

    def _validate(self, part):
        name, kind = part["name"], part["kind"]
        # Revalidate a fresh private copy so preview never flips/caps the source or staged data.
        geometry = part["geometry"].Duplicate()
        if isinstance(geometry, (_drawer_rg.Extrusion, _drawer_rg.Surface)):
            geometry = geometry.ToBrep()
        if kind == "auto":
            if isinstance(geometry, _drawer_rg.Brep):
                kind = "solid" if geometry.IsSolid else "surface"
            else:
                kind = next((label for cls, label in ((_drawer_rg.Mesh, "mesh"), (_drawer_rg.Curve, "curve"),
                            (_drawer_rg.Point, "point"), (_drawer_rg.PointCloud, "pointcloud"), (_drawer_rg.SubD, "subd"))
                            if isinstance(geometry, cls)), "unsupported")
        required = {"surface": _drawer_rg.Brep, "mesh": _drawer_rg.Mesh, "curve": _drawer_rg.Curve,
                    "point": _drawer_rg.Point, "pointcloud": _drawer_rg.PointCloud, "subd": _drawer_rg.SubD}
        if kind == "solid" and not isinstance(geometry, (_drawer_rg.Brep, _drawer_rg.Mesh, _drawer_rg.SubD)):
            raise ValueError("Expected Brep, mesh or SubD solid for " + name)
        if kind in required and not isinstance(geometry, required[kind]):
            raise ValueError("Geometry type/intent mismatch for " + name + ": expected " + kind + ", actual " + type(geometry).__name__)
        if part["cap"]:
            if not isinstance(geometry, _drawer_rg.Brep):
                raise ValueError("Planar capping is Brep-only; do not fill intentional mesh openings: " + name)
            if not geometry.IsSolid:
                capped = geometry.CapPlanarHoles(self.tolerance)
                if capped is None or not capped.IsValid or not capped.IsSolid:
                    raise ValueError("Planar capping could not produce the required solid: " + name)
                geometry = capped
        if not geometry.IsValid:
            raise ValueError("Invalid staged geometry: " + name)
        if isinstance(geometry, _drawer_rg.Mesh) and (geometry.Vertices.Count == 0 or geometry.Faces.Count == 0):
            raise ValueError("Empty staged mesh: " + name)
        if isinstance(geometry, _drawer_rg.PointCloud) and geometry.Count == 0:
            raise ValueError("Empty staged point cloud: " + name)
        if kind == "solid":
            if not geometry.IsSolid:
                naked = geometry.DuplicateNakedEdgeCurves(True, False) if isinstance(geometry, _drawer_rg.Brep) else None
                raise ValueError("Open solid: " + name + ("; naked edges=" + str(len(naked)) if naked is not None else "") + "; staged geometry not committed")
            # SubD stays native in the document; conversion is only for solid validation.
            probe = geometry.ToBrep() if isinstance(geometry, _drawer_rg.SubD) else geometry
            try:
                if probe is None or not probe.IsValid or not probe.IsSolid:
                    raise ValueError("Cannot validate required SubD solid: " + name)
                if self._orientation(probe) == "Inward":
                    if isinstance(geometry, _drawer_rg.Mesh):
                        geometry.Flip(True, True, True)
                    elif isinstance(geometry, _drawer_rg.SubD):
                        if not hasattr(geometry, "Flip") or not geometry.Flip():
                            raise ValueError("Cannot normalize inward SubD in this Rhino version: " + name)
                        probe.Dispose()
                        probe = geometry.ToBrep()
                    else:
                        geometry.Flip()
                if probe is None or not probe.IsValid or self._orientation(probe) != "Outward":
                    raise ValueError("Indeterminate solid orientation: " + name)
                properties = _drawer_rg.VolumeMassProperties.Compute(probe)
                try:
                    volume = properties.Volume if properties is not None else 0
                    if properties is None or _drawer_math.isnan(volume) or _drawer_math.isinf(volume) or volume <= 0:
                        raise ValueError("Invalid solid volume: " + name)
                finally:
                    if properties is not None:
                        properties.Dispose()
            finally:
                if probe is not None and probe is not geometry:
                    probe.Dispose()
        for index in part["planar"]:
            if not isinstance(geometry, _drawer_rg.Brep) or not isinstance(index, int) or index < 0 or index >= geometry.Faces.Count:
                raise ValueError("Explicit planar-face constraints apply only to Brep faces: " + name)
            if not geometry.Faces[index].IsPlanar(self.tolerance):
                raise ValueError("Required planar face is curved: " + name + "; face=" + str(index))
        bounds = geometry.GetBoundingBox(True)
        values = [bounds.Min.X, bounds.Min.Y, bounds.Min.Z, bounds.Max.X, bounds.Max.Y, bounds.Max.Z]
        if not bounds.IsValid or any(_drawer_math.isnan(n) or _drawer_math.isinf(n) for n in values):
            raise ValueError("Invalid staged bounds: " + name)
        result = dict(part)
        result.update({"geometry": geometry, "kind": kind})
        return result

    def preview(self):
        """Read-only validated summary; never bake or assume a fixed GH output count."""
        if self.finished:
            raise RuntimeError("This geometry stage has already been committed or attempted")
        counts = {}
        for part in self.parts:
            prepared = self._validate(part)
            try:
                counts[prepared["kind"]] = counts.get(prepared["kind"], 0) + 1
            finally:
                prepared["geometry"].Dispose()
        return {"stagedCount": len(self.parts), "kinds": counts, "documentWrites": False}

    def commit(self):
        if self.finished:
            raise RuntimeError("A geometry stage can be committed only once; never replay a failed write")
        self.finished = True
        if not self.parts:
            raise ValueError("No staged geometry to commit")
        prepared = [self._validate(part) for part in self.parts]
        targets = [str(self._id(part["target"])) for part in prepared if part["target"] is not None]
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
            for part in prepared:
                name, geometry, kind, target = part["name"], part["geometry"], part["kind"], part["target"]
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
                receipt.append({"name": name, "id": str(object_id), "kind": kind, "replaced": target is not None, "source": part["source"]})
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
        result = {"parts": receipt, "committedCount": len(receipt), "structuralOnly": True, "photoFidelityVerified": False}
        try:
            self.doc.Views.Redraw()
        except Exception as error:
            result["redrawWarning"] = str(error)
        return result
