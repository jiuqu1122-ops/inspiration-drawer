import React from 'react';
import type { AgentToolExecutionContext } from '../../agentModel';
import { BufferItem,Folder } from '../../../types';
import type { CanvasAiPromptPreset } from '../../../types/canvasWorkflow';
import { CANVAS_AI_DEFAULT_ASPECT_RATIO,normalizeCanvasAiAspectRatioForModel } from '../../../utils/canvasAiAspectRatio';
import { CANVAS_AI_DEFAULT_OUTPUT_FORMAT,CANVAS_AI_OUTPUT_FORMATS,normalizeCanvasAiProvider } from '../../../utils/canvasAiConfig';
import { canUseCanvasItemAsAiInput,canUseCanvasItemAsFrameInterpolationVideoInput,canUseCanvasItemAsImageEnhancementInput,canUseCanvasItemAsVideoEnhancementInput,isCanvasAgentTextTarget } from '../../../utils/canvasItemSelectors';
import { createCanvasImagePolicy,getImagePolicyFromRecord } from '../../../utils/canvasWorkflowDefinitions';
import { CANVAS_AI_MAX_OUTPUT_COUNT } from '../../canvasAiNodeLayout';
import { CANVAS_MAX_SCALE,CANVAS_MIN_SCALE,type CanvasImageItem,type CanvasItemBox } from '../../canvasModel';
import { setCanvasChatVisibility } from '../../chat/runtime/canvasChatVisibility';
import { clamp } from '../../common';
import { getDrawerFolderPathName } from '../../folderModel';
import { buildProductDesignPipelineAnalysisPrompt,buildProductDesignPipelineGeneratorPrompt,expandProductStyleSearchTerms,extractExplicitProductStyleTerms,filterExplicitStyleReferences,mapInspirationRoleToGeneratorRole,selectProductDesignReferencesByAxis,type ProductDesignSelectedReference } from '../../productDesignPipeline';
import { searchDrawerInspirations,type DrawerSearchInspirationsInput,type InspirationCandidate,type InspirationProfile } from '../inspirationMemory';

type canvasCreationToolContext = { AUTO_INSPIRATION_ANALYSIS_ENABLED: true; addDrawerMediaItemToCanvas: (itemId: string, client?: { x: number; y: number; }) => Promise<boolean>; analyzeDrawerInspirationWithLlm: (input: { itemId: string; imageSource?: string; existingProfile?: InspirationProfile; userTags?: string[]; userNotes?: string[]; forceRefresh?: boolean; }) => Promise<InspirationProfile>; appendCanvasItems: (nextItems: CanvasImageItem[], label: string, select?: boolean) => number; buildCanvasAiGeneratorNode: (pos: { x: number; y: number; }, preset?: CanvasAiPromptPreset, inputIds?: string[], mediaType?: "image" | "video") => CanvasImageItem; buildCanvasEnhancementNode: (pos: { x: number; y: number; }, mediaType: "image" | "video", inputIds?: string[]) => CanvasImageItem; buildCanvasFrameInterpolationNode: (pos: { x: number; y: number; }, inputIds?: string[]) => CanvasImageItem; canvasAiPromptPresets: CanvasAiPromptPreset[]; canvasItemsRef: React.RefObject<CanvasImageItem[]>; canvasScaleRef: React.RefObject<number>; canvasSelectedIdsRef: React.RefObject<string[]>; canvasSurfaceRef: React.RefObject<HTMLDivElement | null>; collectAgentBoundNodeIds: (value: unknown) => string[]; createAssetId: () => `${string}-${string}-${string}-${string}-${string}`; createCanvasTextItemFromContent: (content: string, index?: number, client?: { x: number; y: number; }) => CanvasImageItem | null; createDrawerMediaCanvasNode: (itemId: string, client?: { x: number; y: number; }, options?: { reuseExisting?: boolean; select?: boolean; toast?: boolean; label?: string; dropIndex?: number; }) => Promise<string>; duplicateCanvasItems: (ids?: string[], client?: { x: number; y: number; }) => number; enterCanvasMode: () => void; executionUserRequest: string; fitCanvasViewToItems: (ids?: string[]) => boolean; foldersRef: React.RefObject<Folder[]>; generateCanvasAiGeneratorNode: (targetId: string) => Promise<void>; generateCanvasWorkflowModuleNode: (targetId: string) => Promise<void>; getCanvasDropPosition: (index?: number, client?: { x: number; y: number; }) => { x: number; y: number; }; getCanvasItemsBounds: (ids: string[]) => CanvasItemBox | null; getSelectedCanvasAiInputIds: () => string[]; getSelectedEnhancementInputIds: (mediaType: "image" | "video") => string[]; getSelectedFrameInterpolationInputIds: () => string[]; hasSelectionSnapshot: boolean; isCanvasModeRef: React.RefObject<boolean>; itemsRef: React.RefObject<BufferItem[]>; makeCanvasNodeId: (seed: string, kind?: string) => string; pushCanvasUndoSnapshot: (label: string, options?: { layoutOnly?: boolean; shareImmutableItems?: boolean; }) => void; removeCanvasConnection: (targetId: string, sourceId: string, label?: string) => boolean; removeCanvasItemsByIds: (ids: string[], label?: string) => number; retrieveDrawerInspirationCandidates: (input: DrawerSearchInspirationsInput) => Promise<InspirationCandidate[]>; runCanvasTextAgentNode: (targetId: string) => Promise<void>; scheduleCanvasFocusItemById: (id?: string | null) => void; setCustomCanvasAiPromptPresets: React.Dispatch<React.SetStateAction<CanvasAiPromptPreset[]>>; showToast: (message: string) => void; snapshotSelectedIds: string[]; snapshotSurface: "canvas" | "drawer"; undoLastCanvasChange: () => boolean; updateCanvasItemsImmediate: (updater: (prev: CanvasImageItem[]) => CanvasImageItem[]) => CanvasImageItem[]; updateCanvasNodesForPreset: (preset: CanvasAiPromptPreset) => void; updateCanvasSelection: (ids: string[]) => void; zoomCanvasAt: (clientX: number, clientY: number, deltaY: number) => void; };

export const executeCanvasCreationTool = async (ctx: Pick<canvasCreationToolContext, 'AUTO_INSPIRATION_ANALYSIS_ENABLED' | 'addDrawerMediaItemToCanvas' | 'analyzeDrawerInspirationWithLlm' | 'appendCanvasItems' | 'buildCanvasAiGeneratorNode' | 'buildCanvasEnhancementNode' | 'buildCanvasFrameInterpolationNode' | 'canvasAiPromptPresets' | 'canvasItemsRef' | 'canvasScaleRef' | 'canvasSelectedIdsRef' | 'canvasSurfaceRef' | 'collectAgentBoundNodeIds' | 'createAssetId' | 'createCanvasTextItemFromContent' | 'createDrawerMediaCanvasNode' | 'duplicateCanvasItems' | 'enterCanvasMode' | 'executionUserRequest' | 'fitCanvasViewToItems' | 'foldersRef' | 'generateCanvasAiGeneratorNode' | 'generateCanvasWorkflowModuleNode' | 'getCanvasDropPosition' | 'getCanvasItemsBounds' | 'getSelectedCanvasAiInputIds' | 'getSelectedEnhancementInputIds' | 'getSelectedFrameInterpolationInputIds' | 'hasSelectionSnapshot' | 'isCanvasModeRef' | 'itemsRef' | 'makeCanvasNodeId' | 'pushCanvasUndoSnapshot' | 'removeCanvasConnection' | 'removeCanvasItemsByIds' | 'retrieveDrawerInspirationCandidates' | 'runCanvasTextAgentNode' | 'scheduleCanvasFocusItemById' | 'setCustomCanvasAiPromptPresets' | 'showToast' | 'snapshotSelectedIds' | 'snapshotSurface' | 'undoLastCanvasChange' | 'updateCanvasItemsImmediate' | 'updateCanvasNodesForPreset' | 'updateCanvasSelection' | 'zoomCanvasAt'>, name: string, args: Record<string, unknown>, _execution: AgentToolExecutionContext | undefined) => {
  const { AUTO_INSPIRATION_ANALYSIS_ENABLED, addDrawerMediaItemToCanvas, analyzeDrawerInspirationWithLlm, appendCanvasItems, buildCanvasAiGeneratorNode, buildCanvasEnhancementNode, buildCanvasFrameInterpolationNode, canvasAiPromptPresets, canvasItemsRef, canvasScaleRef, canvasSelectedIdsRef, canvasSurfaceRef, collectAgentBoundNodeIds, createAssetId, createCanvasTextItemFromContent, createDrawerMediaCanvasNode, duplicateCanvasItems, enterCanvasMode, executionUserRequest, fitCanvasViewToItems, foldersRef, generateCanvasAiGeneratorNode, generateCanvasWorkflowModuleNode, getCanvasDropPosition, getCanvasItemsBounds, getSelectedCanvasAiInputIds, getSelectedEnhancementInputIds, getSelectedFrameInterpolationInputIds, hasSelectionSnapshot, isCanvasModeRef, itemsRef, makeCanvasNodeId, pushCanvasUndoSnapshot, removeCanvasConnection, removeCanvasItemsByIds, retrieveDrawerInspirationCandidates, runCanvasTextAgentNode, scheduleCanvasFocusItemById, setCustomCanvasAiPromptPresets, showToast, snapshotSelectedIds, snapshotSurface, undoLastCanvasChange, updateCanvasItemsImmediate, updateCanvasNodesForPreset, updateCanvasSelection, zoomCanvasAt } = ctx;
if (name === 'canvas_manage') {
        const action = String(args.action || '');
        if (!isCanvasModeRef.current) enterCanvasMode();
        setCanvasChatVisibility(true);
        const requestedIds = Array.isArray(args.targetIds) ? args.targetIds.map(String) : [];
        const fallbackCanvasIds = hasSelectionSnapshot && snapshotSurface === 'canvas'
          ? snapshotSelectedIds
          : [...canvasSelectedIdsRef.current];
        const targetIds = requestedIds.length > 0 ? requestedIds : fallbackCanvasIds;
        const existingIds = new Set(canvasItemsRef.current.map(item => item.id));
        const validIds = targetIds.filter(id => existingIds.has(id));
        if (action === 'select_nodes') {
          updateCanvasSelection(validIds);
          return { action, selectedIds: validIds };
        }
        if (action === 'clear_selection') {
          updateCanvasSelection([]);
          return { action };
        }
        if (action === 'delete_nodes' || action === 'clear_canvas') {
          const ids = action === 'clear_canvas' ? canvasItemsRef.current.map(item => item.id) : validIds;
          if (ids.length === 0) throw new Error('没有找到要删除的画布节点');
          return { action, removed: removeCanvasItemsByIds(ids, action === 'clear_canvas' ? 'Agent 清空画布' : 'Agent 删除节点') };
        }
        if (action === 'duplicate_nodes') {
          if (validIds.length === 0) throw new Error('没有找到要复制的画布节点');
          return { action, duplicated: duplicateCanvasItems(validIds) };
        }
        if (action === 'move_nodes') {
          if (validIds.length === 0) throw new Error('没有找到要移动的画布节点');
          const deltaX = Number(args.deltaX || 0);
          const deltaY = Number(args.deltaY || 0);
          const absoluteX = typeof args.x === 'number' ? args.x : null;
          const absoluteY = typeof args.y === 'number' ? args.y : null;
          const anchor = canvasItemsRef.current.find(item => item.id === validIds[0]);
          const offsetX = absoluteX !== null && anchor ? absoluteX - anchor.x : deltaX;
          const offsetY = absoluteY !== null && anchor ? absoluteY - anchor.y : deltaY;
          pushCanvasUndoSnapshot('Agent 移动节点');
          const idSet = new Set(validIds);
          updateCanvasItemsImmediate(prev => prev.map(item => idSet.has(item.id) ? {
            ...item,
            x: Math.max(24, item.x + offsetX),
            y: Math.max(24, item.y + offsetY),
          } : item));
          return { action, moved: validIds.length, deltaX: offsetX, deltaY: offsetY };
        }
        if (action === 'resize_node') {
          const targetId = String(args.targetId || validIds[0] || '');
          const target = canvasItemsRef.current.find(item => item.id === targetId);
          if (!target) throw new Error('没有找到要缩放的节点');
          const width = Math.max(120, Number(args.width || target.width));
          const height = Math.max(96, Number(args.height || target.height));
          pushCanvasUndoSnapshot('Agent 调整节点大小');
          updateCanvasItemsImmediate(prev => prev.map(item => item.id === targetId ? { ...item, width, height } : item));
          return { action, targetId, width, height };
        }
        if (action === 'disconnect_nodes') {
          const sourceId = String(args.sourceId || '');
          const targetId = String(args.targetId || '');
          if (!removeCanvasConnection(targetId, sourceId, 'Agent 删除连接')) throw new Error('没有找到指定连接');
          return { action, sourceId, targetId };
        }
        if (action === 'focus_node') {
          const targetId = String(args.targetId || validIds[0] || '');
          if (!targetId) throw new Error('没有指定要聚焦的节点');
          scheduleCanvasFocusItemById(targetId);
          return { action, targetId };
        }
        if (action === 'fit_view') {
          window.requestAnimationFrame(() => fitCanvasViewToItems(validIds.length > 0 ? validIds : undefined));
          return { action, targetIds: validIds };
        }
        if (action === 'zoom') {
          const nextScale = clamp(Number(args.scale || canvasScaleRef.current || 1), CANVAS_MIN_SCALE, CANVAS_MAX_SCALE);
          const surface = canvasSurfaceRef.current;
          if (surface) {
            const rect = surface.getBoundingClientRect();
            const previous = canvasScaleRef.current || 1;
            const deltaY = -Math.log(nextScale / previous) / 0.0008;
            zoomCanvasAt(rect.left + rect.width / 2, rect.top + rect.height / 2, deltaY);
          }
          return { action, scale: nextScale };
        }
        if (action === 'undo') {
          if (!undoLastCanvasChange()) throw new Error('没有可撤回的画布操作');
          return { action };
        }
        if (action === 'add_drawer_items') {
          const drawerIds = [...new Set(requestedIds.map(String).filter(Boolean))];
          if (drawerIds.length === 0) throw new Error('没有找到可加入画布的抽屉图片或视频');
          let added = 0;
          for (const itemId of drawerIds) {
            if (await addDrawerMediaItemToCanvas(itemId)) added += 1;
          }
          if (added === 0) throw new Error('没有找到可加入画布的抽屉图片或视频');
          return { action, added };
        }
        if (action === 'update_node') {
          const ids = validIds.length > 0 ? validIds : [String(args.targetId || '')].filter(Boolean);
          if (ids.length === 0) throw new Error('没有找到要修改的节点');
          const idSet = new Set(ids);
          const nextName = String(args.name || '').trim();
          const nextModel = String(args.model || '').trim();
          const nextProvider = String(args.provider || '').trim();
          const nextAspectRatio = String(args.aspectRatio || '').trim();
          const nextOutputFormat = String(args.outputFormat || '').trim().toLowerCase();
          const rawCount = Number(args.count);
          pushCanvasUndoSnapshot('Agent 修改节点参数');
          updateCanvasItemsImmediate(prev => prev.map(item => {
            if (!idSet.has(item.id)) return item;
            return {
              ...item,
              item: nextName ? { ...item.item, name: nextName } : item.item,
              ai: item.ai ? {
                ...item.ai,
                ...(nextProvider ? { provider: normalizeCanvasAiProvider(nextProvider) } : {}),
                ...(nextModel ? { model: nextModel } : {}),
                ...(nextAspectRatio ? { aspectRatio: normalizeCanvasAiAspectRatioForModel(nextModel || item.ai.model, nextAspectRatio) } : {}),
                ...(CANVAS_AI_OUTPUT_FORMATS.includes(nextOutputFormat) ? { outputFormat: nextOutputFormat } : {}),
                ...(Number.isFinite(rawCount) ? { count: clamp(Math.round(rawCount), 1, CANVAS_AI_MAX_OUTPUT_COUNT) } : {}),
              } : item.ai,
            };
          }));
          return { action, updated: ids.length };
        }
        if (action === 'run_nodes') {
          if (validIds.length === 0) throw new Error('没有找到要运行的节点');
          for (const nodeId of validIds) {
            const node = canvasItemsRef.current.find(item => item.id === nodeId);
            if (!node) continue;
            if (node.ai?.type === 'workflow') await generateCanvasWorkflowModuleNode(nodeId);
            else if (isCanvasAgentTextTarget(node)) await runCanvasTextAgentNode(nodeId);
            else if (node.ai) await generateCanvasAiGeneratorNode(nodeId);
          }
          return { action, requestedNodeIds: validIds };
        }
        throw new Error(`不支持的画布管理操作：${action}`);
      }

      if (name === 'canvas_get_context') {
        return {
          selectedIds: [...canvasSelectedIdsRef.current],
          nodeCount: canvasItemsRef.current.length,
        };
      }

      if (name === 'canvas_create_design_pipeline') {
        const request = String(args.request || executionUserRequest || '').trim();
        if (!request) throw new Error('产品设计链路需要明确的设计需求');
        if (!isCanvasModeRef.current) enterCanvasMode();
        setCanvasChatVisibility(true);

        const referenceCount = 5;
        const projectBrief = args.projectBrief && typeof args.projectBrief === 'object'
          ? args.projectBrief as Record<string, unknown>
          : String(args.projectBrief || request);
        const folderNames = Object.fromEntries(foldersRef.current.map(folder => [
          folder.id,
          getDrawerFolderPathName(foldersRef.current, folder.id) || folder.name,
        ]));
        const explicitStyleTerms = extractExplicitProductStyleTerms(request);
        const expandedStyleSearchTerms = expandProductStyleSearchTerms(explicitStyleTerms);
        const searchTaggedReferences = (
          query: string,
          referenceRole: DrawerSearchInspirationsInput['referenceRole'],
        ) => searchDrawerInspirations(itemsRef.current, {
          query,
          projectBrief,
          folderNames,
          referenceRole,
          topK: 8,
        });
        const categoryCandidates = searchTaggedReferences(
          `${request}\n品类参考：同类产品、产品身份、核心功能和使用场景`,
          'SUBJECT_REF',
        );
        const formCandidates = searchTaggedReferences(
          `${request}\n造型参考：外轮廓、比例、体块、几何和曲面语言`,
          'FORM_REF',
        );
        const cmfCandidates = searchTaggedReferences(
          `${request}\n颜色与 CMF 参考：主色、配色、材质、表面处理和质感`,
          'CMF_REF',
        );
        const styleCandidates = explicitStyleTerms.length > 0
          ? filterExplicitStyleReferences(searchTaggedReferences(
            `${request}\n明确风格及相近标签：${expandedStyleSearchTerms.join('、')}，必须优先匹配已有风格标签`,
            'MOOD_REF',
          ), explicitStyleTerms)
          : [];
        const selectedReferences = selectProductDesignReferencesByAxis({
          category: categoryCandidates,
          form: formCandidates,
          color: [...styleCandidates, ...cmfCandidates],
          count: referenceCount,
        });
        const candidates = Array.from(new Map(
          [...categoryCandidates, ...formCandidates, ...styleCandidates, ...cmfCandidates]
            .map(candidate => [candidate.itemId, candidate]),
        ).values());
        const explicitInputIds = Array.isArray(args.inputIds)
          ? Array.from(new Set(args.inputIds.map(String))).filter(id => (
            canUseCanvasItemAsAiInput(canvasItemsRef.current.find(item => item.id === id))
          ))
          : [];
        const explicitInputBounds = explicitInputIds.length > 0 ? getCanvasItemsBounds(explicitInputIds) : null;
        const referenceBase = explicitInputBounds
          ? { x: explicitInputBounds.x + explicitInputBounds.width + 96, y: explicitInputBounds.y }
          : getCanvasDropPosition(0);
        const resolvedReferences: Array<{ match: ProductDesignSelectedReference; nodeId: string }> = [];

        for (let index = 0; index < selectedReferences.length; index += 1) {
          const match = selectedReferences[index];
          const nodeId = await createDrawerMediaCanvasNode(match.itemId, undefined, {
            reuseExisting: false,
            select: false,
            toast: false,
            dropIndex: index,
            label: 'Agent 自动加入设计意向图',
          });
          if (nodeId) resolvedReferences.push({ match, nodeId });
        }

        const referenceNodeIdSet = new Set(resolvedReferences.map(item => item.nodeId));
        if (referenceNodeIdSet.size > 0) {
          pushCanvasUndoSnapshot('Agent 整理设计意向图');
          updateCanvasItemsImmediate(prev => prev.map(item => {
            if (!referenceNodeIdSet.has(item.id)) return item;
            const referenceIndex = resolvedReferences.findIndex(reference => reference.nodeId === item.id);
            const width = 240;
            const aspectHeight = item.width > 0 ? width * (item.height / item.width) : 200;
            return {
              ...item,
              x: Math.max(24, referenceBase.x + (referenceIndex % 2) * 272),
              y: Math.max(24, referenceBase.y + Math.floor(referenceIndex / 2) * 216),
              width,
              height: clamp(aspectHeight, 148, 192),
            };
          }));
        }

        const referenceNodeIds = resolvedReferences.map(item => item.nodeId);
        const analysisInputIds = Array.from(new Set([...referenceNodeIds, ...explicitInputIds]));
        const analysisPrompt = buildProductDesignPipelineAnalysisPrompt({
          request,
          basePrompt: typeof args.analysisPrompt === 'string' ? args.analysisPrompt : undefined,
          references: resolvedReferences.map(item => item.match),
          explicitStyleTerms,
        });
        const analysisItemId = createAssetId();
        const analysisX = Math.max(24, referenceBase.x + 640);
        const analysisY = Math.max(24, referenceBase.y);
        const analysisNode: CanvasImageItem = {
          id: makeCanvasNodeId(analysisItemId, 'text'),
          item: {
            id: analysisItemId,
            type: 'text',
            content: analysisPrompt,
            name: '设计需求与意向图分析',
            createdAt: Date.now(),
            isQuickAccess: false,
          },
          inputs: analysisInputIds,
          textMode: 'agent',
          designAgentConfig: {
            agentRole: 'design_strategist',
            outputArtifactType: 'DesignStrategy',
            thinkingMode: 'analysis',
          },
          x: analysisX,
          y: analysisY,
          width: 560,
          height: 520,
        };

        const requestedPresetId = typeof args.presetId === 'string' ? args.presetId.trim() : '';
        const preset = canvasAiPromptPresets.find(item => item.id === requestedPresetId);
        const generatorPrompt = buildProductDesignPipelineGeneratorPrompt({
          request,
          basePrompt: typeof args.generatorPrompt === 'string' ? args.generatorPrompt : undefined,
        });
        const generatorInputIds = Array.from(new Set([analysisNode.id, ...analysisInputIds]));
        const generatorNode = buildCanvasAiGeneratorNode(
          { x: analysisX + 632, y: analysisY },
          preset,
          generatorInputIds,
          'image',
        );
        const visualReferenceIds = analysisInputIds.filter(id => (
          canUseCanvasItemAsImageEnhancementInput(canvasItemsRef.current.find(item => item.id === id))
        ));
        const autoReferenceRoles = resolvedReferences.map(({ match, nodeId }) => ({
          nodeId,
          role: mapInspirationRoleToGeneratorRole(match.recommendedRole),
        }));
        const explicitReferenceRoles = explicitInputIds
          .filter(id => visualReferenceIds.includes(id) && !referenceNodeIds.includes(id))
          .map(nodeId => ({ nodeId, role: 'SUBJECT_REF' as const }));
        const designReferencePlan = {
          references: resolvedReferences.map(({ match }) => ({
            itemId: match.itemId,
            role: match.recommendedRole,
            selectionAxis: match.selectionAxis,
            reason: match.reason,
            matchedFeatures: match.matchedFeatures,
            confidence: match.confidence,
          })),
        };
        const requestedSkillMeta = args.skillMeta && typeof args.skillMeta === 'object' && !Array.isArray(args.skillMeta)
          ? args.skillMeta as NonNullable<CanvasImageItem['ai']>['skillMeta']
          : undefined;
        const requestedProvider = typeof args.provider === 'string' ? args.provider.trim() : '';
        const requestedModel = typeof args.model === 'string' ? args.model.trim() : '';
        const requestedAspectRatio = typeof args.aspectRatio === 'string' ? args.aspectRatio.trim() : '';
        const requestedTargetSize = typeof args.targetSize === 'string' ? args.targetSize.trim() : '';
        const requestedResolution = typeof args.resolution === 'string' ? args.resolution.trim() : '';
        const requestedToolHint = typeof args.toolHint === 'string' ? args.toolHint.trim() : '';
        generatorNode.item = {
          ...generatorNode.item,
          content: generatorPrompt,
          name: '产品设计生图',
        };
        generatorNode.ai = {
          ...generatorNode.ai!,
          prompt: generatorPrompt,
          referenceImageNodeIds: visualReferenceIds,
          referenceRoles: [...autoReferenceRoles, ...explicitReferenceRoles],
          ...(requestedProvider ? { provider: normalizeCanvasAiProvider(requestedProvider) } : {}),
          ...(requestedModel ? { model: requestedModel } : {}),
          ...(requestedAspectRatio ? {
            aspectRatio: normalizeCanvasAiAspectRatioForModel(requestedModel || generatorNode.ai?.model, requestedAspectRatio),
          } : {}),
          ...(requestedTargetSize ? { targetSize: requestedTargetSize } : {}),
          ...(requestedResolution ? { resolution: requestedResolution } : {}),
          ...(requestedToolHint ? { toolHint: requestedToolHint } : {}),
          skillMeta: {
            ...(requestedSkillMeta || {}),
            skillId: requestedSkillMeta?.skillId || 'creative-product-design-skill',
            originalRequest: request,
            taskKind: 'product_design_pipeline',
            designReferencePlan,
            inspirationCandidates: candidates.map(candidate => ({
              itemId: candidate.itemId,
              state: referenceNodeIds.some((_, index) => resolvedReferences[index]?.match.itemId === candidate.itemId)
                ? 'selected'
                : candidate.state,
              confidence: candidate.confidence,
              referenceRole: candidate.recommendedRole,
              reason: candidate.reason,
            })),
          },
        };

        if (appendCanvasItems([analysisNode, generatorNode], 'Agent 创建产品设计分析与生图链路') <= 0) {
          throw new Error('创建产品设计链路失败');
        }
        updateCanvasItemsImmediate(prev => prev.map(item => {
          if (item.id === analysisNode.id) return { ...item, inputs: [...analysisInputIds] };
          if (item.id === generatorNode.id) return { ...item, inputs: [...generatorInputIds] };
          return item;
        }));
        const linkedAnalysisNode = canvasItemsRef.current.find(item => item.id === analysisNode.id);
        const missingAnalysisReferenceIds = referenceNodeIds.filter(id => !(linkedAnalysisNode?.inputs || []).includes(id));
        if (missingAnalysisReferenceIds.length > 0) {
          throw new Error(`设计分析节点缺少 ${missingAnalysisReferenceIds.length} 条参考图连接`);
        }
        updateCanvasSelection([generatorNode.id]);

        const autoRunGenerator = args.autoRunGenerator === true;
        const autoRunAnalysis = args.autoRunAnalysis !== false || autoRunGenerator;
        let analysisCompleted = false;
        if (autoRunAnalysis) {
          await runCanvasTextAgentNode(analysisNode.id);
          analysisCompleted = Boolean(canvasItemsRef.current.find(item => item.id === analysisNode.id)?.item.remark?.trim());
        }
        if (autoRunGenerator && analysisCompleted) {
          await generateCanvasAiGeneratorNode(generatorNode.id);
        }
        const latestGenerator = canvasItemsRef.current.find(item => item.id === generatorNode.id);
        if (resolvedReferences.length < referenceCount) {
          showToast(`仅找到 ${resolvedReferences.length} 张相关意向图，链路已按现有素材建立`);
        } else {
          showToast('已按品类、造型、颜色/风格检索 5 张意向图，并连接设计分析与生图节点');
        }
        return {
          nodeId: generatorNode.id,
          analysisNodeId: analysisNode.id,
          generatorNodeId: generatorNode.id,
          referenceNodeIds,
          analysisInputIds,
          selectedInspirationItemIds: resolvedReferences.map(item => item.match.itemId),
          requestedReferenceCount: referenceCount,
          resolvedReferenceCount: resolvedReferences.length,
          analysisCompleted,
          generatorAutoRunRequested: autoRunGenerator,
          generatorStatus: latestGenerator?.ai?.status,
          outputCount: latestGenerator?.ai?.outputs?.length || 0,
        };
      }

      if (name === 'canvas_create_generator') {
        const mediaType = args.mediaType === 'video' ? 'video' : 'image';
        const autoRun = args.autoRun === true;
        const presetId = typeof args.presetId === 'string' ? args.presetId : '';
        const preset = canvasAiPromptPresets.find(item => item.id === presetId);
        const sourceImageNodeId = typeof args.sourceImageNodeId === 'string'
          && canvasItemsRef.current.some(item => item.id === args.sourceImageNodeId)
          ? args.sourceImageNodeId
          : null;
        const explicitReferenceImageNodeIds = Array.isArray(args.referenceImageNodeIds)
          ? args.referenceImageNodeIds.map(String).filter(id => canvasItemsRef.current.some(item => item.id === id))
          : [];
        const inspirationSearch = args.inspirationSearch && typeof args.inspirationSearch === 'object' && !Array.isArray(args.inspirationSearch)
          ? args.inspirationSearch as Record<string, unknown>
          : null;
        const inspirationSearchQuery = String(inspirationSearch?.query || '').trim();
        const inspirationSearchBrief = inspirationSearch?.projectBrief && typeof inspirationSearch.projectBrief === 'object'
          ? inspirationSearch.projectBrief as Record<string, unknown>
          : String(inspirationSearch?.projectBrief || '');
        const inspirationCandidates = mediaType === 'image' && inspirationSearchQuery
          ? await retrieveDrawerInspirationCandidates({
            query: inspirationSearchQuery,
            projectBrief: inspirationSearchBrief,
            topK: Math.min(8, Math.max(1, Number(inspirationSearch?.topK) || 8)),
          })
          : [];
        const inspirationMatches = inspirationCandidates.filter(candidate => candidate.state === 'selected');
        const inspirationReferenceNodeIdsByMatch: Array<string | undefined> = [];
        for (const match of inspirationMatches) {
          try {
            const sourceItem = itemsRef.current.find(item => item.id === match.itemId);
            if (AUTO_INSPIRATION_ANALYSIS_ENABLED && sourceItem && !sourceItem.inspirationProfile) {
              await analyzeDrawerInspirationWithLlm({ itemId: match.itemId });
            }
          } catch (error) {
            console.warn('生成前灵感图分析失败:', match.itemId, error);
          }
          const nodeId = await createDrawerMediaCanvasNode(match.itemId, undefined, {
            reuseExisting: true,
            select: false,
            toast: false,
            label: 'Agent 相关灵感参考图',
          });
          inspirationReferenceNodeIdsByMatch.push(nodeId || undefined);
        }
        const inspirationReferenceNodeIdsFromSearch = inspirationReferenceNodeIdsByMatch.filter(
          (nodeId): nodeId is string => !!nodeId
        );
        const inspirationReferenceItemIds = Array.isArray(args.inspirationReferences)
          ? args.inspirationReferences.flatMap(reference => {
            if (!reference || typeof reference !== 'object' || Array.isArray(reference)) return [];
            const record = reference as Record<string, unknown>;
            const state = String(record.state || '').trim();
            if (state && state !== 'selected') return [];
            const itemId = String(record.itemId || '').trim();
            return itemId ? [itemId] : [];
          })
          : [];
        const inspirationReferenceNodeIdsFromArgs: string[] = [];
        for (const itemId of inspirationReferenceItemIds) {
          const existingNodeIds = canvasItemsRef.current
            .filter(item => item.id === itemId || item.item.sourceItemId === itemId)
            .map(item => item.id);
          if (existingNodeIds.length > 0) {
            inspirationReferenceNodeIdsFromArgs.push(...existingNodeIds);
            continue;
          }
          if (!itemsRef.current.some(item => item.id === itemId && item.type === 'image')) continue;
          const nodeId = await createDrawerMediaCanvasNode(itemId, undefined, {
            reuseExisting: true,
            select: false,
            toast: false,
            label: 'Agent 灵感参考图',
          });
          if (nodeId) inspirationReferenceNodeIdsFromArgs.push(nodeId);
        }
        const pendingInspirationCandidates = inspirationCandidates.filter(candidate => candidate.state === 'candidate');
        if (
          pendingInspirationCandidates.length > 0
          && inspirationMatches.length === 0
          && inspirationReferenceItemIds.length === 0
        ) {
          return {
            skipped: true,
            requiresInspirationConfirmation: true,
            inspirationCandidates,
            selectedInspirationItemIds: [],
          };
        }
        const inspirationReferenceNodeIds = Array.from(new Set([
          ...inspirationReferenceNodeIdsFromSearch,
          ...inspirationReferenceNodeIdsFromArgs,
        ]));
        const referenceImageNodeIds = Array.from(new Set([
          ...explicitReferenceImageNodeIds,
          ...inspirationReferenceNodeIdsFromSearch,
        ]));
        const referenceRoles = Array.isArray(args.referenceRoles)
          ? args.referenceRoles
            .map(role => {
              const record = role && typeof role === 'object' ? role as Record<string, unknown> : {};
              const nodeId = typeof record.nodeId === 'string' && canvasItemsRef.current.some(item => item.id === record.nodeId)
                ? record.nodeId
                : '';
              const roleValue = String(record.role || '');
              if (!nodeId || !['BASE', 'STYLE_REF', 'LAYOUT_REF', 'SUBJECT_REF', 'NONE'].includes(roleValue)) return null;
              return {
                nodeId,
                role: roleValue as 'BASE' | 'STYLE_REF' | 'LAYOUT_REF' | 'SUBJECT_REF' | 'NONE',
              };
            })
            .filter((role): role is NonNullable<typeof role> => !!role)
          : [];
        const searchReferenceRoles = inspirationMatches.flatMap((match, index) => {
          const nodeId = inspirationReferenceNodeIdsByMatch[index];
          if (!nodeId) return [];
          const role = match.recommendedRole === 'MOOD_REF'
            ? 'LAYOUT_REF'
            : match.recommendedRole === 'SUBJECT_REF'
              ? 'SUBJECT_REF'
              : 'STYLE_REF';
          return [{ nodeId, role } as const];
        });
        const mergedReferenceRoles = Array.from(new Map(
          [...referenceRoles, ...searchReferenceRoles].map(role => [role.nodeId, role])
        ).values());
        const roleInputIds = mergedReferenceRoles
          .filter(role => role.role !== 'NONE')
          .map(role => role.nodeId);
        const inputBindingsArg = args.inputBindings && typeof args.inputBindings === 'object' && !Array.isArray(args.inputBindings)
          ? args.inputBindings as Record<string, unknown>
          : {};
        const requestedInputCandidates = [
          ...(Array.isArray(args.inputIds) ? args.inputIds.map(String) : []),
          ...(Array.isArray(args.selectedReferenceImageNodeIds) ? args.selectedReferenceImageNodeIds.map(String) : []),
          ...inspirationReferenceNodeIds,
          ...collectAgentBoundNodeIds(inputBindingsArg.product_reference_image),
        ];
        const requestedInputs = Array.from(new Set(requestedInputCandidates))
          .filter(id => canvasItemsRef.current.some(item => item.id === id));
        const explicitInputIds = Array.from(new Set([
          ...requestedInputs,
          ...(sourceImageNodeId ? [sourceImageNodeId] : []),
          ...referenceImageNodeIds,
          ...roleInputIds,
        ]));
        const hasCanvasSelectionSnapshot = hasSelectionSnapshot && snapshotSurface === 'canvas';
        const snapshotInputIds = hasCanvasSelectionSnapshot
          ? snapshotSelectedIds.filter(id => canvasItemsRef.current.some(item => item.id === id))
          : [];
        const inputIds = explicitInputIds.length > 0
          ? explicitInputIds
          : (hasCanvasSelectionSnapshot ? snapshotInputIds : getSelectedCanvasAiInputIds());
        const inputBounds = inputIds.length > 0 ? getCanvasItemsBounds(inputIds) : null;
        const pos = inputBounds
          ? { x: inputBounds.x + inputBounds.width + 72, y: inputBounds.y }
          : getCanvasDropPosition(0);
        const node = buildCanvasAiGeneratorNode(pos, preset, inputIds, mediaType);
        const prompt = typeof args.prompt === 'string' ? args.prompt.trim() : '';
        const inspirationContext = inspirationMatches.length > 0
          ? [
            'Selected Inspiration References:',
            ...inspirationMatches.map((match, index) => [
              `${index + 1}. itemId: ${match.itemId}`,
              `Role: ${match.recommendedRole}`,
              `Reason: ${match.reason}`,
              match.matchedFeatures.length > 0 ? `Matched features: ${match.matchedFeatures.join(', ')}` : '',
            ].filter(Boolean).join('\n')),
            'Reference Roles:',
            inspirationMatches.map(match => `${match.itemId}=${match.recommendedRole}`).join(', '),
          ].join('\n')
          : '';
        const enrichedPrompt = inspirationContext && !/Selected Inspiration References:/i.test(prompt)
          ? `${prompt}\n\n${inspirationContext}`.trim()
          : prompt;
        const requestedAspectRatio = typeof args.aspectRatio === 'string' ? args.aspectRatio.trim() : '';
        const requestedTargetSize = typeof args.targetSize === 'string' ? args.targetSize.trim() : '';
        const requestedResolution = typeof args.resolution === 'string' ? args.resolution.trim() : '';
        const requestedToolHint = typeof args.toolHint === 'string' ? args.toolHint.trim() : '';
        const requestedSkillMeta = args.skillMeta && typeof args.skillMeta === 'object' && !Array.isArray(args.skillMeta)
          ? args.skillMeta as NonNullable<CanvasImageItem['ai']>['skillMeta']
          : undefined;
        const effectiveSkillMeta = inspirationCandidates.length > 0
          ? {
            ...(requestedSkillMeta || {}),
            inspirationCandidates: inspirationCandidates.map(candidate => ({
              itemId: candidate.itemId,
              state: candidate.state,
              confidence: candidate.confidence,
              referenceRole: candidate.recommendedRole,
              reason: candidate.reason,
              llmRanked: candidate.llmRanked === true,
              llmRecommended: candidate.llmRecommended,
            })),
            designReferencePlan: {
              references: inspirationMatches.map(match => ({
                itemId: match.itemId,
                role: match.recommendedRole,
                reason: match.reason,
                matchedFeatures: match.matchedFeatures,
                confidence: match.confidence,
              })),
            },
          }
          : requestedSkillMeta;
        const requestedImagePolicy = mediaType === 'image' ? getImagePolicyFromRecord(args.imagePolicy) : null;
        const nextAiPatch: Partial<NonNullable<CanvasImageItem['ai']>> = {
          ...(sourceImageNodeId ? { sourceImageNodeId } : {}),
          ...(referenceImageNodeIds.length > 0 ? { referenceImageNodeIds } : {}),
          ...(mergedReferenceRoles.length > 0 ? { referenceRoles: mergedReferenceRoles } : {}),
          ...(requestedTargetSize ? { targetSize: requestedTargetSize } : {}),
          ...(requestedToolHint ? { toolHint: requestedToolHint } : {}),
          ...(effectiveSkillMeta ? { skillMeta: effectiveSkillMeta } : {}),
          ...(requestedResolution ? { resolution: requestedResolution } : {}),
        };
        const aspectSource = requestedAspectRatio || requestedTargetSize;
        if (aspectSource) {
          nextAiPatch.aspectRatio = normalizeCanvasAiAspectRatioForModel(node.ai?.model, aspectSource);
        }
        node.ai = { ...node.ai!, ...nextAiPatch };
        if (enrichedPrompt) {
          node.item = {
            ...node.item,
            content: enrichedPrompt,
            name: enrichedPrompt.split(/\r?\n/)[0]?.slice(0, 24) || node.item.name,
          };
          node.ai = { ...node.ai!, prompt: enrichedPrompt };
        }
        if (requestedImagePolicy) {
          node.ai = {
            ...node.ai!,
            imagePolicy: createCanvasImagePolicy({
              hasReferenceImage: inputIds.length > 0,
              presetId: node.ai?.presetId,
              presetLabel: node.ai?.presetLabel,
              outputRole: typeof node.ai?.skillMeta?.workflowOutputType === 'string'
                ? node.ai.skillMeta.workflowOutputType
                : undefined,
              workflowTemplateId: typeof node.ai?.skillMeta?.workflowTemplateId === 'string'
                ? node.ai.skillMeta.workflowTemplateId
                : undefined,
              qualityProfileId: typeof node.ai?.skillMeta?.qualityProfileId === 'string'
                ? node.ai.skillMeta.qualityProfileId
                : undefined,
              prompt: [
                node.ai?.presetPrompt,
                node.ai?.prompt,
                node.item.content,
              ].filter(Boolean).join('\n'),
            }, requestedImagePolicy),
          };
        }
        if (appendCanvasItems([node], mediaType === 'video' ? 'Agent 创建视频节点' : 'Agent 创建生图节点') <= 0) {
          throw new Error('创建节点失败');
        }
        updateCanvasSelection([node.id]);
        if (autoRun) {
          await generateCanvasAiGeneratorNode(node.id);
        }
        const latestNode = canvasItemsRef.current.find(item => item.id === node.id);
        return {
          nodeId: node.id,
          mediaType,
          inputs: inputIds,
          autoRun,
          status: latestNode?.ai?.status,
          outputCount: latestNode?.ai?.outputs?.length || 0,
          inspirationCandidates,
          requiresInspirationConfirmation: inspirationCandidates.some(candidate => candidate.state === 'candidate'),
          selectedInspirationItemIds: inspirationMatches.map(match => match.itemId),
        };
      }

      if (name === 'canvas_create_media_tool') {
        const toolType = args.toolType === 'frame-interpolation'
          || args.toolType === 'image-enhancement'
          || args.toolType === 'video-enhancement'
          ? args.toolType
          : '';
        if (!toolType) throw new Error('请选择补帧、图增强或视增强');
        const mediaType = toolType === 'image-enhancement' ? 'image' : 'video';
        const isFrameInterpolation = toolType === 'frame-interpolation';
        const isValidInput = (source?: CanvasImageItem | null) => (
          isFrameInterpolation
            ? canUseCanvasItemAsFrameInterpolationVideoInput(source)
            : mediaType === 'video'
              ? canUseCanvasItemAsVideoEnhancementInput(source)
              : canUseCanvasItemAsImageEnhancementInput(source)
        );
        const requestedInputs = Array.isArray(args.inputIds)
          ? args.inputIds.map(String).filter(id => isValidInput(canvasItemsRef.current.find(item => item.id === id))).slice(0, 1)
          : [];
        const selectedInputs = isFrameInterpolation
          ? getSelectedFrameInterpolationInputIds()
          : getSelectedEnhancementInputIds(mediaType);
        const hasCanvasSelectionSnapshot = hasSelectionSnapshot && snapshotSurface === 'canvas';
        const snapshotInputIds = hasCanvasSelectionSnapshot
          ? snapshotSelectedIds.filter(id => isValidInput(canvasItemsRef.current.find(item => item.id === id))).slice(0, 1)
          : [];
        const inputIds = requestedInputs.length > 0
          ? requestedInputs
          : (hasCanvasSelectionSnapshot ? snapshotInputIds : selectedInputs);
        if (args.autoRun === true && inputIds.length === 0) {
          throw new Error(mediaType === 'video' ? '请先选择视频素材或视频生成结果' : '请先选择图片素材或图片生成结果');
        }
        const inputBounds = inputIds.length > 0 ? getCanvasItemsBounds(inputIds) : null;
        const pos = inputBounds
          ? { x: inputBounds.x + inputBounds.width + 72, y: inputBounds.y }
          : getCanvasDropPosition(0);
        const node = isFrameInterpolation
          ? buildCanvasFrameInterpolationNode(pos, inputIds)
          : buildCanvasEnhancementNode(pos, mediaType, inputIds);
        const label = isFrameInterpolation
          ? '补帧'
          : mediaType === 'video'
            ? '视频增强'
            : '图片增强';
        if (appendCanvasItems([node], 'Agent 创建' + label + '节点') <= 0) throw new Error('创建' + label + '节点失败');
        updateCanvasSelection([node.id]);
        if (args.autoRun === true) {
          await generateCanvasAiGeneratorNode(node.id);
        }
        const latest = canvasItemsRef.current.find(item => item.id === node.id);
        return {
          nodeId: node.id,
          toolType,
          inputIds,
          autoRun: args.autoRun === true,
          status: latest?.ai?.status,
          outputCount: latest?.ai?.outputs?.length || 0,
        };
      }

      if (name === 'canvas_create_preset') {
        const requestedPresetId = typeof args.presetId === 'string' ? args.presetId.trim() : '';
        const presetById = requestedPresetId
          ? canvasAiPromptPresets.find(item => item.id === requestedPresetId)
          : null;
        const rawLabel = typeof args.label === 'string' ? args.label.trim() : '';
        const label = (rawLabel || presetById?.label || '').slice(0, 24);
        const normalizedLabel = label.toLowerCase();
        const presetByLabel = normalizedLabel
          ? canvasAiPromptPresets.find(item => item.label.trim().toLowerCase() === normalizedLabel)
          : null;
        const existingPreset = presetById || presetByLabel || null;
        const prompt = typeof args.prompt === 'string' && args.prompt.trim()
          ? args.prompt.trim()
          : existingPreset?.prompt || '';
        if (!label || !prompt) throw new Error('节点预设需要名称和 Prompt');

        const requestedAspectRatio = typeof args.aspectRatio === 'string' ? args.aspectRatio.trim() : '';
        const requestedOutputFormat = typeof args.outputFormat === 'string' ? args.outputFormat.trim().toLowerCase() : '';
        const rawCount = typeof args.count === 'number' || typeof args.count === 'string'
          ? Number(args.count)
          : Number.NaN;
        const preset: CanvasAiPromptPreset = {
          id: existingPreset?.id || `custom-agent-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`,
          label,
          hint: typeof args.hint === 'string' && args.hint.trim()
            ? args.hint.trim().slice(0, 48)
            : existingPreset?.hint || 'Agent 创建的节点预设',
          prompt,
          aspectRatio: requestedAspectRatio
            ? normalizeCanvasAiAspectRatioForModel(null, requestedAspectRatio)
            : existingPreset?.aspectRatio || CANVAS_AI_DEFAULT_ASPECT_RATIO,
          outputFormat: CANVAS_AI_OUTPUT_FORMATS.includes(requestedOutputFormat)
            ? requestedOutputFormat
            : existingPreset?.outputFormat || CANVAS_AI_DEFAULT_OUTPUT_FORMAT,
          count: Number.isFinite(rawCount)
            ? clamp(Math.round(rawCount), 1, CANVAS_AI_MAX_OUTPUT_COUNT)
            : existingPreset?.count,
        };

        setCustomCanvasAiPromptPresets(prev => (
          prev.some(item => item.id === preset.id)
            ? prev.map(item => item.id === preset.id ? preset : item)
            : [...prev, preset]
        ));
        updateCanvasNodesForPreset(preset);

        let nodeId = '';
        if (args.createNode === true) {
          const mediaType = args.mediaType === 'video' ? 'video' : 'image';
          const requestedInputs = Array.isArray(args.inputIds)
            ? args.inputIds.map(String).filter(id => canvasItemsRef.current.some(item => item.id === id))
            : [];
          const hasCanvasSelectionSnapshot = hasSelectionSnapshot && snapshotSurface === 'canvas';
          const snapshotInputIds = hasCanvasSelectionSnapshot
            ? snapshotSelectedIds.filter(id => canvasItemsRef.current.some(item => item.id === id))
            : [];
          const inputIds = requestedInputs.length > 0
            ? requestedInputs
            : (hasCanvasSelectionSnapshot ? snapshotInputIds : getSelectedCanvasAiInputIds());
          const inputBounds = inputIds.length > 0 ? getCanvasItemsBounds(inputIds) : null;
          const pos = inputBounds
            ? { x: inputBounds.x + inputBounds.width + 72, y: inputBounds.y }
            : getCanvasDropPosition(0);
          const node = buildCanvasAiGeneratorNode(pos, preset, inputIds, mediaType);
          if (appendCanvasItems([node], 'Agent 创建节点预设') <= 0) throw new Error('创建预设节点失败');
          updateCanvasSelection([node.id]);
          nodeId = node.id;
        }

        showToast(`${existingPreset ? '已更新' : '已新增'}节点预设「${label}」`);
        return {
          presetId: preset.id,
          label: preset.label,
          updated: Boolean(existingPreset),
          createNode: args.createNode === true,
          nodeId: nodeId || undefined,
        };
      }

      if (name === 'canvas_add_text') {
        const content = typeof args.content === 'string' ? args.content.trim() : '';
        if (!content) throw new Error('文字内容不能为空');
        const node = createCanvasTextItemFromContent(content);
        if (!node || appendCanvasItems([node], 'Agent 添加文字节点') <= 0) throw new Error('添加文字节点失败');
        updateCanvasSelection([node.id]);
        return { nodeId: node.id };
      }
};
