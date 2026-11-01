import { afterEach, describe, expect, it, vi } from 'vitest';

describe('drawer image preview keyboard navigation', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('steps through the open gallery with the left and right arrow keys', async () => {
    const keydown: { current?: (event: KeyboardEvent) => void } = {};
    vi.stubGlobal('window', {
      screen: { availWidth: 1920, availHeight: 1080 },
      addEventListener: (type: string, listener: (event: KeyboardEvent) => void) => {
        if (type === 'keydown') keydown.current = listener;
      },
      removeEventListener: vi.fn(),
    });
    const { runWindowSnipEffect05 } = await import('./windowSnipEffects');
    const stepSelectedImageGallery = vi.fn();
    const cleanup = runWindowSnipEffect05({
      closeSelectedImagePreview: vi.fn(),
      selectedImage: 'asset://selected.png',
      selectedImageGallery: { items: [{ id: 'one' }, { id: 'two' }], index: 0 },
      stepSelectedImageGallery,
    } as any);
    const left = { key: 'ArrowLeft', preventDefault: vi.fn(), stopPropagation: vi.fn() } as unknown as KeyboardEvent;
    const right = { key: 'ArrowRight', preventDefault: vi.fn(), stopPropagation: vi.fn() } as unknown as KeyboardEvent;

    keydown.current?.(left);
    keydown.current?.(right);

    expect(stepSelectedImageGallery).toHaveBeenNthCalledWith(1, -1);
    expect(stepSelectedImageGallery).toHaveBeenNthCalledWith(2, 1);
    expect(left.preventDefault).toHaveBeenCalledOnce();
    expect(right.preventDefault).toHaveBeenCalledOnce();
    cleanup?.();
  });

  it('does not consume arrow keys when no multi-image gallery is open', async () => {
    const keydown: { current?: (event: KeyboardEvent) => void } = {};
    vi.stubGlobal('window', {
      screen: { availWidth: 1920, availHeight: 1080 },
      addEventListener: (_type: string, listener: (event: KeyboardEvent) => void) => { keydown.current = listener; },
      removeEventListener: vi.fn(),
    });
    const { runWindowSnipEffect05 } = await import('./windowSnipEffects');
    const stepSelectedImageGallery = vi.fn();
    runWindowSnipEffect05({
      closeSelectedImagePreview: vi.fn(),
      selectedImage: 'asset://selected.png',
      selectedImageGallery: null,
      stepSelectedImageGallery,
    } as any);
    const event = { key: 'ArrowRight', preventDefault: vi.fn(), stopPropagation: vi.fn() } as unknown as KeyboardEvent;

    keydown.current?.(event);

    expect(stepSelectedImageGallery).not.toHaveBeenCalled();
    expect(event.preventDefault).not.toHaveBeenCalled();
  });
});
