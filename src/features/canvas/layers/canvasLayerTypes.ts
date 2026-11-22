export type LayerMode = 'split' | 'edit';
export type LayerSelection =
  | { kind: 'point'; x: number; y: number }
  | { kind: 'rect'; x: number; y: number; width: number; height: number };
export type LayerPixels = { width: number; height: number; alpha: boolean; transparent: boolean };
export type LayerPlacement = LayerPixels & { id: string; name: string; x: number; y: number; order: number; opacity: number; hidden?: boolean };
export type LayerAsset = LayerPixels & { path: string };
export type CanvasLayer = LayerPlacement & { path: string };
export type CanvasLayerGroup = {
  width: number;
  height: number;
  base: LayerAsset;
  layers: CanvasLayer[];
};
export type CanvasLayerOperation = {
  mode: LayerMode;
  prompts?: Partial<Record<LayerMode, string>>;
  selection?: { sourceId: string; source: string; value: LayerSelection };
  outputs?: Partial<Record<LayerMode, string>>;
};
export type LayerLink = { groupId: string; layerId: string; path: string };
type LayerImageBilling = { creditsPerOutputImage: string; imageCount: number };
export type CanvasLayerResult = {
  mode: LayerMode;
  requestId: string;
  status: 'processing' | 'success' | 'failed';
  message?: string;
  chargedCredits?: string;
  imageBilling?: LayerImageBilling;
  group?: CanvasLayerGroup;
  asset?: LayerAsset;
  sourceLayer?: LayerLink;
};
export type LayerOffer = { creditsPerRequest: string; creditsPerOutputImage?: string; maxOutputImages?: number };
export type LayerCatalog = Record<LayerMode, LayerOffer[]> & { referenceUpload?: boolean };
export type LayerOutput = ({ operation: 'split'; width: number; height: number; base: LayerPixels & { asset: number }; layers: (LayerPlacement & { asset: number })[] }
  | { operation: 'edit'; image: LayerPixels & { asset: number } }) & { assets: string[] };
export type LayerReceipt =
  | { status: 'success'; result: LayerOutput; chargedCredits: string; imageBilling?: LayerImageBilling }
  | { status: 'processing' }
  | { status: 'failed'; message: string };
