import { useLayoutEffect, useRef, type ImgHTMLAttributes } from 'react';
import { cancelCanvasImageSwap, swapCanvasImageAfterDecode } from '../canvasImagePresentation';

/** React must not replace visible pixels before a new source has decoded.
 * The ref's first src is intentionally stable; later swaps are versioned and
 * shared with the canvas's imperative selection/preview updater.
 */
export function CanvasStableImage({ src, ...props }: Omit<ImgHTMLAttributes<HTMLImageElement>, 'src'> & { src: string }) {
  const imageRef = useRef<HTMLImageElement | null>(null);
  const initialSource = useRef(src);
  useLayoutEffect(() => {
    const image = imageRef.current;
    if (!image) return;
    void swapCanvasImageAfterDecode(image, src);
    return () => cancelCanvasImageSwap(image);
  }, [src]);
  return <img {...props} ref={imageRef} src={initialSource.current} />;
}
