import { describe, expect, it } from 'vitest';
import { extractImageUrlFromHtml, getWebImageFromDataTransfer, normalizeDraggedUrl } from './dragData';

describe('browser image drag data', () => {
  it('prefers Baidu data-objurl over the search-result page link', () => {
    const html = `
      <a href="https://image.baidu.com/search/index?tn=baiduimage&word=s">
        <img src="https://image.baidu.com/static/blank.gif"
          data-objurl="https%3A%2F%2Fimg95.699pic.com%2Fxsj%2F0p%2Fb3%2Fur.jpg%21%2Ffh%2F300">
      </a>
    `;

    expect(extractImageUrlFromHtml(html)).toBe(
      'https://img95.699pic.com/xsj/0p/b3/ur.jpg!/fh/300',
    );
  });

  it('prefers the accessible Baidu cached tile over a blocked source image', () => {
    const html = `
      <a href="https://image.baidu.com/search/detail?tn=baiduimagedetail">
        <img
          src="https://img2.baidu.com/it/u=3840004386,1451325835&amp;fm=253&amp;fmt=auto&amp;app=138&amp;f=JPEG?w=500&amp;h=700"
          data-objurl="https://img95.699pic.com/xsj/0p/b3/ur.jpg!/fh/300">
      </a>
    `;

    expect(extractImageUrlFromHtml(html)).toBe(
      'https://img2.baidu.com/it/u=3840004386,1451325835&fm=253&fmt=auto&app=138&f=JPEG?w=500&h=700',
    );
  });

  it('extracts an escaped Baidu objURL JSON field', () => {
    const html = String.raw`<div data-state="{\"objURL\":\"https:\/\/img2.baidu.com\/it\/u=3840004386,1451325835&amp;fm=253&amp;fmt=auto&amp;app=138&amp;f=JPEG?w=500&amp;h=700\"}"></div>`;

    expect(extractImageUrlFromHtml(html)).toBe(
      'https://img2.baidu.com/it/u=3840004386,1451325835&fm=253&fmt=auto&app=138&f=JPEG?w=500&h=700',
    );
  });

  it('uses a direct srcset image instead of a Baidu detail-page href', () => {
    const html = `
      <a href="https://image.baidu.com/search/detail?tn=baiduimagedetail">
        <img srcset="https://cdn.example.com/a.webp 1x, https://cdn.example.com/a@2x.webp 2x">
      </a>
    `;

    expect(extractImageUrlFromHtml(html)).toBe('https://cdn.example.com/a@2x.webp');
  });

  it('unwraps a double-encoded objurl from a Baidu detail URL', () => {
    const detailUrl = 'https://image.baidu.com/search/detail?tn=baiduimagedetail&objurl=https%253A%252F%252Fimg95.699pic.com%252Fxsj%252F0p%252Fb3%252Fur.jpg%2521%252Ffh%252F300&word=s';

    expect(normalizeDraggedUrl(detailUrl)).toBe(
      'https://img95.699pic.com/xsj/0p/b3/ur.jpg!/fh/300',
    );
  });

  it('decodes a detached double-encoded Baidu objurl and removes detail parameters', () => {
    const detached = 'https%253A%252F%252Fku.90sjimg.com%252Felement_origin_min_pic%252F17%252F08%252F14%252Ff07d382fe836fbf9657581b5ac57ca51.jpg&os=828300594%2C37046194&pd=image_content&pn=5&tn=baiduimagedetail';

    expect(normalizeDraggedUrl(detached)).toBe(
      'https://ku.90sjimg.com/element_origin_min_pic/17/08/14/f07d382fe836fbf9657581b5ac57ca51.jpg',
    );
  });

  it('does not treat a plain Baidu search page as an image', () => {
    expect(extractImageUrlFromHtml(
      '<a href="https://image.baidu.com/search/index?tn=baiduimage&word=s">result</a>',
    )).toBe('');
  });

  it('prefers rich HTML image data over a DownloadURL page link', () => {
    const values: Record<string, string> = {
      DownloadURL: 'text/html:result:https://image.baidu.com/search/index?tn=baiduimage&word=s',
      'text/html': '<img data-objurl="https://img2.baidu.com/it/u=1,2&amp;fm=253&amp;f=JPEG?w=500&amp;h=700">',
    };
    const dataTransfer = {
      getData: (type: string) => values[type] || '',
    } as DataTransfer;

    expect(getWebImageFromDataTransfer(dataTransfer)?.url).toBe(
      'https://img2.baidu.com/it/u=1,2&fm=253&f=JPEG?w=500&h=700',
    );
  });

  it('keeps alternate image URLs for cache fallback', () => {
    const values: Record<string, string> = {
      'text/html': `
        <img src="https://img2.baidu.com/it/u=1,2&amp;fm=253&amp;f=JPEG?w=500&amp;h=700"
          data-objurl="https://source.example.com/original.jpg">
      `,
    };
    const dataTransfer = {
      files: [],
      getData: (type: string) => values[type] || '',
    } as unknown as DataTransfer;
    const image = getWebImageFromDataTransfer(dataTransfer);

    expect(image?.url).toContain('img2.baidu.com/it/');
    expect(image?.fallbackUrls).toContain('https://source.example.com/original.jpg');
  });
});
