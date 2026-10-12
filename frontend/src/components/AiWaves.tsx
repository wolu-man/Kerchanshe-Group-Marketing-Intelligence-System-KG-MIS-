'use client';

// Tri-color motion waves (Kerchanshe blue/green/bronze) rendered around the
// AI assistant icons. Purely decorative — hidden from assistive tech.
export function AiWaves() {
  return (
    <span className="ai-waves" aria-hidden="true">
      <i className="ai-wave-1" />
      <i className="ai-wave-2" />
      <i className="ai-wave-3" />
    </span>
  );
}
