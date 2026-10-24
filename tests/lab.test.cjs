const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { Chess } = require('chess.js');
const { pentanomialStats, performanceRating, llr } = require('../electron/rating.cjs');
const { builtinBook, builtinPgn, parseEpd, parsePgn, MAX_PLIES } = require('../electron/openings.cjs');
const { Gauntlet, adjudicate } = require('../electron/gauntlet.cjs');
const { FastchessRun, buildArgs, engineNames } = require('../electron/fastchess.cjs');
const near = (actual, expected, tolerance, label) => assert.ok(Math.abs(actual - expected) <= tolerance, `${label}: ${actual} vs ${expected}`);

test('pentanomial statistics reproduce fastchess 1.8.2 reports', () => {
  // Reported by fastchess: Elo 388.79 +/- 82.08, nElo 546.85 +/- 52.85, LOS 100.00 %, LLR 2.97 [0, 10].
  const a = pentanomialStats([0, 2, 6, 14, 61], { elo0: 0, elo1: 10, alpha: .05, beta: .05, model: 'normalized' });
  near(a.elo, 388.79, .01, 'elo'); near(a.error, 82.08, .01, 'error'); near(a.nElo, 546.85, .01, 'nElo'); near(a.nEloError, 52.85, .01, 'nElo error');
  near(a.llr, 2.97, .005, 'llr'); near(a.upper, 2.94, .005, 'upper bound');
  // Elo -88.74 +/- 172.82, nElo -141.84 +/- 240.76, LOS 12.41 %, LLR -0.04 [0, 5].
  const b = pentanomialStats([1, 0, 3, 0, 0], { elo0: 0, elo1: 5, alpha: .05, beta: .05, model: 'normalized' });
  near(b.elo, -88.74, .01, 'elo'); near(b.error, 172.82, .01, 'error'); near(b.nElo, -141.84, .01, 'nElo');
  near(b.los * 100, 12.41, .01, 'los'); near(b.llr, -.04, .005, 'llr');
  // Elo 394.88 +/- 82.31, nElo 565.64, LLR 2.98 [0, 10].
  const c = pentanomialStats([0, 1, 8, 12, 62], { elo0: 0, elo1: 10, model: 'normalized' });
  near(c.elo, 394.88, .01, 'elo'); near(c.error, 82.31, .01, 'error'); near(c.nElo, 565.64, .01, 'nElo'); near(c.llr, 2.98, .005, 'llr');
  assert.equal(pentanomialStats([0, 0, 0, 0, 0]), null);
  assert.ok(llr([10, 20, 40, 20, 10], { elo0: 0, elo1: 5, model: 'logistic' }) < 0);
});

test('anchored performance rating solves the gauntlet equation', () => {
  // Even score against a single 3000 anchor is exactly 3000.
  const even = performanceRating([{ rating: 3000, score: 1, group: 'a' }, { rating: 3000, score: 0, group: 'a' }, { rating: 3000, score: .5, group: 'b' }, { rating: 3000, score: .5, group: 'b' }]);
  near(even.elo, 3000, .01, 'even'); assert.equal(even.bound, null); assert.ok(even.error >= 0);
  // 75% against 3000 is 3000 + 191 Elo.
  const games = []; for (let i = 0; i < 40; i++) games.push({ rating: 3000, score: i % 4 ? 1 : 0, group: Math.floor(i / 2) });
  near(performanceRating(games).elo, 3190.85, .1, '75%');
  // Mixed anchors: sum of expected scores equals the points scored.
  const mixed = [{ rating: 3400, score: .5 }, { rating: 3200, score: 1 }, { rating: 3600, score: 0 }, { rating: 3300, score: .5 }];
  const r = performanceRating(mixed), expected = mixed.reduce((s, g) => s + 1 / (1 + 10 ** ((g.rating - r.elo) / 400)), 0);
  near(expected, 2, 1e-6, 'expected score');
  const shut = performanceRating([{ rating: 3000, score: 0 }, { rating: 3000, score: 0 }]);
  assert.equal(shut.bound, 'below'); assert.ok(shut.elo < 3000);
  assert.equal(performanceRating([]), null);
});

test('built-in book is legal, generic, and within CCRL’s 12 moves per side', () => {
  const book = builtinBook();
  assert.ok(book.length >= 50);
  assert.equal(new Set(book.map(b => b.moves.join(' '))).size, book.length);
  for (const line of book) {
    assert.ok(line.moves.length > 0 && line.moves.length <= MAX_PLIES, line.name);
    const chess = new Chess();
    for (const uci of line.moves) chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
    assert.ok(!chess.isGameOver(), line.name);
  }
  const roundTrip = parsePgn(builtinPgn());
  assert.equal(roundTrip.length, book.length);
  assert.deepEqual(roundTrip.map(b => b.moves), book.map(b => b.moves));
});

test('EPD and PGN suites are parsed, normalized, and capped to the book depth', () => {
  const epd = parseEpd('rnb1kbnr/ppp1pppp/8/4q3/8/2N5/PPPP1PPP/R1BQKBNR w KQkq - 2 4\nrnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - hmvc 0; fmvn 1; id "e4";\nnot a position\n');
  assert.equal(epd.length, 2);
  assert.equal(epd[0].fen, 'rnb1kbnr/ppp1pppp/8/4q3/8/2N5/PPPP1PPP/R1BQKBNR w KQkq - 2 4');
  assert.equal(epd[1].name, 'e4');
  const long = Array.from({ length: 20 }, (_, i) => `${i + 1}. Nf3 Nf6 ${i + 1}... `).join('');
  const pgn = parsePgn(`[Event "a"]\n\n1. e4 e5 2. Nf3 Nc6 *\n\n[Event "b"]\n[Opening "Shuffle"]\n\n1. Nf3 Nf6 2. Ng1 Ng8 3. Nf3 Nf6 4. Ng1 Ng8 5. Nf3 Nf6 6. Ng1 Ng8 7. Nf3 Nf6 8. Ng1 Ng8 9. Nf3 Nf6 10. Ng1 Ng8 11. Nf3 Nf6 12. Ng1 Ng8 13. Nf3 Nf6 *\n`, 24);
  assert.equal(pgn.length, 2); assert.deepEqual(pgn[0].moves, ['e2e4', 'e7e5', 'g1f3', 'b8c6']);
  assert.equal(pgn[1].name, 'Shuffle'); assert.equal(pgn[1].moves.length, 24);
  assert.ok(long);
});

test('adjudication requires agreement over consecutive moves', () => {
  assert.equal(adjudicate(Array(7).fill(1200), 30), null);
  assert.deepEqual(adjudicate(Array(8).fill(1200), 30).winner, 'w');
  assert.deepEqual(adjudicate(Array(8).fill(-1500), 30).winner, 'b');
  assert.equal(adjudicate([...Array(7).fill(1200), null], 30), null);
  assert.equal(adjudicate(Array(16).fill(5), 30), null);
  assert.equal(adjudicate(Array(16).fill(5), 41).winner, null);
  assert.equal(adjudicate([...Array(15).fill(5), 40], 41), null);
});

const builtins = [{ id: 'atlas', name: 'Atlas', builtin: 'atlas' }, { id: 'volt', name: 'Volt', builtin: 'volt', rating: 1500 }, { id: 'volt2', name: 'Volt II', builtin: 'volt', rating: 1700 }];
test('gauntlet plays paired openings against every anchor in parallel and estimates a rating', { timeout: 60000 }, async () => {
  const pgnPath = path.join(os.tmpdir(), `arena-gauntlet-${process.pid}.pgn`);
  try {
    const gauntlet = new Gauntlet({ minutes: .03, increment: .05, gamesPerOpponent: 4, concurrency: 3, hash: 16, adjudicate: true, tc: 'short', list: 'blitz' }, builtins[0], builtins.slice(1), builtinBook(), { pgnPath });
    let maxBoards = 0;
    gauntlet.on('state', state => { maxBoards = Math.max(maxBoards, state.boards.length); });
    await gauntlet.run();
    const s = gauntlet.state;
    assert.equal(s.status, 'finished', s.message);
    assert.equal(s.finished, 8); assert.equal(s.wins + s.draws + s.losses, 8);
    assert.ok(maxBoards > 1, 'games ran in parallel');
    assert.deepEqual(s.opponents.map(o => o.games), [4, 4]);
    assert.ok(Number.isFinite(s.estimate.elo));
    assert.deepEqual(s.boards, []);
    const games = fs.readFileSync(pgnPath, 'utf8').trim().split(/\n\n(?=\[Event)/);
    assert.equal(games.length, 8);
    for (const pgn of games) { const replay = new Chess(); replay.loadPgn(pgn); assert.match(pgn, /\[TimeControl "1\.8\+0\.05"\]/); assert.match(pgn, /Elo "1[57]00"/); }
    // Each opening is used for a colour-reversed pair against the same opponent.
    const queue = new Gauntlet({ minutes: 1, increment: 1, gamesPerOpponent: 6, concurrency: 1, hash: 16 }, builtins[0], builtins.slice(1), builtinBook()).queue;
    for (let i = 0; i < queue.length; i += 2) {
      assert.equal(queue[i].opening, queue[i + 1].opening); assert.equal(queue[i].opponent, queue[i + 1].opponent);
      assert.deepEqual([queue[i].subjectWhite, queue[i + 1].subjectWhite], [true, false]);
    }
  } finally { fs.rmSync(pgnPath, { force: true }); }
});
test('stopping a gauntlet discards unfinished games and closes every engine', { timeout: 20000 }, async () => {
  const gauntlet = new Gauntlet({ minutes: 1, increment: 1, gamesPerOpponent: 2, concurrency: 2, hash: 16 }, builtins[0], builtins.slice(1), builtinBook());
  gauntlet.on('state', state => { if (state.boards.length === 2 && state.boards.every(b => b.history.length > b.bookPlies)) gauntlet.stop(); });
  await gauntlet.run();
  assert.equal(gauntlet.state.status, 'stopped'); assert.equal(gauntlet.state.finished, 0);
  assert.equal(gauntlet.sessions.size, 0);
});

test('fastchess arguments follow the requested test and keep engine names unambiguous', () => {
  assert.deepEqual(engineNames([{ name: 'Engine' }, { name: 'Engine' }]), ['Engine (dev)', 'Engine (base)']);
  assert.deepEqual(engineNames([{ name: 'A vs B' }, { name: 'C' }]), ['A v. B', 'C']);
  const { args } = buildArgs({ tc: '8+0.08', hash: 16, threads: 1, concurrency: 3, mode: 'sprt', maxGames: 20000, sprt: { elo0: 0, elo1: 5, alpha: .05, beta: .05, model: 'normalized' }, adjudicate: false },
    [{ name: 'Dev', path: 'C:\\e\\dev.exe' }, { name: 'Base', path: 'C:\\e\\base.exe' }], { bookPath: 'C:\\b\\uho.epd', pgnPath: 'C:\\o\\x.pgn' });
  const after = flag => args.slice(args.indexOf(flag) + 1);
  assert.deepEqual(after('-sprt').slice(0, 5), ['elo0=0', 'elo1=5', 'alpha=0.05', 'beta=0.05', 'model=normalized']);
  assert.deepEqual(after('-openings').slice(0, 3), ['file=C:\\b\\uho.epd', 'format=epd', 'order=random']);
  assert.equal(after('-rounds')[0], '10000'); assert.ok(args.includes('-repeat')); assert.equal(after('-concurrency')[0], '3');
  assert.ok(!args.includes('-resign'));
  assert.ok(args.includes('tc=8+0.08') && args.includes('option.Hash=16') && args.includes('option.Threads=1'));
});

test('fastchess output is parsed into live pentanomial statistics and a verdict', async () => {
  const run = new FastchessRun({ tc: '1+0.01', hash: 16, threads: 1, concurrency: 2, mode: 'sprt', maxGames: 100, sprt: { elo0: 0, elo1: 5, alpha: .05, beta: .05, model: 'normalized' } },
    [{ id: 'a', name: 'SF8a', path: 'x' }, { id: 'b', name: 'SF8b', path: 'y' }], { executable: 'fastchess', bookPath: 'b.epd', bookName: 'b.epd' });
  const transcript = `Indexing opening suite...
\x1b[1mStarted game 1 of 8 (SF8a vs SF8b)\x1b[0m
Started game 2 of 8 (SF8b vs SF8a)
Warning; PV continues after threefold repetition - move g7h6 from SF8a
Info; info depth 8 seldepth 17 score cp 0
Position; fen r1bqkbnr/p1pppppp/1pn5/8/8/3N4/PPPPPPPP/RNBQKB1R b KQkq - 3 3
Moves; e7e5 g2g3
Finished game 1 (SF8a vs SF8b): 1-0 {White mates}
Finished game 2 (SF8b vs SF8a): 1-0 {White mates}
Finished game 3 (SF8a vs SF8b): 1/2-1/2 {Draw by 3-fold repetition}
Finished game 4 (SF8b vs SF8a): 1/2-1/2 {Draw by 3-fold repetition}
Finished game 5 (SF8a vs SF8b): 0-1 {Black mates}
Finished game 6 (SF8b vs SF8a): 1-0 {White mates}
Finished game 8 (SF8b vs SF8a): 0-1 {Black mates}
Finished game 7 (SF8a vs SF8b): 0-1 {Black mates}
--------------------------------------------------
Results of SF8a vs SF8b (1+0.01, 1t, 16MB, UHO_Lichess_4852_v1.epd):
Elo: -88.74 +/- 172.82, nElo: -141.84 +/- 240.76
LOS: 12.41 %, DrawRatio: 75.00 %, PairsRatio: 0.00
Games: 8, Wins: 2, Losses: 4, Draws: 2, Points: 3.0 (37.50 %)
Ptnml(0-2): [1, 0, 3, 0, 0], WL/DD Ratio: 2.00
LLR: -0.04 (-1.4%) (-2.94, 2.94) [0.00, 5.00]
--------------------------------------------------
SPRT ([0.00, 5.00]) completed - H0 was accepted`;
  for (const line of transcript.split('\n')) run.line(line);
  const s = run.state;
  assert.deepEqual([s.games, s.wins, s.losses, s.draws], [8, 2, 4, 2]);
  assert.deepEqual(s.ptnml, [1, 0, 3, 0, 0]);
  near(s.stats.elo, s.reported.elo, .01, 'elo'); near(s.stats.error, s.reported.error, .01, 'error'); near(s.stats.llr, s.reported.llr, .005, 'llr');
  assert.equal(s.reported.games, 8); assert.equal(s.verdict, 'H0'); assert.equal(s.warnings, 1);
  assert.ok(!s.log.some(line => /^(Info|Position|Moves);|PV continues|Started game/.test(line)));
  assert.ok(s.log.some(line => line.startsWith('Finished game 8')));
  clearTimeout(run.publishTimer);
});

const fastchessPath = process.env.FASTCHESS_PATH;
const enginePath = process.env.UCI_ENGINE_PATH;
test('real fastchess run (set FASTCHESS_PATH and UCI_ENGINE_PATH)', { timeout: 120000, skip: !(fastchessPath && enginePath && fs.existsSync(fastchessPath)) }, async () => {
  const book = path.join(os.tmpdir(), `arena-book-${process.pid}.pgn`);
  fs.writeFileSync(book, builtinPgn());
  try {
    const engines = [{ id: 'a', name: 'Dev', path: enginePath }, { id: 'b', name: 'Base', path: enginePath }];
    const run = new FastchessRun({ tc: '1+0.01', hash: 16, threads: 1, concurrency: 2, mode: 'games', games: 8, adjudicate: true }, engines, { executable: fastchessPath, bookPath: book, bookName: 'book' });
    const s = await run.start();
    assert.equal(s.status, 'finished', s.message); assert.equal(s.games, 8);
    assert.equal(s.ptnml.reduce((a, b) => a + b, 0), 4);
    near(s.stats.elo, s.reported.elo, .01, 'elo');
  } finally { fs.rmSync(book, { force: true }); }
});

const { findAnchor, anchorRatings, anchors, rejectedReason } = require('../electron/anchors.cjs');
test('anchor catalog matches engines by their UCI names and carries both CCRL lists', () => {
  assert.equal(findAnchor('Patricia 5.0').name, 'Patricia 5.0');
  assert.equal(findAnchor('Patricia 3.0'), null);
  assert.deepEqual(anchorRatings(findAnchor('Lizard 11.2.0')), { blitz: 3694, classical: 3569 });
  assert.deepEqual(anchorRatings(findAnchor('Stockfish 8 64 BMI2')), { blitz: 3421, classical: 3358 });
  assert.deepEqual(anchorRatings(findAnchor('Gyatso 1.6.0')), { blitz: 3568, classical: 3553 });
  assert.deepEqual(anchorRatings(findAnchor('Weiss 2.0')), { blitz: 3319, classical: 3263 });
  assert.deepEqual(anchorRatings(findAnchor('Tucano 12.00')), { blitz: 3491, classical: 3433 });
  // Engines that failed local calibration are no longer anchors, and say why.
  for (const name of ['Kociolek-2.1', 'Mantissa v3.7.2']) { assert.equal(findAnchor(name), null); assert.ok(rejectedReason(name)); }
  for (const a of anchors) for (const v of [a.blitz, a.classical].filter(v => v !== null)) assert.ok(v >= 3200 && v <= 3800, a.name);
});

test('fastchess STC gauntlet output yields per-anchor standings and a live anchored estimate', () => {
  const engines = [{ id: 's', name: 'Subject', path: 'x' }, { id: 'a', name: 'Anchor A', path: 'y' }, { id: 'b', name: 'Anchor B', path: 'z' }];
  const config = { tc: '8+0.08', hash: 16, threads: 1, concurrency: 2, mode: 'gauntlet', gamesPerOpponent: 4, ratings: [3400, 3200], list: 'blitz' };
  const { args } = buildArgs(config, engines, { bookPath: 'b.epd' });
  const after = flag => args.slice(args.indexOf(flag) + 1);
  assert.deepEqual(after('-tournament').slice(0, 5), ['gauntlet', '-seeds', '1', '-rounds', '2']);
  assert.ok(!args.includes('-sprt'));
  const run = new FastchessRun(config, engines, { executable: 'fastchess', bookPath: 'b.epd', bookName: 'b.epd' });
  const transcript = `Warning: Stats will be dropped for more than 2 engines.
Finished game 1 (Subject vs Anchor A): 1-0 {White mates}
Finished game 2 (Anchor A vs Subject): 1/2-1/2 {Draw by 3-fold repetition}
Finished game 3 (Subject vs Anchor B): 0-1 {Black wins by adjudication}
Finished game 4 (Anchor B vs Subject): 0-1 {Black mates}
Finished game 5 (Subject vs Anchor A): 1/2-1/2 {Draw by 3-fold repetition}
Finished game 6 (Anchor A vs Subject): 1-0 {White mates}
Finished game 8 (Anchor B vs Subject): 1/2-1/2 {Draw by adjudication}
Finished game 7 (Subject vs Anchor B): 1-0 {White wins by adjudication}`;
  for (const line of transcript.split('\n')) run.line(line);
  const s = run.state;
  assert.equal(s.planned, 8); assert.equal(s.games, 8); assert.deepEqual([s.wins, s.draws, s.losses], [3, 3, 2]);
  assert.deepEqual(s.opponents.map(o => [o.games, o.points]), [[4, 2], [4, 2.5]]);
  // Even against 3400 and 62.5% against 3200: the estimate sits between the anchors.
  const expected = [3400, 3200].reduce((sum, r, i) => sum + 4 / (1 + 10 ** ((r - s.estimate.elo) / 400)), 0);
  near(expected, s.points, 1e-6, 'expected score'); assert.ok(s.estimate.elo > 3200 && s.estimate.elo < 3400);
  assert.equal(s.timeline.length, 8); assert.equal(s.timeline.at(-1).elo, s.estimate.elo);
  assert.equal(s.recent[0].game, 7);
  clearTimeout(run.publishTimer);
});
