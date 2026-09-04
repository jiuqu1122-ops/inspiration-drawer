export const shouldMountThreeSceneRenderer = (
  nodeId: string,
  activeNodeId?: string | null,
) => Boolean(nodeId) && nodeId === activeNodeId;

export const shouldExitThreeSceneInteraction = (
  activeNodeId: string | null | undefined,
  clickedInsideInteractiveNode: boolean,
) => Boolean(activeNodeId) && !clickedInsideInteractiveNode;
