import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence } from 'framer-motion';

import type { BufferItem } from '../../types';
import {
  buildDrawerMasonryLayout,
  getDrawerMasonryColumnMetrics,
  type DrawerMasonryPosition,
  type MediaDimensions,
} from './mediaAspect';

const LOAD_AHEAD_PX = 640;
const VIRTUALIZATION_THRESHOLD = 80;
const VIRTUAL_OVERSCAN_PX = 900;
const MASONRY_GAP = 16;

type DrawerAssetGridProps = {
  items: BufferItem[];
  windowOffset: number;
  hasMore: boolean;
  isLoading: boolean;
  cardWidth: number;
  mediaHeight: number;
  resetKey: string;
  scrollContainerRef: React.RefObject<HTMLDivElement | null>;
  onLoadMore: () => void;
  onLoadPrevious: () => void;
  onWheel: (event: React.WheelEvent<HTMLDivElement>) => void;
  onVisibleItemsChange?: (items: BufferItem[]) => void;
  renderItem: (
    item: BufferItem,
    optimizeLargeList: boolean,
    onMediaDimensionsResolved: (itemId: string, dimensions: MediaDimensions) => void,
  ) => React.ReactNode;
};

type VisibleMasonryItem = {
  item: BufferItem;
  position: DrawerMasonryPosition;
};

export const DrawerAssetGrid = React.memo(({
  items,
  windowOffset,
  hasMore,
  isLoading,
  cardWidth,
  mediaHeight,
  resetKey,
  scrollContainerRef,
  onLoadMore,
  onLoadPrevious,
  onWheel,
  onVisibleItemsChange,
  renderItem,
}: DrawerAssetGridProps) => {
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(1);
  const [galleryOffsetTop, setGalleryOffsetTop] = useState(0);
  const [columnCount, setColumnCount] = useState(1);
  const [columnWidth, setColumnWidth] = useState(cardWidth);
  const [resolvedMediaDimensions, setResolvedMediaDimensions] = useState<Record<string, MediaDimensions>>({});
  const [measuredCardHeights, setMeasuredCardHeights] = useState<Record<string, number>>({});
  const galleryRef = useRef<HTMLDivElement | null>(null);
  const itemNodesRef = useRef(new Map<string, HTMLDivElement>());
  const itemRefCallbacksRef = useRef(new Map<string, (node: HTMLDivElement | null) => void>());
  const itemResizeObserverRef = useRef<ResizeObserver | null>(null);
  const loadMoreRef = useRef(onLoadMore);
  const loadPreviousRef = useRef(onLoadPrevious);
  const hasMoreRef = useRef(hasMore);
  const windowOffsetRef = useRef(windowOffset);
  const isLoadingRef = useRef(isLoading);
  const frameRef = useRef<number | null>(null);

  useEffect(() => { loadMoreRef.current = onLoadMore; }, [onLoadMore]);
  useEffect(() => { loadPreviousRef.current = onLoadPrevious; }, [onLoadPrevious]);
  useEffect(() => { hasMoreRef.current = hasMore; }, [hasMore]);
  useEffect(() => { windowOffsetRef.current = windowOffset; }, [windowOffset]);
  useEffect(() => { isLoadingRef.current = isLoading; }, [isLoading]);

  useLayoutEffect(() => {
    const node = scrollContainerRef.current;
    if (!node) return;

    const updateMetrics = () => {
      const nextScrollTop = node.scrollTop || 0;
      setScrollTop(nextScrollTop);
      setViewportHeight(node.clientHeight || 1);
      // The scroll container includes its horizontal padding in clientWidth,
      // while the gallery is laid out inside that padding. Measuring the
      // container made the last masonry column extend underneath the right
      // edge and clipped the outermost card/actions.
      const availableWidth = Math.max(1, galleryRef.current?.clientWidth || node.clientWidth);
      const metrics = getDrawerMasonryColumnMetrics(availableWidth, cardWidth, MASONRY_GAP);
      setColumnCount(metrics.columnCount);
      setColumnWidth(metrics.columnWidth);
      const gallery = galleryRef.current;
      if (gallery) {
        const nodeRect = node.getBoundingClientRect();
        const galleryRect = gallery.getBoundingClientRect();
        setGalleryOffsetTop(galleryRect.top - nodeRect.top + nextScrollTop);
      }
    };
    const handleScroll = () => {
      if (frameRef.current !== null) return;
      frameRef.current = window.requestAnimationFrame(() => {
        frameRef.current = null;
        updateMetrics();
        if (!isLoadingRef.current) {
          if (windowOffsetRef.current > 0 && node.scrollTop <= LOAD_AHEAD_PX) {
            loadPreviousRef.current();
          } else if (
            hasMoreRef.current
            && node.scrollTop + node.clientHeight >= node.scrollHeight - LOAD_AHEAD_PX
          ) {
            loadMoreRef.current();
          }
        }
      });
    };

    updateMetrics();
    const observer = typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(updateMetrics)
      : null;
    observer?.observe(node);
    if (galleryRef.current) observer?.observe(galleryRef.current);
    node.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('resize', updateMetrics);
    return () => {
      if (frameRef.current !== null) window.cancelAnimationFrame(frameRef.current);
      observer?.disconnect();
      node.removeEventListener('scroll', handleScroll);
      window.removeEventListener('resize', updateMetrics);
    };
  }, [cardWidth, scrollContainerRef]);

  useLayoutEffect(() => {
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver((entries) => {
      setMeasuredCardHeights(current => {
        let next = current;
        entries.forEach((entry) => {
          const itemId = (entry.target as HTMLElement).dataset.masonryItemId;
          const height = Math.ceil(entry.target.getBoundingClientRect().height);
          if (!itemId || height <= 0 || Math.abs((current[itemId] || 0) - height) <= 1) return;
          if (next === current) next = { ...current };
          next[itemId] = height;
        });
        return next;
      });
    });
    itemResizeObserverRef.current = observer;
    itemNodesRef.current.forEach(node => observer.observe(node));
    return () => {
      observer.disconnect();
      itemResizeObserverRef.current = null;
    };
  }, []);

  const getItemRef = useCallback((itemId: string) => {
    const existing = itemRefCallbacksRef.current.get(itemId);
    if (existing) return existing;
    const callback = (node: HTMLDivElement | null) => {
      const previous = itemNodesRef.current.get(itemId);
      if (previous && previous !== node) itemResizeObserverRef.current?.unobserve(previous);
      if (!node) {
        itemNodesRef.current.delete(itemId);
        return;
      }
      itemNodesRef.current.set(itemId, node);
      itemResizeObserverRef.current?.observe(node);
    };
    itemRefCallbacksRef.current.set(itemId, callback);
    return callback;
  }, []);

  useEffect(() => {
    const node = scrollContainerRef.current;
    node?.scrollTo({ top: 0 });
    setScrollTop(0);
    setResolvedMediaDimensions({});
    setMeasuredCardHeights({});
  }, [resetKey, scrollContainerRef]);

  const handleMediaDimensionsResolved = useCallback((itemId: string, dimensions: MediaDimensions) => {
    setResolvedMediaDimensions(current => {
      const previous = current[itemId];
      if (previous?.width === dimensions.width && previous?.height === dimensions.height) return current;
      return { ...current, [itemId]: dimensions };
    });
  }, []);

  const masonryLayout = useMemo(() => buildDrawerMasonryLayout(items, {
    columnCount,
    columnWidth,
    gap: MASONRY_GAP,
    fallbackMediaHeight: mediaHeight,
    resolvedMediaDimensions,
    measuredCardHeights,
  }), [columnCount, columnWidth, items, measuredCardHeights, mediaHeight, resolvedMediaDimensions]);

  useEffect(() => {
    const node = scrollContainerRef.current;
    if (
      node
      && hasMore
      && !isLoading
      && node.scrollHeight <= node.clientHeight + LOAD_AHEAD_PX
    ) {
      loadMoreRef.current();
    }
  }, [hasMore, isLoading, items.length, masonryLayout.height, scrollContainerRef, viewportHeight]);

  const canVirtualize = items.length >= VIRTUALIZATION_THRESHOLD;
  const visibleMasonryItems = useMemo<VisibleMasonryItem[]>(() => {
    const viewportTop = Math.max(0, scrollTop - galleryOffsetTop - VIRTUAL_OVERSCAN_PX);
    const viewportBottom = Math.max(
      viewportTop,
      scrollTop - galleryOffsetTop + viewportHeight + VIRTUAL_OVERSCAN_PX,
    );
    const result: VisibleMasonryItem[] = [];
    items.forEach((item, index) => {
      const position = masonryLayout.positions[index];
      if (!position) return;
      if (
        canVirtualize
        && (position.top + position.height < viewportTop || position.top > viewportBottom)
      ) return;
      result.push({ item, position });
    });
    return result;
  }, [canVirtualize, galleryOffsetTop, items, masonryLayout.positions, scrollTop, viewportHeight]);
  const optimizeLargeList = canVirtualize || visibleMasonryItems.length > 80;

  useEffect(() => {
    onVisibleItemsChange?.(visibleMasonryItems.map(entry => entry.item));
  }, [onVisibleItemsChange, visibleMasonryItems]);

  return (
    <>
      <div
        ref={galleryRef}
        data-drawer-gallery="true"
        className="relative w-full shrink-0"
        onWheel={onWheel}
        style={{ height: Math.max(1, masonryLayout.height) }}
      >
        <AnimatePresence mode={optimizeLargeList ? 'sync' : 'popLayout'}>
          {visibleMasonryItems.map(({ item, position }) => (
            <div
              key={item.id}
              ref={getItemRef(item.id)}
              data-masonry-item-id={item.id}
              className="absolute left-0 top-0"
              style={{
                width: position.width,
                transform: `translate3d(${position.left}px, ${position.top}px, 0)`,
                transition: optimizeLargeList ? undefined : 'transform 180ms cubic-bezier(0.16, 1, 0.3, 1)',
              }}
            >
              {renderItem(item, optimizeLargeList, handleMediaDimensionsResolved)}
            </div>
          ))}
        </AnimatePresence>
      </div>
      {isLoading && (
        <div className="mt-4 flex justify-center text-[11px] font-bold text-stone-400 dark:text-stone-500">
          正在加载…
        </div>
      )}
    </>
  );
});

DrawerAssetGrid.displayName = 'DrawerAssetGrid';
