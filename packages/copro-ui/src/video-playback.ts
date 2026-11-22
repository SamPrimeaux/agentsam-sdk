type VideoPlaybackPort = Pick<HTMLVideoElement,
  'readyState' | 'paused' | 'play' | 'pause' | 'addEventListener' | 'removeEventListener'>;

/** Keep a newly-mounted or source-switched preview video in sync with the timeline transport. */
export function syncVideoPlayback(
  video: VideoPlaybackPort,
  shouldPlay: boolean,
  onError?: (error: unknown) => void,
): () => void {
  let active = true;
  let waitingForCanPlay = false;

  const startWhenReady = () => {
    waitingForCanPlay = false;
    if (!active) return;
    if (!shouldPlay) {
      video.pause();
      return;
    }
    if (video.readyState < 2) {
      waitingForCanPlay = true;
      video.addEventListener('canplay', startWhenReady, {once: true});
      return;
    }
    if (!video.paused) return;
    void video.play().catch(error => {
      if (active) onError?.(error);
    });
  };

  if (shouldPlay) startWhenReady();
  else video.pause();

  return () => {
    active = false;
    if (waitingForCanPlay) video.removeEventListener('canplay', startWhenReady);
  };
}
