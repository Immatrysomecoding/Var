import { useEffect, useRef, useCallback, useState } from 'react';
import Hls from 'hls.js';

export interface HlsPlayerState {
  isLive: boolean;
  offsetSeconds: number; // negative = behind live, 0 = live
  duration: number;
}

export function useHlsPlayer(src: string | null) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const [state, setState] = useState<HlsPlayerState>({
    isLive: true,
    offsetSeconds: 0,
    duration: 60,
  });

  // Sync offset from video timeupdate
  const syncOffset = useCallback(() => {
    const video = videoRef.current;
    if (!video || !video.seekable.length) return;
    const liveEdge = video.seekable.end(0);
    const offset = video.currentTime - liveEdge;
    const isLive = offset >= -2;
    setState({ isLive, offsetSeconds: Math.round(offset), duration: liveEdge - video.seekable.start(0) });
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !src) return;

    // Teardown previous instance
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    if (Hls.isSupported()) {
      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: true,
        backBufferLength: 60,
        maxBufferLength: 10,
        liveSyncDurationCount: 2,
      });
      hlsRef.current = hls;
      hls.loadSource(src);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        video.play().catch(() => {});
      });
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      // Safari native HLS
      video.src = src;
      video.play().catch(() => {});
    }

    video.addEventListener('timeupdate', syncOffset);
    return () => {
      video.removeEventListener('timeupdate', syncOffset);
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [src, syncOffset]);

  // Seek to live edge
  const goLive = useCallback(() => {
    const video = videoRef.current;
    if (!video || !video.seekable.length) return;
    video.currentTime = video.seekable.end(0);
    video.play().catch(() => {});
  }, []);

  // Seek by delta seconds (negative = go further back, positive = forward)
  const seekBy = useCallback((deltaSec: number) => {
    const video = videoRef.current;
    if (!video || !video.seekable.length) return;
    const min = video.seekable.start(0);
    const max = video.seekable.end(0);
    const next = Math.max(min, Math.min(max, video.currentTime + deltaSec));
    video.currentTime = next;
  }, []);

  // Seek to specific offset from live (e.g. -12 = 12s behind)
  const seekToOffset = useCallback((offsetSec: number) => {
    const video = videoRef.current;
    if (!video || !video.seekable.length) return;
    const liveEdge = video.seekable.end(0);
    const min = video.seekable.start(0);
    const target = Math.max(min, liveEdge + offsetSec);
    video.currentTime = target;
    if (offsetSec < -2) video.pause();
    else { video.play().catch(() => {}); }
  }, []);

  return { videoRef, state, goLive, seekBy, seekToOffset };
}
