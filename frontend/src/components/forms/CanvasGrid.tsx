'use client';

// ---------------------------------------------------------------------------
// CanvasGrid — CSS grid overlay for the builder canvas
// ---------------------------------------------------------------------------
export function CanvasGrid({ show, gridSize }: {
  show: boolean;
  gridSize: number;
}) {
  if (!show) return null;

  return (
    <div
      className="bcv-grid-overlay"
      style={{
        backgroundImage: `
          linear-gradient(to right, rgba(0,71,171,0.06) 1px, transparent 1px),
          linear-gradient(to bottom, rgba(0,71,171,0.06) 1px, transparent 1px)
        `,
        backgroundSize: `${gridSize}px ${gridSize}px`,
      }}
      aria-hidden="true"
    />
  );
}
