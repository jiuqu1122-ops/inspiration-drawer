import { describe, expect, it } from 'vitest';
import type { BufferItem } from '../types';
import {
  fileUrlToLocalPath,
  getBufferItemLocalPaths,
  getCanvasLocalPathsFromDataTransfer,
  getDrawerImageLocalDeletePaths,
  isCanvasImageFileName,
  isCanvasTemplateJsonFileName,
  isCanvasVideoFileName,
  isCanvasAudioFileName,
  isCanvasWorkflowReadableTextFileName,
  isDrawerLocalDeleteCandidate,
  normalizeLocalDragPath,
} from './localMediaPaths';

const createItem = (
  type: BufferItem['type'],
  patch: Partial<BufferItem> & Record<string, unknown> = {},
): BufferItem => ({
  id: `${type}-item`,
  type,
  content: '',
  createdAt: 1,
  ...patch,
});

describe('local media paths', () => {
  it('preserves media, template, and readable-text extension matching', () => {
    expect(isCanvasImageFileName('reference.AVIF')).toBe(true);
    expect(isCanvasImageFileName('reference.jpeg')).toBe(true);
    expect(isCanvasImageFileName('reference.png?size=2')).toBe(false);
    expect(isCanvasVideoFileName('clip.WEBM')).toBe(true);
    expect(isCanvasVideoFileName('clip.mp3')).toBe(false);
    expect(isCanvasAudioFileName('voice.MP3')).toBe(true);
    expect(isCanvasAudioFileName('clip.mp4')).toBe(false);
    expect(isCanvasTemplateJsonFileName(' workflow.JSON\0\0 ')).toBe(false);
    expect(isCanvasTemplateJsonFileName(' workflow.JSON\0\0')).toBe(true);
    expect(isCanvasWorkflowReadableTextFileName('workflow.markdown')).toBe(true);
    expect(isCanvasWorkflowReadableTextFileName('component.TSX')).toBe(true);
    expect(isCanvasWorkflowReadableTextFileName('document.pdf')).toBe(false);
  });

  it('converts Windows drive and UNC file URLs without changing invalid inputs', () => {
    expect(fileUrlToLocalPath(' file:///C:/Design%20Files/reference.png ')).toBe(
      'C:\\Design Files\\reference.png',
    );
    expect(fileUrlToLocalPath('file://server/share/My%20Image.PNG')).toBe(
      '\\\\server\\share\\My Image.PNG',
    );
    expect(fileUrlToLocalPath('https://example.com/reference.png')).toBe('');
    expect(fileUrlToLocalPath('file:///C:/bad%ZZ.png')).toBe('');
  });

  it('normalizes quoted, null-terminated, file URL, and supported device-style paths', () => {
    expect(normalizeLocalDragPath('  "C:\\Images\\reference.png"\0\0')).toBe(
      'C:\\Images\\reference.png',
    );
    expect(normalizeLocalDragPath('file:///D:/Boards/hero%20image.webp')).toBe(
      'D:\\Boards\\hero image.webp',
    );
    expect(normalizeLocalDragPath('\\?\\E:\\Boards\\hero.png')).toBe(
      'E:\\Boards\\hero.png',
    );
    expect(normalizeLocalDragPath('?\\F:\\Boards\\hero.png')).toBe(
      'F:\\Boards\\hero.png',
    );
    expect(normalizeLocalDragPath('\\\\?\\G:\\Boards\\hero.png')).toBe(
      '\\\\?\\G:\\Boards\\hero.png',
    );
    expect(normalizeLocalDragPath(null)).toBe('');
  });

  it('keeps the existing local deletion candidate rules', () => {
    expect(isDrawerLocalDeleteCandidate('')).toBe(false);
    expect(isDrawerLocalDeleteCandidate('data:image/png;base64,AAAA')).toBe(false);
    expect(isDrawerLocalDeleteCandidate('https://example.com/image.png')).toBe(false);
    expect(isDrawerLocalDeleteCandidate('ftp://example.com/image.png')).toBe(false);
    expect(isDrawerLocalDeleteCandidate('http://asset.localhost/image.png')).toBe(true);
    expect(isDrawerLocalDeleteCandidate('asset://localhost/image.png')).toBe(true);
    expect(isDrawerLocalDeleteCandidate('file:///C:/Images/image.png')).toBe(true);
    expect(isDrawerLocalDeleteCandidate('C:\\Images\\image.png')).toBe(false);
    expect(isDrawerLocalDeleteCandidate('\\\\server\\share\\image.png')).toBe(true);
  });

  it('collects BufferItem paths in order, deduplicates them, and excludes Eagle sources', () => {
    const item = createItem('image', {
      path: ' file:///C:/Cache/image.png ',
      url: 'C:\\Ignored\\because-path-exists.png',
      sourceUrl: 'file:///D:/Sources/original.png',
      originalUrl: 'file:///D:/Sources/original.png',
      sourcePath: 'file:///E:/Sources/alternate.png',
      originalPath: 'file:///F:/Eagle/source.png',
      eagleSourcePath: 'file:///F:/Eagle/source.png',
    });

    expect(getBufferItemLocalPaths(item)).toEqual([
      'C:\\Cache\\image.png',
      'D:\\Sources\\original.png',
      'E:\\Sources\\alternate.png',
    ]);
    expect(getBufferItemLocalPaths(createItem('text', { path: 'C:\\Notes\\note.txt' }))).toEqual([]);
  });

  it('uses the URL fallback only without a path and limits image deletion paths by item type', () => {
    const image = createItem('image', { url: 'file:///C:/Cache/fallback.png' });
    const video = createItem('video', { path: 'C:\\Cache\\clip.mp4' });

    expect(getBufferItemLocalPaths(image)).toEqual(['C:\\Cache\\fallback.png']);
    expect(getDrawerImageLocalDeletePaths(image)).toEqual(['C:\\Cache\\fallback.png']);
    expect(getDrawerImageLocalDeletePaths(video)).toEqual([]);
  });

  it('extracts supported paths from every DataTransfer source in stable deduplicated order', () => {
    const values: Record<string, string> = {
      'text/uri-list': [
        '# drag metadata',
        'file:///C:/Drops/from-file.png',
        'file://server/share/from-uri.MOV',
        'https://example.com/remote.png',
      ].join('\r\n'),
      'text/plain': [
        '"C:\\Drops\\quoted.webp"',
        'C:\\Drops\\from-item.JSON',
        'C:\\Drops\\unsupported.txt',
      ].join('\n'),
    };
    const dataTransfer = {
      files: [
        { path: 'C:\\Drops\\from-file.png' },
        { path: 'C:\\Drops\\ignored.pdf' },
      ],
      items: [
        { kind: 'file', getAsFile: () => ({ path: 'C:\\Drops\\from-item.JSON' }) },
        { kind: 'file', getAsFile: () => null },
        { kind: 'string', getAsFile: () => ({ path: 'C:\\Drops\\ignored.jpg' }) },
      ],
      getData: (type: string) => values[type] || '',
    } as unknown as DataTransfer;

    expect(getCanvasLocalPathsFromDataTransfer(dataTransfer)).toEqual([
      'C:\\Drops\\from-file.png',
      'C:\\Drops\\from-item.JSON',
      '\\\\server\\share\\from-uri.MOV',
      'https://example.com/remote.png',
      'C:\\Drops\\quoted.webp',
    ]);
    expect(getCanvasLocalPathsFromDataTransfer(null)).toEqual([]);
  });

  it('preserves POSIX roots and decodes special characters in macOS file URLs', () => {
    expect(fileUrlToLocalPath('file:///Users/%E5%B0%8F%E6%98%8E/My%20Images/design%20%23100%25.png'))
      .toBe('/Users/小明/My Images/design #100%.png');
  });
});
