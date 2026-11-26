# Trusted convenience helper for existing run_python capability, NOT a Python sandbox.
# All of this helper's geometry checks run before its first document write.
import json as _drawer_json
import math as _drawer_math
import System as _drawer_system
import Rhino.Geometry as _drawer_rg
import Rhino.DocObjects as _drawer_objects
import scriptcontext as _drawer_sc


class DrawerFeatureAcceptanceError(ValueError):
    """No helper write was attempted. receipt is the same JSON-safe schema as preview."""
    def __init__(self, receipt):
        self.receipt = receipt
        first = next((c for c in receipt["checks"] if not c["passed"]), receipt)
        ValueError.__init__(self, "Feature acceptance failed before write: " + first["reason"])


def _drawer_number(value):
    n = float(value)
    if _drawer_math.isnan(n) or _drawer_math.isinf(n):
        raise ValueError("Expected a finite number")
    return n


def _drawer_xyz(value):
    xyz = (value.X, value.Y, value.Z) if hasattr(value, "X") else value
    if len(xyz) != 3:
        raise ValueError("Expected three world coordinates")
    return [_drawer_number(x) for x in xyz]


def _drawer_solid(brep):
    if not (isinstance(brep, _drawer_rg.Brep) and brep.IsValid and brep.IsSolid and brep.IsManifold):
        raise ValueError("Groove evidence requires a valid closed manifold Brep")
    pieces = brep.GetConnectedComponents()  # empty for a single connected Brep
    if pieces is None or len(pieces) != 0:
        for piece in pieces or []:
            piece.Dispose()
        raise ValueError("Groove evidence requires one connected boundary")
    if str(brep.SolidOrientation) != "Outward":
        raise ValueError("Groove evidence requires an outward solid")
    props = _drawer_rg.VolumeMassProperties.Compute(brep)
    if props is None:
        raise ValueError("Missing volume evidence")
    try:
        volume, error = _drawer_number(props.Volume), _drawer_number(props.VolumeError)
        if volume <= 0 or error < 0:
            raise ValueError("Invalid solid volume or uncertainty")
        return volume, error
    finally:
        props.Dispose()


def _drawer_chord(brep, origin, inward, extent, tol):
    """Front/back world-axis coordinates; unsupported if not a single material interval."""
    line = _drawer_rg.LineCurve(origin - inward * extent, origin + inward * extent)
    try:
        ok, overlaps, points = _drawer_rg.Intersect.Intersection.CurveBrep(line, brep, tol)[:3]
        try:
            if not ok or overlaps is None or len(overlaps) or points is None or len(points) != 2:
                raise ValueError("Probe requires exactly two isolated crossings (no overlap, tangency or multiple walls)")
            depths = sorted(_drawer_number((p - origin) * inward) for p in points if p.IsValid)
            if len(depths) != 2 or depths[1] - depths[0] <= 8 * tol:
                raise ValueError("Unresolved material chord")
            return depths
        finally:
            for curve in overlaps or []:
                curve.Dispose()
    finally:
        line.Dispose()


def _drawer_material(brep, point, inside, tol):
    boundary = brep.ClosestPoint(point)
    if not boundary.IsValid or _drawer_number(boundary.DistanceTo(point)) <= 2 * tol:
        raise ValueError("Material witness too close to a boundary or unresolved")
    if bool(brep.IsPointInside(point, tol, inside)) != inside:
        raise ValueError("Material witness did not have the required occupancy")


def _drawer_probe(before, after, sample, tol, evidence, boxes):
    p = _drawer_rg.Point3d(*sample["point"])
    axis = _drawer_rg.Vector3d(*sample["inward"])
    side = _drawer_rg.Vector3d(*sample["across"])
    if not (p.IsValid and axis.IsValid and side.IsValid and axis.Unitize() and side.Unitize()) or abs(axis * side) > 1e-6:
        raise ValueError("Expected a valid point and perpendicular non-zero inward/across directions")
    width, low, high = (sample[k] for k in ("flankDistance", "minDepth", "maxDepth"))
    if min(width, low) <= 8 * tol or high < low:
        raise ValueError("Flank distance and minimum depth must exceed 8 tolerances; require maxDepth >= minDepth")
    for label, offset in (("center", 0), ("left", -width), ("right", width)):
        q = p + side * offset
        # From outside BOTH bounding boxes, including translated or enlarged candidates.
        extent = _drawer_number(max(q.DistanceTo(b.Center) + b.Diagonal.Length for b in boxes) + 16 * tol)
        a, b = (_drawer_chord(s, q, axis, extent, tol) for s in (before, after))
        depth = _drawer_number(b[0] - a[0])
        evidence[label] = {"beforeChord": a, "candidateChord": b, "frontDelta": depth}
        if abs(b[1] - a[1]) > tol:
            raise ValueError(label + ": opposite wall moved/missing")
        if label == "center":
            if abs(a[0]) > tol:
                raise ValueError("Specified point is not on the original entry surface")
            if not low <= depth <= high:
                raise ValueError("No recess of the declared depth at the specified point")
            void = q + axis * ((a[0] + b[0]) * 0.5)
            _drawer_material(before, void, True, tol)
            _drawer_material(after, void, False, tol)
            evidence["removedAt"] = _drawer_xyz(void)
        elif abs(depth) > tol:
            raise ValueError(label + ": flank surface not retained")
        backing = q + axis * ((max(a[0], b[0]) + min(a[1], b[1])) * 0.5)
        for solid in (before, after):
            _drawer_material(solid, backing, True, tol)
        evidence[label]["retainedAt"] = _drawer_xyz(backing)


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
        self._requirements = []
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

    def _can_require(self):
        if self.finished or len(self._requirements) >= 64:
            raise ValueError("Cannot add requirements after commit or beyond the 64-check budget")

    def _snapshot(self, object_id):
        obj = self._object(object_id)
        crc = obj.Geometry.DataCRC(0)
        if self.reads.get(str(obj.Id), crc) != crc:
            raise ValueError("Object changed since stage.copy: " + str(obj.Id))
        return {"id": str(obj.Id), "serial": int(obj.RuntimeSerialNumber), "crc": crc,
                "original": obj.Geometry.Duplicate()}

    def require_preserved(self, object_id):
        """Pin a separate existing object. No replacement (even a look-alike) is allowed."""
        self._can_require()
        spec = self._snapshot(object_id)
        spec["type"] = "preservedObject"
        self._requirements.append(spec)

    def require_groove(self, part_name, samples, source_id=None, baseline=None):
        """Bind a unique named candidate to one baseline BEFORE evaluating, in model units.

        Exactly one of source_id (must replace that GUID) or baseline (new/add-only
        part; caller attests the origin of this private original). Each world-space
        sample: point, inward, across (3-vectors); flankDistance, minDepth, maxDepth.
        Measures blind recesses only; not a proof of continuous toolpath or appearance.
        """
        self._can_require()
        if (source_id is None) == (baseline is None):
            raise ValueError("Specify exactly one of source_id or private baseline")
        if not isinstance(samples, (list, tuple)) or not 1 <= len(samples) <= 128:
            raise ValueError("Expected 1..128 explicit groove samples")
        if sum(len(r.get("samples", [])) for r in self._requirements) + len(samples) > 128:
            raise ValueError("Stage exceeds 128 total groove samples")
        plan = []
        for s in samples:
            item = {k: _drawer_xyz(s[k]) for k in ("point", "inward", "across")}
            item.update({k: _drawer_number(s[k]) for k in ("flankDistance", "minDepth", "maxDepth")})
            plan.append(item)
        spec = self._snapshot(source_id) if source_id is not None else {
            "id": None, "original": self._native(baseline).Duplicate()}
        spec.update({"type": "sampledGroove", "part": str(part_name), "samples": plan})
        self._requirements.append(spec)

    def _verify_reference(self, spec):
        obj = self._object(spec["id"])
        if (str(obj.Id) != spec["id"] or int(obj.RuntimeSerialNumber) != spec["serial"] or
                not obj.Geometry.IsValid or obj.Geometry.DataCRC(0) != spec["crc"] or not
                _drawer_rg.GeometryBase.GeometryEquals(spec["original"], obj.Geometry)):
            raise ValueError("Pinned object identity or geometry changed: " + spec["id"])

    def _measure_groove(self, spec, prepared, check):
        named = [p for p in prepared if p["name"] == spec["part"]]
        if len(named) != 1:
            raise ValueError("Expected exactly one staged part named " + spec["part"])
        part = named[0]
        target = None if part["target"] is None else str(self._id(part["target"]))
        if target != spec["id"]:
            raise ValueError("Named candidate is not bound to the declared mother object/addition")
        if target and sum(p["target"] is not None and str(self._id(p["target"])) == target for p in prepared) != 1:
            raise ValueError("Ambiguous staged replacement for mother object")
        original = spec["original"]
        before = original.ToBrep() if isinstance(original, _drawer_rg.Extrusion) else original
        try:
            after = part["geometry"]  # exactly the prepared object about to be written
            bv, be = _drawer_solid(before)
            av, ae = _drawer_solid(after)
            tol = _drawer_number(self.tolerance)
            if tol <= 0 or tol != self.doc.ModelAbsoluteTolerance:
                raise ValueError("Invalid or changed model tolerance")
            delta = _drawer_number(bv - av)
            noise = _drawer_number(max(tol ** 3, be + ae, max(bv, av) * 1e-9))
            check.update({"beforeVolume": bv, "candidateVolume": av, "removedVolume": delta,
                          "volumeNoiseFloor": noise, "samples": []})
            if delta <= noise:
                raise ValueError("No net material loss beyond volume uncertainty")
            boxes = [s.GetBoundingBox(True) for s in (before, after)]
            if not all(b.IsValid for b in boxes):
                raise ValueError("Missing solid bounds")
            for i, sample in enumerate(spec["samples"]):
                row = {"index": i, "request": dict((k, list(v) if isinstance(v, list) else v)
                       for k, v in sample.items()), "passed": False}
                check["samples"].append(row)
                try:
                    _drawer_probe(before, after, sample, tol, row, boxes)
                    row["passed"] = True
                except Exception as error:
                    row["reason"] = str(error)
            failed = next((r for r in check["samples"] if not r["passed"]), None)
            if failed is not None:
                raise ValueError("Sample %d: %s" % (failed["index"], failed["reason"]))
        finally:
            if before is not None and before is not original:
                before.Dispose()

    def _feature_receipt(self, phase, prepared, preparation_error=None):
        checks = []
        for spec in self._requirements:
            check = {"type": spec["type"], "objectId": spec["id"], "passed": False}
            if "part" in spec:
                check.update({"part": spec["part"], "requestedSampleCount": len(spec["samples"])})
            checks.append(check)
            try:
                if preparation_error is not None:
                    raise ValueError("Not measured: " + preparation_error)
                if spec["id"] is not None:
                    self._verify_reference(spec)
                    check["objectSerial"] = spec["serial"]
                if spec["type"] == "preservedObject":
                    if any(p["target"] is not None and str(self._id(p["target"])) == spec["id"] for p in prepared):
                        raise ValueError("Separate protected object is targeted for replacement")
                    check["geometryEquals"] = True
                else:
                    self._measure_groove(spec, prepared, check)
                check["passed"] = True
            except Exception as error:
                check["reason"] = str(error)
        return {"schema": "drawer.featureAcceptance.v1", "phase": phase,
                "documentSerial": int(self.doc.RuntimeSerialNumber), "units": str(self.doc.ModelUnitSystem),
                "tolerance": self.tolerance, "checks": checks, "passed": bool(checks) and all(c["passed"] for c in checks)}

    # Scheduler correlation only, NOT proof of authorship or absence of other script effects.
    # Bounded including prefix (excluding line terminator); never truncate a check or ID.
    MAX_FEATURE_MARKER_BYTES = 8192

    def _feature_commit_line(self, prepared, ids, acceptance):
        by_name = dict((p["name"], i) for p, i in zip(prepared, ids))
        checks = []
        for check in acceptance["checks"]:
            item = {"type": check["type"], "passed": True}
            if check["type"] == "sampledGroove":
                item.update({"part": check["part"], "id": by_name[check["part"]]})
            else:
                item["id"] = check["objectId"]
            checks.append(item)
        line = "IDRAW_FEATURE_COMMIT_V1:" + _drawer_json.dumps(
            {"partIds": ids, "checks": checks}, ensure_ascii=True, separators=(",", ":"))
        if len(line) > self.MAX_FEATURE_MARKER_BYTES:
            raise ValueError("Commit marker exceeds 8192 ASCII bytes; choose a smaller explicit stage")
        return line

    def _prepare_features(self, phase, prepared):
        try:
            for part in self.parts:
                prepared.append(self._validate(part))
            if not prepared:
                raise ValueError("No staged geometry")
        except Exception as error:
            return self._feature_receipt(phase, prepared, str(error))
        acceptance = self._feature_receipt(phase, prepared)
        if acceptance["passed"]:
            try:
                # Real GUIDs have fixed width. Reject oversized receipts BEFORE the undo record.
                self._feature_commit_line(prepared, [str(_drawer_system.Guid.Empty)] * len(prepared), acceptance)
            except Exception as error:
                acceptance.update({"passed": False, "reason": str(error)})
        return acceptance

    def preview(self):
        """Read-only validated summary; never bake or assume a fixed GH output count."""
        if self.finished:
            raise RuntimeError("This geometry stage has already been committed or attempted")
        counts = {}
        if self._requirements:
            prepared = []
            try:
                acceptance = self._prepare_features("preview", prepared)
                for p in prepared:
                    counts[p["kind"]] = counts.get(p["kind"], 0) + 1
                return {"stagedCount": len(self.parts), "kinds": counts, "documentWrites": False,
                        "featureAcceptance": acceptance}
            finally:
                for p in prepared:
                    p["geometry"].Dispose()
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
        prepared = []
        try:
            acceptance = None
            if self._requirements:
                acceptance = self._prepare_features("precommit", prepared)
                if not acceptance["passed"]:
                    raise DrawerFeatureAcceptanceError(acceptance)
            else:
                if not self.parts:
                    raise ValueError("No staged geometry to commit")
                for part in self.parts:
                    prepared.append(self._validate(part))
            result = self._write(prepared)
            if acceptance is not None:
                result.update({"featureAcceptance": acceptance, "structuralOnly": False})
                try:
                    print(self._feature_commit_line(prepared, [p["id"] for p in result["parts"]], acceptance))
                except Exception as error:
                    # A broken stdout cannot undo a committed edit or authorize a retry.
                    result["featureMarkerWarning"] = str(error)
            return result
        finally:
            for part in prepared:
                part["geometry"].Dispose()
            for spec in self._requirements:
                spec["original"].Dispose()

    def _write(self, prepared):
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
