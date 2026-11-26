// Narrow managed test doubles, not a geometric kernel. Retain placements and loop
// inventories; deliberately allow a cap to lose an inner loop or a solid to be invalid.
namespace Rhino.Geometry;

internal record struct Point3d(double X, double Y, double Z)
{
    public static Vector3d operator -(Point3d p, Point3d q) => new(p.X-q.X,p.Y-q.Y,p.Z-q.Z);
    public static Point3d operator +(Point3d p, Vector3d v) => new(p.X+v.X,p.Y+v.Y,p.Z+v.Z);
}
internal record struct Vector3d(double X, double Y, double Z)
{
    public static Vector3d XAxis => new(1,0,0);
    public static Vector3d YAxis => new(0,1,0);
    public static Vector3d operator -(Vector3d a) => new(-a.X,-a.Y,-a.Z);
    public static Vector3d operator -(Vector3d a, Vector3d b) => new(a.X-b.X,a.Y-b.Y,a.Z-b.Z);
    public static double operator *(Vector3d a, Vector3d b) => a.X*b.X+a.Y*b.Y+a.Z*b.Z;
    public static Vector3d operator *(double k, Vector3d v) => new(k*v.X,k*v.Y,k*v.Z);
    public static Vector3d CrossProduct(Vector3d a, Vector3d b) => new(a.Y*b.Z-a.Z*b.Y,a.Z*b.X-a.X*b.Z,a.X*b.Y-a.Y*b.X);
    public double Length => Math.Sqrt(this*this);
    public bool Unitize() { double n=Length; if (n==0) return false; this=(1/n)*this; return true; }
}
internal sealed record Plane(Point3d Origin, Vector3d XAxis, Vector3d YAxis);
internal sealed record Ellipse(Plane Plane, double U, double V)
{
    public Curve ToNurbsCurve() => new() { Hole=this };
}
internal class Curve : IDisposable
{
    public Ellipse? Hole;
    public bool IsValid => true;
    public virtual bool IsClosed => true;
    public void Dispose() { }
}
internal class PolylineCurve(IEnumerable<Point3d> vertices) : Curve
{
    public Point3d[] Points = vertices.ToArray();
    public override bool IsClosed => Points[0] == Points[^1];
}
internal enum BrepLoopType { Outer, Inner }
internal record Loop(BrepLoopType LoopType);
internal class Face(int holes)
{
    public List<Loop> Loops = [new(BrepLoopType.Outer), ..Enumerable.Repeat(new Loop(BrepLoopType.Inner),holes)];
    public bool IsPlanar(double tol) => true;
}
internal class Brep(int holes) : IDisposable
{
    public bool IsValid => true;
    public bool IsSolid => !Extrusion.Open;
    public bool IsManifold => true;
    public List<Face> Faces = [new(0), new(holes), new(holes - (Extrusion.DropLoop ? 1 : 0))];
    public void Dispose() { }
}
internal class Extrusion : IDisposable
{
    public static bool Open, DropLoop, RejectInner;
    public static Extrusion? Last;
    public Point3d End, Start;
    public Vector3d Up;
    public PolylineCurve? Outer;
    public List<Ellipse> Holes = [];
    public int ProfileCount => 1 + Holes.Count;
    public int CapCount => 2;
    public bool IsValid => true;
    public bool SetPathAndUp(Point3d a, Point3d b, Vector3d up) { (Start,End,Up,Last)=(a,b,up,this); return true; }
    public bool SetOuterProfile(PolylineCurve c, bool cap) { Outer=c; return cap && c.IsClosed; }
    public bool AddInnerProfile(Curve c) { if (RejectInner) return false; Holes.Add(c.Hole!); return true; }
    public Brep ToBrep(bool splitKinks) => new(Holes.Count);
    public void Dispose() { }
}
