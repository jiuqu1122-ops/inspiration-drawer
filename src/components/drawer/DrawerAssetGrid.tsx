import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence } from 'framer-motion';

import type { BufferItem } from '../../types';
import {
  buildDrawerMasonryLayout,
  getDrawerContentBoxWidth,
  getDrawerMasonryColumnMetrics,
  type DrawerMasonryPosition,
  type MediaDimensions,
} from './mediaAspect';

const LOAD_AHEAD_PX = 640;
const VIRTUALIZATION_THRESHOLD = 80;
const VIRTUAL_OVERSCAN_PX = 900;
const MASONRY_GAP = 16;
let lastKnownDrawerGalleryWidth = 0;

type DrawerAssetGridProps = {
  items: BufferItem[];
  windowOffset: number;
  hasMore: boolean;
  isLoading: boolean;
  cardWidth: number;
  mediaHeight: number;
  resetKey: string;
  scrollContainer: HTMLDivElement | null;
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
  scrollContainer,
  onLoadMore,
  onLoadPrevious,
  onWheel,
  onVisibleItemsChange,
  renderItem,
}: DrawerAssetGridProps) => {
  const initialGalleryWidth = lastKnownDrawerGalleryWidth || cardWidth;
  const initialColumnMetrics = getDrawerMasonryColumnMetrics(
    initialGalleryWidth,
    cardWidth,
    MASONRY_GAP,
  );
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(1);
  const [galleryOffsetTop, setGalleryOffsetTop] = useState(0);
  const [galleryWidth, setGalleryWidth] = useState(initialGalleryWidth);
  const [columnCount, setColumnCount] = useState(initialColumnMetrics.columnCount);
  const [columnWidth, setColumnWidth] = useState(initialColumnMetrics.columnWidth);
  const [resolvedMediaDimensions, setResolvedMediaDimensions] = useState<Record<string, MediaDimensions>>({});
  const [measuredCardHeights, setMeasuredCardHeights] = useState<Record<string, number>>({});
  const galleryRef = useRef<HTMLDivElement | null>(null);
  const loadMoreSentinelRef = useRef<HTMLDivElement | null>(null);
  const itemNodesRef = useRef(new Map<string, HTMLDivElement>());
  const itemRefCallbacksRef = useRef(new Map<string, (node: HTMLDivElement | null) => void>());
  const itemResizeObserverRef = useRef<ResizeObserver | null>(null);
  const loadMoreRef = useRef(onLoadMore);
  const loadPreviousRef = useRef(onLoadPrevious);
  const hasMoreRef = useRef(hasMore);
  const windowOffsetRef = useRef(windowOffset);
  const isLoadingRef = useRef(isLoading);
  const frameRef = useRef<number | null>(null);

  useLayoutEffect(() => { loadMoreRef.current = onLoadMore; }, [onLoadMore]);
  useLayoutEffect(() => { loadPreviousRef.current = onLoadPrevious; }, [onLoadPrevious]);
  useLayoutEffect(() => { hasMoreRef.current = hasMore; }, [hasMore]);
  useLayoutEffect(() => { windowOffsetRef.current = windowOffset; }, [windowOffset]);
  useLayoutEffect(() => { isLoadingRef.current = isLoading; }, [isLoading]);

  const requestLoadMore = useCallback(() => {
    if (isLoadingRef.current || !hasMoreRef.current) return;
    // Lock synchronously. IntersectionObserver and a native scroll event can
    // run in the same frame before the loading prop has rendered.
    isLoadingRef.current = true;
    loadMoreRef.current();
  }, []);

  const requestLoadPrevious = useCallback(() => {
    if (isLoadingRef.current || windowOffsetRef.current <= 0) return;
    isLoadingRef.current = true;
    loadPreviousRef.current();
  }, []);

  useLayoutEffect(() => {
    const node = scrollContainer;
    if (!node) return;

    const updateMetrics = () => {
      const nextScrollTop = node.scrollTop || 0;
      setScrollTop(nextScrollTop);
      setViewportHeight(node.clientHeight || 1);
      // The gallery contains only absolutely positioned cards, so after
      // switching from canvas it can shrink-wrap to one card. Always derive
      // the real width from the scroll container's content box instead.
      const computedStyle = window.getComputedStyle(node);
      const availableWidth = getDrawerContentBoxWidth(
        node.clientWidth,
        Number.parseFloat(computedStyle.paddingLeft),
        Number.parseFloat(computedStyle.paddingRight),
      );
      const metrics = getDrawerMasonryColumnMetrics(availableWidth, cardWidth, MASONRY_GAP);
      lastKnownDrawerGalleryWidth = availableWidth;
      setGalleryWidth(availableWidth);
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
        if (windowOffsetRef.current > 0 && node.scrollTop <= LOAD_AHEAD_PX) {
          requestLoadPrevious();
        } else if (node.scrollTop + node.clientHeight >= node.scrollHeight - LOAD_AHEAD_PX) {
          requestLoadMore();
        }
      });
    };

    updateMetrics();
    // Switching back from canvas changes the parent flex direction and the
    // folder rail can still be in its 200 ms width transition. Measure again
    // after layout settles so the first transient 1 px width cannot leave the
    // masonry stuck at one column until the user zooms a card.
    let settleFrame = window.requestAnimationFrame(() => {
      updateMetrics();
      settleFrame = window.requestAnimationFrame(updateMetrics);
    });
    const settleTimer = window.setTimeout(updateMetrics, 240);
    const observer = typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(updateMetrics)
      : null;
    observer?.observe(node);
    if (galleryRef.current) observer?.observe(galleryRef.current);
    if (node.parentElement) observer?.observe(node.parentElement);
    node.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('resize', updateMetrics);
    return () => {
      if (frameRef.current !== null) window.cancelAnimationFrame(frameRef.current);
      window.cancelAnimationFrame(settleFrame);
      window.clearTimeout(settleTimer);
      observer?.disconnect();
      node.removeEventListener('scroll', handleScroll);
      window.removeEventListener('resize', updateMetrics);
    };
  }, [cardWidth, requestLoadMore, requestLoadPrevious, scrollContainer]);

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
    const node = scrollContainer;
    node?.scrollTo({ top: 0 });
    setScrollTop(0);
    setResolvedMediaDimensions({});
    setMeasuredCardHeights({});
  }, [resetKey, scrollContainer]);

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
    const node = scrollContainer;
    if (
      node
      && hasMore
      && !isLoading
      && node.scrollHeight <= node.clientHeight + LOAD_AHEAD_PX
    ) {
      requestLoadMore();
    }
  }, [hasMore, isLoading, items.length, masonryLayout.height, requestLoadMore, scrollContainer, viewportHeight]);

  useLayoutEffect(() => {
    const root = scrollContainer;
    const sentinel = loadMoreSentinelRef.current;
    if (!root || !sentinel || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some(entry => entry.isIntersecting)) requestLoadMore();
    }, {
      root,
      rootMargin: `0px 0px ${LOAD_AHEAD_PX}px 0px`,
      threshold: 0,
    });
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [requestLoadMore, resetKey, scrollContainer]);

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
        className="relative min-w-0 shrink-0 self-stretch"
        onWheel={onWheel}
        style={{
          width: galleryWidth,
          maxWidth: '100%',
          height: Math.max(1, masonryLayout.height),
        }}
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
      <div
        ref={loadMoreSentinelRef}
        data-drawer-load-more-sentinel="true"
        aria-hidden="true"
        className="h-px w-full shrink-0"
      />
      {isLoading && (
        <div className="mt-4 flex justify-center text-[11px] font-bold text-stone-400 dark:text-stone-500">
          正在加载…
        </div>
      )}
    </>
  );
});

DrawerAssetGrid.displayName = 'DrawerAssetGrid';
