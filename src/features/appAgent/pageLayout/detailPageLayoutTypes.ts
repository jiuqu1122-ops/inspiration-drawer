export type DetailPageRenderMode =
  | 'composited_final_page'
  | 'model_text_baked'
  | 'visual_background_only';

export type DetailPageStatus =
  | 'pending'
  | 'waiting_for_master'
  | 'ready'
  | 'generated'
  | 'approved'
  | 'needs_revision';

export interface DetailPageSpec {
  pageIndex: number;
  pageName: string;
  uniqueSellingPoint: string;
  productAnchor: {
    referenceImageNodeIds: string[];
    lockedFeatures: string[];
    forbiddenChanges: string[];
  };
  styleAnchor: {
    masterPageNodeId?: string;
    backgroundStyle: string;
    mainColor: string;
    auxiliaryColors: string[];
    accentColor: string;
    lighting: string;
    iconStyle: string;
    closeupFrameStyle: string;
    layoutLanguage: string;
  };
  layout: {
    aspectRatio: string;
    productPosition: 'center' | 'left' | 'right' | 'bottom-center';
    productAngle: string;
    titleArea: 'top';
    labelArea: 'top' | 'left' | 'right' | 'bottom';
    closeupCount: 0 | 1 | 2 | 3;
    closeupPosition?: 'left' | 'right' | 'bottom';
  };
  copy: {
    pageNo: string;
    title: string;
    subtitle: string;
    tags: Array<{
      text: string;
      icon: string;
    }>;
    localNotes?: string[];
    adaptive?: boolean;
    sourceBrief?: string;
  };
  renderMode: DetailPageRenderMode;
}
