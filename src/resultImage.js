import { resultFormats, resultScore } from './resultModel.js';

const green = '#b5e4a6', purple = '#c5afea', cream = '#f3ecdb', muted = '#a2b2a4';
function rounded(ctx, x, y, w, h, radius, fill, stroke) {
  ctx.beginPath(); ctx.roundRect(x, y, w, h, radius);
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.stroke(); }
}
function text(ctx, value, x, y, size, color = cream, font = 'Arial', align = 'center', weight = '400') {
  ctx.font = `${weight} ${size}px ${font}`; ctx.fillStyle = color; ctx.textAlign = align; ctx.textBaseline = 'alphabetic'; ctx.fillText(value, x, y);
}
function wrap(ctx, value, width) {
  const lines = []; let line = '';
  for (const word of value.split(' ')) {
    const joined = line ? `${line} ${word}` : word;
    if (ctx.measureText(joined).width <= width) { line = joined; continue; }
    if (line) { lines.push(line); line = ''; }
    for (const character of Array.from(word)) {
      if (ctx.measureText(line + character).width > width && line) { lines.push(line); line = ''; }
      line += character;
    }
  }
  if (line) lines.push(line);
  return lines;
}
function fittedText(ctx, value, x, y, width, initial, minimum, lines = 2, color = cream, font = 'Arial') {
  let size = initial, wrapped;
  do { ctx.font = `500 ${size}px ${font}`; wrapped = wrap(ctx, value, width); if (wrapped.length <= lines || size === minimum) break; size--; } while (size >= minimum);
  if (wrapped.length > lines) {
    wrapped = wrapped.slice(0, lines);
    let last = wrapped.at(-1);
    while (ctx.measureText(last + '…').width > width) last = Array.from(last).slice(0, -1).join('');
    wrapped[lines - 1] = last + '…';
  }
  wrapped.forEach((line, i) => text(ctx, line, x, y + i * (size + 5), size, color, font, 'center', '500'));
}
async function logoImage(url) {
  if (!url) return null;
  return new Promise(resolve => {
    const image = new Image(); let done = false;
    const finish = result => { if (!done) { done = true; clearTimeout(timer); resolve(result); } };
    const timer = setTimeout(() => finish(null), 4000);
    image.onload = () => finish(image); image.onerror = () => finish(null); image.src = url;
  });
}
function drawBadge(ctx, engine, image, x, y, color) {
  ctx.lineWidth = 2;
  rounded(ctx, x - 65, y - 65, 130, 130, 27, color === green ? '#273c2b' : '#342e44', color + '65');
  if (image) {
    const scale = Math.min(104 / image.naturalWidth, 104 / image.naturalHeight);
    ctx.save(); ctx.beginPath(); ctx.roundRect(x - 53, y - 53, 106, 106, 17); ctx.clip();
    ctx.drawImage(image, x - image.naturalWidth * scale / 2, y - image.naturalHeight * scale / 2, image.naturalWidth * scale, image.naturalHeight * scale); ctx.restore();
  } else if (engine.builtin === 'atlas') {
    ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(x - 37, y + 30); ctx.lineTo(x - 5, y - 34); ctx.lineTo(x + 8, y - 34); ctx.lineTo(x + 38, y + 30); ctx.lineTo(x + 15, y + 30); ctx.lineTo(x, y - 3); ctx.lineTo(x - 15, y + 30); ctx.closePath(); ctx.fill();
    rounded(ctx, x - 17, y + 19, 34, 10, 1, color);
  } else if (engine.builtin === 'volt') {
    ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(x + 13, y - 42); ctx.lineTo(x - 30, y + 7); ctx.lineTo(x - 3, y + 7); ctx.lineTo(x - 12, y + 42); ctx.lineTo(x + 31, y - 11); ctx.lineTo(x + 4, y - 11); ctx.closePath(); ctx.fill();
  } else { text(ctx, Array.from(engine.name)[0].toUpperCase(), x, y + 22, 66, color, 'Georgia'); }
}
function crown(ctx, x, y) {
  ctx.save(); ctx.translate(x, y); ctx.strokeStyle = '#d4bc81'; ctx.fillStyle = '#d4bc8120'; ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.moveTo(-18, 12); ctx.lineTo(-24, -9); ctx.lineTo(-10, -1); ctx.lineTo(0, -18); ctx.lineTo(10, -1); ctx.lineTo(24, -9); ctx.lineTo(18, 12); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(-18, 19); ctx.lineTo(18, 19); ctx.stroke(); ctx.restore();
}
export async function renderResultImage(model, formatId = 'square') {
  const format = resultFormats.find(f => f.id === formatId);
  if (!format) throw new Error('Choose a supported result image size.');
  await document.fonts.ready;
  const logos = await Promise.all(model.contenders.map(e => logoImage(e.logo)));
  const canvas = document.createElement('canvas'); canvas.width = format.width; canvas.height = format.height;
  const ctx = canvas.getContext('2d'); if (!ctx) throw new Error('Image rendering is unavailable.');
  const height = canvas.height, shift = (height - 1080) / 2;
  const background = ctx.createLinearGradient(0, 0, 1080, height);
  background.addColorStop(0, '#18271f'); background.addColorStop(.6, '#101b16'); background.addColorStop(1, '#0b1210');
  ctx.fillStyle = background; ctx.fillRect(0, 0, 1080, height);
  const glow = ctx.createRadialGradient(220, 480 + shift, 10, 220, 480 + shift, 650);
  glow.addColorStop(0, '#66834a20'); glow.addColorStop(1, '#66834a00'); ctx.fillStyle = glow; ctx.fillRect(0, 0, 1080, height);
  // Quiet chessboard pattern, not a screenshot of unrelated desktop content.
  ctx.save(); ctx.translate(860, height - 130); ctx.rotate(-Math.PI / 7);
  for (let row = -5; row < 6; row++) for (let col = -5; col < 6; col++) if ((row + col) % 2 === 0) { ctx.fillStyle = '#b5e4a608'; ctx.fillRect(col * 64, row * 64, 64, 64); }
  ctx.restore(); ctx.lineWidth = 1; rounded(ctx, 30, 30, 1020, height - 60, 24, null, '#c9ba8633');
  text(ctx, 'engine arena', 75, 97, 28, green, 'Arial', 'left', '600');
  text(ctx, model.preview ? 'BROWSER DEMO' : 'UCI ENGINE BATTLE', 1005, 94, 16, muted, 'Arial', 'right', '600');
  ctx.strokeStyle = '#b4c09e25'; ctx.beginPath(); ctx.moveTo(75, 130); ctx.lineTo(1005, 130); ctx.stroke();
  text(ctx, model.complete ? 'THE FINAL VERDICT' : 'PARTIAL MATCH RESULTS', 540, 194 + shift, 18, '#d4bc81', 'Arial', 'center', '600');
  text(ctx, model.verdict, 540, 263 + shift, 64, cream, 'Georgia');
  fittedText(ctx, model.subtitle, 540, 309 + shift, 880, 26, 20, 2, muted);
  rounded(ctx, 74, 362 + shift, 932, 453, 25, '#ffffff04', '#a6bea22a');
  model.contenders.forEach((engine, i) => {
    const x = i === 0 ? 285 : 795, color = i === 0 ? green : purple;
    drawBadge(ctx, engine, logos[i], x, 457 + shift, color);
    if (model.winner === i && model.complete) crown(ctx, x, 382 + shift);
    fittedText(ctx, engine.name, x, 555 + shift, 380, 38, 27, 2);
    text(ctx, resultScore(engine.score), x, 714 + shift, 136, color, 'Georgia');
    text(ctx, `${engine.wins} WINS   ·   ${engine.draws} DRAWS   ·   ${engine.losses} LOSSES`, x, 761 + shift, 18, muted, 'Arial');
  });
  text(ctx, ':', 540, 681 + shift, 74, '#72816f', 'Georgia');
  rounded(ctx, 105, 795 + shift, 870, 6, 3, purple);
  const share = model.scores[0] / Math.max(1, model.games);
  if (share) { ctx.save(); ctx.beginPath(); ctx.roundRect(105, 795 + shift, 870, 6, 3); ctx.clip(); ctx.fillStyle = green; ctx.fillRect(105, 795 + shift, 870 * share, 6); ctx.restore(); }
  const detailsY = 878 + shift;
  text(ctx, 'GAMES PLAYED', 242, detailsY, 14, muted, 'Arial', 'center', '600');
  text(ctx, 'TIME CONTROL', 540, detailsY, 14, muted, 'Arial', 'center', '600');
  text(ctx, 'DATE', 838, detailsY, 14, muted, 'Arial', 'center', '600');
  text(ctx, model.complete ? String(model.games) : `${model.games} / ${model.plannedGames}`, 242, detailsY + 40, 29);
  text(ctx, model.timeControl, 540, detailsY + 40, 27);
  text(ctx, model.dateLabel, 838, detailsY + 40, 24);
  if (!model.complete) text(ctx, 'Stopped early · completed games only', 540, detailsY + 82, 18, '#d4bc81');
  text(ctx, 'EVERY MOVE. A NEW POSSIBILITY.', 540, height - 68, 14, '#7c8c7f', 'Arial', 'center', '600');
  return { dataUrl: canvas.toDataURL('image/png'), width: canvas.width, height: canvas.height };
}
