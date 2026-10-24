import React, { useMemo, useState } from 'react';

// The rating estimate after each finished game, with its 95% interval as a band.
const W = 640, H = 210, PAD = { left: 46, right: 14, top: 14, bottom: 28 };
export default function EstimateChart({ timeline, anchors = [], label = 'Estimate' }) {
  const [hover, setHover] = useState(null);
  const points = timeline.filter(p => Number.isFinite(p.elo));
  const scale = useMemo(() => {
    if (!points.length) return null;
    const values = points.flatMap(p => [p.low ?? p.elo, p.high ?? p.elo]);
    // Keep the view on the estimate: early intervals are huge, so cap the band at ±300 around the latest value.
    const last = points.at(-1).elo, lo = Math.max(Math.min(...values), last - 300), hi = Math.min(Math.max(...values), last + 300);
    const pad = Math.max(10, (hi - lo) * .08), min = Math.floor((lo - pad) / 10) * 10, max = Math.ceil((hi + pad) / 10) * 10;
    const games = Math.max(points.at(-1).games, 2);
    return {
      min, max, games,
      x: g => PAD.left + (g / games) * (W - PAD.left - PAD.right),
      y: v => PAD.top + (1 - (Math.min(max, Math.max(min, v)) - min) / (max - min)) * (H - PAD.top - PAD.bottom),
    };
  }, [timeline]);
  if (!scale) return <div className="estimate-chart empty">The curve appears after the first finished game.</div>;
  const { x, y } = scale, banded = points.filter(p => Number.isFinite(p.low) && Number.isFinite(p.high));
  const band = banded.length > 1 ? `M${banded.map(p => `${x(p.games)},${y(p.high)}`).join('L')}L${[...banded].reverse().map(p => `${x(p.games)},${y(p.low)}`).join('L')}Z` : '';
  const line = `M${points.map(p => `${x(p.games)},${y(p.elo)}`).join('L')}`;
  const ticks = [scale.min, Math.round((scale.min + scale.max) / 20) * 10, scale.max];
  const visibleAnchors = anchors.filter(a => a.rating > scale.min && a.rating < scale.max);
  const active = hover ?? points.length - 1, point = points[active];
  function move(event) {
    const box = event.currentTarget.getBoundingClientRect(), games = ((event.clientX - box.left) / box.width * W - PAD.left) / (W - PAD.left - PAD.right) * scale.games;
    let best = 0; points.forEach((p, i) => { if (Math.abs(p.games - games) < Math.abs(points[best].games - games)) best = i; });
    setHover(best);
  }
  return <div className="estimate-chart">
    <div className="estimate-chart-readout"><span>{label} after {point.games} game{point.games === 1 ? '' : 's'}</span><strong>{Math.round(point.elo)}</strong>{Number.isFinite(point.low) && <small>95% {Math.round(point.low)} – {Math.round(point.high)}</small>}</div>
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${label} over ${points.at(-1).games} games, currently ${Math.round(points.at(-1).elo)}`} onMouseMove={move} onMouseLeave={() => setHover(null)}>
      {ticks.map(t => <g key={t}><line className="grid" x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} /><text className="axis" x={PAD.left - 8} y={y(t) + 3} textAnchor="end">{t}</text></g>)}
      {visibleAnchors.map(a => <g key={a.name}><line className="anchor" x1={PAD.left} x2={W - PAD.right} y1={y(a.rating)} y2={y(a.rating)} /><text className="anchor-label" x={W - PAD.right} y={y(a.rating) - 3} textAnchor="end">{a.name}</text></g>)}
      {band && <path className="band" d={band} />}
      <path className="line" d={line} />
      <line className="cursor" x1={x(point.games)} x2={x(point.games)} y1={PAD.top} y2={H - PAD.bottom} />
      <circle className="dot" cx={x(point.games)} cy={y(point.elo)} r="4" />
      <text className="axis" x={PAD.left} y={H - 8}>0</text><text className="axis" x={W - PAD.right} y={H - 8} textAnchor="end">{scale.games} games</text>
    </svg>
  </div>;
}
