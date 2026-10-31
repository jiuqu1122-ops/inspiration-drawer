/** @deprecated Legacy preference key; snapshot mode no longer reads or writes storage. */
export const CANVAS_SNAPSHOT_MODE_KEY = 'inspiration.canvas.snapshotMode';

// Production always uses snapshots. Tests and profiling can explicitly override
// scope.canvasSnapshotMode in CanvasNodeLayer without a user-facing preference.
export const getCanvasSnapshotMode = (): boolean => true;

/** @deprecated Compatibility no-op. Use scope.canvasSnapshotMode for test/profiling baselines. */
export const setCanvasSnapshotMode = (_enabled: boolean): void => {};

export const useCanvasSnapshotMode = (): boolean => getCanvasSnapshotMode();
