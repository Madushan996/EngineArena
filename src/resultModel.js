export const resultFormats = [
  { id: 'square', name: 'Square', width: 1080, height: 1080 },
  { id: 'portrait', name: 'Portrait', width: 1080, height: 1350 },
  { id: 'story', name: 'Status / Story', width: 1080, height: 1920 },
];
const safeName = name => String(name || 'Chess engine').replace(/[\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80) || 'Chess engine';
export const resultScore = score => Number.isInteger(score) ? String(score) : `${Math.floor(score) || ''}½`;
export function resultModel({ state, engines, config, date, preview = false }) {
  if (!state?.results?.length || !['finished', 'stopped', 'error'].includes(state.status)) throw new Error('Finish or stop a match before sharing its results.');
  if (engines?.length !== 2) throw new Error('Both engine names are needed for a result image.');
  const wins = [0, 0]; let draws = 0;
  for (const round of state.results) {
    if (round.winner === null) draws++;
    else if (round.winner === 0 || round.winner === 1) wins[round.winner]++;
    else throw new Error('This match contains an invalid result.');
  }
  const complete = state.status === 'finished', scores = wins.map(w => w + draws / 2);
  const winner = scores[0] === scores[1] ? null : scores[0] > scores[1] ? 0 : 1;
  const timestamp = new Date(date || Date.now());
  const day = Number.isNaN(timestamp.getTime()) ? new Date() : timestamp;
  const contenders = engines.map((engine, i) => ({
    name: safeName(engine.name), builtin: engine.builtin,
    logo: /^data:image\/(png|jpeg|jpg|webp);base64,/.test(engine.logo || '') ? engine.logo : null,
    wins: wins[i], draws, losses: wins[1 - i], score: scores[i],
  }));
  const seconds = Math.round(Number(config?.minutes || 0) * 60);
  const baseTime = seconds >= 60 && seconds % 60 === 0 ? `${seconds / 60} min` : `${seconds} sec`;
  return {
    contenders, scores, winner, complete, preview, games: state.results.length, plannedGames: state.total,
    timeControl: `${baseTime} + ${Number(config?.increment || 0)} sec`,
    dateLabel: day.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }),
    dateStamp: `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`,
    verdict: complete ? winner === null ? 'A battle of equals.' : 'Victory, earned.' : 'Until next time.',
    subtitle: winner === null ? `${state.results.length} games. Every move mattered.` : `${contenders[winner].name} ${complete ? 'takes the crown.' : 'leads the score.'}`,
  };
}
export function resultFilename(model, format) {
  const stem = value => value.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '').replace(/\s+/g, '-').slice(0, 36).replace(/[. ]+$/g, '') || 'Engine';
  return `Engine-Arena-${stem(model.contenders[0].name)}-vs-${stem(model.contenders[1].name)}-${model.dateStamp}-${format}.png`;
}
