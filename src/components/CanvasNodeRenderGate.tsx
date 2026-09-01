import { memo, type ReactNode } from 'react';

export const areCanvasRenderDependenciesEqual = (
  previous: readonly unknown[],
  next: readonly unknown[],
) => previous.length === next.length
  && previous.every((value, index) => Object.is(value, next[index]));

export const CanvasNodeRenderGate = memo(function CanvasNodeRenderGate({
  render,
}: {
  dependencies: readonly unknown[];
  render: () => ReactNode;
}) {
  return render();
}, (previous, next) => areCanvasRenderDependenciesEqual(
  previous.dependencies,
  next.dependencies,
));
