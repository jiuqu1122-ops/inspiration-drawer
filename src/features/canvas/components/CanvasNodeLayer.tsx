import { useLayoutEffect, useRef } from 'react';
import { CanvasNodeRenderGate } from '../../../components/CanvasNodeRenderGate';
import { createCanvasNodeRenderScope, getCanvasNodeRenderDependencies } from '../canvasNodeRenderDependencies';
import { CanvasNode } from './CanvasNode';
import type { CanvasImageItem } from '../../canvasModel';

export type CanvasNodeLayerScope = Record<string, any>;

export function CanvasNodeLayer({ scope, canvasItemsRef }: { scope: CanvasNodeLayerScope; canvasItemsRef: { current: any[] } }) {
  const { canvasRenderableItems } = scope;
  const latestScope = useRef(scope);
  const actions = useRef(new Map<string, (...args: any[]) => any>());
  // Do not expose an interrupted concurrent render's actions to the old UI.
  useLayoutEffect(() => { latestScope.current = scope; }, [scope]);
  const renderScope = createCanvasNodeRenderScope(scope, latestScope, actions.current);
  return (
<>
{canvasRenderableItems.map((canvasItem: CanvasImageItem) => (
                          <CanvasNodeRenderGate
                            key={canvasItem.id}
                            dependencies={getCanvasNodeRenderDependencies(scope, canvasItem)}
                            render={() => <CanvasNode scope={renderScope} canvasItem={canvasItem} canvasItemsRef={canvasItemsRef} />}
                          />
                        ))}
</>
  );
}
