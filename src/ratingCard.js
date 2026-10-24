// Shareable rating-estimate card in a gothic black-notebook style. Drawn on a canvas at 1080 px wide.
import { ratingLists } from './ratings.js';

// Native sizes for sharing: Instagram feed (4:5 and 1:1), WhatsApp chats, and 9:16 Stories / WhatsApp Status.
export const cardFormats = [
  { id: 'portrait', name: 'Instagram post', ratio: '4:5', use: 'Fills the most of the feed', width: 1080, height: 1350 },
  { id: 'square', name: 'Square post', ratio: '1:1', use: 'Instagram grid · WhatsApp chats', width: 1080, height: 1080 },
  { id: 'story', name: 'Story / Status', ratio: '9:16', use: 'Instagram Stories · WhatsApp Status', width: 1080, height: 1920 },
];
// Stories cover the top and bottom of the screen with profile and reply bars; keep text clear of them.
const STORY_SAFE = 250;
const GOTHIC = '"Old English Text MT", "UnifrakturMaguntia", "Blackadder ITC", Georgia, serif';
const SERIF = '"Palatino Linotype", "Book Antiqua", Georgia, serif';
const HAND = '"Ink Free", "Segoe Script", "Bradley Hand", cursive';
const PAPER = '#ece6d8', BONE = '#d9d3c4', ASH = '#8d877c', RED = '#b3121b', INK_RED = '#c41a22';
const roman = n => ['I', 'II', 'III', 'IV', 'V', 'VI'][n];
const words = n => ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'][n] ?? n.toLocaleString('en-US');
const safe = value => String(value ?? '').replace(/[\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim();

/** Normalizes a finished (or stopped) CCRL-style or STC gauntlet into what the card shows. */
export function ratingCardModel({ engine, state, kind, tcLabel, date }) {
  const estimate = state?.estimate;
  if (!estimate || !Number.isFinite(estimate.elo)) throw new Error('Play at least one game before sharing a rating.');
  const games = state.finished ?? state.games ?? 0, list = ratingLists[state.list] || ratingLists.blitz;
  const opponents = (state.opponents || []).filter(o => o.games).map(o => ({ name: safe(o.name), rating: o.rating, games: o.games, score: o.points / o.games }))
    .sort((a, b) => b.rating - a.rating);
  const day = new Date(date || Date.now());
  return {
    name: safe(engine?.name) || 'Unknown engine', author: safe(engine?.author).slice(0, 80) || null, logo: /^data:image\/(png|jpeg|jpg|webp);base64,/.test(engine?.logo || '') ? engine.logo : null,
    elo: Math.round(estimate.elo), error: Number.isFinite(estimate.error) && estimate.error > 0 ? Math.round(estimate.error) : null,
    low: Number.isFinite(estimate.low) ? Math.round(estimate.low) : null, high: Number.isFinite(estimate.high) ? Math.round(estimate.high) : null,
    bound: estimate.bound, list: list.name, kind, tc: tcLabel, games, planned: state.planned, complete: state.status === 'finished',
    wins: state.wins, draws: state.draws, losses: state.losses, score: games ? (state.points ?? (state.wins + state.draws / 2)) / games : 0,
    opponents, dateLabel: day.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }),
    dateStamp: `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`,
  };
}
export function ratingCardFilename(model, format) {
  const stem = model.name.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '').replace(/\s+/g, '-').slice(0, 40).replace(/[. ]+$/g, '') || 'Engine';
  return `Rating-Note-${stem}-${model.elo}-${model.dateStamp}-${format}.png`;
}

// Deterministic noise so the same result always renders the same card.
function random(seed) { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return (s >>> 0) / 4294967296; }; }
function seedFrom(text) { let h = 2166136261; for (const c of text) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h; }
function font(ctx, size, family, style = '') { ctx.font = `${style} ${size}px ${family}`.trim(); }
function fit(ctx, text, maxWidth, size, family, style = '', min = 18) {
  let current = size;
  do { font(ctx, current, family, style); if (ctx.measureText(text).width <= maxWidth) return current; current -= 2; } while (current > min);
  return min;
}
function wrap(ctx, text, width) {
  const lines = []; let line = '';
  for (const word of text.split(' ')) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width > width && line) { lines.push(line); line = word; } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}
function leather(ctx, width, height, rand) {
  const base = ctx.createLinearGradient(0, 0, width, height);
  base.addColorStop(0, '#141314'); base.addColorStop(.5, '#0b0a0b'); base.addColorStop(1, '#111012');
  ctx.fillStyle = base; ctx.fillRect(0, 0, width, height);
  for (let i = 0; i < width * height / 260; i++) {
    const x = rand() * width, y = rand() * height, r = rand() * 1.6 + .3;
    ctx.fillStyle = rand() > .5 ? `rgba(255,255,255,${rand() * .035})` : `rgba(0,0,0,${rand() * .35})`;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  }
  ctx.strokeStyle = 'rgba(255,255,255,.025)'; ctx.lineWidth = 1;
  for (let i = 0; i < 40; i++) {
    const x = rand() * width, y = rand() * height, length = 40 + rand() * 160, angle = rand() * Math.PI;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(angle) * length, y + Math.sin(angle) * length); ctx.stroke();
  }
  const vignette = ctx.createRadialGradient(width / 2, height * .45, Math.min(width, height) * .25, width / 2, height / 2, Math.max(width, height) * .75);
  vignette.addColorStop(0, 'rgba(0,0,0,0)'); vignette.addColorStop(1, 'rgba(0,0,0,.72)');
  ctx.fillStyle = vignette; ctx.fillRect(0, 0, width, height);
}
// Gothic lettering with worn, chipped edges, like print rubbed off an old cover.
function wornText(ctx, text, x, y, size, color, rand, family = GOTHIC, align = 'center') {
  const canvas = document.createElement('canvas'), c = canvas.getContext('2d');
  font(c, size, family); const width = Math.ceil(c.measureText(text).width) + size, height = Math.ceil(size * 1.6);
  canvas.width = width; canvas.height = height;
  font(c, size, family); c.fillStyle = color; c.textBaseline = 'alphabetic'; c.textAlign = 'center'; c.fillText(text, width / 2, size * 1.15);
  c.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < width * height / 140; i++) { c.fillStyle = `rgba(0,0,0,${.25 + rand() * .75})`; c.beginPath(); c.arc(rand() * width, rand() * height, rand() * 1.8, 0, Math.PI * 2); c.fill(); }
  const left = align === 'center' ? x - width / 2 : x - size / 2;
  ctx.drawImage(canvas, left, y - size * 1.15);
}
function rule(ctx, x1, x2, y, color = 'rgba(217,211,196,.35)', widthPx = 1.5) { ctx.strokeStyle = color; ctx.lineWidth = widthPx; ctx.beginPath(); ctx.moveTo(x1, y); ctx.lineTo(x2, y); ctx.stroke(); }
function inkDrip(ctx, x, y, rand) {
  ctx.fillStyle = RED;
  for (let i = 0; i < 3; i++) {
    const dx = x + (i - 1) * 26 + rand() * 8, length = 12 + rand() * 24;
    ctx.beginPath(); ctx.moveTo(dx - 3, y); ctx.lineTo(dx + 3, y); ctx.lineTo(dx + 2, y + length); ctx.arc(dx, y + length, 4.5, 0, Math.PI); ctx.closePath(); ctx.fill();
  }
}
function apple(ctx, x, y, size) {
  ctx.save(); ctx.translate(x, y); ctx.scale(size / 40, size / 40);
  ctx.fillStyle = RED; ctx.beginPath();
  ctx.moveTo(0, -12); ctx.bezierCurveTo(-8, -20, -24, -16, -22, 2); ctx.bezierCurveTo(-20, 16, -9, 24, 0, 18); ctx.bezierCurveTo(9, 24, 20, 16, 22, 2); ctx.bezierCurveTo(24, -16, 8, -20, 0, -12); ctx.fill();
  ctx.strokeStyle = '#3a2a1c'; ctx.lineWidth = 2.4; ctx.beginPath(); ctx.moveTo(0, -12); ctx.quadraticCurveTo(1, -20, 5, -24); ctx.stroke();
  ctx.fillStyle = '#2f3b26'; ctx.beginPath(); ctx.ellipse(8, -21, 6, 2.6, -.5, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,.22)'; ctx.beginPath(); ctx.ellipse(-11, -4, 3, 7, .4, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}
async function loadImage(url) {
  if (!url) return null;
  return new Promise(resolve => {
    const image = new Image(), timer = setTimeout(() => resolve(null), 4000);
    image.onload = () => { clearTimeout(timer); resolve(image); }; image.onerror = () => { clearTimeout(timer); resolve(null); }; image.src = url;
  });
}
function seal(ctx, image, name, x, y, radius) {
  ctx.save(); ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2); ctx.fillStyle = '#18161a'; ctx.fill(); ctx.clip();
  if (image) {
    const scale = Math.min(radius * 1.55 / image.naturalWidth, radius * 1.55 / image.naturalHeight);
    ctx.filter = 'grayscale(1) contrast(1.15) brightness(1.05)';
    ctx.drawImage(image, x - image.naturalWidth * scale / 2, y - image.naturalHeight * scale / 2, image.naturalWidth * scale, image.naturalHeight * scale);
    ctx.filter = 'none';
  } else { font(ctx, radius * 1.1, GOTHIC); ctx.fillStyle = BONE; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(Array.from(name)[0].toUpperCase(), x, y + radius * .06); }
  ctx.restore();
  ctx.strokeStyle = BONE; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2); ctx.stroke();
  ctx.strokeStyle = 'rgba(217,211,196,.35)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(x, y, radius + 9, 0, Math.PI * 2); ctx.stroke();
}

export async function renderRatingCard(model, formatId = 'portrait') {
  const format = cardFormats.find(f => f.id === formatId) || cardFormats[1], { width, height } = format;
  await Promise.allSettled([GOTHIC, SERIF, HAND].map(family => document.fonts.load(`40px ${family}`)));
  const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext('2d'), rand = random(seedFrom(`${model.name}${model.elo}${model.games}${formatId}`));
  const tall = height >= 1350, story = height >= 1920, margin = 70;
  leather(ctx, width, height, rand);
  // Stitched inner border of the notebook cover.
  ctx.strokeStyle = 'rgba(217,211,196,.18)'; ctx.lineWidth = 2; ctx.setLineDash([10, 9]);
  ctx.strokeRect(34, 34, width - 68, height - 68); ctx.setLineDash([]);
  ctx.strokeStyle = 'rgba(217,211,196,.55)'; ctx.lineWidth = 1.5; ctx.strokeRect(48, 48, width - 96, height - 96);

  let y = story ? STORY_SAFE + 140 : tall ? 175 : 150;
  const titleSize = story ? 150 : tall ? 132 : 112;
  wornText(ctx, 'Rating Note', width / 2, y, titleSize, PAPER, rand);
  font(ctx, titleSize, GOTHIC); const titleWidth = ctx.measureText('Rating Note').width;
  // A red ink stroke under the title, bleeding at its end.
  ctx.strokeStyle = RED; ctx.lineWidth = 5; ctx.lineCap = 'round'; ctx.beginPath();
  ctx.moveTo(width / 2 - titleWidth / 2 + 10, y + 16); ctx.quadraticCurveTo(width / 2, y + 22, width / 2 + titleWidth / 2 - 20, y + 13); ctx.stroke();
  inkDrip(ctx, width / 2 + titleWidth / 2 - 50, y + 14, rand);
  y += story ? 96 : 78;
  font(ctx, 19, SERIF); ctx.fillStyle = ASH; ctx.textAlign = 'center'; ctx.letterSpacing = '7px';
  ctx.fillText(`${model.kind.toUpperCase()} · ${model.list.toUpperCase()}`, width / 2, y); ctx.letterSpacing = '0px';

  // The name, written by hand on a ruled line, beside the engine's seal.
  y += story ? 128 : tall ? 104 : 92;
  const sealRadius = story ? 74 : tall ? 64 : 54, sealX = margin + 40 + sealRadius;
  seal(ctx, await loadImage(model.logo), model.name, sealX, y - 20, sealRadius);
  const nameLeft = sealX + sealRadius + 46, nameRight = width - margin - 40, handSize = fit(ctx, model.name, nameRight - nameLeft, story ? 76 : 66, HAND, '', 30);
  ctx.save(); ctx.translate(nameLeft, y); ctx.rotate(-.025);
  font(ctx, handSize, HAND); ctx.fillStyle = INK_RED; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  ctx.shadowColor = 'rgba(196,26,34,.35)'; ctx.shadowBlur = 6; ctx.fillText(model.name, 0, 0); ctx.restore();
  rule(ctx, nameLeft - 10, nameRight, y + 16, 'rgba(217,211,196,.45)', 2);
  font(ctx, 16, SERIF, 'italic'); ctx.fillStyle = ASH; ctx.textAlign = 'left'; ctx.fillText('name of the engine', nameLeft, y + 44);
  if (model.author) {
    const authorSize = fit(ctx, `by ${model.author}`, nameRight - nameLeft - 170, story ? 26 : 23, SERIF, 'italic', 15);
    font(ctx, authorSize, SERIF, 'italic'); ctx.fillStyle = BONE; ctx.textAlign = 'right'; ctx.fillText(`by ${model.author}`, nameRight, y + 46);
  }

  // The verdict.
  y += story ? 218 : tall ? 192 : 186;
  const ratingText = `${model.bound === 'above' ? '>' : model.bound === 'below' ? '<' : ''}${model.elo}`;
  const ratingSize = story ? 230 : tall ? 200 : 168;
  wornText(ctx, ratingText, width / 2 - (model.error ? 60 : 0), y, ratingSize, PAPER, rand);
  font(ctx, ratingSize, GOTHIC); const ratingWidth = ctx.measureText(ratingText).width;
  if (model.error) { font(ctx, story ? 64 : 56, HAND); ctx.fillStyle = INK_RED; ctx.textAlign = 'left'; ctx.fillText(`± ${model.error}`, width / 2 - 60 + ratingWidth / 2 + 18, y - ratingSize * .2); }
  y += story ? 64 : 50;
  font(ctx, 21, SERIF, 'italic'); ctx.fillStyle = BONE; ctx.textAlign = 'center';
  ctx.fillText(model.low !== null && model.error ? `95% interval ${model.low} – ${model.high}` : 'Estimated rating', width / 2, y);

  // How to read it: the result written as the rules of the note.
  y += story ? 84 : tall ? 62 : 64;
  wornText(ctx, 'How to read it', width / 2, y, story ? 58 : tall ? 50 : 42, BONE, rand);
  rule(ctx, margin + 90, width / 2 - 200, y - 16); rule(ctx, width / 2 + 200, width - margin - 90, y - 16);
  const pct = `${(model.score * 100).toFixed(1)}%`, opponents = model.opponents.length;
  const rules = [
    `The engine whose name is written in this note shall be known as a ${model.elo}-rated engine on the ${model.list} scale.`,
    `This judgement was passed after ${model.games.toLocaleString('en-US')} games at ${model.tc}, against ${words(opponents)} rated ${opponents === 1 ? 'anchor' : 'anchors'}, scoring ${pct} (+${model.wins} =${model.draws} −${model.losses}).`,
    model.error ? `The verdict holds within ${model.error} Elo, nineteen times out of twenty.` : 'Until results differ from game to game, the margin of the verdict cannot be known.',
    `It won ${model.wins.toLocaleString('en-US')}, drew ${model.draws.toLocaleString('en-US')} and lost ${model.losses.toLocaleString('en-US')}${model.complete ? '' : ', before the trial was ended early'}.`,
  ].slice(0, 3);
  const ruleSize = story ? 27 : tall ? 25 : 23, lineGap = ruleSize * 1.42, textLeft = margin + 120, textWidth = width - textLeft - margin - 50;
  y += story ? 52 : tall ? 44 : 50;
  for (const [i, sentence] of rules.entries()) {
    font(ctx, ruleSize + 4, GOTHIC); ctx.fillStyle = INK_RED; ctx.textAlign = 'right'; ctx.fillText(roman(i), textLeft - 22, y);
    font(ctx, ruleSize, SERIF, 'italic'); ctx.fillStyle = BONE; ctx.textAlign = 'left';
    const lines = wrap(ctx, sentence, textWidth);
    lines.forEach((line, j) => ctx.fillText(line, textLeft, y + j * lineGap));
    y += lines.length * lineGap + (story ? 16 : 14);
  }

  // Those it faced.
  const bottom = story ? STORY_SAFE - 40 : 0, footerTop = height - 160 - bottom - 52;
  if (tall && model.opponents.length && y + 130 < footerTop) {
    y += story ? 46 : 30;
    wornText(ctx, 'Those it faced', width / 2, y, story ? 50 : 42, BONE, rand);
    y += story ? 46 : 30;
    // Rows below the column header (y + 14), leaving room for the "and N more" line when needed.
    const rowGap = story ? 40 : 36, space = footerTop - (y + 14), all = Math.floor(space / rowGap);
    const shown = Math.max(1, Math.min(story ? 12 : 6, all >= model.opponents.length ? model.opponents.length : Math.floor((space - rowGap * .8) / rowGap)));
    const rows = model.opponents.slice(0, shown), nameX = margin + 120, ratingX = width - margin - 260, scoreX = width - margin - 70;
    font(ctx, 14, SERIF); ctx.fillStyle = ASH; ctx.letterSpacing = '3px'; ctx.textAlign = 'left'; ctx.fillText('ANCHOR', nameX, y);
    ctx.textAlign = 'right'; ctx.fillText('RATING', ratingX, y); ctx.fillText('ITS SCORE', scoreX, y); ctx.letterSpacing = '0px';
    y += 14; rule(ctx, nameX, scoreX, y, 'rgba(217,211,196,.25)', 1);
    for (const o of rows) {
      y += rowGap;
      font(ctx, story ? 26 : 24, SERIF, 'italic'); ctx.fillStyle = BONE; ctx.textAlign = 'left';
      let label = o.name; while (ctx.measureText(label).width > ratingX - nameX - 120 && label.length > 4) label = label.slice(0, -2) + '…';
      ctx.fillText(label, nameX, y);
      font(ctx, story ? 26 : 24, SERIF); ctx.textAlign = 'right'; ctx.fillStyle = ASH; ctx.fillText(String(o.rating), ratingX, y);
      ctx.fillStyle = o.score >= .5 ? PAPER : INK_RED; ctx.fillText(`${(o.score * 100).toFixed(0)}%`, scoreX, y);
      rule(ctx, nameX, scoreX, y + 14, 'rgba(217,211,196,.08)', 1);
    }
    if (model.opponents.length > rows.length) { y += rowGap * .8; font(ctx, 18, SERIF, 'italic'); ctx.fillStyle = ASH; ctx.textAlign = 'left'; ctx.fillText(`and ${model.opponents.length - rows.length} more`, nameX, y); }
  }

  // Footer.
  apple(ctx, width / 2, height - 160 - bottom, story ? 40 : 32);
  rule(ctx, margin + 40, width / 2 - 40, height - 158 - bottom, 'rgba(217,211,196,.2)', 1); rule(ctx, width / 2 + 40, width - margin - 40, height - 158 - bottom, 'rgba(217,211,196,.2)', 1);
  font(ctx, 17, SERIF); ctx.fillStyle = ASH; ctx.textAlign = 'center'; ctx.letterSpacing = '4px';
  ctx.fillText(`ENGINE ARENA · ${model.dateLabel.toUpperCase()}`, width / 2, height - 104 - bottom); ctx.letterSpacing = '0px';
  font(ctx, 16, SERIF, 'italic'); ctx.fillStyle = '#6f6a61';
  ctx.fillText('A local estimate on supplied anchors — not an official CCRL rating.', width / 2, height - 76 - bottom);
  return { dataUrl: canvas.toDataURL('image/png'), width, height };
}
