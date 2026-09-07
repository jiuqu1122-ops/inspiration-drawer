import React from 'react';
import type { AgentToolExecutionContext } from '../../agentModel';
import type { WorkflowInputResolution } from '../commands/workflowInputResolver';
import { normalizeCanvasWorkflowTemplate } from '../../../services/canvasTemplateStorage';
import { CANVAS_AI_DEFAULT_ASPECT_RATIO,normalizeCanvasAiAspectRatioForModel } from '../../../utils/canvasAiAspectRatio';
import { CANVAS_AI_DEFAULT_OUTPUT_FORMAT,CANVAS_AI_OUTPUT_FORMATS,getCanvasAiDefaultModel,getReferenceImageWorkflowAiConfig } from '../../../utils/canvasAiConfig';
import { canUseCanvasItemAsAiInput,canUseCanvasItemAsAiTarget,canUseCanvasItemAsReferenceBridgeInput,isCanvasAgentTextTarget } from '../../../utils/canvasItemSelectors';
import { buildCanvasProductDetailsWorkflowTemplate,buildIndustrialDesignReviewWorkflowTemplateFromDefinition,CANVAS_PRODUCT_DETAILS_NODE_IDS,doesWorkflowExplicitlyRequestProductAnalysis,isCanvasProductDetailsWorkflowIntent,validateCanvasWorkflowTemplate } from '../../../utils/canvasWorkflowDefinitions';
import { CANVAS_AI_MAX_OUTPUT_COUNT,getCanvasAiNodeAutoSize } from '../../canvasAiNodeLayout';
import { type CanvasAiProvider,type CanvasImageItem,type CanvasItemBox } from '../../canvasModel';
import { type CanvasWorkflowNodeTemplate,type CanvasWorkflowSaveDraft,type CanvasWorkflowTemplate } from '../../canvasTemplates';
import { clamp } from '../../common';
import { normalizeDesignAgentConfig } from '../../designAgentNode';
import { INDUSTRIAL_DESIGN_FULL_PROCESS_WORKFLOW_ID } from '../../workflows/industrialDesignFullProcessWorkflow';
import { convertWorkflowDraftToDefinition } from '../kernel/appAgentKernel';
import type { WorkflowOutputSpec,WorkflowRecipeDraft,WorkflowTextPolicy } from '../workflows/workflowRecipeTypes';

type canvasWorkflowToolContext = { activeWorkflowDraftId: string | null; activeWorkflowDraftRef: React.RefObject<WorkflowRecipeDraft | null>; appendCanvasItems: (nextItems: CanvasImageItem[], label: string, select?: boolean) => number; attachAgentWorkflowInputsToModule: (nodeId: string) => Promise<{ inputIds: string[]; resolution: WorkflowInputResolution; createdNodeIds: string[]; } | null>; buildCanvasWorkflowModuleNode: (workflow: CanvasWorkflowTemplate, pos: { x: number; y: number; }, inputIds?: string[]) => CanvasImageItem | null; buildCanvasWorkflowSaveDraftFromSelection: (defaultName: string) => CanvasWorkflowSaveDraft | null; canvasAiProvider: CanvasAiProvider; canvasItemsRef: React.RefObject<CanvasImageItem[]>; canvasSelectedIdsRef: React.RefObject<string[]>; canvasTextAreaRefs: React.RefObject<Record<string, HTMLTextAreaElement | null>>; canvasWorkflowTemplates: CanvasWorkflowTemplate[]; collectAgentBoundNodeIds: (value: unknown) => string[]; connectCanvasItems: (sourceId: string, targetId: string) => boolean; createAssetId: () => `${string}-${string}-${string}-${string}-${string}`; createdNodeIds: string[]; enterCanvasMode: () => void; executionUserRequest: string; generateCanvasWorkflowModuleNode: (targetId: string) => Promise<void>; getCanvasDropPosition: (index?: number, client?: { x: number; y: number; }) => { x: number; y: number; }; getCanvasItemsBounds: (ids: string[]) => CanvasItemBox | null; getExistingCanvasIds: (ids: string[]) => string[]; getSelectedCanvasAiInputIds: () => string[]; hasSelectionSnapshot: boolean; inputIds: string[]; isCanvasModeRef: React.RefObject<boolean>; makeCanvasNodeId: (seed: string, kind?: string) => string; organizeCanvasItems: (ids?: string[]) => number; pushCanvasUndoSnapshot: (label: string, options?: { layoutOnly?: boolean; shareImmutableItems?: boolean; }) => void; resolution: WorkflowInputResolution; resolveAgentWorkflowInputIds: (workflow: CanvasWorkflowTemplate, requestedInputIds?: string[], options?: { allowMissingRequired?: boolean; useImplicitInputs?: boolean; allowRecentCanvasFallback?: boolean; }) => Promise<{ inputIds: string[]; resolution: WorkflowInputResolution; createdNodeIds: string[]; }>; runCanvasTextAgentNode: (targetId: string) => Promise<void>; runSelectedCanvasWorkflowModules: (seedIds?: string[]) => Promise<void>; setActiveDraftForDisplay: React.Dispatch<React.SetStateAction<WorkflowRecipeDraft | null>>; setActiveWorkflowDraftId: React.Dispatch<React.SetStateAction<string | null>>; setCustomCanvasWorkflows: React.Dispatch<React.SetStateAction<CanvasWorkflowTemplate[]>>; setShowWorkflowDraftPanel: React.Dispatch<React.SetStateAction<boolean>>; showToast: (message: string) => void; snapshotSelectedIds: string[]; snapshotSurface: "canvas" | "drawer"; uniqueAgentIds: (ids: string[]) => string[]; updateCanvasAiGeneratorData: (nodeId: string, patch: Partial<NonNullable<CanvasImageItem["ai"]>>, content?: string) => CanvasImageItem | undefined; updateCanvasItemsImmediate: (updater: (prev: CanvasImageItem[]) => CanvasImageItem[]) => CanvasImageItem[]; updateCanvasSelection: (ids: string[]) => void; updateCanvasTextItem: (canvasId: string, content: string) => void; };

export const executeCanvasWorkflowTool = async (ctx: Pick<canvasWorkflowToolContext, 'activeWorkflowDraftId' | 'activeWorkflowDraftRef' | 'appendCanvasItems' | 'attachAgentWorkflowInputsToModule' | 'buildCanvasWorkflowModuleNode' | 'buildCanvasWorkflowSaveDraftFromSelection' | 'canvasAiProvider' | 'canvasItemsRef' | 'canvasSelectedIdsRef' | 'canvasTextAreaRefs' | 'canvasWorkflowTemplates' | 'collectAgentBoundNodeIds' | 'connectCanvasItems' | 'createAssetId' | 'enterCanvasMode' | 'executionUserRequest' | 'generateCanvasWorkflowModuleNode' | 'getCanvasDropPosition' | 'getCanvasItemsBounds' | 'getExistingCanvasIds' | 'getSelectedCanvasAiInputIds' | 'hasSelectionSnapshot' | 'isCanvasModeRef' | 'makeCanvasNodeId' | 'organizeCanvasItems' | 'pushCanvasUndoSnapshot' | 'resolveAgentWorkflowInputIds' | 'runCanvasTextAgentNode' | 'runSelectedCanvasWorkflowModules' | 'setActiveDraftForDisplay' | 'setActiveWorkflowDraftId' | 'setCustomCanvasWorkflows' | 'setShowWorkflowDraftPanel' | 'showToast' | 'snapshotSelectedIds' | 'snapshotSurface' | 'uniqueAgentIds' | 'updateCanvasAiGeneratorData' | 'updateCanvasItemsImmediate' | 'updateCanvasSelection' | 'updateCanvasTextItem'>, name: string, args: Record<string, unknown>, _execution: AgentToolExecutionContext | undefined) => {
  const { activeWorkflowDraftId, activeWorkflowDraftRef, appendCanvasItems, attachAgentWorkflowInputsToModule, buildCanvasWorkflowModuleNode, buildCanvasWorkflowSaveDraftFromSelection, canvasAiProvider, canvasItemsRef, canvasSelectedIdsRef, canvasTextAreaRefs, canvasWorkflowTemplates, collectAgentBoundNodeIds, connectCanvasItems, createAssetId, enterCanvasMode, executionUserRequest, generateCanvasWorkflowModuleNode, getCanvasDropPosition, getCanvasItemsBounds, getExistingCanvasIds, getSelectedCanvasAiInputIds, hasSelectionSnapshot, isCanvasModeRef, makeCanvasNodeId, organizeCanvasItems, pushCanvasUndoSnapshot, resolveAgentWorkflowInputIds, runCanvasTextAgentNode, runSelectedCanvasWorkflowModules, setActiveDraftForDisplay, setActiveWorkflowDraftId, setCustomCanvasWorkflows, setShowWorkflowDraftPanel, showToast, snapshotSelectedIds, snapshotSurface, uniqueAgentIds, updateCanvasAiGeneratorData, updateCanvasItemsImmediate, updateCanvasSelection, updateCanvasTextItem } = ctx;
if (name === 'canvas_create_text_agent') {
        const prompt = typeof args.prompt === 'string' ? args.prompt.trim() : '';
        if (!prompt) throw new Error('文字 Agent 节点需要需求 prompt');
        const designAgentConfig = normalizeDesignAgentConfig(args.designAgentConfig);
        const requestedInputs = Array.isArray(args.inputIds)
          ? args.inputIds.map(String).filter(id => {
            const item = canvasItemsRef.current.find(canvasItem => canvasItem.id === id);
            return canUseCanvasItemAsAiInput(item);
          })
          : [];
        const hasCanvasSelectionSnapshot = hasSelectionSnapshot && snapshotSurface === 'canvas';
        const snapshotInputIds = hasCanvasSelectionSnapshot
          ? snapshotSelectedIds.filter(id => canUseCanvasItemAsAiInput(canvasItemsRef.current.find(canvasItem => canvasItem.id === id)))
          : [];
        const inputIds = requestedInputs.length > 0
          ? requestedInputs
          : (hasCanvasSelectionSnapshot ? snapshotInputIds : getSelectedCanvasAiInputIds());
        const inputBounds = inputIds.length > 0 ? getCanvasItemsBounds(inputIds) : null;
        const pos = inputBounds
          ? { x: inputBounds.x + inputBounds.width + 72, y: inputBounds.y }
          : getCanvasDropPosition(0);
        const itemId = createAssetId();
        const title = prompt.split(/\r?\n/)[0]?.slice(0, 32) || 'Agent 文字节点';
        const node: CanvasImageItem = {
          id: makeCanvasNodeId(itemId, 'text'),
          item: {
            id: itemId,
            type: 'text',
            content: prompt,
            name: title,
            createdAt: Date.now(),
            isQuickAccess: false,
          },
          inputs: inputIds,
          textMode: 'agent',
          designAgentConfig,
          x: Math.max(24, pos.x),
          y: Math.max(24, pos.y),
          width: 560,
          height: 520,
        };
        if (appendCanvasItems([node], 'Agent 创建文字生成节点') <= 0) throw new Error('创建文字 Agent 节点失败');
        updateCanvasSelection([node.id]);
        if (args.autoRun === true) {
          await runCanvasTextAgentNode(node.id);
        }
        const latest = canvasItemsRef.current.find(item => item.id === node.id);
        return {
          nodeId: node.id,
          inputIds,
          autoRun: args.autoRun === true,
          designAgentConfig,
          outputLength: latest?.item.remark?.length || 0,
        };
      }

      if (name === 'canvas_run_text_agent') {
        const requestedNodeId = typeof args.nodeId === 'string' ? args.nodeId.trim() : '';
        const node = requestedNodeId
          ? canvasItemsRef.current.find(item => item.id === requestedNodeId)
          : canvasItemsRef.current.find(item => canvasSelectedIdsRef.current.includes(item.id) && isCanvasAgentTextTarget(item));
        if (!node || !isCanvasAgentTextTarget(node)) throw new Error('请先指定或选中一个 Agent 文字节点');
        await runCanvasTextAgentNode(node.id);
        const latest = canvasItemsRef.current.find(item => item.id === node.id);
        return { nodeId: node.id, outputLength: latest?.item.remark?.length || 0 };
      }

      if (name === 'canvas_apply_workflow') {
        const workflowId = typeof args.workflowId === 'string' ? args.workflowId.trim() : '';
        const workflowName = typeof args.workflowName === 'string' ? args.workflowName.trim().toLowerCase() : '';
        const workflow = canvasWorkflowTemplates.find(item => item.id === workflowId)
          || canvasWorkflowTemplates.find(item => item.label.toLowerCase() === workflowName)
          || canvasWorkflowTemplates.find(item => workflowName && item.label.toLowerCase().includes(workflowName));
        if (!workflow) throw new Error('没有找到指定工作流');
        const requestedInputs = Array.isArray(args.inputIds)
          ? args.inputIds.map(String).filter(id => canvasItemsRef.current.some(item => item.id === id))
          : [];
        const isLocalIndustrialDesignWorkflow = workflow.id === INDUSTRIAL_DESIGN_FULL_PROCESS_WORKFLOW_ID;
        const projectBrief = typeof args.projectBrief === 'string' && args.projectBrief.trim()
          ? args.projectBrief.trim()
          : executionUserRequest;
        const preflight = await resolveAgentWorkflowInputIds(workflow, requestedInputs, {
          allowMissingRequired: isLocalIndustrialDesignWorkflow,
          allowRecentCanvasFallback: !isLocalIndustrialDesignWorkflow,
        });
        if (!isCanvasModeRef.current) enterCanvasMode();
        const inputBounds = preflight.inputIds.length > 0 ? getCanvasItemsBounds(preflight.inputIds) : null;
        const base = inputBounds
          ? { x: inputBounds.x + inputBounds.width + 96, y: inputBounds.y }
          : getCanvasDropPosition(0);
        const moduleNode = buildCanvasWorkflowModuleNode(workflow, base, preflight.inputIds);
        if (!moduleNode) throw new Error('添加工作流失败');
        if (projectBrief) {
          moduleNode.item = { ...moduleNode.item, content: projectBrief };
          moduleNode.ai = {
            ...(moduleNode.ai || { type: 'workflow' as const }),
            type: 'workflow' as const,
            skillMeta: {
              ...(moduleNode.ai?.skillMeta || {}),
              originalRequest: projectBrief,
            },
          };
        }
        if (appendCanvasItems([moduleNode], 'Agent 添加工作流') <= 0) throw new Error('添加工作流失败');
        updateCanvasSelection([moduleNode.id]);
        return {
          workflowId: workflow.id,
          nodeId: moduleNode.id,
          inputs: preflight.inputIds,
          workflowAutoConnections: preflight.resolution.autoConnections,
          workflowInputResolution: preflight.resolution.workflowInputResolution,
          createdInputNodeIds: preflight.createdNodeIds,
          projectBriefIncluded: Boolean(projectBrief),
        };
      }

      if (name === 'canvas_create_workflow_draft') {
        const workflowDraftArg = args.workflowDraft && typeof args.workflowDraft === 'object' && !Array.isArray(args.workflowDraft)
          ? args.workflowDraft as WorkflowRecipeDraft
          : null;
        if (!workflowDraftArg) throw new Error('canvas_create_workflow_draft requires workflowDraft argument');
        const draftId = 'draft-' + Date.now().toString(36) + '-' + Math.random().toString(36).substring(2, 6);
        const inputBindingsArg = args.inputBindings && typeof args.inputBindings === 'object' && !Array.isArray(args.inputBindings)
          ? args.inputBindings as Record<string, unknown>
          : {};
        const selectedReferenceImageNodeIds = getExistingCanvasIds([
          ...(Array.isArray(args.selectedReferenceImageNodeIds) ? args.selectedReferenceImageNodeIds.map(String) : []),
          ...collectAgentBoundNodeIds(inputBindingsArg.product_reference_image),
        ]).filter(id => canUseCanvasItemAsReferenceBridgeInput(canvasItemsRef.current.find(item => item.id === id)));
        const draft: WorkflowRecipeDraft = {
          ...workflowDraftArg,
          id: draftId,
          metadata: {
            ...workflowDraftArg.metadata,
            ...(selectedReferenceImageNodeIds.length > 0 ? { selectedReferenceImageNodeIds } : {}),
          },
        };
        if (args.languagePolicy && typeof args.languagePolicy === 'object') {
          draft.languagePolicy = { ...draft.languagePolicy, ...(args.languagePolicy as WorkflowTextPolicy) };
        }
        activeWorkflowDraftRef.current = draft;
        setActiveWorkflowDraftId(draftId);
        setActiveDraftForDisplay(draft);
        setShowWorkflowDraftPanel(true);
        return {
          draftId,
          workflowDraft: draft,
          createdAt: Date.now(),
          outputCount: draft.outputs.filter(o => o.enabled !== false).length,
          languagePolicy: draft.languagePolicy,
        };
      }

      if (name === 'canvas_update_workflow_draft') {
        const action = typeof args.action === 'string' ? args.action : '';
        const currentDraft = activeWorkflowDraftRef.current;
        if (!currentDraft) throw new Error('没有激活的工作流草稿，请先创建草稿 (canvas_create_workflow_draft)');
        if (activeWorkflowDraftId !== currentDraft.id) {
          setActiveWorkflowDraftId(currentDraft.id);
        }
        let updatedDraft: WorkflowRecipeDraft = { ...currentDraft, outputs: [...currentDraft.outputs] };

        if (action === 'add_output') {
          const outputSpec = args.outputSpec && typeof args.outputSpec === 'object' && !Array.isArray(args.outputSpec)
            ? args.outputSpec as WorkflowOutputSpec
            : null;
          if (!outputSpec) throw new Error('add_output requires outputSpec');
          updatedDraft.outputs = [...updatedDraft.outputs.filter(o => o.id !== outputSpec.id), outputSpec];
        } else if (action === 'remove_output') {
          const outputId = typeof args.outputId === 'string' ? args.outputId : '';
          updatedDraft.outputs = updatedDraft.outputs.map(o =>
            o.id === outputId ? { ...o, enabled: false } : o
          );
        } else if (action === 'update_output_prompt') {
          const outputId = typeof args.outputId === 'string' ? args.outputId : '';
          const outputSpec = args.outputSpec && typeof args.outputSpec === 'object' && !Array.isArray(args.outputSpec)
            ? args.outputSpec as Partial<WorkflowOutputSpec>
            : {};
          // Support __APPEND__:<text> prefix to append to existing prompt
          const specWithResolvedPrompt = outputSpec.prompt && typeof outputSpec.prompt === 'string' && outputSpec.prompt.startsWith('__APPEND__:')
            ? {
                ...outputSpec,
                prompt: undefined, // handled below
              }
            : outputSpec;
          const appendText = outputSpec.prompt && typeof outputSpec.prompt === 'string' && outputSpec.prompt.startsWith('__APPEND__:')
            ? outputSpec.prompt.slice('__APPEND__:'.length)
            : null;
          updatedDraft.outputs = updatedDraft.outputs.map(o => {
            if (o.id !== outputId) return o;
            const base = { ...o, ...specWithResolvedPrompt };
            return appendText ? { ...base, prompt: o.prompt.includes(appendText) ? o.prompt : o.prompt + appendText } : base;
          });
        } else if (action === 'set_language') {
          const languagePolicy = args.languagePolicy && typeof args.languagePolicy === 'object' && !Array.isArray(args.languagePolicy)
            ? args.languagePolicy as Partial<WorkflowTextPolicy>
            : null;
          if (!languagePolicy) throw new Error('set_language requires languagePolicy');
          updatedDraft.languagePolicy = { ...updatedDraft.languagePolicy, ...languagePolicy };
        } else if (action === 'set_aspect_ratio') {
          const aspectRatioSpec = args.outputSpec && typeof args.outputSpec === 'object' && !Array.isArray(args.outputSpec)
            ? args.outputSpec as Partial<WorkflowOutputSpec>
            : {};
          const newRatio = typeof aspectRatioSpec.aspectRatio === 'string' ? aspectRatioSpec.aspectRatio : '';
          if (newRatio) {
            updatedDraft.outputs = updatedDraft.outputs.map(o => ({
              ...o,
              aspectRatio: newRatio,
              pageSpec: o.pageSpec
                ? { ...o.pageSpec, layout: { ...o.pageSpec.layout, aspectRatio: newRatio } }
                : o.pageSpec,
            }));
            updatedDraft.metadata = { ...updatedDraft.metadata, aspectRatio: newRatio };
          }
        } else if (action === 'set_generation_settings') {
          const generationSpec = args.outputSpec && typeof args.outputSpec === 'object' && !Array.isArray(args.outputSpec)
            ? args.outputSpec as Partial<WorkflowOutputSpec>
            : {};
          const generationSettings = args.generationSettings && typeof args.generationSettings === 'object' && !Array.isArray(args.generationSettings)
            ? args.generationSettings as Record<string, unknown>
            : {};
          updatedDraft.outputs = updatedDraft.outputs.map(o => {
            const aspectRatio = typeof generationSpec.aspectRatio === 'string' && generationSpec.aspectRatio.trim()
              ? generationSpec.aspectRatio.trim()
              : o.aspectRatio;
            return {
              ...o,
              ...(aspectRatio ? { aspectRatio } : {}),
              ...(typeof generationSpec.targetSize === 'string' ? { targetSize: generationSpec.targetSize } : {}),
              ...(typeof generationSpec.resolution === 'string' ? { resolution: generationSpec.resolution } : {}),
              ...(typeof generationSpec.provider === 'string' ? { provider: generationSpec.provider } : {}),
              ...(typeof generationSpec.model === 'string' ? { model: generationSpec.model } : {}),
              pageSpec: o.pageSpec && aspectRatio
                ? { ...o.pageSpec, layout: { ...o.pageSpec.layout, aspectRatio } }
                : o.pageSpec,
            };
          });
          updatedDraft.metadata = {
            ...updatedDraft.metadata,
            workflowGenerationSettings: generationSettings,
            ...(typeof generationSpec.aspectRatio === 'string' ? { aspectRatio: generationSpec.aspectRatio } : {}),
            ...(typeof generationSpec.targetSize === 'string' ? { targetSize: generationSpec.targetSize } : {}),
            ...(typeof generationSpec.resolution === 'string' ? { resolution: generationSpec.resolution } : {}),
            ...(typeof generationSpec.provider === 'string' ? { provider: generationSpec.provider } : {}),
            ...(typeof generationSpec.model === 'string' ? { model: generationSpec.model } : {}),
            ...(typeof generationSettings.modelFamily === 'string' ? { modelFamily: generationSettings.modelFamily } : {}),
            ...(typeof generationSettings.explicitModel === 'boolean' ? { explicitModel: generationSettings.explicitModel } : {}),
          };
        } else if (action === 'set_page_count') {
          const pageCount = Number(args.pageCount);
          if (Number.isFinite(pageCount) && pageCount > 0) {
            updatedDraft.outputs = updatedDraft.outputs.map(o => {
              const pageIndex = o.pageSpec?.pageIndex || o.order || 0;
              return { ...o, enabled: pageIndex <= pageCount };
            });
            updatedDraft.metadata = { ...updatedDraft.metadata, pageCount };
          }
        } else if (action === 'set_render_mode') {
          type DetailRenderMode = NonNullable<WorkflowOutputSpec['renderMode']>;
          const rawRenderMode = String(args.renderMode || '');
          const renderMode: DetailRenderMode | null =
            rawRenderMode === 'composited_final_page' || rawRenderMode === 'model_text_baked' || rawRenderMode === 'visual_background_only'
              ? rawRenderMode
              : null;
          if (renderMode) {
            updatedDraft.outputs = updatedDraft.outputs.map(o => {
              const nextPageSpec = o.pageSpec
                ? {
                    ...o.pageSpec,
                    renderMode,
                    copy: renderMode === 'visual_background_only'
                      ? { pageNo: o.pageSpec.copy.pageNo, title: '', subtitle: '', tags: [], localNotes: [] }
                      : o.pageSpec.copy,
                  }
                : o.pageSpec;
              return { ...o, renderMode, pageSpec: nextPageSpec };
            });
            updatedDraft.metadata = { ...updatedDraft.metadata, renderMode };
          }
        } else if (action === 'ecommerce_patch_pages') {
          const removeOutputIds = Array.isArray(args.removeOutputIds) ? args.removeOutputIds.map(String).filter(Boolean) : [];
          const outputSpecs = Array.isArray(args.outputSpecs)
            ? args.outputSpecs.filter((spec): spec is WorkflowOutputSpec => !!spec && typeof spec === 'object' && !Array.isArray(spec) && typeof (spec as WorkflowOutputSpec).id === 'string') as WorkflowOutputSpec[]
            : [];
          if (removeOutputIds.length > 0) {
            const removeSet = new Set(removeOutputIds);
            updatedDraft.outputs = updatedDraft.outputs.map(o => removeSet.has(o.id) ? { ...o, enabled: false } : o);
          }
          outputSpecs.forEach(spec => {
            updatedDraft.outputs = [
              ...updatedDraft.outputs.filter(o => o.id !== spec.id),
              spec,
            ].sort((a, b) => (a.order || 0) - (b.order || 0));
          });
        } else if (action === 'approve_master_and_generate') {
          const nextPageCount = Math.max(1, Math.min(7, Number(args.nextPageCount) || 3));
          let readied = 0;
          updatedDraft.outputs = updatedDraft.outputs.map(o => {
            const pageIndex = o.pageSpec?.pageIndex || o.order || 0;
            if (pageIndex === 1 || o.id === 'master_page_image') return { ...o, status: 'approved' };
            if (o.enabled !== false && o.status === 'waiting_for_master' && readied < nextPageCount) {
              readied += 1;
              return { ...o, status: 'ready' };
            }
            return o;
          });
          updatedDraft.metadata = { ...updatedDraft.metadata, masterApproved: true, readyPageCount: readied };
        } else if (action === 'toggle_strategy') {
          const strategyEnabled = args.strategyEnabled === true;
          updatedDraft.strategy = updatedDraft.strategy
            ? { ...updatedDraft.strategy, enabled: strategyEnabled, mode: strategyEnabled ? 'enabled' as const : 'disabled' as const }
            : { enabled: strategyEnabled, mode: strategyEnabled ? 'enabled' as const : 'disabled' as const, title: '', prompt: '' };
        } else if (action === 'save_draft_as_workflow') {
          const draftReferenceNodeIds = Array.isArray(updatedDraft.metadata.selectedReferenceImageNodeIds)
            ? updatedDraft.metadata.selectedReferenceImageNodeIds.map(String)
            : [];
          const selectedImageNodeIds = uniqueAgentIds([
            ...getSelectedCanvasAiInputIds(),
            ...draftReferenceNodeIds,
          ]).filter(id => canUseCanvasItemAsReferenceBridgeInput(canvasItemsRef.current.find(item => item.id === id)));
          const originalRequest = updatedDraft.metadata.originalRequest || '';
          const workflowDefinitionArg = convertWorkflowDraftToDefinition(
            updatedDraft,
            selectedImageNodeIds,
            originalRequest,
            'workflow_module'
          ) as unknown as Record<string, unknown>;
          const referenceWorkflowAi = getReferenceImageWorkflowAiConfig();
          const workflow = normalizeCanvasWorkflowTemplate(buildIndustrialDesignReviewWorkflowTemplateFromDefinition({
            definition: workflowDefinitionArg,
            provider: referenceWorkflowAi.provider,
            model: referenceWorkflowAi.model,
          }));
          if (!workflow) throw new Error('工作流草稿转换失败');
          const validation = validateCanvasWorkflowTemplate(workflow);
          if (validation.errors.length > 0) throw new Error('Workflow校验失败：' + validation.errors[0]);
          const preflight = await resolveAgentWorkflowInputIds(workflow, selectedImageNodeIds, {
            allowMissingRequired: true,
            useImplicitInputs: false,
          });
          if (!isCanvasModeRef.current) enterCanvasMode();
          const inputBounds = preflight.inputIds.length > 0 ? getCanvasItemsBounds(preflight.inputIds) : null;
          const base = inputBounds
            ? { x: inputBounds.x + inputBounds.width + 96, y: inputBounds.y }
            : getCanvasDropPosition(0);
          const moduleNode = buildCanvasWorkflowModuleNode(workflow, base, preflight.inputIds);
          if (!moduleNode) throw new Error('工作流模块创建失败');
          setCustomCanvasWorkflows(prev => [workflow, ...prev].slice(0, 24));
          if (appendCanvasItems([moduleNode], 'Agent保存工作流草稿') <= 0) throw new Error('添加工作流模块失败');
          updateCanvasSelection([moduleNode.id]);
          activeWorkflowDraftRef.current = null;
          setActiveWorkflowDraftId(null);
          setActiveDraftForDisplay(null);
          showToast('工作流已保存：' + workflow.label);
          return {
            workflowId: workflow.id,
            nodeId: moduleNode.id,
            templateId: workflowDefinitionArg.templateId,
            draftId: currentDraft.id,
            stepCount: workflow.nodes.length,
            inputs: preflight.inputIds,
          };
        }

        activeWorkflowDraftRef.current = updatedDraft;
        setActiveDraftForDisplay(updatedDraft);
        showToast('工作流草稿已更新');
        setShowWorkflowDraftPanel(true);
        return {
          draftId: currentDraft.id,
          workflowDraft: updatedDraft,
          action,
          updatedAt: Date.now(),
          outputCount: updatedDraft.outputs.filter(o => o.enabled !== false).length,
        };
      }

      if (name === 'canvas_create_workflow') {
        const rawLabel = typeof args.label === 'string' ? args.label.trim() : '';
        const label = (rawLabel || 'Agent 工作流').slice(0, 32);
        const hint = typeof args.hint === 'string' && args.hint.trim()
          ? args.hint.trim().slice(0, 80)
          : 'Agent 创建的自动化工作流';
        const inputBindingsArg = args.inputBindings && typeof args.inputBindings === 'object' && !Array.isArray(args.inputBindings)
          ? args.inputBindings as Record<string, unknown>
          : {};
        const productReferenceBindingArg = inputBindingsArg.product_reference_image;
        const isProductReferenceExplicitlyUnbound = !!(
          productReferenceBindingArg
          && typeof productReferenceBindingArg === 'object'
          && !Array.isArray(productReferenceBindingArg)
          && String((productReferenceBindingArg as Record<string, unknown>).kind || '').toLowerCase() === 'unbound'
        );
        const collectBoundNodeIds = (value: unknown): string[] => {
          if (Array.isArray(value)) return value.map(String).filter(Boolean);
          if (!value || typeof value !== 'object') return [];
          const record = value as Record<string, unknown>;
          return [
            typeof record.nodeId === 'string' ? record.nodeId : '',
            ...(Array.isArray(record.nodeIds) ? record.nodeIds.map(String) : []),
          ].filter(Boolean);
        };
        const requestedInputCandidates = [
          ...(isProductReferenceExplicitlyUnbound ? [] : Array.isArray(args.inputIds) ? args.inputIds.map(String) : []),
          ...(isProductReferenceExplicitlyUnbound ? [] : Array.isArray(args.selectedReferenceImageNodeIds) ? args.selectedReferenceImageNodeIds.map(String) : []),
          ...(isProductReferenceExplicitlyUnbound ? [] : collectBoundNodeIds(productReferenceBindingArg)),
        ];
        const requestedInputs = Array.from(new Set(requestedInputCandidates))
          .filter(id => canvasItemsRef.current.some(item => item.id === id));
        const selectedInputIds = requestedInputs;
        const rawSteps = Array.isArray(args.steps) ? args.steps : [];
        const workflowDefinitionArg = args.workflowDefinition && typeof args.workflowDefinition === 'object' && !Array.isArray(args.workflowDefinition)
          ? args.workflowDefinition as Record<string, unknown>
          : null;

        if (
          workflowDefinitionArg
          && ['industrial-design-review', 'ecommerce-detail-page', 'product-detail-page'].includes(String(workflowDefinitionArg.templateId || args.templateId || ''))
        ) {
          const workflowTemplateId = String(workflowDefinitionArg.templateId || args.templateId || 'industrial-design-review');
          const referenceWorkflowAi = getReferenceImageWorkflowAiConfig();
          const workflow = normalizeCanvasWorkflowTemplate(buildIndustrialDesignReviewWorkflowTemplateFromDefinition({
            definition: workflowDefinitionArg,
            provider: referenceWorkflowAi.provider,
            model: referenceWorkflowAi.model,
          }));
          if (!workflow) throw new Error('工作流编译失败');
          const validation = validateCanvasWorkflowTemplate(workflow);
          if (validation.errors.length > 0) throw new Error(`Workflow 校验失败：${validation.errors[0]}`);
          if (validation.warnings.length > 0) console.warn('Industrial review workflow validation warnings:', validation.warnings, workflow);
          const preflight = await resolveAgentWorkflowInputIds(workflow, selectedInputIds, {
            allowMissingRequired: args.autoRun !== true,
            useImplicitInputs: false,
          });
          if (!isCanvasModeRef.current) enterCanvasMode();
          const inputBounds = preflight.inputIds.length > 0 ? getCanvasItemsBounds(preflight.inputIds) : null;
          const base = inputBounds
            ? { x: inputBounds.x + inputBounds.width + 96, y: inputBounds.y }
            : getCanvasDropPosition(0);
          const moduleNode = buildCanvasWorkflowModuleNode(workflow, base, preflight.inputIds);
          if (!moduleNode) throw new Error('workflow 模块创建失败');
          setCustomCanvasWorkflows(prev => [workflow, ...prev].slice(0, 24));
          if (appendCanvasItems([moduleNode], 'Agent 创建 workflow') <= 0) throw new Error('添加 workflow 模块失败');
          updateCanvasSelection([moduleNode.id]);
          if (args.autoRun === true) await generateCanvasWorkflowModuleNode(moduleNode.id);
          // ── 保存 workflowDraft ref 供后续对话 update，不自动弹出面板 ──────
          const meta = workflowDefinitionArg.metadata;
          const embeddedDraft = meta && typeof meta === 'object' && !Array.isArray(meta)
            ? (meta as Record<string, unknown>).workflowDraft
            : null;
          if (embeddedDraft && typeof embeddedDraft === 'object' && !Array.isArray(embeddedDraft)) {
            const d = embeddedDraft as WorkflowRecipeDraft;
            activeWorkflowDraftRef.current = d;
            setActiveWorkflowDraftId(d.id);
            setActiveDraftForDisplay(d);
            setShowWorkflowDraftPanel(true);
          }
          // ─────────────────────────────────────────────────────────────────
          return {
            workflowId: workflow.id,
            nodeId: moduleNode.id,
            templateId: workflowTemplateId,
            workflowCreationMode: workflowDefinitionArg.creationMode,
            strategyStepMode: workflowDefinitionArg.strategyStepMode,
            stepCount: workflow.nodes.length,
            inputs: preflight.inputIds,
            workflowInputBindings: preflight.resolution.workflowInputBindings,
            workflowVisualFanout: preflight.resolution.workflowVisualFanout,
            workflowTextDependencies: preflight.resolution.workflowTextDependencies,
            workflowAutoConnections: preflight.resolution.autoConnections,
            workflowInputResolution: preflight.resolution.workflowInputResolution,
            createdInputNodeIds: preflight.createdNodeIds,
            autoRun: args.autoRun === true,
          };
        }

        if (isCanvasProductDetailsWorkflowIntent(label, hint, rawSteps)) {
          const referenceWorkflowAi = getReferenceImageWorkflowAiConfig();
          const workflowMetadataArg = workflowDefinitionArg?.metadata && typeof workflowDefinitionArg.metadata === 'object' && !Array.isArray(workflowDefinitionArg.metadata)
            ? workflowDefinitionArg.metadata as Record<string, unknown>
            : {};
          const productDetailsModel = typeof workflowMetadataArg.model === 'string' && workflowMetadataArg.model.trim()
            ? workflowMetadataArg.model.trim()
            : 'gpt-image-2';
          const productDetailsProvider = productDetailsModel === 'gpt-image-2'
            ? 'new-api' as CanvasAiProvider
            : referenceWorkflowAi.provider;
          const includeStrategy = args.strategyStepMode === 'enabled'
            || workflowDefinitionArg?.strategyStepMode === 'enabled'
            || doesWorkflowExplicitlyRequestProductAnalysis(
              label,
              hint,
              args.originalRequest,
              args.userRequest,
              workflowDefinitionArg?.originalRequest,
              workflowMetadataArg.originalRequest,
              workflowMetadataArg.userRequest,
              workflowMetadataArg.prompt
            );
          const workflow = normalizeCanvasWorkflowTemplate(buildCanvasProductDetailsWorkflowTemplate({
            label,
            hint,
            steps: rawSteps,
            provider: productDetailsProvider,
            model: productDetailsModel,
            includeStrategy,
          }));
          if (!workflow) throw new Error('详情页五图 workflow 编译失败');
          const validation = validateCanvasWorkflowTemplate(workflow);
          if (validation.errors.length > 0) throw new Error(`Workflow 校验失败：${validation.errors[0]}`);
          if (validation.warnings.length > 0) console.warn('Product details workflow validation warnings:', validation.warnings, workflow);
          const preflight = await resolveAgentWorkflowInputIds(workflow, selectedInputIds, {
            useImplicitInputs: false,
          });
          if (!isCanvasModeRef.current) enterCanvasMode();
          const inputBounds = preflight.inputIds.length > 0 ? getCanvasItemsBounds(preflight.inputIds) : null;
          const base = inputBounds
            ? { x: inputBounds.x + inputBounds.width + 96, y: inputBounds.y }
            : getCanvasDropPosition(0);
          const moduleNode = buildCanvasWorkflowModuleNode(workflow, base, preflight.inputIds);
          if (!moduleNode) throw new Error('详情页五图 workflow 模块创建失败');
          setCustomCanvasWorkflows(prev => [workflow, ...prev].slice(0, 24));
          if (appendCanvasItems([moduleNode], 'Agent 创建详情页五图 workflow') <= 0) throw new Error('添加详情页五图 workflow 模块失败');
          updateCanvasSelection([moduleNode.id]);
          if (args.autoRun === true) await generateCanvasWorkflowModuleNode(moduleNode.id);
          return {
            workflowId: workflow.id,
            nodeId: moduleNode.id,
            templateId: 'product_details_five_images',
            stages: includeStrategy ? [['product_refs'], ['product_strategy'], [...CANVAS_PRODUCT_DETAILS_NODE_IDS]] : [['product_refs'], [...CANVAS_PRODUCT_DETAILS_NODE_IDS]],
            inputs: preflight.inputIds,
            workflowAutoConnections: preflight.resolution.autoConnections,
            workflowInputResolution: preflight.resolution.workflowInputResolution,
            createdInputNodeIds: preflight.createdNodeIds,
            autoRun: args.autoRun === true,
          };
        }

        if (rawSteps.length === 0) {
          const draft = buildCanvasWorkflowSaveDraftFromSelection(label);
          if (!draft) throw new Error('创建工作流需要 steps，或先选中要封装的节点');
          const workflow: CanvasWorkflowTemplate = {
            id: 'custom-workflow-' + Date.now().toString(36) + '-' + Math.random().toString(36).substring(2, 6),
            label,
            hint: hint || (draft.nodes.length + ' 个节点，' + draft.aiCount + ' 个生图节点'),
            nodes: draft.nodes,
            createdAt: Date.now(),
          };
          const moduleNode = buildCanvasWorkflowModuleNode(workflow, { x: draft.bounds.x, y: draft.bounds.y }, draft.externalInputIds);
          if (!moduleNode) throw new Error('工作流封装失败');
          setCustomCanvasWorkflows(prev => [workflow, ...prev].slice(0, 24));
          pushCanvasUndoSnapshot('Agent 封装工作流');
          updateCanvasItemsImmediate(prev => {
            const selectedSet = new Set(draft.selectedItemIds);
            const nextItems = prev
              .filter(item => !selectedSet.has(item.id))
              .map(item => {
                const inputs = item.inputs || [];
                if (!inputs.some(inputId => selectedSet.has(inputId))) return item;
                return {
                  ...item,
                  inputs: Array.from(new Set(inputs.map(inputId => selectedSet.has(inputId) ? moduleNode.id : inputId))),
                };
              });
            return [...nextItems, moduleNode];
          });
          updateCanvasSelection([moduleNode.id]);
          if (args.autoRun === true) {
            await generateCanvasWorkflowModuleNode(moduleNode.id);
          }
          showToast('已封装工作流「' + label + '」');
          return {
            workflowId: workflow.id,
            nodeId: moduleNode.id,
            sealedSelectedNodes: draft.selectedItemIds.length,
            autoRun: args.autoRun === true,
          };
        }

        const usedStepIds = new Set<string>();
        const makeStepId = (raw: unknown, index: number) => {
          const base = String(raw || '').trim().replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 32) || 'step-' + (index + 1);
          let id = base;
          let suffix = 2;
          while (usedStepIds.has(id)) {
            id = base + '-' + suffix;
            suffix += 1;
          }
          usedStepIds.add(id);
          return id;
        };

        const workflowNodes: CanvasWorkflowNodeTemplate[] = [];
        let previousConnectableId = '';
        rawSteps.forEach((stepValue, index) => {
          const step = stepValue && typeof stepValue === 'object' ? stepValue as Record<string, unknown> : {};
          const rawStepType = String(step.type || step.kind || '').toLowerCase();
          const kind = rawStepType === 'text' || rawStepType === 'text_agent' || rawStepType === 'text-agent'
            ? 'text'
            : 'image-generator';
          const stepId = makeStepId(step.id, index);
          const stepLabel = (typeof step.label === 'string' && step.label.trim() ? step.label.trim() : '步骤 ' + (index + 1)).slice(0, 32);
          const prompt = typeof step.prompt === 'string' && step.prompt.trim()
            ? step.prompt.trim()
            : stepLabel;
          const y = index * 260;
          const inputStepIds = Array.isArray(step.inputStepIds)
            ? step.inputStepIds.map(String).filter(id => usedStepIds.has(id) && id !== stepId)
            : [];
          const inputs = inputStepIds.length > 0
            ? inputStepIds
            : (previousConnectableId ? [previousConnectableId] : []);

          if (kind === 'text') {
            workflowNodes.push({
              id: stepId,
              x: 0,
              y,
              width: 360,
              height: 170,
              item: {
                id: stepId,
                type: 'text',
                content: prompt,
                name: stepLabel,
                createdAt: 0,
                isQuickAccess: false,
              },
              inputs,
              fixedInput: true,
              textMode: 'agent',
              designAgentConfig: normalizeDesignAgentConfig(step.designAgentConfig),
              acceptsExternalInputs: inputs.length === 0,
              outputType: 'text',
            });
            previousConnectableId = stepId;
            return;
          }

          const requestedAspectRatio = typeof step.aspectRatio === 'string' ? step.aspectRatio.trim() : '';
          const aspectRatio = requestedAspectRatio
            ? normalizeCanvasAiAspectRatioForModel(null, requestedAspectRatio)
            : CANVAS_AI_DEFAULT_ASPECT_RATIO;
          const requestedOutputFormat = typeof step.outputFormat === 'string' ? step.outputFormat.trim().toLowerCase() : '';
          const outputFormat = CANVAS_AI_OUTPUT_FORMATS.includes(requestedOutputFormat)
            ? requestedOutputFormat
            : CANVAS_AI_DEFAULT_OUTPUT_FORMAT;
          const rawCount = typeof step.count === 'number' || typeof step.count === 'string'
            ? Number(step.count)
            : Number.NaN;
          const count = Number.isFinite(rawCount)
            ? clamp(Math.round(rawCount), 1, CANVAS_AI_MAX_OUTPUT_COUNT)
            : 1;
          const nodeSize = getCanvasAiNodeAutoSize({
            type: 'image-generator',
            aspectRatio,
            count,
            promptText: prompt,
            promptExpanded: true,
          });
          workflowNodes.push({
            id: stepId,
            x: 420,
            y,
            width: nodeSize.width,
            height: nodeSize.height,
            item: {
              id: stepId,
              type: 'text',
              content: prompt.length > 120 ? '' : prompt,
              name: stepLabel,
              createdAt: 0,
              isQuickAccess: false,
            },
            inputs,
            acceptsExternalInputs: inputs.length === 0,
            externalInputTypes: inputs.length === 0 ? ['image', 'text'] : undefined,
            outputType: count > 1 ? 'image[]' : 'image',
            ai: {
              type: 'image-generator',
              provider: canvasAiProvider,
              model: getCanvasAiDefaultModel(canvasAiProvider),
              prompt: undefined,
              presetLabel: stepLabel,
              presetPrompt: prompt,
              aspectRatio,
              outputFormat,
              count,
              status: 'idle',
              outputs: [],
            },
          });
          previousConnectableId = stepId;
        });

        if (!workflowNodes.some(node => node.ai?.type === 'image-generator')) {
          const fallbackPrompt = rawSteps.map((stepValue, index) => {
            const step = stepValue && typeof stepValue === 'object' ? stepValue as Record<string, unknown> : {};
            return String(step.prompt || step.label || '步骤 ' + (index + 1));
          }).join('\n\n');
          const stepId = makeStepId('final-output', workflowNodes.length);
          const nodeSize = getCanvasAiNodeAutoSize({
            type: 'image-generator',
            aspectRatio: CANVAS_AI_DEFAULT_ASPECT_RATIO,
            count: 1,
            promptText: fallbackPrompt,
            promptExpanded: true,
          });
          workflowNodes.push({
            id: stepId,
            x: 420,
            y: workflowNodes.length * 260,
            width: nodeSize.width,
            height: nodeSize.height,
            item: {
              id: stepId,
              type: 'text',
              content: fallbackPrompt.length > 120 ? '' : fallbackPrompt,
              name: '最终输出',
              createdAt: 0,
              isQuickAccess: false,
            },
            inputs: previousConnectableId ? [previousConnectableId] : [],
            acceptsExternalInputs: !previousConnectableId,
            externalInputTypes: !previousConnectableId ? ['image', 'text'] : undefined,
            outputType: 'image',
            ai: {
              type: 'image-generator',
              provider: canvasAiProvider,
              model: getCanvasAiDefaultModel(canvasAiProvider),
              prompt: undefined,
              presetLabel: '最终输出',
              presetPrompt: fallbackPrompt,
              aspectRatio: CANVAS_AI_DEFAULT_ASPECT_RATIO,
              outputFormat: CANVAS_AI_DEFAULT_OUTPUT_FORMAT,
              count: 1,
              status: 'idle',
              outputs: [],
            },
          });
        }

        const workflow = normalizeCanvasWorkflowTemplate({
          id: 'custom-workflow-' + Date.now().toString(36) + '-' + Math.random().toString(36).substring(2, 6),
          label,
          hint,
          nodes: workflowNodes,
          createdAt: Date.now(),
        });
        if (!workflow) throw new Error('Workflow 编译失败');
        const validation = validateCanvasWorkflowTemplate(workflow);
        if (validation.errors.length > 0) throw new Error(`Workflow 校验失败：${validation.errors[0]}`);
        if (validation.warnings.length > 0) console.warn('Agent workflow validation warnings:', validation.warnings, workflow);
        const preflight = await resolveAgentWorkflowInputIds(workflow, selectedInputIds);
        if (!isCanvasModeRef.current) enterCanvasMode();
        const inputBounds = preflight.inputIds.length > 0 ? getCanvasItemsBounds(preflight.inputIds) : null;
        const base = inputBounds
          ? { x: inputBounds.x + inputBounds.width + 96, y: inputBounds.y }
          : getCanvasDropPosition(0);
        const moduleNode = buildCanvasWorkflowModuleNode(workflow, base, preflight.inputIds);
        if (!moduleNode) throw new Error('工作流模块创建失败');
        setCustomCanvasWorkflows(prev => [workflow, ...prev].slice(0, 24));
        if (appendCanvasItems([moduleNode], 'Agent 创建工作流') <= 0) throw new Error('添加工作流模块失败');
        updateCanvasSelection([moduleNode.id]);
        if (args.autoRun === true) {
          await generateCanvasWorkflowModuleNode(moduleNode.id);
        }
        return {
          workflowId: workflow.id,
          nodeId: moduleNode.id,
          stepCount: workflowNodes.length,
          inputs: preflight.inputIds,
          workflowAutoConnections: preflight.resolution.autoConnections,
          workflowInputResolution: preflight.resolution.workflowInputResolution,
          createdInputNodeIds: preflight.createdNodeIds,
          autoRun: args.autoRun === true,
        };
      }

      if (name === 'canvas_update_prompt') {
        const nodeId = typeof args.nodeId === 'string' ? args.nodeId : '';
        const prompt = typeof args.prompt === 'string' ? args.prompt.trim() : '';
        const node = canvasItemsRef.current.find(item => item.id === nodeId);
        if (!node || !canUseCanvasItemAsAiTarget(node)) throw new Error('目标节点不存在');
        if (!prompt) throw new Error('Prompt 不能为空');
        if (isCanvasAgentTextTarget(node)) {
          updateCanvasTextItem(nodeId, prompt);
          const textarea = canvasTextAreaRefs.current[nodeId];
          if (textarea) textarea.value = prompt;
          updateCanvasSelection([nodeId]);
          return { nodeId, promptLength: prompt.length, type: 'text' };
        }
        updateCanvasAiGeneratorData(nodeId, { prompt }, prompt);
        updateCanvasSelection([nodeId]);
        return { nodeId, promptLength: prompt.length, type: 'ai' };
      }

      if (name === 'canvas_connect_nodes') {
        const sourceId = typeof args.sourceId === 'string' ? args.sourceId : '';
        const targetId = typeof args.targetId === 'string' ? args.targetId : '';
        if (!connectCanvasItems(sourceId, targetId)) throw new Error('节点无法连接，请检查输入与目标类型');
        return { sourceId, targetId };
      }

      if (name === 'canvas_organize') {
        const nodeIds = Array.isArray(args.nodeIds) ? args.nodeIds.map(String) : undefined;
        organizeCanvasItems(nodeIds?.length ? nodeIds : undefined);
        return { organized: nodeIds?.length || canvasItemsRef.current.length };
      }

      if (name === 'canvas_run_workflow') {
        const nodeIds = Array.isArray(args.nodeIds)
          ? args.nodeIds.map(String)
          : [...canvasSelectedIdsRef.current];
        const workflowNodeIds = nodeIds.filter(id => canvasItemsRef.current.find(item => item.id === id)?.ai?.type === 'workflow');
        const preflights = [];
        for (const nodeId of workflowNodeIds) {
          const preflight = await attachAgentWorkflowInputsToModule(nodeId);
          if (preflight) preflights.push({ nodeId, ...preflight });
        }
        await runSelectedCanvasWorkflowModules(nodeIds);
        return {
          requestedNodeIds: nodeIds,
          workflowResolvedImageNodeIds: Array.from(new Set(preflights.flatMap(item => item.resolution.resolvedImageNodeIds))),
          workflowAutoConnections: preflights.flatMap(item => item.resolution.autoConnections),
          workflowInputResolution: preflights.map(item => item.resolution.workflowInputResolution),
          workflowMissingRequiredInputs: preflights.flatMap(item => item.resolution.missingRequiredInputs),
        };
      }
};
