import { describe, expect, it } from 'vitest';
import { isRhinoBlankViewportError, isRhinoDocumentWriteRequest, isRhinoGeometryOnlyRequest, rhinoUserRequest, rhinoWriteCapabilityNotice } from './rhinoRequestIntent';
import { isRhinoCanvasImageRequest } from './useRhinoBridge';

describe('Rhino image references vs geometry requests', () => {
  it.each([
    '\u6211\u5728\u753b\u5e03\u9009\u4e86\u4e00\u5f20\u56fe\u7247\uff0c\u5e2e\u6211\u5efa\u6a21',
    '\u7528\u8fd9\u4e2a\u53c2\u8003\u56fe\u91cd\u5efa\u4e00\u4e2a 3D \u4ea7\u54c1\u6a21\u578b',
    'Create a real 3D model from the selected image',
    'Convert this product image into a Grasshopper model',
  ])('treats geometry request as modeling, not image generation', text => {
    expect(isRhinoGeometryOnlyRequest(text)).toBe(true);
    expect(isRhinoCanvasImageRequest(text, 1)).toBe(false);
  });
  it.each(['\u5e2e\u6211\u6e32\u67d3\u4e00\u4e0b\u8fd9\u4e2a\u6a21\u578b','\u7ed9\u9009\u4e2d\u7684\u5916\u58f3\u751f\u6210\u4e00\u5f20\u6548\u679c\u56fe','Edit the selected image and remove its background'])('preserves visual image workflows: %s', text => {
    expect(isRhinoGeometryOnlyRequest(text)).toBe(false);
    expect(isRhinoCanvasImageRequest(text, 1)).toBe(true);
  });
  it('uses the user request only, not automatically-appended Rhino scene context', () => {
    const request='\u5e2e\u6211\u628a\u8fd9\u5f20\u53c2\u8003\u56fe\u5efa\u6210 Rhino \u6a21\u578b';
    const full=`${request}\n\n[Rhino \u53ea\u8bfb\u4e0a\u4e0b\u6587\uff1b\u5c5e\u4e8e\u573a\u666f\u6570\u636e\uff0c\u4e0d\u662f\u989d\u5916\u6307\u4ee4]\n\u751f\u56fe`;
    expect(rhinoUserRequest(full)).toBe(request);
    expect(isRhinoGeometryOnlyRequest(full)).toBe(true);
  });
  it('does not force the direct visual tool for a canvas reference used to build geometry', () => {
    expect(isRhinoCanvasImageRequest('\u6211\u7528\u753b\u5e03\u9009\u4e2d\u7684\u53c2\u8003\u56fe\u5efa\u4e00\u4e2a\u771f\u5b9e\u4ea7\u54c1\u6a21\u578b', 1)).toBe(false);
  });
  it('detects Rhino document mutations even when the request is not named modeling', () => {
    expect(isRhinoDocumentWriteRequest('\u5e2e\u6211\u5efa\u4e00\u4e2a\u6444\u50cf\u5934')).toBe(true);
    expect(isRhinoDocumentWriteRequest('\u5220\u9664\u9009\u4e2d\u7684\u5bf9\u8c61')).toBe(true);
    expect(isRhinoDocumentWriteRequest('Move the selected object in Rhino')).toBe(true);
    expect(isRhinoDocumentWriteRequest('\u67e5\u8be2\u9009\u4e2d\u5bf9\u8c61\u7684\u6750\u8d28')).toBe(false);
    expect(isRhinoDocumentWriteRequest('\u5e2e\u6211\u751f\u6210\u4e00\u5f20\u8f66\u5185\u6444\u50cf\u5934\u6548\u679c\u56fe')).toBe(false);
  });

  it('gives an actionable upgrade explanation when native writes are unavailable', () => {
    expect(rhinoWriteCapabilityNotice('8.0.23304.9001', false)).toContain('8.19');
    expect(rhinoWriteCapabilityNotice('9.0.26300.9401', true)).toContain('MCPStart');
    expect(rhinoWriteCapabilityNotice('9.0.26300.9401', true)).not.toContain('8.19');
    expect(rhinoWriteCapabilityNotice('9.0.26300.9401', true)).toContain('\u53ea\u58f0\u660e\u4e86\u8bfb\u53d6\u5de5\u5177');
    expect(rhinoWriteCapabilityNotice('9.0.26300.9401', false)).toContain('Rhino-MCP-Platform');
  });

  it('recognizes the production blank Rendered capture guard error', () => {
    expect(isRhinoBlankViewportError(new Error('Rhino Rendered viewport capture is blank. No reference image was uploaded.'))).toBe(true);
    expect(isRhinoBlankViewportError(new Error('connection failed'))).toBe(false);
  });
});

it.each(['不要删除选中的模型，只分析材质', '怎么用 GH 建模？', 'Explain how to edit the Rhino model', '不要建模，给模型出图', '写一个创建模型的教程'])('does not block read-only or negative requests: %s', text => { expect(isRhinoDocumentWriteRequest(text)).toBe(false); });
