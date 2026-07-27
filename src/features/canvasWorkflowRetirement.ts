export const RETIRED_CANVAS_WORKFLOW_IDS = new Set([
  'industrial-design-full-process',
  'industrial-design-basic',
]);

export const isRetiredCanvasWorkflowId = (workflowId: string) => (
  RETIRED_CANVAS_WORKFLOW_IDS.has(workflowId)
);

export const removeRetiredCanvasWorkflows = <T extends { id: string }>(workflows: T[]) => (
  workflows.filter(workflow => !isRetiredCanvasWorkflowId(workflow.id))
);
