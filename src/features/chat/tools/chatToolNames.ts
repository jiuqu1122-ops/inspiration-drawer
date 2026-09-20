/**
 * Names emitted by older Chat sessions remain accepted after a tool rename.
 */
const CHAT_TOOL_ALIASES: Record<string, string> = {
  get_canvas_selected_shapes: 'get_canvas_selection',
};

export const normalizeChatToolName = (name: string) => (
  CHAT_TOOL_ALIASES[name] || name
);
