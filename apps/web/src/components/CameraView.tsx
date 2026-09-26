/**
 * Camera + landmark overlay. Owns the video element, the MediaPipe tracker, and the
 * requestAnimationFrame loop; hands every tracked frame to the parent via onFrame.
 *
 * Callers get frames, not pixels. No consumer of this component ever touches the video.
 */

import { useEffect, useRef, useState } from 'react';
import {
  HAND_CONNECTIONS,
  LandmarkTracker,
  requestCamera,
  type TrackedFrame,
} from '../lib/landmarks.js';
import { useSettings } from '../state/settings.js';

export interface FrameMeta {
  /** Video width / height, so motion can be stored with correct proportions. */
  aspect: number;
}

export interface CameraViewProps {
  onFrame(frame: TrackedFrame, meta: FrameMeta): void;
  /** Short status text shown over the video. */
  badge?: string;
  /** Renders the badge in the recording colour. */
  recording?: boolean;
  /** Pause detection without tearing the camera down. */
  paused?: boolean;
}

type Status = 'idle' | 'starting' | 'running' | 'error';

export default function CameraView({ onFrame, badge, recording = false, paused = false }: CameraViewProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const trackerRef = useRef<LandmarkTracker | null>(null);
  const rafRef = useRef<number>(0);
  const onFrameRef = useRef(onFrame);
  const pausedRef = useRef(paused);
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState<string | null>(null);
  const [fps, setFps] = useState(0);
  const [aspect, setAspect] = useState(4 / 3);
  const [points, setPoints] = useState<number[]>([]);
  const [processorInUse, setProcessorInUse] = useState<'GPU' | 'CPU' | null>(null);

  const { settings } = useSettings();

  // Keep the latest callback without restarting the camera on every parent render.
  useEffect(() => {
    onFrameRef.current = onFrame;
  }, [onFrame]);
  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  useEffect(() => {
    trackerRef.current?.setDominantHand(settings.dominantHand);
  }, [settings.dominantHand]);

  useEffect(() => {
    let cancelled = false;
    let stream: MediaStream | null = null;
    let frames = 0;
    let lastFpsAt = performance.now();
    const frameStats: number[][] = [];

    async function start() {
      setStatus('starting');
      setError(null);

      const camera = await requestCamera();
      if (cancelled) {
        camera.stream?.getTracks().forEach((track) => track.stop());
        return;
      }
      if (!camera.stream) {
        setError(camera.error);
        setStatus('error');
        return;
      }
      stream = camera.stream;

      const video = videoRef.current;
      if (!video) return;
      video.srcObject = stream;
      try {
        await video.play();
      } catch {
        setError('The browser blocked video playback. Tap the page and try again.');
        setStatus('error');
        return;
      }

      const tracker = new LandmarkTracker({
        dominantHand: settings.dominantHand,
        handsOnly: settings.handsOnly,
        processor: settings.processor,
      });
      try {
        await tracker.init();
      } catch {
        setError(
          'Could not load the hand-tracking model. Check your connection — the first load needs network access.',
        );
        setStatus('error');
        return;
      }
      if (cancelled) {
        tracker.close();
        return;
      }
      trackerRef.current = tracker;
      setStatus('running');

      const loop = () => {
        rafRef.current = requestAnimationFrame(loop);
        const currentVideo = videoRef.current;
        if (!currentVideo || currentVideo.readyState < 2 || pausedRef.current) return;

        const frame = tracker.detect(currentVideo, performance.now());
        if (!frame) return;

        draw(canvasRef.current, currentVideo, frame);
        frameStats.push(frame.hands.map((h) => h.length));
        onFrameRef.current(frame, {
          aspect: currentVideo.videoWidth && currentVideo.videoHeight ? currentVideo.videoWidth / currentVideo.videoHeight : 4 / 3,
        });

        frames += 1;
        const now = performance.now();
        if (now - lastFpsAt >= 1000) {
          setFps(Math.round((frames * 1000) / (now - lastFpsAt)));
          setPoints(frameStats.at(-1) ?? []);
          frameStats.length = 0;
          setProcessorInUse(tracker.delegate);
          if (currentVideo.videoWidth && currentVideo.videoHeight) setAspect(currentVideo.videoWidth / currentVideo.videoHeight);
          frames = 0;
          lastFpsAt = now;
        }
      };
      rafRef.current = requestAnimationFrame(loop);
    }

    void start();

    return () => {
      cancelled = true;
      cancelAnimationFrame(rafRef.current);
      trackerRef.current?.close();
      trackerRef.current = null;
      stream?.getTracks().forEach((track) => track.stop());
    };
    // Restarting on handsOnly is intentional: it changes which models get created.
  }, [settings.dominantHand, settings.handsOnly, settings.processor]);

  return (
    <div className="stack">
      <div className="camera" style={{ aspectRatio: String(aspect) }}>
        <video ref={videoRef} playsInline muted aria-label="Camera preview" />
        <canvas ref={canvasRef} aria-hidden="true" />
        <span className={`badge${recording ? ' recording' : ''}`}>
          {status === 'running' ? (badge ?? `Tracking · ${fps} fps`) : statusLabel(status)}
        </span>
        {status === 'running' && (
          <span className="badge points-badge" aria-hidden="true">
            {points.length === 0 ? 'No hand in view' : points.map((n, i) => `Hand ${i + 1}: ${n}/21`).join(' · ')}
            {processorInUse ? ` · ${processorInUse}` : ''}
          </span>
        )}
      </div>

      {/* Status is announced to screen readers, not just shown visually. */}
      <p className="sr-only" role="status">
        {status === 'running' ? `Camera running at ${fps} frames per second` : statusLabel(status)}
      </p>

      {error && (
        <p className="notice error">
          <strong>Camera problem</strong>
          {error}
        </p>
      )}

      {status === 'running' && fps > 0 && fps < 12 && (
        <p className="notice warn">
          <strong>Tracking is slow ({fps} fps)</strong>
          Recognition needs about 15 fps to work well. Close other tabs, or in Settings try
          &ldquo;Tracking runs on: Main processor&rdquo; or turn on &ldquo;hands only&rdquo;.
        </p>
      )}
    </div>
  );
}

function statusLabel(status: Status): string {
  switch (status) {
    case 'idle':
      return 'Camera off';
    case 'starting':
      return 'Starting camera…';
    case 'running':
      return 'Tracking';
    case 'error':
      return 'Camera unavailable';
  }
}

/** Draw the hand skeleton over the video. Purely a debugging/confidence aid for the user. */
function draw(
  canvas: HTMLCanvasElement | null,
  video: HTMLVideoElement,
  frame: TrackedFrame,
): void {
  if (!canvas) return;
  const width = video.videoWidth;
  const height = video.videoHeight;
  if (!width || !height) return;
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }

  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.clearRect(0, 0, width, height);

  frame.hands.forEach((hand, index) => {
    // Distinct colours per hand, but the app never relies on colour alone to convey
    // anything — this overlay is decorative and marked aria-hidden.
    const colour = index === 0 ? '#4cc9f0' : '#ffd166';
    ctx.strokeStyle = colour;
    ctx.fillStyle = colour;
    ctx.lineWidth = Math.max(2, width / 260);

    for (const [a, b] of HAND_CONNECTIONS) {
      const from = hand[a];
      const to = hand[b];
      if (!from || !to) continue;
      ctx.beginPath();
      ctx.moveTo(from.x * width, from.y * height);
      ctx.lineTo(to.x * width, to.y * height);
      ctx.stroke();
    }
    const radius = Math.max(3, width / 150);
    hand.forEach((point, i) => {
      const tip = i === 4 || i === 8 || i === 12 || i === 16 || i === 20;
      ctx.beginPath();
      ctx.arc(point.x * width, point.y * height, tip ? radius * 1.35 : radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.lineWidth = Math.max(1, width / 640);
      ctx.strokeStyle = '#0b1f1d';
      ctx.stroke();
      ctx.strokeStyle = colour;
      ctx.lineWidth = Math.max(2, width / 260);
    });
  });
}
