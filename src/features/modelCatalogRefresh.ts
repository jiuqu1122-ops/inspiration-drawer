/**
 * Latest-started-wins across manual / focus / timer refreshes of ONE store.
 * React state dispatchers provide stable owner identity; a WeakMap avoids a
 * single process-wide sequence accidentally coupling different windows/stores.
 * This is a commit guard, not HTTP cancellation or a model-permission cache.
 */
export type CatalogRefreshTicket = Readonly<{ owner: object; token: symbol }>;
const latest = new WeakMap<object, symbol>();

export function beginCatalogRefresh(owner: object): CatalogRefreshTicket {
  const token = Symbol('catalog-refresh');
  latest.set(owner, token);
  return { owner, token };
}

export function isCurrentCatalogRefresh(ticket: CatalogRefreshTicket): boolean {
  return latest.get(ticket.owner) === ticket.token;
}

/** Cleanup for an old effect must not invalidate a newer manual refresh. */
export function cancelCatalogRefresh(ticket: CatalogRefreshTicket | undefined): void {
  if (ticket && isCurrentCatalogRefresh(ticket)) latest.delete(ticket.owner);
}

/** Logout/account reset invalidates every request started for this store. */
export function invalidateCatalogRefreshOwner(owner: object): void {
  latest.delete(owner);
}
