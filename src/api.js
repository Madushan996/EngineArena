import { Chess } from 'chess.js';
export const isDesktop = !!window.arena;
export const builtins = [
  { id: 'atlas', name: 'Atlas', author: 'Engine Arena', builtin: 'atlas', accent: 'green', description: 'Positional · Built-in engine' },
  { id: 'volt', name: 'Volt', author: 'Engine Arena', builtin: 'volt', accent: 'purple', description: 'Dynamic · Built-in engine' },
];
export function blankState(config = { games: 10, minutes: 1 }) {
  return { status: 'idle', game: 1, total: config.games, scores: [0, 0], results: [], history: [], fen: new Chess().fen(), clocks: { w: config.minutes * 60000, b: config.minutes * 60000 }, turn: 'w', white: 0, telemetry: [{}, {}], lastMove: null, thinkingAt: null, message: 'Your arena is ready' };
}
let subscribers = new Set(), state, config, chess, timer, previewEngines;
const readHistory = () => { try { return JSON.parse(localStorage.getItem('arena-history') || '[]'); } catch { return []; } };
function emit() { for (const callback of subscribers) callback(structuredClone(state)); }
function saveMatch() {
  if (!state.results.length) return;
  const history = readHistory(); history.unshift({ id: crypto.randomUUID(), date: new Date().toISOString(), engines: previewEngines, config, state });
  localStorage.setItem('arena-history', JSON.stringify(history.slice(0, 30)));
}
function nextGame() {
  chess = new Chess(); state.white = (state.game - 1) % 2; state.history = []; state.lastMove = null;
  state.fen = chess.fen(); state.turn = 'w'; state.clocks = { w: config.minutes * 60000, b: config.minutes * 60000 };
  state.thinkingAt = Date.now(); emit(); timer = setTimeout(step, 420);
}
function step() {
  if (state.status !== 'running') return;
  const turn = chess.turn(), index = turn === 'w' ? state.white : 1 - state.white;
  state.clocks[turn] = Math.max(0, state.clocks[turn] - (Date.now() - state.thinkingAt));
  if (!chess.isGameOver() && state.clocks[turn] > 0 && state.history.length < 800) {
    const values = { p: 1, n: 3, b: 3.2, r: 5, q: 9, k: 100 };
    const ranked = chess.moves({ verbose: true }).map(move => {
      chess.move(move);
      const score = (values[move.captured] || 0) * 10 + (move.promotion ? 70 : 0) + (chess.isCheckmate() ? 10000 : 0) - (chess.isAttacked(move.to, chess.turn()) ? values[move.piece] * 7 : 0) + Math.random() * 3 + (['d4', 'e4', 'd5', 'e5'].includes(move.to) ? 2 : 0);
      chess.undo(); return { move, score };
    }).sort((a, b) => b.score - a.score);
    const move = chess.move(ranked[0].move); state.history.push(move.san); state.lastMove = [move.from, move.to];
    state.clocks[turn] += config.increment * 1000; state.fen = chess.fen(); state.turn = chess.turn();
  }
  if (chess.isGameOver() || state.clocks[turn] <= 0 || state.history.length >= 800) {
    const winner = state.clocks[turn] <= 0 ? 1 - index : chess.isCheckmate() ? index : null;
    const reason = state.clocks[turn] <= 0 ? 'Time forfeit' : chess.isCheckmate() ? 'Checkmate' : chess.isStalemate() ? 'Stalemate' : chess.isThreefoldRepetition() ? 'Threefold repetition' : 'Draw';
    const result = winner === null ? '1/2-1/2' : winner === state.white ? '1-0' : '0-1';
    chess.header('Event', 'Engine Arena browser demo', 'Round', String(state.game), 'White', previewEngines[state.white].name, 'Black', previewEngines[1 - state.white].name, 'Result', result, 'Termination', reason);
    state.results.push({ game: state.game, white: state.white, winner, result, reason, pgn: chess.pgn(), fen: chess.fen(), moves: [...state.history] });
    if (winner === null) state.scores = state.scores.map(s => s + 0.5); else state.scores[winner]++;
    state.thinkingAt = null; emit();
    if (state.game === config.games) { state.status = 'finished'; state.message = 'Match complete'; emit(); saveMatch(); return; }
    state.game++; nextGame(); return;
  }
  state.thinkingAt = Date.now(); emit(); timer = setTimeout(step, 420);
}
const preview = {
  engines: async () => builtins,
  addEngine: async () => { throw new Error('Open the desktop app to load a local UCI executable. The browser preview includes two demo opponents.'); },
  importAnchors: async () => { throw new Error('Anchor engines can be imported in the desktop app.'); },
  removeEngine: async () => builtins,
  chooseLogo: async () => { throw new Error('Custom engine logos are available in the desktop app.'); },
  updateEngine: async patch => Object.assign(builtins.find(e => e.id === patch.id), patch),
  start: async options => {
    clearTimeout(timer); config = options; previewEngines = options.engineIds.map(id => builtins.find(e => e.id === id));
    state = { ...blankState(options), status: 'running', message: 'Browser demo in progress' }; nextGame();
  },
  pause: async () => {
    if (state.status === 'running') { state.clocks[state.turn] -= Date.now() - state.thinkingAt; clearTimeout(timer); state.status = 'paused'; state.thinkingAt = null; }
    else { state.status = 'running'; state.thinkingAt = Date.now(); timer = setTimeout(step, 420); }
    emit();
  },
  stop: async () => { clearTimeout(timer); state.status = 'stopped'; state.thinkingAt = null; state.message = 'Match stopped'; emit(); saveMatch(); },
  history: async () => readHistory(),
  exportPgn: async text => {
    const url = URL.createObjectURL(new Blob([text], { type: 'application/x-chess-pgn' }));
    const a = document.createElement('a'); a.href = url; a.download = 'Engine-Arena.pgn'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); return true;
  },
  exportResultImage: async ({ dataUrl, filename }) => {
    const bytes = Uint8Array.from(atob(dataUrl.split(',')[1]), char => char.charCodeAt(0));
    const url = URL.createObjectURL(new Blob([bytes], { type: 'image/png' }));
    const a = document.createElement('a'); a.href = url; a.download = filename; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000); return true;
  },
  onState: callback => { subscribers.add(callback); return () => subscribers.delete(callback); },
  systemInfo: async () => ({ cores: navigator.hardwareConcurrency || 4, cpu: 'Browser preview' }),
  chooseBook: async () => { throw new Error('Opening suites can be loaded in the desktop app.'); },
  chooseFolder: async () => { throw new Error('Folders can be chosen in the desktop app.'); },
  gauntlet: {
    start: async () => { throw new Error('Rating gauntlets run real UCI engines, so they need the desktop app.'); },
    current: async () => null, pause: async () => {}, stop: async () => {}, list: async () => [],
    exportPgn: async () => false, onState: () => () => {},
  },
  fastchess: {
    status: async () => ({ path: null, version: null }),
    locate: async () => { throw new Error('fastchess runs in the desktop app.'); },
    start: async () => { throw new Error('fastchess runs in the desktop app.'); },
    current: async () => null, stop: async () => {}, list: async () => [],
    exportPgn: async () => false, onState: () => () => {},
  },
};
export const api = window.arena || preview;
