import React, { useEffect, useState } from 'react';
import { ArrowDownToLine, LoaderCircle, ShieldCheck } from 'lucide-react';
import { api, isDesktop } from './api.js';
import { cardFormats, ratingCardFilename, renderRatingCard } from './ratingCard.js';

export default function RatingShare({ model, notify }) {
  const [format, setFormat] = useState('portrait'), [image, setImage] = useState(null), [error, setError] = useState(''), [saving, setSaving] = useState(false);
  useEffect(() => {
    let current = true; setImage(null); setError('');
    renderRatingCard(model, format).then(result => { if (current) setImage(result); }).catch(e => { if (current) setError(e.message); });
    return () => { current = false; };
  }, [model, format]);
  async function download() {
    if (!image || saving) return;
    setSaving(true);
    try { if (await api.exportResultImage({ dataUrl: image.dataUrl, filename: ratingCardFilename(model, format) })) notify('Rating card saved.'); }
    catch (e) { notify(e.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, ''), true); }
    finally { setSaving(false); }
  }
  return <div className="share-result rating-share">
    <div className="eyebrow">WRITE IT DOWN</div><h2>The rating, in ink.</h2>
    <p className="modal-intro">A gothic notebook card with {model.name}’s estimated {model.list} rating, its margin, and the anchors it faced.</p>
    <div className="share-formats" role="group" aria-label="Rating card format">{cardFormats.map(item => <button key={item.id} aria-label={`${item.name} rating card`} aria-pressed={format === item.id} disabled={saving} onClick={() => setFormat(item.id)}><strong>{item.name} · {item.ratio}</strong><span>{item.use}</span><span>{item.width} × {item.height}</span></button>)}</div>
    <div className="share-preview" aria-busy={!image && !error}>{image ? <img src={image.dataUrl} alt={`Rating card: ${model.name}, estimated ${model.list} ${model.elo}${model.error ? ` plus or minus ${model.error}` : ''} over ${model.games} games.`} data-export-width={image.width} data-export-height={image.height} /> : error ? <p role="alert">{error}</p> : <div role="status"><LoaderCircle className="spin" size={24} /><span>Inking the card…</span></div>}</div>
    <button className="primary-btn share-download" aria-label="Download rating card" disabled={!image || saving} onClick={download}>{saving ? <LoaderCircle className="spin" size={17} /> : <ArrowDownToLine size={17} />}{saving ? 'Saving…' : 'Download rating card'}</button>
    <p className="share-footnote"><ShieldCheck size={13} />{isDesktop ? 'Save as PNG or JPG. ' : 'Downloads as PNG. '}Nothing is posted or uploaded automatically.</p>
  </div>;
}
