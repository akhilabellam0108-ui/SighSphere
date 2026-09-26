/**
 * Avatar timeline: a sentence of signs → one continuous performance.
 *
 *   rest ─blend→ sign 1 ─blend→ sign 2 ─ … ─blend→ rest
 *
 * Each sign is a real motion clip (see motion.ts). Transitions blend the last pose of one
 * sign into the first pose of the next so the avatar never teleports. A sign with no motion
 * yet is held as a captioned rest pose, so the sentence still reads in order.
 * Pure logic: no three.js, no DOM.
 */

import { blendRigs, clipReference, frameToRig, restRig, type Rig, type RigReference } from './avatarRig.js';
import { clipDuration, sampleClip, type MotionClip } from './motion.js';

export interface SegmentInput {
  gloss: string;
  caption: string;
  clip: MotionClip | null;
  /** Where the motion came from, for the on-screen label. */
  source: string | null;
  /** How long to hold a sign that has no motion (default MISSING_HOLD_MS). */
  holdMs?: number;
}

interface Segment extends SegmentInput {
  start: number;
  end: number;
  ref: RigReference | null;
}

export interface Timeline {
  segments: Segment[];
  duration: number;
}

export const LEAD_IN_MS = 350;
export const TRANSITION_MS = 240;
export const LEAD_OUT_MS = 450;
export const MISSING_HOLD_MS = 900;

export function buildTimeline(inputs: SegmentInput[]): Timeline {
  let t = LEAD_IN_MS;
  const segments: Segment[] = inputs.map((input, i) => {
    const length = input.clip ? Math.max(200, clipDuration(input.clip)) : (input.holdMs ?? MISSING_HOLD_MS);
    const start = t + (i > 0 ? TRANSITION_MS : 0);
    const end = start + length;
    t = end;
    return { ...input, start, end, ref: input.clip ? clipReference(input.clip) : null };
  });
  return { segments, duration: segments.length > 0 ? t + LEAD_OUT_MS : 0 };
}

function segmentRig(segment: Segment, t: number): Rig {
  if (!segment.clip) return restRig();
  return frameToRig(sampleClip(segment.clip, t - segment.start), segment.ref);
}

export interface TimelineState {
  rig: Rig;
  /** Index of the sign being shown (or about to be), -1 before the first. */
  index: number;
  finished: boolean;
}

export function stateAt(timeline: Timeline, t: number): TimelineState {
  const { segments } = timeline;
  if (segments.length === 0) return { rig: restRig(), index: -1, finished: true };
  if (t >= timeline.duration) return { rig: restRig(), index: segments.length - 1, finished: true };

  const first = segments[0] as Segment;
  if (t < first.start) {
    return { rig: blendRigs(restRig(), segmentRig(first, first.start), t / first.start), index: 0, finished: false };
  }
  for (let i = 0; i < segments.length; i += 1) {
    const seg = segments[i] as Segment;
    if (t >= seg.start && t <= seg.end) return { rig: segmentRig(seg, t), index: i, finished: false };
    const next = segments[i + 1];
    if (next && t > seg.end && t < next.start) {
      const w = (t - seg.end) / (next.start - seg.end);
      return { rig: blendRigs(segmentRig(seg, seg.end), segmentRig(next, next.start), w), index: i + 1, finished: false };
    }
  }
  const last = segments[segments.length - 1] as Segment;
  const w = Math.min(1, (t - last.end) / LEAD_OUT_MS);
  return { rig: blendRigs(segmentRig(last, last.end), restRig(), w), index: segments.length - 1, finished: false };
}

/** Time at which sign i starts (for Previous / Next). */
export function startOf(timeline: Timeline, index: number): number {
  const seg = timeline.segments[Math.max(0, Math.min(index, timeline.segments.length - 1))];
  return seg ? Math.max(0, seg.start - (index > 0 ? TRANSITION_MS : LEAD_IN_MS)) : 0;
}
