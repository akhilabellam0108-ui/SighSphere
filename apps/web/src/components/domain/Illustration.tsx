import { createElement } from 'react';
import { ICONS, type IconName } from '../ui/icons.js';

/**
 * Onboarding / empty-state illustrations, drawn from brand shapes and the icon set so they
 * theme correctly and weigh almost nothing. Always decorative (aria-hidden).
 */

function Glyph({ name, x, y, size, color, width = 2 }: { name: IconName; x: number; y: number; size: number; color: string; width?: number }) {
  const scale = size / 24;
  return (
    <g
      transform={`translate(${x} ${y}) scale(${scale})`}
      fill="none"
      stroke={color}
      strokeWidth={width / scale}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {ICONS[name].map(([tag, attrs], index) => createElement(tag, { key: index, ...attrs }))}
    </g>
  );
}

function Person({ x, y, tone }: { x: number; y: number; tone: string }) {
  return (
    <g>
      <circle cx={x} cy={y} r="22" fill={tone} />
      <rect x={x - 34} y={y + 30} width="68" height="70" rx="30" fill={tone} opacity="0.9" />
    </g>
  );
}

export type IllustrationKind = 'communicate' | 'learn' | 'connect';

export function Illustration({ kind }: { kind: IllustrationKind }) {
  return (
    <svg className="illustration" viewBox="0 0 320 240" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id={`ill-${kind}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#4f46e5" />
          <stop offset="1" stopColor="#0e7490" />
        </linearGradient>
      </defs>
      <circle cx="160" cy="120" r="104" fill={`url(#ill-${kind})`} opacity="0.12" />
      <circle cx="160" cy="120" r="72" fill="none" stroke="#06b6d4" strokeOpacity="0.35" strokeWidth="2" strokeDasharray="4 8" />

      {kind === 'communicate' && (
        <>
          <Person x={88} y={96} tone="#4f46e5" />
          <Person x={232} y={96} tone="#0e7490" />
          <rect x="112" y="30" width="96" height="44" rx="16" fill="#ffffff" stroke="#4f46e5" strokeWidth="2" />
          <Glyph name="hand" x={126} y={40} size={24} color="#4f46e5" />
          <Glyph name="arrow-right" x={150} y={40} size={20} color="#0e7490" />
          <Glyph name="type" x={172} y={40} size={24} color="#0e7490" />
          <circle cx="160" cy="180" r="26" fill="#ffffff" stroke="#14b8a6" strokeWidth="2" />
          <Glyph name="sparkles" x={146} y={166} size={28} color="#0f766e" />
        </>
      )}

      {kind === 'learn' && (
        <>
          <rect x="84" y="46" width="152" height="112" rx="20" fill="#ffffff" stroke="#4f46e5" strokeWidth="2" />
          <Glyph name="hand" x={124} y={70} size={64} color="#4f46e5" width={2.5} />
          <rect x="102" y="170" width="116" height="12" rx="6" fill="#e0e7ff" />
          <rect x="102" y="170" width="78" height="12" rx="6" fill="url(#ill-learn)" />
          <circle cx="236" cy="54" r="22" fill="#22c55e" />
          <Glyph name="check" x={224} y={42} size={24} color="#ffffff" width={3} />
          <circle cx="84" cy="176" r="18" fill="#f59e0b" />
          <Glyph name="flame" x={74} y={166} size={20} color="#ffffff" />
        </>
      )}

      {kind === 'connect' && (
        <>
          <line x1="160" y1="120" x2="86" y2="70" stroke="#4f46e5" strokeOpacity="0.4" strokeWidth="2" />
          <line x1="160" y1="120" x2="238" y2="70" stroke="#4f46e5" strokeOpacity="0.4" strokeWidth="2" />
          <line x1="160" y1="120" x2="92" y2="184" stroke="#4f46e5" strokeOpacity="0.4" strokeWidth="2" />
          <line x1="160" y1="120" x2="230" y2="184" stroke="#4f46e5" strokeOpacity="0.4" strokeWidth="2" />
          <circle cx="160" cy="120" r="34" fill="url(#ill-connect)" />
          <Glyph name="hand-heart" x={142} y={102} size={36} color="#ffffff" />
          <circle cx="86" cy="70" r="22" fill="#4f46e5" />
          <circle cx="238" cy="70" r="22" fill="#0e7490" />
          <circle cx="92" cy="184" r="22" fill="#0f766e" />
          <circle cx="230" cy="184" r="22" fill="#7c3aed" />
          <Glyph name="profile" x={76} y={60} size={20} color="#ffffff" />
          <Glyph name="profile" x={228} y={60} size={20} color="#ffffff" />
          <Glyph name="profile" x={82} y={174} size={20} color="#ffffff" />
          <Glyph name="profile" x={220} y={174} size={20} color="#ffffff" />
        </>
      )}
    </svg>
  );
}
