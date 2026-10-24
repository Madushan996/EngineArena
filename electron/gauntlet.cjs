// CCRL-style rating gauntlet: one engine plays every rated opponent with colour-reversed opening
// pairs, one thread per engine, and its performance is anchored to the opponents' list ratings.
const fs = require('node:fs/promises');
const { Chess } = require('chess.js');
const { EventEmitter } = require('node:events');
const { performance } = require('node:perf_hooks');
const { UciEngine } = require('./uci.cjs');
const { performanceRating } = require('./rating.cjs');
// Mirrors common fastchess settings: resign after 4 moves each beyond ±10 pawns (both engines),
// draw after move 40 when 8 moves each stay within ±0.10.
const RESIGN = { plies: 8, score: 1000 }, DRAW = { moveNumber: 40, plies: 16, score: 10 };
const MATE = 100000, TIME_MARGIN = 50;
function shuffle(list) {
  for (let i = list.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [list[i], list[j]] = [list[j], list[i]]; }
  return list;
}
function adjudicate(scores, moveNumber) {
  const recent = n => scores.length >= n && scores.slice(-n).every(s => s !== null) ? scores.slice(-n) : null;
  const resign = recent(RESIGN.plies);
  if (resign?.every(s => s >= RESIGN.score)) return { winner: 'w', reason: 'Adjudication: White is winning' };
  if (resign?.every(s => s <= -RESIGN.score)) return { winner: 'b', reason: 'Adjudication: Black is winning' };
  const draw = recent(DRAW.plies);
  if (moveNumber > DRAW.moveNumber && draw?.every(s => Math.abs(s) <= DRAW.score)) return { winner: null, reason: 'Adjudication: drawn position' };
  return null;
}
class Gauntlet extends EventEmitter {
  constructor(config, subject, opponents, book, { pgnPath } = {}) {
    super();
    Object.assign(this, { config, subject, opponents, book, pgnPath });
    this.cancelled = false; this.paused = false; this.sessions = new Set(); this.records = [];
    this.pgnWrite = Promise.resolve(); this.publishTimer = null; this.queue = this.schedule();
    this.state = {
      mode: 'gauntlet', status: 'starting', message: 'Preparing the gauntlet…', startedAt: Date.now(), finishedAt: null,
      tc: config.tc, list: config.list, minutes: config.minutes, increment: config.increment, hash: config.hash, concurrency: config.concurrency,
      book: config.bookName || 'Built-in book', adjudicate: !!config.adjudicate, subjectId: subject.id,
      planned: this.queue.length, finished: 0, wins: 0, draws: 0, losses: 0, points: 0, forfeits: 0, adjudicated: 0,
      opponents: opponents.map(o => ({ id: o.id, name: o.name, rating: o.rating, games: 0, wins: 0, draws: 0, losses: 0, points: 0, performance: null })),
      estimate: null, timeline: [], boards: [], recent: [],
    };
  }
  schedule() {
    const order = shuffle(this.book.map((_, i) => i)), queue = [];
    let game = 0, next = 0;
    // Interleave opponents so the estimate draws on every anchor from the first games.
    for (let pair = 0; pair < this.config.gamesPerOpponent / 2; pair++) for (let opponent = 0; opponent < this.opponents.length; opponent++) {
      const opening = this.book[order[next++ % order.length]];
      for (const subjectWhite of [true, false]) queue.push({ game: ++game, group: `${pair}:${opponent}`, opponent, subjectWhite, opening });
    }
    return queue;
  }
  publish() { clearTimeout(this.publishTimer); this.publishTimer = null; this.emit('state', structuredClone(this.state)); }
  touch() { if (!this.publishTimer) this.publishTimer = setTimeout(() => this.publish(), 150); }
  pause() {
    if (this.cancelled || this.state.status !== (this.paused ? 'paused' : 'running')) return;
    this.paused = !this.paused;
    if (this.paused) this.resumed = new Promise(resolve => { this.resume = resolve; }); else this.resume?.();
    this.state.status = this.paused ? 'paused' : 'running';
    this.state.message = this.paused ? 'Pausing after the current searches' : 'Gauntlet in progress';
    this.publish();
  }
  stop() {
    if (this.cancelled) return;
    this.cancelled = true; this.resume?.();
    for (const session of this.sessions) session.close();
    Object.assign(this.state, { status: 'stopped', boards: [], finishedAt: Date.now(), message: `Gauntlet stopped after ${this.state.finished} games. Unfinished games were discarded.` });
    this.publish();
  }
  async run() {
    this.state.status = 'running'; this.state.message = 'Gauntlet in progress'; this.publish();
    try {
      await Promise.all(Array.from({ length: Math.min(this.config.concurrency, this.queue.length) }, (_, slot) => this.worker(slot)));
      if (!this.cancelled) Object.assign(this.state, { status: 'finished', message: 'Gauntlet complete' });
    } catch (error) {
      if (!this.cancelled) {
        this.cancelled = true; this.resume?.();
        for (const session of this.sessions) session.close();
        Object.assign(this.state, { status: 'error', message: error.message });
      }
    } finally {
      this.state.boards = []; this.state.finishedAt ??= Date.now();
      await this.pgnWrite; this.publish();
    }
  }
  async worker(slot) { while (!this.cancelled && this.queue.length) await this.play(slot, this.queue.shift()); }
  async play(slot, job) {
    const opponent = this.opponents[job.opponent], engines = job.subjectWhite ? [this.subject, opponent] : [opponent, this.subject];
    const options = { threads: 1, hash: this.config.hash, syzygyPath: this.config.syzygyPath };
    const sessions = { w: new UciEngine(engines[0], options), b: new UciEngine(engines[1], options) };
    const { opening } = job, chess = new Chess(opening.fen || undefined), moves = [], scores = [];
    const base = this.config.minutes * 60000, increment = this.config.increment * 1000;
    const board = { slot, game: job.game, opponent: job.opponent, subjectWhite: job.subjectWhite, opening: opening.name, bookPlies: opening.moves.length, fen: chess.fen(), history: [], clocks: { w: base, b: base }, turn: chess.turn(), thinkingAt: null, lastMove: null, telemetry: { w: {}, b: {} } };
    for (const uci of opening.moves) {
      const played = chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
      moves.push(uci); board.history.push(played.san); board.lastMove = [played.from, played.to];
    }
    board.fen = chess.fen(); board.turn = chess.turn();
    let searchScore = null;
    for (const color of ['w', 'b']) {
      sessions[color].on('line', line => {
        if (!line.startsWith('info ') || this.cancelled) return;
        const previous = board.telemetry[color];
        const read = key => Number(line.match(new RegExp(`(?:^| )${key} (\\d+)`))?.[1]) || previous[key] || 0;
        const score = line.match(/score (cp|mate) (-?\d+)/);
        board.telemetry[color] = { depth: read('depth'), nodes: read('nodes'), nps: read('nps'), score: score ? { type: score[1], value: Number(score[2]) } : previous.score };
        if (score && color === board.turn && !/ (lower|upper)bound/.test(line)) {
          const value = Number(score[2]);
          searchScore = score[1] === 'cp' ? value : (value > 0 ? 1 : -1) * (MATE - Math.abs(value));
        }
        this.touch();
      });
      this.sessions.add(sessions[color]);
    }
    this.state.boards = [...this.state.boards, board].sort((a, b) => a.slot - b.slot); this.touch();
    try {
      try {
        await Promise.all([sessions.w.open(), sessions.b.open()]);
        await Promise.all([sessions.w.newGame(), sessions.b.newGame()]);
      } catch (error) {
        if (this.cancelled) return;
        throw new Error(`Could not start an engine for game ${job.game}: ${error.message}`);
      }
      let winner = null, reason = '', timer;
      while (!chess.isGameOver() && !this.cancelled) {
        if (this.paused) await this.resumed;
        if (this.cancelled) return;
        const turn = chess.turn(), other = turn === 'w' ? 'b' : 'w', started = performance.now();
        searchScore = null; board.turn = turn; board.thinkingAt = Date.now(); this.touch();
        let move, engineError;
        try {
          const forfeit = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Time forfeit')), Math.max(1, board.clocks[turn] + TIME_MARGIN)); });
          move = await Promise.race([sessions[turn].move(moves, board.clocks, increment, turn, opening.fen), forfeit]);
        } catch (error) { engineError = error; } finally { clearTimeout(timer); }
        if (this.cancelled) return;
        board.clocks[turn] -= performance.now() - started; board.thinkingAt = null;
        if (board.clocks[turn] < -TIME_MARGIN || engineError?.message === 'Time forfeit') { board.clocks[turn] = 0; winner = other; reason = 'Time forfeit'; this.state.forfeits++; break; }
        if (engineError) { winner = other; reason = engineError.message; break; }
        board.clocks[turn] = Math.max(0, board.clocks[turn]);
        let played;
        try { played = chess.move({ from: move.slice(0, 2), to: move.slice(2, 4), promotion: move[4] }); } catch { /* Illegal moves forfeit. */ }
        if (!played) { winner = other; reason = `Illegal move: ${move}`; break; }
        moves.push(move); board.clocks[turn] += increment;
        board.history.push(played.san); board.fen = chess.fen(); board.turn = chess.turn(); board.lastMove = [played.from, played.to];
        scores.push(searchScore === null ? null : turn === 'w' ? searchScore : -searchScore);
        const verdict = this.config.adjudicate && !chess.isGameOver() ? adjudicate(scores, chess.moveNumber()) : null;
        if (verdict) { ({ winner, reason } = verdict); this.state.adjudicated++; break; }
        if (board.history.length >= 800) { reason = 'Move limit (400 full moves)'; break; }
        this.touch();
      }
      if (this.cancelled) return;
      if (!reason) {
        if (chess.isCheckmate()) { winner = chess.turn() === 'w' ? 'b' : 'w'; reason = 'Checkmate'; }
        else reason = chess.isStalemate() ? 'Stalemate' : chess.isThreefoldRepetition() ? 'Threefold repetition' : chess.isInsufficientMaterial() ? 'Insufficient material' : 'Fifty-move rule';
      }
      this.record(job, opponent, engines, chess, winner, reason, board.history.length);
    } finally {
      for (const session of Object.values(sessions)) { session.close(); this.sessions.delete(session); }
      this.state.boards = this.state.boards.filter(b => b !== board);
    }
  }
  record(job, opponent, engines, chess, winner, reason, plies) {
    const result = winner === null ? '1/2-1/2' : winner === 'w' ? '1-0' : '0-1';
    const score = winner === null ? .5 : (winner === 'w') === job.subjectWhite ? 1 : 0;
    chess.header('Event', 'Engine Arena rating gauntlet', 'Site', 'Engine Arena', 'Date', new Date().toISOString().slice(0, 10).replaceAll('-', '.'), 'Round', String(job.game),
      'White', engines[0].name, 'Black', engines[1].name, 'Result', result, job.subjectWhite ? 'BlackElo' : 'WhiteElo', String(opponent.rating),
      'TimeControl', `${Math.round(this.config.minutes * 60000) / 1000}+${this.config.increment}`, 'Termination', reason, ...(job.opening.name ? ['Opening', job.opening.name] : []));
    if (this.pgnPath) { const pgn = chess.pgn(); this.pgnWrite = this.pgnWrite.then(() => fs.appendFile(this.pgnPath, pgn + '\n\n')).catch(error => console.error(error)); }
    const state = this.state, standing = state.opponents[job.opponent], key = score === 1 ? 'wins' : score === 0 ? 'losses' : 'draws';
    state.finished++; state.points += score; state[key]++;
    standing.games++; standing.points += score; standing[key]++;
    this.records.push({ rating: opponent.rating, score, group: job.group, opponent: job.opponent });
    const versus = performanceRating(this.records.filter(r => r.opponent === job.opponent));
    standing.performance = { elo: versus.elo, bound: versus.bound };
    state.estimate = performanceRating(this.records);
    state.timeline.push({ games: state.finished, elo: state.estimate.elo, low: state.estimate.low, high: state.estimate.high });
    if (state.timeline.length > 600) state.timeline = state.timeline.filter((_, i, all) => i % 2 === 0 || i === all.length - 1);
    state.recent = [{ game: job.game, opponent: job.opponent, subjectWhite: job.subjectWhite, score, result, reason, plies, opening: job.opening.name }, ...state.recent].slice(0, 60);
    state.message = `Game ${job.game}: ${reason}`;
    this.publish();
  }
}
module.exports = { Gauntlet, adjudicate };
