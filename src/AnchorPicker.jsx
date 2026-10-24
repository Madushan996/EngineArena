import React, { useState } from 'react';
import { Info } from 'lucide-react';
import { api } from './api.js';
import { Badge } from './ui.jsx';
import { ratingLists, ratingOf } from './ratings.js';

// Editable per-list ratings for opponents. Drafts are saved to the engine when a field loses focus.
export function useRatingDrafts(list, { notify, attempt, refreshEngines }) {
  const [drafts, setDrafts] = useState({});
  const ratingInput = engine => drafts[`${list}:${engine.id}`] ?? String(ratingOf(engine, list) ?? '');
  const validRating = engine => { const text = ratingInput(engine).trim(); return text !== '' && Number(text) >= 0 && Number(text) <= 5000; };
  const setDraft = (engine, value) => setDrafts(d => ({ ...d, [`${list}:${engine.id}`]: value.replace(/[^\d]/g, '').slice(0, 4) }));
  async function saveRating(engine) {
    const key = `${list}:${engine.id}`, text = drafts[key];
    if (text === undefined) return;
    const value = text.trim() === '' ? null : Number(text);
    if (value !== null && !(value >= 0 && value <= 5000)) return notify('Ratings must be between 0 and 5000.', true);
    if (value === ratingOf(engine, list)) return;
    const updated = await attempt(() => api.updateEngine({ id: engine.id, ratings: { ...engine.ratings, [list]: value === null ? null : Math.round(value) } }));
    if (updated) { await refreshEngines(); setDrafts(d => { const next = { ...d }; delete next[key]; return next; }); }
  }
  return { ratingInput, validRating, setDraft, saveRating, clearDrafts: () => setDrafts({}) };
}

export default function AnchorPicker({ candidates, list, selectedIds, onChange, drafts, games, title = 'Rated opponents', icon: Icon }) {
  const toggle = id => onChange(selectedIds.includes(id) ? selectedIds.filter(x => x !== id) : [...selectedIds, id]);
  const sorted = [...candidates].sort((a, b) => (ratingOf(b, list) ?? -1) - (ratingOf(a, list) ?? -1));
  const chosen = candidates.filter(e => selectedIds.includes(e.id) && drafts.validRating(e));
  const average = chosen.length ? Math.round(chosen.reduce((sum, e) => sum + Number(drafts.ratingInput(e)), 0) / chosen.length) : null;
  return <section className="lab-panel">
    <div className="panel-heading"><div>{Icon && <Icon size={17} />}<h2>{title}</h2><span className="label-chip">{ratingLists[list].name.toUpperCase()}</span>{average && <span className="subtle-tag anchor-average">AVG {average}</span>}</div>
      <div className="lab-heading-actions"><button className="text-btn" onClick={() => onChange(candidates.filter(e => ratingOf(e, list) !== null).map(e => e.id))}>Select all rated</button><button className="text-btn" onClick={() => onChange([])}>Clear</button></div></div>
    {candidates.length ? <div className="opponent-picker">
      <div className="opponent-head"><span /><span>Engine</span><span>{ratingLists[list].name} rating</span><span>Games</span></div>
      {sorted.map(engine => { const on = selectedIds.includes(engine.id); return <div className={`opponent-row ${on ? 'on' : ''}`} key={engine.id}>
        <input type="checkbox" checked={on} onChange={() => toggle(engine.id)} aria-label={`Include ${engine.name}`} />
        <button className="opponent-name" onClick={() => toggle(engine.id)}><Badge engine={engine} small /><span><strong>{engine.name}</strong><small>{engine.anchor ? `CCRL anchor · ${engine.anchor}` : engine.builtin ? 'Built-in demo engine' : engine.author || 'UCI engine'}</small></span></button>
        <input className="rating-input" inputMode="numeric" placeholder="e.g. 3421" aria-label={`${engine.name} ${ratingLists[list].name} rating`} value={drafts.ratingInput(engine)} onChange={e => drafts.setDraft(engine, e.target.value)} onBlur={() => drafts.saveRating(engine)} />
        <span className="opponent-games">{on ? games : '—'}</span>
      </div>; })}
    </div> : <p className="lab-empty">Load anchor engines in the Engine library first (“Import anchors” finds known CCRL anchors automatically).</p>}
    <p className="lab-hint"><Info size={13} />Ratings are saved with each engine. Imported anchors come with their published CCRL Blitz and 40/15 ratings.</p>
  </section>;
}
