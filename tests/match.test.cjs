const { test } = require('node:test');
const assert = require('node:assert/strict');
const { Chess } = require('chess.js');
const { Match } = require('../electron/match.cjs');
const { UciEngine } = require('../electron/uci.cjs');
const path = require('node:path');
const fs = require('node:fs');
const base = { games: 2, minutes: .015, increment: 0, threads: 1, hash: 16 };
const engines = [{ id: 'atlas', name: 'Atlas', builtin: 'atlas' }, { id: 'volt', name: 'Volt', builtin: 'volt' }];
function fakeSession(mode) {
  return { name: mode, path: process.execPath, args: [path.join(__dirname, 'fixtures', 'fake-engine.cjs'), mode] };
}
test('real bundled UCI handshake and legal move', { timeout: 15000 }, async () => {
  const engine = new UciEngine(engines[0], base);
  try {
    await engine.open(); await engine.newGame();
    const move = await engine.move([], { w: 1000, b: 1000 }, 0, 'w');
    const chess = new Chess(); assert.ok(chess.move({ from: move.slice(0, 2), to: move.slice(2, 4), promotion: move[4] }));
  } finally { engine.close(); }
});
test('timed multi-game match alternates colors, totals scores, and produces replayable PGN', { timeout: 25000 }, async () => {
  const match = new Match(base, engines);
  await match.run();
  assert.equal(match.state.status, 'finished', match.state.message);
  assert.equal(match.state.results.length, 2);
  assert.deepEqual(match.state.results.map(r => r.white), [0, 1]);
  assert.equal(match.state.scores.reduce((a, b) => a + b, 0), 2);
  for (const game of match.state.results) {
    const replay = new Chess(); replay.loadPgn(game.pgn);
    assert.equal(replay.fen(), game.fen); assert.match(game.pgn, /\[Result "/); assert.match(game.pgn, /\[TimeControl /);
  }
});
test('pause halts the next search and resume continues', { timeout: 15000 }, async () => {
  const match = new Match({ ...base, minutes: .05, games: 1 }, engines);
  let pausedHistory, resume;
  const paused = new Promise(resolve => { resume = resolve; });
  match.on('state', state => {
    if (state.history.length === 1 && !match.paused && pausedHistory === undefined) { match.pause(); pausedHistory = state.history.length; setTimeout(() => resume(), 350); }
  });
  const running = match.run();
  await paused;
  assert.equal(match.state.status, 'paused'); assert.equal(match.state.history.length, pausedHistory);
  match.pause(); await running;
  assert.equal(match.state.status, 'finished');
});
test('stop releases engines and does not award an unfinished game', { timeout: 10000 }, async () => {
  const match = new Match({ ...base, minutes: 1 }, engines);
  match.once('state', () => match.stop());
  await match.run();
  assert.equal(match.state.status, 'stopped'); assert.equal(match.state.results.length, 0);
  assert.equal(match.state.scores[0] + match.state.scores[1], 0);
  assert.ok(match.sessions.every(s => s.dead));
});
test('illegal moves lose the game and subsequent games still run', { timeout: 15000 }, async () => {
  const match = new Match({ ...base, games: 2 }, [fakeSession('illegal'), fakeSession('legal')]);
  await match.run();
  assert.equal(match.state.status, 'finished', match.state.message);
  assert.equal(match.state.results.length, 2);
  assert.deepEqual(match.state.scores, [0, 2]);
  assert.ok(match.state.results.every(r => r.reason.startsWith('Illegal move:')));
});
test('unresponsive engine loses on time without hanging the match', { timeout: 10000 }, async () => {
  const match = new Match({ ...base, games: 1, minutes: .01 }, [fakeSession('hang'), fakeSession('legal')]);
  await match.run();
  assert.equal(match.state.status, 'finished'); assert.deepEqual(match.state.scores, [0, 1]);
  assert.equal(match.state.results[0].reason, 'Time forfeit');
});
test('engine crash loses the game', { timeout: 10000 }, async () => {
  const match = new Match({ ...base, games: 1 }, [fakeSession('crash'), fakeSession('legal')]);
  await match.run();
  assert.equal(match.state.status, 'finished'); assert.deepEqual(match.state.scores, [0, 1]);
  assert.match(match.state.results[0].reason, /exited/);
});
const packagedRoot = process.env.PACKAGED_ROOT || path.resolve(__dirname, '..', 'release', 'win-unpacked');
const packagedExecutable = path.join(packagedRoot, 'Engine Arena.exe');
test('packaged desktop runtime runs its unpacked built-in engines', { timeout: 20000, skip: !fs.existsSync(path.join(packagedRoot, 'resources', 'app.asar')) }, async () => {
  const builtinScript = path.join(packagedRoot, 'resources', 'app.asar.unpacked', 'electron', 'builtin.cjs');
  assert.ok(fs.existsSync(builtinScript));
  const previousMode = process.env.ELECTRON_RUN_AS_NODE;
  process.env.ELECTRON_RUN_AS_NODE = '1';
  try {
    const packagedEngines = engines.map(engine => ({ ...engine, builtin: undefined, path: packagedExecutable, args: [builtinScript, engine.id] }));
    const match = new Match({ ...base, games: 2 }, packagedEngines);
    await match.run();
    assert.equal(match.state.status, 'finished', match.state.message);
    assert.equal(match.state.results.length, 2);
    assert.equal(match.state.scores[0] + match.state.scores[1], 2);
  } finally {
    if (previousMode === undefined) delete process.env.ELECTRON_RUN_AS_NODE; else process.env.ELECTRON_RUN_AS_NODE = previousMode;
  }
});
