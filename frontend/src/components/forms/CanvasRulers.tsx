'use client';

import { useMemo } from 'react';

// ---------------------------------------------------------------------------
// CanvasRulers — SVG-based ruler (horizontal or vertical)
// ---------------------------------------------------------------------------
export function CanvasRulers({ width, height, zoom, show, type }: {
  width: number;
  height: number;
  zoom: number;
  show: boolean;
  type: 'horizontal' | 'vertical';
}) {
  const ticks = useMemo(() => generateTicks(type === 'horizontal' ? width : height, zoom), [type, width, height, zoom]);

  if (!show) return null;

  if (type === 'horizontal') {
    return (
      <div className="bcv-ruler bcv-ruler-h">
        <svg width={width} height={16} viewBox={`0 0 ${width} 16`}>
          {ticks.map((t) => (
            <g key={t.pos}>
              <line x1={t.pos} y1={t.major ? 0 : 8} x2={t.pos} y2={16} stroke="var(--text-faint)" strokeWidth={t.major ? 1 : 0.5} />
              {t.major && (
                <text x={t.pos + 3} y={11} fill="var(--text-faint)" fontSize={9} fontFamily="var(--mono)">
                  {t.label}
                </text>
              )}
            </g>
          ))}
        </svg>
      </div>
    );
  }

  return (
    <div className="bcv-ruler bcv-ruler-v">
      <svg width={16} height={height} viewBox={`0 0 16 ${height}`}>
        {ticks.map((t) => (
          <g key={t.pos}>
            <line x1={t.major ? 0 : 8} y1={t.pos} x2={16} y2={t.pos} stroke="var(--text-faint)" strokeWidth={t.major ? 1 : 0.5} />
            {t.major && (
              <text x={3} y={t.pos - 3} fill="var(--text-faint)" fontSize={9} fontFamily="var(--mono)" writingMode="vertical-lr">
                {t.label}
              </text>
            )}
          </g>
        ))}
      </svg>
    </div>
  );
}

// ---------------------------------------------------------------------------
// generateTicks — create ruler tick marks
// ---------------------------------------------------------------------------
interface Tick {
  pos: number;
  major: boolean;
  label: string;
}

function generateTicks(size: number, zoom: number): Tick[] {
  const ticks: Tick[] = [];
  const step = 10; // pixels per minor tick
  const majorEvery = 5; // major tick every 50px
  for (let i = 0; i <= size; i += step) {
    const isMajor = (i / step) % majorEvery === 0;
    ticks.push({
      pos: i,
      major: isMajor,
      label: isMajor ? String(Math.round(i / zoom)) : '',
    });
  }
  return ticks;
}
