import { invoke } from '@tauri-apps/api/core';
import React,{ startTransition } from 'react';
import { getAssetById,listAssets,updateAsset } from '../../services/assetsApi';
import { BufferItem,Folder } from '../../types';
import type { ImageThumbnailFileResult } from '../../types/canvasMedia';
import { optimizeCanvasAiInputDataUrl } from '../../utils/canvasImageData';
import { getCanvasAiOutputDisplaySource,getCanvasItemDisplaySource,getCanvasItemNavSource,isCanvasAgentTextTarget,isCanvasWorkflowReferenceBridge } from '../../utils/canvasItemSelectors';
import { getCanvasAiOutputPreviewSlots } from '../../utils/canvasWorkflowRuntime';
import { type AgentCanvasSelectionItem,type AgentCanvasVisualReference } from '../agentModel';
import { getCanvasAiMediaType,getCanvasAiNodeTitle } from '../canvasAiRuntime';
import { type CanvasImageItem } from '../canvasModel';
import { runInternalAgentModelRequest } from '../chat/runtime/agentModelResolution';
import { getDrawerFolderPathName } from '../folderModel';
import { AUTO_INSPIRATION_ANALYSIS_MAX_ATTEMPTS,INSPIRATION_ANALYSIS_IMAGE_MAX_EDGE,INSPIRATION_ANALYSIS_IMAGE_TARGET_BYTES,applyInspirationCandidateRanking,buildInspirationAnalysisRequest,buildInspirationCandidateRankingPrompt,extractJsonObject,getInspirationAnalysisSourceCandidates,hasUsableInspirationAiTags,isPermanentInspirationAnalysisFailure,normalizeInspirationProfile,searchDrawerInspirations,shouldRankInspirationCandidates,type DrawerSearchInspirationsInput,type InspirationAnalysisJob,type InspirationCandidate,type InspirationProfile } from './inspirationMemory';

type inspirationAgentActionContext = { canvasItemsRef: React.RefObject<CanvasImageItem[]>; getCanvasInputItemsForNode: (canvasItem: CanvasImageItem, sourceItems?: CanvasImageItem[]) => CanvasImageItem[]; getCanvasAgentVisualReferences: (canvasItem: CanvasImageItem) => AgentCanvasVisualReference[]; canvasSelectedIdsRef: React.RefObject<string[]>; getCanvasAgentVisualReferencesForNodeInputs: (canvasItem: CanvasImageItem, sourceItems?: CanvasImageItem[]) => AgentCanvasVisualReference[]; itemsRef: React.RefObject<BufferItem[]>; assetStorageMode: "initializing" | "sqlite" | "json"; imageSourceToDataUrl: (source: string, optimizeForAi?: boolean) => Promise<string>; inspirationRetrievalCacheRef: React.RefObject<Map<string, { createdAt: number; candidates: InspirationCandidate[]; }>>; updateAssetsFromQuery: (updatedAssets: BufferItem[]) => void; setItems: React.Dispatch<React.SetStateAction<BufferItem[]>>; AUTO_INSPIRATION_ANALYSIS_ENABLED: true; setAutoAiAnalysisRetryTick: React.Dispatch<React.SetStateAction<number>>; isAutoAiTaggableItem: (item: BufferItem) => boolean; autoInspirationAnalysisPendingIdsRef: React.RefObject<Set<string>>; autoInspirationAnalysisAttemptedRef: React.RefObject<Set<string>>; setAutoAiAnalysisProgress: React.Dispatch<React.SetStateAction<{ completed: number; failed: number; total: number; } | null>>; completed: number; total: number; inspirationAnalysisJobsRef: React.RefObject<Map<string, InspirationAnalysisJob>>; analyzeDrawerInspirationWithLlm: (input: { itemId: string; imageSource?: string; existingProfile?: InspirationProfile; userTags?: string[]; userNotes?: string[]; forceRefresh?: boolean; }) => Promise<InspirationProfile>; foldersRef: React.RefObject<Folder[]>; totalAssetCount: number; createdAt: number; candidates: InspirationCandidate[]; agentModelRef: React.RefObject<string>; content: string | undefined; };

type AgentOpenAiChatResult = {
  requestId?: string;
  content?: string;
  toolCalls?: Array<{ id?: string; name?: string; arguments?: string }>;
  finishReason?: string;
};

export const getCanvasAgentVisualReferencesImpl = (ctx: Record<never, never>, canvasItem: CanvasImageItem): AgentCanvasVisualReference[] => {
  const {  } = ctx;
    const references: AgentCanvasVisualReference[] = [];
    const seen = new Set<string>();
    const pushReference = (reference: AgentCanvasVisualReference) => {
      const key = [
        reference.nodeId,
        reference.outputId || '',
        reference.path || '',
        reference.source || '',
        reference.thumbnail || '',
      ].join('|');
      if (seen.has(key)) return;
      seen.add(key);
      references.push(reference);
    };

    if (canvasItem.item.type === 'image') {
      const source = getCanvasItemDisplaySource(canvasItem.item);
      if (source || canvasItem.item.path || canvasItem.item.thumbnail) {
        pushReference({
          id: `${canvasItem.id}:item`,
          nodeId: canvasItem.id,
          sourceItemId: canvasItem.item.sourceItemId,
          name: canvasItem.item.name || canvasItem.item.content || '选中图片',
          mediaType: 'image',
          sourceMediaType: 'image',
          source: source || canvasItem.item.thumbnail,
          path: canvasItem.item.path,
          thumbnail: getCanvasItemNavSource(canvasItem.item) || source || canvasItem.item.thumbnail,
        });
      }
    } else if (canvasItem.item.type === 'video' && canvasItem.item.thumbnail) {
      pushReference({
        id: `${canvasItem.id}:thumbnail`,
        nodeId: canvasItem.id,
        sourceItemId: canvasItem.item.sourceItemId,
        name: `${canvasItem.item.name || canvasItem.item.content || '选中视频'} 预览图`,
        mediaType: 'image',
        sourceMediaType: 'video',
        source: canvasItem.item.thumbnail,
        thumbnail: canvasItem.item.thumbnail,
      });
    }

    getCanvasAiOutputPreviewSlots(canvasItem)
      .filter(output => output.status === 'success')
      .forEach((output, outputIndex) => {
        const mediaType = output.mediaType || getCanvasAiMediaType(canvasItem.ai);
        const source = getCanvasAiOutputDisplaySource(output);
        if (mediaType === 'video') {
          const thumbnail = output.thumbnail?.trim();
          if (!thumbnail) return;
          pushReference({
            id: `${canvasItem.id}:${output.id || outputIndex}:video-preview`,
            nodeId: canvasItem.id,
            sourceItemId: output.id || canvasItem.item.sourceItemId,
            outputId: output.id || `${outputIndex}`,
            name: `${output.name || canvasItem.ai?.presetLabel || canvasItem.item.name || `节点输出视频 ${outputIndex + 1}`} 预览图`,
            mediaType: 'image',
            sourceMediaType: 'video',
            source: thumbnail,
            thumbnail,
          });
          return;
        }
        if (mediaType !== 'image' || !source) return;
        pushReference({
          id: `${canvasItem.id}:${output.id || outputIndex}`,
          nodeId: canvasItem.id,
          sourceItemId: output.id || canvasItem.item.sourceItemId,
          outputId: output.id || `${outputIndex}`,
          name: output.name || canvasItem.ai?.presetLabel || canvasItem.item.name || `节点输出图 ${outputIndex + 1}`,
          mediaType: 'image',
          sourceMediaType: 'image',
          source,
          path: output.path,
          thumbnail: source,
        });
      });

    return references;

};

export const getCanvasAgentVisualReferencesForNodeInputsImpl = (ctx: Pick<inspirationAgentActionContext, 'getCanvasAgentVisualReferences' | 'getCanvasInputItemsForNode'>, canvasItem: CanvasImageItem, sourceItems: CanvasImageItem[]) => {
  const { getCanvasAgentVisualReferences, getCanvasInputItemsForNode } = ctx;
    const references: AgentCanvasVisualReference[] = [];
    const seenReferenceIds = new Set<string>();
    const pushReference = (reference: AgentCanvasVisualReference) => {
      const key = [
        reference.id,
        reference.nodeId,
        reference.outputId || '',
        reference.path || '',
        reference.source || '',
        reference.thumbnail || '',
      ].join('|');
      if (seenReferenceIds.has(key)) return;
      seenReferenceIds.add(key);
      references.push(reference);
    };
    const visit = (inputItem: CanvasImageItem, seenNodeIds: Set<string>) => {
      if (seenNodeIds.has(inputItem.id)) return;
      seenNodeIds.add(inputItem.id);
      if (isCanvasWorkflowReferenceBridge(inputItem)) {
        getCanvasInputItemsForNode(inputItem, sourceItems).forEach(upstreamItem => visit(upstreamItem, seenNodeIds));
        return;
      }
      getCanvasAgentVisualReferences(inputItem).forEach(pushReference);
      if (!inputItem.ai && (inputItem.inputs || []).length > 0) {
        getCanvasInputItemsForNode(inputItem, sourceItems).forEach(upstreamItem => visit(upstreamItem, seenNodeIds));
      }
    };
    getCanvasInputItemsForNode(canvasItem, sourceItems)
      .forEach(inputItem => visit(inputItem, new Set([canvasItem.id])));
    return references;

};

export const buildCanvasAgentSelectedItemsImpl = (ctx: Pick<inspirationAgentActionContext, 'getCanvasAgentVisualReferences' | 'getCanvasAgentVisualReferencesForNodeInputs'>, sourceItems: CanvasImageItem[], sourceSelectedIds: string[]): AgentCanvasSelectionItem[] => {
  const { getCanvasAgentVisualReferences, getCanvasAgentVisualReferencesForNodeInputs } = ctx;
    const byId = new Map(sourceItems.map(item => [item.id, item]));
    return sourceSelectedIds.reduce<AgentCanvasSelectionItem[]>((items, id, index) => {
      const canvasItem = byId.get(id);
      if (!canvasItem) return items;
      const item = canvasItem.item;
      const references = getCanvasAgentVisualReferences(canvasItem);
      if (isCanvasAgentTextTarget(canvasItem)) {
        getCanvasAgentVisualReferencesForNodeInputs(canvasItem, sourceItems)
          .forEach(reference => {
            if (!references.some(existing => existing.id === reference.id)) references.push(reference);
          });
      }
      const primaryReference = references.find(reference => reference.thumbnail || reference.source);
      const thumbnail = primaryReference?.thumbnail
        || primaryReference?.source
        || (item.type === 'image' || item.type === 'video'
          ? getCanvasItemNavSource(item)
          : '');
      items.push({
        id,
        sourceItemId: item.sourceItemId,
        name: item.name || canvasItem.ai?.presetLabel || getCanvasAiNodeTitle(canvasItem.ai) || `选中素材 ${index + 1}`,
        type: String(canvasItem.ai?.type || item.type),
        thumbnail: thumbnail || undefined,
        status: canvasItem.ai?.status,
        prompt: canvasItem.ai?.prompt || item.content || undefined,
        referenceCount: references.length,
        references: references.length > 0 ? references : undefined,
      });
      return items;
    }, []);

};

export const analyzeDrawerInspirationWithLlmImpl = async (ctx: Pick<inspirationAgentActionContext, 'assetStorageMode' | 'imageSourceToDataUrl' | 'inspirationRetrievalCacheRef' | 'itemsRef' | 'setItems' | 'updateAssetsFromQuery'>, input: {
    itemId: string;
    imageSource?: string;
    existingProfile?: InspirationProfile;
    userTags?: string[];
    userNotes?: string[];
    forceRefresh?: boolean;
  }): Promise<InspirationProfile> => {
  const { assetStorageMode, imageSourceToDataUrl, inspirationRetrievalCacheRef, itemsRef, setItems, updateAssetsFromQuery } = ctx;
    const cachedItem = itemsRef.current.find(candidate => candidate.id === input.itemId);
    const item = cachedItem
      || (assetStorageMode === 'sqlite' ? await getAssetById(input.itemId) : null);
    if (!item) throw new Error(`灵感素材不存在：${input.itemId}`);
    if (item.type !== 'image') throw new Error('只有图片素材可以建立 InspirationProfile');
    if (
      hasUsableInspirationAiTags(item.inspirationProfile)
      && !input.forceRefresh
      && !input.existingProfile
    ) return item.inspirationProfile!;
    let generatedThumbnail = '';
    if (!input.imageSource && item.path) {
      try {
        const thumbnail = await invoke<ImageThumbnailFileResult>('ensure_image_thumbnail_file', {
          path: item.path,
          size: INSPIRATION_ANALYSIS_IMAGE_MAX_EDGE,
        });
        generatedThumbnail = String(thumbnail.url || thumbnail.path || '').trim();
      } catch (error) {
        console.warn('生成图片分析缩略图失败，使用本地文件压缩兜底:', item.id, error);
      }
    }
    const sourceCandidates = getInspirationAnalysisSourceCandidates({
      explicitSource: input.imageSource,
      generatedThumbnail,
      path: item.path,
      url: item.url,
      sourceUrl: item.sourceUrl,
      originalUrl: item.originalUrl,
      // Legacy inline thumbnails may be tiny, stale, or have the wrong aspect
      // ratio after migration, so they are strictly the final fallback.
      storedThumbnail: item.thumbnail,
    });
    if (sourceCandidates.length === 0) throw new Error('图片素材没有可读取的图像来源');
    let readableDataUrl = '';
    let usedGeneratedThumbnail = false;
    let lastSourceError: unknown;
    for (const source of sourceCandidates) {
      try {
        const candidate = await imageSourceToDataUrl(source, false);
        if (/^data:image\//i.test(candidate)) {
          readableDataUrl = candidate;
          usedGeneratedThumbnail = Boolean(generatedThumbnail && source === generatedThumbnail);
          break;
        }
      } catch (error) {
        lastSourceError = error;
      }
    }
    if (!readableDataUrl) {
      throw lastSourceError instanceof Error
        ? lastSourceError
        : new Error('图片素材没有可读取的图像来源');
    }
    // The native thumbnail worker has already decoded and resized local images
    // off the UI thread. Re-encoding that 512px JPEG through a WebView canvas
    // caused periodic input/scroll stalls while the background queue ran.
    const modelSource = usedGeneratedThumbnail
      ? readableDataUrl
      : await optimizeCanvasAiInputDataUrl(readableDataUrl, {
        maxEdge: INSPIRATION_ANALYSIS_IMAGE_MAX_EDGE,
        targetBytes: INSPIRATION_ANALYSIS_IMAGE_TARGET_BYTES,
      });
    if (!/^data:image\/|^https?:\/\//i.test(modelSource)) throw new Error('图片无法转换为 LLM 可读取的来源');
    const existingProfile = input.existingProfile || item.inspirationProfile;
    const userTags = (input.userTags || [])
      .map(value => String(value || '').trim().slice(0, 100))
      .filter(Boolean)
      .slice(0, 50);
    const userNotes = (input.userNotes || [])
      .map(value => String(value || '').trim().slice(0, 2_000))
      .filter(Boolean)
      .slice(0, 50);
    // The server selects the visual provider/model from the manager's encrypted
    // Provider Channel configuration. The desktop never supplies a tag-analysis API key.
    const serverProfile = await invoke<unknown>('agent_analyze_inspiration', {
      request: buildInspirationAnalysisRequest({
        itemId: item.id,
        imageSource: modelSource,
        userTags,
        userNotes,
        existingProfile,
      }),
    });
    const serverProfileRecord = serverProfile && typeof serverProfile === 'object' && !Array.isArray(serverProfile)
      ? serverProfile as Record<string, unknown>
      : {};
    const profile = normalizeInspirationProfile(serverProfileRecord.profile ?? serverProfile, {
      itemId: item.id,
      existingProfile,
      userTags,
      userNotes,
    });
    const updatedItem = { ...item, inspirationProfile: profile, inspirationAnalysisFailure: undefined };
    inspirationRetrievalCacheRef.current.clear();
    if (cachedItem) {
      const nextItems = itemsRef.current.map(candidate => candidate.id === item.id ? updatedItem : candidate);
      itemsRef.current = nextItems;
      startTransition(() => {
        if (assetStorageMode === 'sqlite') updateAssetsFromQuery([updatedItem]);
        else setItems(nextItems);
      });
    }
    if (assetStorageMode === 'sqlite') {
      await updateAsset(item.id, {
        metadata: updatedItem,
        clear_inspiration_analysis_failure: true,
      });
    }
    return profile;

};

export const recordAutoAiAnalysisFailureImpl = async (ctx: Pick<inspirationAgentActionContext, 'assetStorageMode' | 'itemsRef' | 'setItems' | 'updateAssetsFromQuery'>, itemId: string, error: unknown) => {
  const { assetStorageMode, itemsRef, setItems, updateAssetsFromQuery } = ctx;
    const message = String(error instanceof Error ? error.message : error || '图片分析失败')
      .replace(/data:image\/[^\s]+/gi, '[image data]')
      .replace(/([?&](?:token|key|signature|authorization)=)[^&\s]+/gi, '$1[REDACTED]')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 240);
    const cachedItem = itemsRef.current.find(candidate => candidate.id === itemId);
    const storedItem = cachedItem
      || (assetStorageMode === 'sqlite' ? await getAssetById(itemId) : null);
    if (!storedItem) return undefined;
    const attempts = Math.max(0, Number(storedItem.inspirationAnalysisFailure?.attempts) || 0) + 1;
    const recordedFailure: BufferItem['inspirationAnalysisFailure'] = {
      attemptedAt: Date.now(),
      attempts: isPermanentInspirationAnalysisFailure(message)
        ? AUTO_INSPIRATION_ANALYSIS_MAX_ATTEMPTS
        : attempts,
      message,
    };
    const updatedItem = { ...storedItem, inspirationAnalysisFailure: recordedFailure };
    const nextItems = itemsRef.current.map(candidate => {
      if (candidate.id !== itemId) return candidate;
      return updatedItem;
    });
    if (cachedItem) {
      itemsRef.current = nextItems;
      startTransition(() => {
        if (assetStorageMode === 'sqlite') updateAssetsFromQuery([updatedItem]);
        else setItems(nextItems);
      });
    }
    if (assetStorageMode === 'sqlite') {
      await updateAsset(itemId, { metadata: updatedItem });
    }
    return recordedFailure;

};

export const enqueueAutoAiTaggingForItemsImpl = (ctx: Pick<inspirationAgentActionContext, 'AUTO_INSPIRATION_ANALYSIS_ENABLED' | 'assetStorageMode' | 'autoInspirationAnalysisAttemptedRef' | 'autoInspirationAnalysisPendingIdsRef' | 'isAutoAiTaggableItem' | 'setAutoAiAnalysisProgress' | 'setAutoAiAnalysisRetryTick'>, incomingItems: BufferItem[]) => {
  const { AUTO_INSPIRATION_ANALYSIS_ENABLED, assetStorageMode, autoInspirationAnalysisAttemptedRef, autoInspirationAnalysisPendingIdsRef, isAutoAiTaggableItem, setAutoAiAnalysisProgress, setAutoAiAnalysisRetryTick } = ctx;
    if (!AUTO_INSPIRATION_ANALYSIS_ENABLED) return;
    if (assetStorageMode === 'sqlite') {
      setAutoAiAnalysisRetryTick(current => current + 1);
      return;
    }
    const newItemIds = incomingItems
      .filter(isAutoAiTaggableItem)
      .map(item => item.id)
      .filter(itemId => (
        !autoInspirationAnalysisPendingIdsRef.current.has(itemId)
        && !autoInspirationAnalysisAttemptedRef.current.has(itemId)
    ));
    if (newItemIds.length === 0) return;
    newItemIds.forEach(itemId => autoInspirationAnalysisPendingIdsRef.current.add(itemId));
    startTransition(() => {
      setAutoAiAnalysisProgress(current => (
        !current || current.completed >= current.total
          ? { completed: 0, failed: 0, total: newItemIds.length }
          : { ...current, total: current.total + newItemIds.length }
      ));
    });

};

export const startDrawerInspirationAnalysisBatchImpl = (ctx: Pick<inspirationAgentActionContext, 'analyzeDrawerInspirationWithLlm' | 'inspirationAnalysisJobsRef' | 'itemsRef'>, input: {
    itemIds: string[];
    forceRefresh?: boolean;
    priority?: 'low' | 'normal' | 'high';
  }) => {
  const { analyzeDrawerInspirationWithLlm, inspirationAnalysisJobsRef, itemsRef } = ctx;
    const itemIds = Array.from(new Set(input.itemIds.map(String).filter(Boolean))).filter(itemId => (
      itemsRef.current.some(item => item.id === itemId && item.type === 'image')
    ));
    if (itemIds.length === 0) throw new Error('批量分析没有有效的图片素材');
    const jobId = `inspiration_job_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    const createdAt = Date.now();
    inspirationAnalysisJobsRef.current.set(jobId, {
      jobId,
      status: 'queued',
      completed: 0,
      total: itemIds.length,
      errors: [],
      createdAt,
      updatedAt: createdAt,
    });
    const patchJob = (patch: Partial<InspirationAnalysisJob>) => {
      const current = inspirationAnalysisJobsRef.current.get(jobId);
      if (current) inspirationAnalysisJobsRef.current.set(jobId, { ...current, ...patch, updatedAt: Date.now() });
    };
    void (async () => {
      patchJob({ status: 'running' });
      for (const itemId of itemIds) {
        patchJob({ currentItemId: itemId });
        try {
          await analyzeDrawerInspirationWithLlm({ itemId, forceRefresh: input.forceRefresh });
        } catch (error) {
          const current = inspirationAnalysisJobsRef.current.get(jobId);
          patchJob({ errors: [...(current?.errors || []), { itemId, error: error instanceof Error ? error.message : String(error) }] });
        } finally {
          const current = inspirationAnalysisJobsRef.current.get(jobId);
          patchJob({ completed: Math.min(itemIds.length, (current?.completed || 0) + 1) });
        }
      }
      const completedJob = inspirationAnalysisJobsRef.current.get(jobId);
      patchJob({
        status: completedJob?.errors.length === itemIds.length ? 'failed' : 'completed',
        currentItemId: undefined,
      });
    })();
    return { jobId };

};

export const retrieveDrawerInspirationCandidatesImpl = async (ctx: Pick<inspirationAgentActionContext, 'agentModelRef' | 'assetStorageMode' | 'foldersRef' | 'inspirationRetrievalCacheRef' | 'itemsRef' | 'totalAssetCount'>, input: DrawerSearchInspirationsInput): Promise<InspirationCandidate[]> => {
  const { agentModelRef, assetStorageMode, foldersRef, inspirationRetrievalCacheRef, itemsRef, totalAssetCount } = ctx;
    const folderNames = Object.fromEntries(foldersRef.current.map(folder => [
      folder.id,
      getDrawerFolderPathName(foldersRef.current, folder.id) || folder.name,
    ]));
    const cacheKey = JSON.stringify({
      query: input.query.trim().toLowerCase(),
      projectBrief: input.projectBrief,
      referenceRole: input.referenceRole || '',
      folderIds: [...(input.folderIds || [])].sort(),
      topK: Math.min(8, Math.max(1, Number(input.topK) || 8)),
      itemCount: assetStorageMode === 'sqlite' ? totalAssetCount : itemsRef.current.length,
      folderNames,
    });
    const cached = inspirationRetrievalCacheRef.current.get(cacheKey);
    if (cached && Date.now() - cached.createdAt < 5 * 60 * 1000) return cached.candidates;
    const sourceAssets = assetStorageMode === 'sqlite'
      ? await listAssets({
          keyword: input.query.trim() || undefined,
          folder_ids: input.folderIds && input.folderIds.length > 0 ? input.folderIds : undefined,
          file_type: 'image',
          sort: 'updated_at_desc',
          limit: 1000,
        })
      : itemsRef.current;
    const candidates = searchDrawerInspirations(sourceAssets, {
      ...input,
      folderNames,
      topK: Math.min(8, Math.max(1, Number(input.topK) || 8)),
    });
    if (!shouldRankInspirationCandidates(candidates)) {
      inspirationRetrievalCacheRef.current.set(cacheKey, { createdAt: Date.now(), candidates });
      return candidates;
    }
    try {
      const requestId = `inspiration_rank_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
      const messages = [
        {
          role: 'system',
          content: 'Rank compact inspiration metadata. Return JSON only. Never request or analyze the source images.',
        },
        {
          role: 'user',
          content: buildInspirationCandidateRankingPrompt(input.query, candidates),
        },
      ];
      const result = await runInternalAgentModelRequest({
        savedModel: agentModelRef.current,
        usageContext: 'inspiration_analysis',
        requestId,
        createRequestId: () => `inspiration_rank_fallback_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
        request: requestModel => invoke<AgentOpenAiChatResult>('agent_openai_chat', {
          request: {
            requestId: requestModel.requestId,
            model: requestModel.model,
            usageContext: requestModel.usageContext,
            messages,
          },
        }),
      });
      const ranked = applyInspirationCandidateRanking(
        candidates,
        extractJsonObject(String(result.content || '')),
      );
      inspirationRetrievalCacheRef.current.set(cacheKey, { createdAt: Date.now(), candidates: ranked });
      return ranked;
    } catch (error) {
      console.warn('灵感候选轻量排序失败，保留本地 metadata 结果:', error);
      inspirationRetrievalCacheRef.current.set(cacheKey, { createdAt: Date.now(), candidates });
      return candidates;
    }

};
