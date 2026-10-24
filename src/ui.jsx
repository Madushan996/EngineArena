import React from 'react';
import { ChevronDown, Cpu, Zap } from 'lucide-react';
import { ratingLists, ratingOf } from './ratings.js';

export const formatScore = score => Number.isInteger(score) ? score : `${Math.floor(score) || ''}½`;
export function clock(ms) { ms = Math.max(0, ms); return `${String(Math.floor(ms / 60000)).padStart(2, '0')}:${String(Math.floor(ms % 60000 / 1000)).padStart(2, '0')}${ms < 10000 ? '.' + Math.floor(ms % 1000 / 100) : ''}`; }
export function duration(ms) {
  if (!Number.isFinite(ms) || ms < 0) return '—';
  const minutes = Math.round(ms / 60000);
  return minutes < 60 ? `${Math.max(1, minutes)} min` : `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, '0')} m`;
}
export function Badge({ engine, small = false }) {
  if (engine?.logo) return <div className={`engine-badge ${small ? 'small' : ''}`}><img src={engine.logo} alt={`${engine.name} logo`} /></div>;
  return <div className={`engine-badge ${engine?.accent || 'green'} ${small ? 'small' : ''}`}>
    {engine?.builtin === 'atlas' ? <svg viewBox="0 0 52 52" aria-hidden="true"><path d="M8 39 24 10h6l15 29H33l-7-14-7 14Z" fill="currentColor" /><path d="M22 35h9l3 6H19Z" fill="currentColor" opacity=".5" /></svg> : engine?.builtin === 'volt' ? <Zap size={small ? 22 : 34} fill="currentColor" strokeWidth={1.5} /> : <Cpu size={small ? 22 : 32} />}
  </div>;
}
export function Field({ label, children, hint }) { return <label className="field"><span>{label}{hint && <span className="field-hint">{hint}</span>}</span>{children}</label>; }
export function EngineSelect({ value, engines, onChange, disabled, exclude, label = 'Select engine' }) {
  const selected = engines.find(e => e.id === value);
  return <div className="engine-select"><Badge engine={selected} small /><select value={value || ''} disabled={disabled} onChange={e => onChange(e.target.value)} aria-label={label}>{!selected && <option value="" disabled>Choose an engine</option>}{engines.map(e => <option key={e.id} value={e.id} disabled={e.id === exclude}>{e.name}</option>)}</select><ChevronDown size={15} /></div>;
}
// A compact CCRL rating label; shows the list's published rating, or an estimate from a gauntlet.
export function RatingTag({ engine, list, estimate, className = '' }) {
  const rating = ratingOf(engine, list);
  // Without a published rating, fall back to the latest gauntlet estimate on the same list.
  estimate ||= rating === null ? Object.values(engine?.estimates || {}).filter(e => e.list === list).sort((a, b) => b.date.localeCompare(a.date))[0] : null;
  if (estimate) return <span className={`rating-tag estimate ${className}`} title={`Estimated ${ratingLists[list].name} rating from this gauntlet`}>≈{Math.round(estimate.elo)}{estimate.error ? <small>±{Math.round(estimate.error)}</small> : null}</span>;
  if (rating === null) return <span className={`rating-tag unrated ${className}`} title={`No ${ratingLists[list].name} rating saved`}>Unrated</span>;
  return <span className={`rating-tag ${className}`} title={ratingLists[list].name}><small>{ratingLists[list].short}</small>{rating}</span>;
}
