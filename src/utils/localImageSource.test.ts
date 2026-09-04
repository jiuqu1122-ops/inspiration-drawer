import { describe, expect, it, vi } from 'vitest';

import {
  localPathFromAssetUrl,
  resolveLocalImageSource,
  shouldShowImageUnavailable,
} from './localImageSource';

const convert = vi.fn((path: string) => `asset://current/${encodeURIComponent(path)}`);

describe('local image source resolver', () => {
  it.each([
    'https://images.example.com/reference.png',
    'data:image/png;base64,AAAA',
    'blob:https://app.local/68ddc19c-4f04-4caa-b074-bb0a76b5da92',
  ])('preserves already WebView-readable source %s', (source) => {
    expect(resolveLocalImageSource(source, convert)).toBe(source);
  });

  it.each([
    ['Windows path', 'C:\\Users\\Artist\\Pictures\\reference.png'],
    ['macOS POSIX path', '/Users/artist/Pictures/reference.png'],
    ['Chinese path', '/Users/小明/图片/灵感.png'],
    ['path with spaces', '/Users/artist/My Images/hero image.png'],
    ['path with # and %', '/Users/artist/Images/design #100%.png'],
    ['path with parentheses and emoji', '/Users/artist/Images/final (2) 🎨.png'],
  ])('converts a %s without hand-encoding it', (_label, source) => {
    expect(resolveLocalImageSource(source, convert)).toBe(`asset://current/${encodeURIComponent(source)}`);
    expect(convert).toHaveBeenLastCalledWith(source);
  });

  it('normalizes a legacy Windows asset.localhost URL through the current converter', () => {
    const legacy = 'http://asset.localhost/C%3A%5CUsers%5CArtist%5CMy%20Images%5Cdesign%20%23100%25.png';
    const path = 'C:\\Users\\Artist\\My Images\\design #100%.png';

    expect(localPathFromAssetUrl(legacy)).toBe(path);
    expect(resolveLocalImageSource(legacy, convert)).toBe(`asset://current/${encodeURIComponent(path)}`);
    expect(convert).toHaveBeenLastCalledWith(path);
  });

  it('normalizes an asset URL containing an encoded macOS root', () => {
    const source = 'asset://localhost/%2FUsers%2F%E5%B0%8F%E6%98%8E%2FMy%20Images%2Fdesign.png';
    const path = '/Users/小明/My Images/design.png';

    expect(localPathFromAssetUrl(source)).toBe(path);
    expect(resolveLocalImageSource(source, convert)).toBe(`asset://current/${encodeURIComponent(path)}`);
  });

  it('turns file URLs into current WebView asset URLs', () => {
    const source = 'file:///Users/%E5%B0%8F%E6%98%8E/My%20Images/design%20%23100%25.png';
    const path = '/Users/小明/My Images/design #100%.png';

    expect(resolveLocalImageSource(source, convert)).toBe(`asset://current/${encodeURIComponent(path)}`);
    expect(convert).toHaveBeenLastCalledWith(path);
  });

  it('selects the unavailable fallback for a missing or failed image', () => {
    expect(shouldShowImageUnavailable('', false)).toBe(true);
    expect(shouldShowImageUnavailable('asset://current/image.png', true)).toBe(true);
    expect(shouldShowImageUnavailable('asset://current/image.png', false)).toBe(false);
  });
});
