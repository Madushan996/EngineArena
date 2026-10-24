import React, { useEffect, useState } from 'react';
import { ArrowDownToLine, LoaderCircle, ShieldCheck } from 'lucide-react';
import { api, isDesktop } from './api.js';
import { resultFilename, resultFormats } from './resultModel.js';
import { renderResultImage } from './resultImage.js';

export default function ShareResult({ model, notify }) {
  const [format, setFormat] = useState('square'), [image, setImage] = useState(null), [error, setError] = useState(''), [saving, setSaving] = useState(false);
  useEffect(() => {
    let current = true; setImage(null); setError('');
    renderResultImage(model, format).then(result => { if (current) setImage(result); }).catch(e => { if (current) setError(e.message); });
    return () => { current = false; };
  }, [model, format]);
  async function download() {
    if (!image || saving) return;
    setSaving(true);
    try {
      const saved = await api.exportResultImage({ dataUrl: image.dataUrl, filename: resultFilename(model, format) });
      if (saved) notify('Result image saved. Attach it in WhatsApp or Facebook.');
    } catch (e) { notify(e.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, ''), true); }
    finally { setSaving(false); }
  }
  return <div className="share-result">
    <div className="eyebrow">A BATTLE WORTH SHARING</div><h2>Take the victory with you.</h2>
    <p className="modal-intro">A clean result card for chats, posts, and stories. Engine logos included.</p>
    <div className="share-formats" role="group" aria-label="Result image format">{resultFormats.map(item => <button key={item.id} aria-label={`${item.name} result image`} aria-pressed={format === item.id} disabled={saving} onClick={() => setFormat(item.id)}><strong>{item.name}</strong><span>{item.width} × {item.height}</span></button>)}</div>
    <div className="share-preview" aria-busy={!image && !error}>{image ? <img src={image.dataUrl} alt={`${model.contenders[0].name} versus ${model.contenders[1].name}: ${model.scores[0]} to ${model.scores[1]}, ${model.games} games. ${model.complete ? 'Final result.' : 'Stopped early.'}`} data-export-width={image.width} data-export-height={image.height} data-time-control={model.timeControl} /> : error ? <p role="alert">{error}</p> : <div role="status"><LoaderCircle className="spin" size={24} /><span>Preparing your result card…</span></div>}</div>
    <button className="primary-btn share-download" aria-label="Download result image" disabled={!image || saving} onClick={download}>{saving ? <LoaderCircle className="spin" size={17} /> : <ArrowDownToLine size={17} />}{saving ? 'Saving…' : 'Download result image'}</button>
    <p className="share-footnote"><ShieldCheck size={13} />{isDesktop ? 'Save as PNG or JPG. ' : 'Downloads as PNG. '}Nothing is posted or uploaded automatically.</p>
  </div>;
}
