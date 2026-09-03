import { invoke } from '@tauri-apps/api/core';
import { useCallback, useEffect, useRef, useState } from 'react';
import { blobToDataUrl } from '../../../utils/canvasImageData';
import type { AgentCanvasSelectionItem } from '../../agentModel';
import type { ChatAttachment, PendingChatAttachment } from '../model/chatTypes';
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

export type ChatHostProps = Omit<ChatViewProps, 'runtime'> & {
  visible: boolean;
  model: string;
  runtimeImageModel?: string;
  approvalMode?: UseChatRuntimeOptions['approvalMode'];
  executeTool: UseChatRuntimeOptions['executeTool'];
  onNotice?: UseChatRuntimeOptions['onNotice'];
  onGeneratedMediaReady?: UseChatRuntimeOptions['onGeneratedMediaReady'];
  resolveSelectedItems?: () => AgentCanvasSelectionItem[];
};

const prepareChatAttachment = async (attachment: PendingChatAttachment) => {
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

const resolveChatAttachmentUrl = async (attachment: ChatAttachment) => {
  const source = attachment.path.trim();
  if (/^(?:https?:|data:)/i.test(source)) return source;
  return invoke<string>('read_local_image_data_url', { path: source });
};

export function ChatHost({
  visible,
  model,
  runtimeImageModel,
  approvalMode,
  executeTool,
  onNotice,
  onGeneratedMediaReady,
  resolveSelectedItems,
  imageModel,
  imageAspectRatio,
  imageResolution,
  ...viewProps
}: ChatHostProps) {
  const canvasChatVisible = useCanvasChatVisibility();
  const canvasWorkflowResult = useCanvasWorkflowProgress();
  const workflowConversationRequest = useCanvasWorkflowConversationRequest();
  const resolvedVisible = viewProps.variant === 'canvas' ? canvasChatVisible : visible;
  const runtime = useChatRuntime({
    model,
    imageModel: runtimeImageModel || imageModel,
    imageAspectRatio,
    imageResolution: imageResolution || undefined,
    approvalMode,
    executeTool,
    onNotice,
    onGeneratedMediaReady,
    prepareAttachment: prepareChatAttachment,
    resolveAttachmentUrl: resolveChatAttachmentUrl,
  });
  const [viewMounted, setViewMounted] = useState(resolvedVisible);
  const [workflowConversationId, setWorkflowConversationId] = useState('');
  const handledWorkflowConversationRequestRef = useRef('');

  useEffect(() => {
    if (
      viewProps.variant !== 'canvas'
      || !workflowConversationRequest
      || workflowConversationRequest.id === handledWorkflowConversationRequestRef.current
      || runtime.busy
    ) return;
    handledWorkflowConversationRequestRef.current = workflowConversationRequest.id;
    setWorkflowConversationId('');
    void runtime.newConversation(workflowConversationRequest.title)
      .then(conversation => {
        if (conversation) setWorkflowConversationId(conversation.id);
      })
      .catch(error => {
        handledWorkflowConversationRequestRef.current = '';
        onNotice?.(`创建工作流会话失败：${String(error)}`);
      });
  }, [onNotice, runtime.busy, runtime.newConversation, viewProps.variant, workflowConversationRequest]);

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
      workflowResult={viewProps.variant === 'canvas'
        ? workflowConversationId === runtime.activeConversationId
          ? canvasWorkflowResult
          : undefined
        : viewProps.workflowResult}
    />
  );
}
