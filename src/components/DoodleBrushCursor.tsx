type DoodleBrushCursorTool = 'brush' | 'eraser';

type DoodleBrushCursorProps = {
  visible: boolean;
  x: number;
  y: number;
  size: number;
  scale: number;
  color: string;
  tool: DoodleBrushCursorTool;
};

export function DoodleBrushCursor({
  visible,
  x,
  y,
  size,
  scale,
  color,
  tool,
}: DoodleBrushCursorProps) {
  if (!visible) return null;

  const diameter = Math.max(1, size * Math.max(0.01, scale));
  const borderColor = tool === 'eraser' ? 'rgba(0,0,0,0.45)' : color || 'rgba(0,0,0,0.45)';

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed rounded-full"
      style={{
        left: x,
        top: y,
        width: diameter,
        height: diameter,
        zIndex: 100130,
        transform: 'translate(-50%, -50%)',
        border: `1px ${tool === 'eraser' ? 'dashed' : 'solid'} ${borderColor}`,
        boxShadow: '0 0 0 1px rgba(255,255,255,0.8)',
      }}
    />
  );
}
