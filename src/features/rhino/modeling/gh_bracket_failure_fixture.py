import Rhino.Geometry as rg
import math
s = float(x) if x else 1.0
t = float(y) if y else 5.0
tol=0.01

def plate(poly, holes, origin, vy, fillet):
    pts=[rg.Point3d(u,v,0) for u,v in poly]
    pts.append(pts[0])
    outer=rg.PolylineCurve(pts)
    rounded=rg.Curve.CreateFilletCornersCurve(outer,fillet,tol,0.01)
    if rounded: outer=rounded
    loops=[outer]
    for u,v,rx,ry,ang in holes:
        h=rg.Ellipse(rg.Plane(rg.Point3d(u,v,0),rg.Vector3d.ZAxis),rx,ry).ToNurbsCurve()
        h.Rotate(ang,rg.Vector3d.ZAxis,rg.Point3d(u,v,0))
        loops.append(h)
    for cr in loops:
        if not cr.IsValid or not cr.IsClosed or not cr.IsPlanar(tol): raise Exception('Invalid profile')
        ev=rg.Intersect.Intersection.CurveSelf(cr,tol)
        if ev and ev.Count: raise Exception('Self intersection')
    for i in range(1,len(loops)):
        if rg.Curve.PlanarClosedCurveRelationship(outer,loops[i],rg.Plane.WorldXY,tol)!=rg.RegionContainment.BInsideA: raise Exception('Hole outside profile')
        for j in range(i):
            ev=rg.Intersect.Intersection.CurveCurve(loops[i],loops[j],tol,tol)
            if ev and ev.Count: raise Exception('Intersecting boundaries')
            for k in range(80):
                p=loops[i].PointAt(loops[i].Domain.ParameterAt(k/80.0))
                ok,par=loops[j].ClosestPoint(p)
                if ok and p.DistanceTo(loops[j].PointAt(par))<1.1: raise Exception('Insufficient web')
    faces=rg.Brep.CreatePlanarBreps(loops,tol)
    if faces is None or len(faces)!=1: raise Exception('Unexpected region count')
    path=rg.LineCurve(rg.Point3d(0,0,0),rg.Point3d(0,0,t))
    b=faces[0].Faces[0].CreateExtrusion(path,True)
    if not b or not b.IsValid or not b.IsSolid: raise Exception('Invalid solid')
    plane=rg.Plane(rg.Point3d(*origin),rg.Vector3d.XAxis,rg.Vector3d(*vy))
    b.Transform(rg.Transform.PlaneToPlane(rg.Plane.WorldXY,plane))
    b.Transform(rg.Transform.Scale(rg.Point3d.Origin,s))
    return b

holes=[]
for v,u,rx,ry in [(12,10,5.5,6.5),(28,9,5,6),(44,8,4.5,6),(60,7,3.6,5.5),(75,6,3.2,5)]:
    holes.append((-u,v,rx,ry,-0.27))
    holes.append((u,v+1.0,rx,ry,0.32))
holes.append((0,89,5.2,6,0))
front=plate([(-23,0),(23,0),(22,15),(15,78),(10,102),(-10,102),(-15,78),(-22,15)],holes,(0,-85,0),(0,0.8,0.6),3.5)
tab=plate([(-10,0),(10,0),(8,46),(-8,46)],[(0,11,3.3,3.3,0),(0,25,4.5,4.5,0),(0,39,3,3,0)],(0,-4,58),(0,0,1),4)
rear=plate([(-10,0),(10,0),(15,65),(12,85),(-12,85),(-15,65)],[(0,16,4.2,6,0),(0,34,5,7,0),(-6.5,55,3.5,7,-0.2),(6.5,55,3.5,7,0.2),(0,74,5,5,0)],(0,-7,60),(0,0.72,-0.694),3)
parts=[front,tab,rear]
union=rg.Brep.CreateBooleanUnion(parts,tol)
if union and len(union)==1 and union[0].IsValid and union[0].IsSolid:
    a=list(union)
else:
    a=parts
print('Closed solids: '+str(len(a))+'; size scale: '+str(s)+'; thickness: '+str(t*s)+' mm')
