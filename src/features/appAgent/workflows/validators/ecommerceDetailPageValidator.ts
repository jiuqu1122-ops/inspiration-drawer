import type { DetailPageSpec } from '../../pageLayout/detailPageLayoutTypes';
import type { WorkflowOutputSpec, WorkflowRecipeDraft } from '../workflowRecipeTypes';

export interface EcommerceDetailPageValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

const hasAsciiMainCopy = (value: string) => /[a-zA-Z]{3,}/.test(value);

const getPageSpec = (output: WorkflowOutputSpec): DetailPageSpec | null => (
  output.pageSpec || null
);

export const validateEcommerceDetailPageDraft = (
  draft: WorkflowRecipeDraft,
  options: { masterApproved?: boolean; autoRunAfterMaster?: boolean } = {},
): EcommerceDetailPageValidationResult => {
  const errors: string[] = [];
  const warnings: string[] = [];
  const outputs = draft.outputs.filter(output => output.enabled !== false);
  const isDetailTemplate = draft.templateId === 'ecommerce-detail-page' || draft.templateId === 'product-detail-page';
  if (!isDetailTemplate) {
    return { valid: true, errors, warnings };
  }

  const hasProductInput = draft.inputs.some(input => input.id === 'product_reference_image' && input.type === 'image');
  if (!hasProductInput) errors.push('ecommerce-detail-page draft must include product_reference_image image input.');

  outputs.forEach(output => {
    const spec = getPageSpec(output);
    if (!output.uniqueSellingPoint && !spec?.uniqueSellingPoint) {
      errors.push(`${output.id} must have uniqueSellingPoint.`);
    }
    if (!output.inputRoles.includes('product_reference_image')) {
      errors.push(`${output.id} must include product_reference_image in inputRoles.`);
    }
    if (output.requiresReferenceImages !== true) {
      errors.push(`${output.id} must require reference images.`);
    }
    if (!spec) {
      errors.push(`${output.id} must have pageSpec.`);
      return;
    }
    if (output.renderMode === 'composited_final_page' || spec.renderMode === 'composited_final_page') {
      if (!spec.copy.title.trim() || !spec.copy.subtitle.trim()) {
        errors.push(`${output.id} composited_final_page requires title and subtitle.`);
      }
      if (spec.copy.tags.length !== 3) {
        errors.push(`${output.id} must have exactly 3 tags by default.`);
      }
      spec.copy.tags.forEach((tag, index) => {
        if (!tag.text.trim() || !tag.icon.trim()) errors.push(`${output.id} tag ${index + 1} must have text and icon.`);
      });
    }
    if (draft.languagePolicy.imageTextLanguage === 'zh-CN') {
      const copyValues = [spec.copy.title, spec.copy.subtitle, ...spec.copy.tags.map(tag => tag.text)];
      if (copyValues.some(hasAsciiMainCopy)) {
        errors.push(`${output.id} main copy should be Simplified Chinese unless the user requests English.`);
      }
    }
    if (/认证|检测|承重|防水等级|100%|零风险|官方授权/.test(`${spec.copy.title} ${spec.copy.subtitle} ${spec.copy.tags.map(tag => tag.text).join(' ')}`)) {
      warnings.push(`${output.id} may contain unsupported parameters, certification, or absolute claims.`);
    }
    if (spec.pageIndex > 1 && spec.styleAnchor.masterPageNodeId && !output.inputRoles.includes('master_page_image')) {
      errors.push(`${output.id} must include master_page_image when a master page is defined.`);
    }
    if (spec.pageIndex > 1 && !options.masterApproved && output.status !== 'waiting_for_master') {
      errors.push(`${output.id} should wait for master approval before generation.`);
    }
  });

  if (!options.masterApproved && options.autoRunAfterMaster !== true) {
    const laterReady = outputs.filter(output => (output.pageSpec?.pageIndex || 0) > 1 && output.status === 'ready');
    if (laterReady.length > 0) errors.push('Page 02+ should not auto-run before Page 01 master is approved.');
  }

  return { valid: errors.length === 0, errors, warnings };
};
