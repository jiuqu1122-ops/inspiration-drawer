import { describe, expect, it, vi } from 'vitest';
import { getEnhancementOutputDimensions, prepareEnhancementImageInput } from './canvasLocalMediaTools';

describe('local enhancement image preparation', () => {
  it.each([
    String.raw`C:\图片库\无后缀`,
    String.raw`C:\cache\png_named_as.jpg`,
    'file:///C:/images/%E4%B8%AD%E6%96%87.png',
    'asset://localhost/C%3A%5Ccache%5Cimage.bin',
    'http://asset.localhost/C%3A%5Ccache%5Cimage',
    'https://asset.localhost/C%3A%5Ccache%5Cimage',
  ])('passes local originals unchanged, without needing an extension: %s', async source => {
    const cache = vi.fn();
    expect(await prepareEnhancementImageInput(`  ` + source + '  ', 'input.png', cache)).toBe(source);
    expect(cache).not.toHaveBeenCalled();
  });

  it.each(['https://cdn.example/original', 'data:image/png;base64,iVBORw0KGgo='])('caches original bytes before native processing: %s', async source => {
    const cache = vi.fn(async () => ({ path: String.raw`C:\cache\original_without_suffix` }));
    expect(await prepareEnhancementImageInput(source, 'input.png', cache)).toBe(String.raw`C:\cache\original_without_suffix`);
    expect(cache).toHaveBeenCalledWith(source, 'input.png', { throwOnFailure: true });
  });

  it('never falls back to a remote URL when caching returns no local file', async () => {
    const cache = vi.fn(async () => ({ path: '', url: 'https://cdn.example/original' }));
    await expect(prepareEnhancementImageInput('https://cdn.example/original', 'input.png', cache)).rejects.toThrow('未返回本地文件');
  });

  it('rejects a remote URL masquerading as the cached file path', async () => {
    const cache = vi.fn(async () => ({ path: 'https://cdn.example/not-cached' }));
    await expect(prepareEnhancementImageInput('https://cdn.example/original', 'input.png', cache)).rejects.toThrow('未返回本地文件');
  });

  it('does not confuse a remote host containing asset.localhost with a local asset', async () => {
    const cache = vi.fn(async () => ({ path: String.raw`C:\cache\original.png` }));
    await prepareEnhancementImageInput('https://asset.localhost.evil.example/image', 'input.png', cache);
    expect(cache).toHaveBeenCalledOnce();
  });

  it('redacts cache failures instead of exposing private URLs or file paths', async () => {
    const cache = vi.fn(async () => { throw new Error(String.raw`C:\Users\Private\secret.png https://private.example?token=secret`); });
    const error = await prepareEnhancementImageInput('https://private.example?token=secret', 'input.png', cache).catch(error => error as Error);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain('准备输入');
    expect((error as Error).message).not.toMatch(/Private|secret|private.example/);
  });

  it.each(['', 'blob:private-id', 'data:text/plain;base64,aA=='])('rejects unavailable or unsupported original sources: %s', async source => {
    const cache = vi.fn();
    await expect(prepareEnhancementImageInput(source, 'input.png', cache)).rejects.toThrow('准备输入');
    expect(cache).not.toHaveBeenCalled();
  });

  it('requires App cache integration for remote images, not for local images', async () => {
    await expect(prepareEnhancementImageInput('https://cdn.example/original', 'input.png')).rejects.toThrow('缓存服务不可用');
    expect(await prepareEnhancementImageInput('C:/images/original', 'input.png')).toBe('C:/images/original');
  });
});

describe('enhancement output pixel metadata', () => {
  it('returns the real file dimensions without deriving anything from node geometry', () => {
    expect(getEnhancementOutputDimensions({ width: 3024, height: 1764 })).toEqual({ width: 3024, height: 1764 });
  });
  it.each([
    {}, { width: null, height: null }, { width: 1200 }, { width: 0, height: 10 },
    { width: -1, height: 10 }, { width: NaN, height: 10 }, { width: Infinity, height: 10 },
    { width: 1.5, height: 10 }, { width: 10, height: 0 },
  ])('never invents dimensions when metadata is unavailable/invalid: %o', metadata => {
    expect(getEnhancementOutputDimensions(metadata)).toBeUndefined();
  });
});
