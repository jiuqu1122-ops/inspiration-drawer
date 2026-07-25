import { useEffect, useRef, type VideoHTMLAttributes } from 'react';

type CanvasSelectionVideoProps = Omit<VideoHTMLAttributes<HTMLVideoElement>, 'autoPlay' | 'controls'> & {
  isSelected: boolean;
  controlsWhenSelected?: boolean;
};

export const syncCanvasVideoPlayback = (
  video: Pick<HTMLVideoElement, 'pause' | 'play'>,
  isSelected: boolean,
) => {
  if (!isSelected) {
    video.pause();
    return;
  }
  const playPromise = video.play();
  if (playPromise && typeof playPromise.catch === 'function') {
    playPromise.catch(() => {});
  }
};

export function CanvasSelectionVideo({
  isSelected,
  controlsWhenSelected = false,
  onPlay,
  src,
  ...props
}: CanvasSelectionVideoProps) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    syncCanvasVideoPlayback(video, isSelected);
  }, [isSelected, src]);

  return (
    <video
      {...props}
      ref={videoRef}
      src={src}
      autoPlay={isSelected}
      controls={controlsWhenSelected && isSelected}
      onPlay={(event) => {
        if (!isSelected) {
          event.currentTarget.pause();
          return;
        }
        onPlay?.(event);
      }}
    />
  );
}
