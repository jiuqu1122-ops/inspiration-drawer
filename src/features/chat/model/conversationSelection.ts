export function selectConversationRange(order: string[], anchor: string, target: string, current: string[]) {
  const to = order.indexOf(target);
  const from = order.indexOf(anchor);
  if (to < 0) return current;
  const range = from < 0 ? [target] : order.slice(Math.min(from, to), Math.max(from, to) + 1);
  return [...new Set([...current, ...range])];
}
