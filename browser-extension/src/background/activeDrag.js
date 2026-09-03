export class ActiveDragStore {
  constructor(timeoutMs = 30_000) {
    this.timeoutMs = timeoutMs;
    this.activeDrag = null;
  }

  begin(payload, now = Date.now()) {
    const previous = this.activeDrag;
    this.activeDrag = {
      dragId: String(payload.dragId || ''),
      image: payload.image,
      startedAt: now,
    };
    return previous;
  }

  current(now = Date.now()) {
    if (this.activeDrag && now - this.activeDrag.startedAt > this.timeoutMs) {
      this.activeDrag = null;
    }
    return this.activeDrag;
  }

  clear(dragId = '') {
    if (dragId && this.activeDrag?.dragId !== dragId) return null;
    const previous = this.activeDrag;
    this.activeDrag = null;
    return previous;
  }
}
