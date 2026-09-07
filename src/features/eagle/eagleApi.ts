import { invoke } from '@tauri-apps/api/core';

import type {
  EagleApiVersion,
  EagleDetectionResult,
  EagleFolderPayload,
  EagleItemPayload,
} from '../../types/eagle';

export const EAGLE_API_V2_BASE_URL = 'http://127.0.0.1:41595/api/v2';
export const EAGLE_API_V1_BASE_URL = 'http://127.0.0.1:41595/api';
export const EAGLE_IMPORT_PAGE_LIMIT = 200;

export const getEagleErrorMessage = (error: unknown) => (
  error instanceof Error ? error.message : String(error || '未知错误')
);

export const eagleApiGet = async <T,>(
  baseUrl: string,
  path: string,
  query?: Record<string, string | number | undefined>,
) => {
  const queryString = query
    ? Object.entries(query)
      .filter(([, value]) => value !== undefined && value !== '')
      .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
      .join('&')
    : '';
  const url = baseUrl + path + (queryString ? `?${queryString}` : '');
  const response = await invoke<Record<string, unknown>>('eagle_api_get', { url });
  if (!response || typeof response !== 'object') return response as T;
  if (response.status && response.status !== 'success') {
    throw new Error(String(response.message || response.error || 'Eagle API 返回失败'));
  }
  return ((response.data !== undefined ? response.data : response) as T);
};

export const detectEagleConnection = async (): Promise<EagleDetectionResult> => {
  let v2Error = '';
  let v1Error = '';
  let apiVersion: EagleApiVersion | undefined;
  let baseUrl = '';

  try {
    await eagleApiGet(EAGLE_API_V2_BASE_URL, '/app/info');
    apiVersion = 'v2';
    baseUrl = EAGLE_API_V2_BASE_URL;
  } catch (error) {
    v2Error = getEagleErrorMessage(error);
    try {
      await eagleApiGet(EAGLE_API_V1_BASE_URL, '/application/info');
      apiVersion = 'v1';
      baseUrl = EAGLE_API_V1_BASE_URL;
    } catch (fallbackError) {
      v1Error = getEagleErrorMessage(fallbackError);
    }
  }

  if (!apiVersion) {
    const [eagleOpen, portAccessible] = await Promise.all([
      invoke<boolean>('eagle_probe_process').catch(() => false),
      invoke<boolean>('eagle_probe_port').catch(() => false),
    ]);
    return { eagleOpen, portAccessible, libraryOpen: null, v2Error, v1Error };
  }

  try {
    const libraryInfo = await eagleApiGet<Record<string, unknown>>(baseUrl, '/library/info');
    return {
      eagleOpen: true,
      portAccessible: true,
      libraryOpen: true,
      apiVersion,
      baseUrl,
      libraryInfo,
      v2Error: v2Error || undefined,
    };
  } catch (error) {
    return {
      eagleOpen: true,
      portAccessible: true,
      libraryOpen: false,
      apiVersion,
      baseUrl,
      v2Error: v2Error || undefined,
      libraryError: getEagleErrorMessage(error),
    };
  }
};

export const normalizeEagleFoldersPayload = (payload: unknown): EagleFolderPayload[] => {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== 'object') return [];
  const record = payload as Record<string, unknown>;
  if (Array.isArray(record.folders)) return record.folders;
  if (Array.isArray(record.data)) return record.data;
  return [];
};

export const normalizeEagleItemsPayload = (payload: unknown) => {
  const record = payload && typeof payload === 'object'
    ? payload as Record<string, unknown>
    : {};
  const items = Array.isArray(payload)
    ? payload
    : [record.items, record.list, record.files, record.data].find(Array.isArray) || [];
  const total = Number(record.total ?? record.count ?? 0) || 0;
  return { items: items as EagleItemPayload[], total };
};
