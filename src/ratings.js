// Rating lists and the gauntlet time controls. Mirrors gauntletControls in electron/main.cjs.
export const ratingLists = {
  blitz: { id: 'blitz', name: 'CCRL Blitz', short: 'Blitz' },
  classical: { id: 'classical', name: 'CCRL 40/15', short: '40/15' },
};
export const gauntletControls = [
  { id: 'short', name: 'Short blitz', minutes: 1, increment: 1, list: 'blitz', hash: [128, 256], label: '1 min + 1 sec' },
  { id: 'long', name: 'Long blitz', minutes: 4, increment: 2, list: 'blitz', hash: [128, 256], label: '4 min + 2 sec' },
  { id: 'classical', name: 'Classical', minutes: 12, increment: 8, list: 'classical', hash: [256, 512], label: '12 min + 8 sec' },
];
export const controlById = id => gauntletControls.find(c => c.id === id) || gauntletControls[0];
// Treat a time control as classical once a 40-move game would last at least ten minutes per side.
export const listForTime = (minutes, increment) => minutes + increment * 40 / 60 >= 10 ? 'classical' : 'blitz';
export const ratingOf = (engine, list) => Number.isFinite(engine?.ratings?.[list]) ? engine.ratings[list] : null;
// Rough wall-clock length of one game: engines rarely use the whole base time, and most games end near move 60.
export const gameDuration = (minutes, increment) => 2 * (minutes * 60 * .85 + increment * 60) * 1000 + 1500;
export const formatRating = (estimate, digits = 0) => estimate ? `${estimate.bound === 'above' ? '>' : estimate.bound === 'below' ? '<' : ''}${estimate.elo.toFixed(digits)}` : '—';
export const signed = (value, digits = 1) => Number.isFinite(value) ? `${value >= 0 ? '+' : ''}${value.toFixed(digits)}` : '—';
