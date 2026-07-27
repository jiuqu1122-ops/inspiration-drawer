export type CanvasReferencePublication<TShare> = {
  urls: string[];
  shareIds: TShare[];
};

type PublishCanvasReferences<TShare> = (
  sources: string[],
) => Promise<CanvasReferencePublication<TShare>>;

type CleanupCanvasReferences<TShare> = (shareIds: TShare[]) => Promise<unknown>;

const DEFAULT_REFERENCE_BATCH_SIZE = 2;

export const publishCanvasReferencesInOrder = async <TShare>(
  sources: string[],
  publish: PublishCanvasReferences<TShare>,
  cleanup: CleanupCanvasReferences<TShare>,
  batchSize = DEFAULT_REFERENCE_BATCH_SIZE,
): Promise<CanvasReferencePublication<TShare>> => {
  if (sources.length === 0) return { urls: [], shareIds: [] };

  const safeBatchSize = Math.max(1, Math.floor(batchSize));
  const urls: string[] = [];
  const shareIds: TShare[] = [];
  const cleanupSafely = async (ids: TShare[]) => {
    if (ids.length === 0) return;
    try {
      await cleanup(ids);
    } catch {
      // Cleanup is best effort and must not hide the upload error.
    }
  };
  const publishExactBatch = async (batch: string[]) => {
    const published = await publish(batch);
    const publishedUrls = published.urls
      .map(url => String(url || '').trim())
      .filter(Boolean);
    if (publishedUrls.length !== batch.length) {
      await cleanupSafely(published.shareIds);
      throw new Error(`公网图床返回 ${publishedUrls.length} 张参考图，预期 ${batch.length} 张。`);
    }
    return {
      urls: publishedUrls,
      shareIds: published.shareIds,
    };
  };
  const appendPublication = (published: CanvasReferencePublication<TShare>) => {
    urls.push(...published.urls);
    shareIds.push(...published.shareIds);
  };

  try {
    for (let offset = 0; offset < sources.length; offset += safeBatchSize) {
      const batch = sources.slice(offset, offset + safeBatchSize);
      try {
        appendPublication(await publishExactBatch(batch));
      } catch (batchError) {
        if (batch.length === 1) throw batchError;

        // Large generated images can exceed an intermediary request-body limit
        // when encoded together. Retry the failed batch one image at a time
        // while retaining the original reference order.
        for (const source of batch) {
          appendPublication(await publishExactBatch([source]));
        }
      }
    }
    return { urls, shareIds };
  } catch (error) {
    await cleanupSafely(shareIds);
    throw error;
  }
};
