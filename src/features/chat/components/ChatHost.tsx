import { invoke } from '@tauri-apps/api/core';
import { useCallback, useEffect, useRef, useState } from 'react';
import { blobToDataUrl } from '../../../utils/canvasImageData';
import type { AgentCanvasSelectionItem } from '../../agentModel';
import type { PendingChatAttachment } from '../model/chatTypes';
import { createChatVisionAttachmentResolver } from '../attachments/chatVisionAttachmentResolver';
import {
  setCanvasChatVisibility,
  useCanvasChatVisibility,
} from '../runtime/canvasChatVisibility';
import {
  useCanvasWorkflowConversationRequest,
  useCanvasWorkflowProgress,
} from '../runtime/canvasWorkflowProgress';
import { useChatRuntime, type UseChatRuntimeOptions } from '../runtime/useChatRuntime';
import { ChatView, type ChatViewProps } from './ChatView';
import { useCloudAccount } from '../../cloudAccountContext';
import { getWorkflowChatBinding, saveWorkflowChatBinding } from '../storage/workflowChatStorage';
import type { WorkflowResultCardData } from '../../agentModel';
import { createCanvasWorkflowSnapshot, workflowSnapshotHash } from '../attachments/chatWorkflowAttachments';

export type ChatHostProps = Omit<ChatViewProps, 'runtime'> & {
  visible: boolean;
  canvasId?: string;
  imageQualities?: string[];
  model: string;
  serverManagedChannelFailover?: boolean;
  cloudWalletMode?: boolean;
  runtimeImageModel?: string;
  approvalMode?: UseChatRuntimeOptions['approvalMode'];
  executeTool: UseChatRuntimeOptions['executeTool'];
  onNotice?: UseChatRuntimeOptions['onNotice'];
  onGeneratedMediaReady?: UseChatRuntimeOptions['onGeneratedMediaReady'];
  onBatchStarted?: UseChatRuntimeOptions['onBatchStarted'];
  onBatchMediaReady?: UseChatRuntimeOptions['onBatchMediaReady'];
  onBatchCompleted?: UseChatRuntimeOptions['onBatchCompleted'];
  resolveSelectedItems?: () => AgentCanvasSelectionItem[];
};

const prepareChatAttachment = async (attachment: PendingChatAttachment) => {
  if (attachment.type === 'workflow') {
    const source = attachment.path.trim();
    if (!source || /^workflow:\/\//i.test(source)) return attachment;
    const payload = await invoke<unknown>('read_canvas_template_json', { path: source });
    const record = payload && typeof payload === 'object' ? payload as Record<string, unknown> : {};
    const workflow = Array.isArray(record.workflows) ? record.workflows[0] : record;
    const workflowRecord = workflow && typeof workflow === 'object' ? workflow as Record<string, unknown> : {};
    const nodes = Array.isArray(workflowRecord.nodes) ? workflowRecord.nodes : [];
    const snapshot = createCanvasWorkflowSnapshot(nodes, String(workflowRecord.label || source.split(/[\\/]/).pop() || '导入工作流'), 'file');
    const structureHash = workflowSnapshotHash(snapshot);
    return { ...attachment, path: `workflow://${structureHash}`, metadataJson: JSON.stringify({ snapshot, structureHash, raw: payload }) };
  }
  if (attachment.type !== 'image') return attachment;
  const source = attachment.path.trim();
  if (!source || !/^(?:https?:|data:|blob:|asset:)/i.test(source)) return attachment;
  let localPath = '';
  if (/^https?:\/\//i.test(source)) {
    localPath = await invoke<string>('cache_web_image', {
      url: source,
      name: `chat-attachment-${Date.now()}`,
    });
  } else {
    let dataUrl = source;
    if (!source.startsWith('data:')) {
      if (/^asset:/i.test(source)) {
        dataUrl = await invoke<string>('read_local_image_data_url', { path: source });
      } else {
        const response = await fetch(source);
        if (!response.ok) throw new Error('读取图片附件失败');
        dataUrl = await blobToDataUrl(await response.blob());
      }
    }
    const encodedType = dataUrl.match(/^data:image\/([a-zA-Z0-9.+-]+)[;,]/)?.[1]?.toLowerCase();
    const extension = encodedType === 'jpeg' ? 'jpg' : encodedType === 'svg+xml' ? 'svg' : encodedType || 'png';
    localPath = await invoke<string>('save_dropped_file', {
      fileName: `chat-attachment-${Date.now()}.${extension}`,
      dataUrl,
    });
  }
  return { ...attachment, path: localPath, thumbnailPath: localPath };
};

export function ChatHost({
  visible,
  canvasId = 'default',
  imageQualities = [],
  model,
  serverManagedChannelFailover,
  cloudWalletMode,
  runtimeImageModel,
  approvalMode,
  executeTool,
  onNotice,
  onGeneratedMediaReady,
  onBatchStarted,
  onBatchMediaReady,
  onBatchCompleted,
  resolveSelectedItems,
  imageModel,
  imageAspectRatio,
  imageResolution,
  ...viewProps
}: ChatHostProps) {
  const { scheduleQuotaRefresh } = useCloudAccount();
  const canvasChatVisible = useCanvasChatVisibility();
  const canvasWorkflowResult = useCanvasWorkflowProgress();
  const workflowConversationRequest = useCanvasWorkflowConversationRequest();
  const resolvedVisible = viewProps.variant === 'canvas' ? canvasChatVisible : visible;
  const [imageQuality, setImageQuality] = useState('');
  const effectiveImageQuality = imageQualities.includes(imageQuality) ? imageQuality : imageQualities[0] || '';
  const runtime = useChatRuntime({
    model,
    modelOptions: viewProps.modelOptions,
    serverManagedChannelFailover,
    imageModel: runtimeImageModel || imageModel,
    imageAspectRatio,
    imageResolution: imageResolution || undefined,
    imageQuality: effectiveImageQuality,
    approvalMode,
    executeTool,
    onNotice,
    onGeneratedMediaReady,
    onBatchStarted,
    onBatchMediaReady,
    onBatchCompleted,
    cloudWalletMode: cloudWalletMode ?? serverManagedChannelFailover === true,
    onWalletSettlementComplete: scheduleQuotaRefresh,
    prepareAttachment: prepareChatAttachment,
    createVisionAttachmentResolver: createChatVisionAttachmentResolver,
  });
  const [viewMounted, setViewMounted] = useState(resolvedVisible);
  const [workflowConversationId, setWorkflowConversationId] = useState('');
  const [savedWorkflowResult, setSavedWorkflowResult] = useState<WorkflowResultCardData | undefined>();
  const restoredWorkflowCanvasRef = useRef('');
  const activeWorkflowBindingRef = useRef<{ canvasId: string; nodeId: string } | null>(null);
  useEffect(() => {
    if (viewProps.variant !== 'canvas' || runtime.loading || restoredWorkflowCanvasRef.current === canvasId) return;
    restoredWorkflowCanvasRef.current = canvasId;
    const binding = getWorkflowChatBinding(canvasId);
    setWorkflowConversationId(binding?.conversationId || '');
    setSavedWorkflowResult(binding?.result);
    activeWorkflowBindingRef.current = binding || null;
    if (binding && runtime.conversations.some(item => item.id === binding.conversationId)) runtime.selectConversation(binding.conversationId);
  }, [canvasId, runtime.loading, viewProps.variant]);
  const handledWorkflowConversationRequestRef = useRef('');

  useEffect(() => {
    if (
      viewProps.variant !== 'canvas'
      || !workflowConversationRequest
      || workflowConversationRequest.canvasId !== canvasId
      || workflowConversationRequest.id === handledWorkflowConversationRequestRef.current
    ) return;
    handledWorkflowConversationRequestRef.current = workflowConversationRequest.id;
    const binding = getWorkflowChatBinding(canvasId, workflowConversationRequest.nodeId);
    activeWorkflowBindingRef.current = workflowConversationRequest;
    if (binding && runtime.conversations.some(item => item.id === binding.conversationId)) {
      setWorkflowConversationId(binding.conversationId);
      runtime.selectConversation(binding.conversationId);
      return;
    }
    setWorkflowConversationId('');
    void runtime.newConversation(workflowConversationRequest.title)
      .then(conversation => {
        if (conversation) {
          saveWorkflowChatBinding({ canvasId, nodeId: workflowConversationRequest.nodeId, conversationId: conversation.id });
          if (activeWorkflowBindingRef.current?.canvasId === canvasId) setWorkflowConversationId(conversation.id);
        }
      })
      .catch(error => {
        handledWorkflowConversationRequestRef.current = '';
        onNotice?.(`创建工作流会话失败：${String(error)}`);
      });
  }, [canvasId, onNotice, runtime.newConversation, viewProps.variant, workflowConversationRequest, runtime.conversations]);

  useEffect(() => {
    const binding = activeWorkflowBindingRef.current;
    if (!binding || !workflowConversationId || !canvasWorkflowResult || canvasWorkflowResult.workflowNodeId !== binding.nodeId) return;
    saveWorkflowChatBinding({ ...binding, conversationId: workflowConversationId, result: canvasWorkflowResult });
    setSavedWorkflowResult(canvasWorkflowResult);
  }, [canvasWorkflowResult, workflowConversationId]);

  useEffect(() => {
    if (resolvedVisible) {
      setViewMounted(true);
      return;
    }
    if (viewMounted || runtime.loading) return;
    const mount = () => setViewMounted(true);
    if (typeof window.requestIdleCallback === 'function') {
      const idleId = window.requestIdleCallback(mount, { timeout: 1_200 });
      return () => window.cancelIdleCallback(idleId);
    }
    const timer = window.setTimeout(mount, 400);
    return () => window.clearTimeout(timer);
  }, [resolvedVisible, runtime.loading, viewMounted]);

  const closeView = useCallback(() => {
    if (viewProps.variant === 'canvas') setCanvasChatVisibility(false);
    else viewProps.onClose();
  }, [viewProps.onClose, viewProps.variant]);

  const changeWidth = useCallback((width: number) => {
    viewProps.onWidthChange?.(width);
  }, [viewProps.onWidthChange]);

  if (!viewMounted && !resolvedVisible) return null;
  const selectedItems = resolvedVisible && resolveSelectedItems
    ? resolveSelectedItems()
    : viewProps.selectedItems;
  return (
    <ChatView
      {...viewProps}
      runtime={runtime}
      visible={resolvedVisible}
      selectedItems={selectedItems}
      onClose={closeView}
      onWidthChange={viewProps.onWidthChange ? changeWidth : undefined}
      imageModel={imageModel}
      imageAspectRatio={imageAspectRatio}
      imageResolution={imageResolution}
      imageQuality={effectiveImageQuality}
      imageQualityOptions={imageQualities.map(value => ({ value, label: value }))}
      onImageQualityChange={setImageQuality}
      workflowResult={viewProps.variant === 'canvas'
        ? workflowConversationId === runtime.activeConversationId
          ? savedWorkflowResult
          : undefined
        : viewProps.workflowResult}
    />
  );
}
