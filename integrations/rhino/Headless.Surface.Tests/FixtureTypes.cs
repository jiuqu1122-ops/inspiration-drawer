// Test doubles only. AABB slab fixtures stand in for native point classification;
// these types cannot load Rhino, perform a Boolean, open a document, or write a 3DM.
using Rhino.DocObjects;
using Rhino.Geometry;

namespace Rhino.Geometry
{
    internal readonly record struct Vector3d(double X, double Y, double Z);
    internal readonly record struct Point3d(double X, double Y, double Z)
    {
        public static Vector3d operator -(Point3d a, Point3d b) => new(a.X - b.X, a.Y - b.Y, a.Z - b.Z);
        public static Point3d operator +(Point3d a, Vector3d d) => new(a.X + d.X, a.Y + d.Y, a.Z + d.Z);
        public double DistanceToSquared(Point3d p) => Math.Pow(X - p.X, 2) + Math.Pow(Y - p.Y, 2) + Math.Pow(Z - p.Z, 2);
        public bool IsValid => double.IsFinite(X) && double.IsFinite(Y) && double.IsFinite(Z);
        public double DistanceTo(Point3d p) => Math.Sqrt(DistanceToSquared(p));
    }

    internal abstract record GeometryBase { public abstract uint DataCRC(uint seed); }
    internal record SubD : GeometryBase { public override uint DataCRC(uint seed) => seed ^ 17; }
    internal record Brep(double Left, double Right, bool IsManifold = true) : GeometryBase
    {
        public override uint DataCRC(uint seed) => seed ^ (uint)HashCode.Combine(Left, Right, IsManifold);
        public bool IsSolid => true;
        public bool IsValid => true;
        public Point3d ClosestPoint(Point3d p)
        {
            var q = new Point3d(Math.Clamp(p.X, Left, Right), Math.Clamp(p.Y, 0, 10), Math.Clamp(p.Z, 0, 10));
            if (p != q) return q;
            Point3d[] faces = [p with { X = Left }, p with { X = Right }, p with { Y = 0 }, p with { Y = 10 }, p with { Z = 0 }, p with { Z = 10 }];
            return faces.MinBy(p.DistanceTo);
        }
        public bool IsPointInside(Point3d p, double tolerance, bool strictlyIn)
        {
            double d = strictlyIn ? tolerance : -tolerance;
            return p.X > Left + d && p.X < Right - d && p.Y > d && p.Y < 10 - d && p.Z > d && p.Z < 10 - d;
        }
    }
}
namespace Rhino.DocObjects
{
    internal record RhinoObject(Guid Id, GeometryBase Geometry);
    internal class ObjectAttributes { }
}
namespace Rhino
{
    internal class RhinoDoc
    {
        public Table Objects { get; } = new();
        internal class Table
        {
            private readonly Dictionary<Guid, RhinoObject> rows = [];
            public Guid[] Ids => rows.Keys.ToArray();
            public Brep? SimulateDifferentStoredShape;
            public bool SimulateLostResultAfterDelete;
            public Guid? SimulateGeometryChangeOnDelete, SimulateLossOnDelete;
            private Guid lastAdded;
            public Guid AddBrep(Brep b, ObjectAttributes _) {
                lastAdded = Guid.NewGuid(); rows.Add(lastAdded, new(lastAdded, SimulateDifferentStoredShape ?? b)); return lastAdded;
            }
            public bool Delete(Guid id, bool _) {
                if (SimulateGeometryChangeOnDelete is Guid changed) rows[changed] = new(changed, new Brep(100, 120));
                if (SimulateLossOnDelete is Guid lost) rows.Remove(lost);
                if (SimulateLostResultAfterDelete) rows.Remove(lastAdded);
                return rows.Remove(id);
            }
            public RhinoObject? FindId(Guid id) => rows.GetValueOrDefault(id);
        }
    }
}
