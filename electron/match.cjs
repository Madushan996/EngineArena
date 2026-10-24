const { Chess } = require('chess.js');
const { EventEmitter } = require('node:events');
const { performance } = require('node:perf_hooks');
const { UciEngine } = require('./uci.cjs');
class Match extends EventEmitter {
  constructor(config, engines) {
    super();
    this.config = config; this.engines = engines;
    this.sessions = []; this.cancelled = false; this.paused = false;
    this.state = { status: 'starting', game: 1, total: config.games, scores: [0, 0], results: [], history: [], fen: new Chess().fen(), clocks: { w: config.minutes * 60000, b: config.minutes * 60000 }, turn: 'w', white: 0, telemetry: [{}, {}], lastMove: null, thinkingAt: null, message: 'Connecting to engines…' };
  }
  publish() { this.emit('state', structuredClone(this.state)); }
  createSession(i) {
    const session = new UciEngine(this.engines[i], this.config);
    session.on('line', line => {
      if (!line.startsWith('info ') || this.cancelled) return;
      const previous = this.state.telemetry[i];
      const read = key => Number(line.match(new RegExp(`(?:^| )${key} (\\d+)`))?.[1]) || previous[key] || 0;
      const score = line.match(/score (cp|mate) (-?\d+)/);
      this.state.telemetry[i] = { depth: read('depth'), nodes: read('nodes'), nps: read('nps'), score: score ? { type: score[1], value: Number(score[2]) } : previous.score };
      this.publish();
    });
    return session;
  }
  pause() { this.paused = !this.paused; this.state.status = this.paused ? 'paused' : 'running'; this.state.message = this.paused ? 'Pausing after the current move' : 'Engines are battling'; this.publish(); if (!this.paused) this.resumeWait?.(); }
  stop() { this.cancelled = true; this.resumeWait?.(); this.sessions.forEach(s => s.close()); this.state.status = 'stopped'; this.state.message = 'Match stopped. Completed games are saved.'; this.state.thinkingAt = null; this.publish(); }
  async run() {
    try {
      for (let i = 0; i < 2; i++) {
        const session = this.createSession(i); this.sessions.push(session);
        await session.open();
      }
      for (let game = 1; game <= this.config.games && !this.cancelled; game++) {
        const chess = new Chess(), moves = []; const white = (game - 1) % 2;
        this.state = { ...this.state, game, white, status: this.paused ? 'paused' : 'running', fen: chess.fen(), history: [], clocks: { w: this.config.minutes * 60000, b: this.config.minutes * 60000 }, turn: 'w', lastMove: null, telemetry: [{}, {}], message: 'Engines are battling' };
        for (const session of this.sessions) await session.newGame();
        let winner = null, reason = '', clockTimer;
        while (!chess.isGameOver() && !this.cancelled) {
          if (this.paused) await new Promise(resolve => { this.resumeWait = resolve; });
          if (this.cancelled) break;
          const turn = chess.turn(), index = turn === 'w' ? white : 1 - white;
          const started = performance.now();
          this.state.thinkingAt = Date.now(); this.state.turn = turn; this.publish();
          let move, engineError;
          try {
            const timeout = new Promise((_, reject) => { clockTimer = setTimeout(() => reject(new Error('Time forfeit')), Math.max(1, this.state.clocks[turn])); });
            move = await Promise.race([this.sessions[index].move(moves, this.state.clocks, this.config.increment * 1000, turn), timeout]);
          } catch (error) { engineError = error; } finally { clearTimeout(clockTimer); }
          if (this.cancelled) break;
          this.state.clocks[turn] -= performance.now() - started;
          this.state.thinkingAt = null;
          if (this.state.clocks[turn] <= 0 || engineError?.message === 'Time forfeit') { this.state.clocks[turn] = 0; winner = 1 - index; reason = 'Time forfeit'; break; }
          if (engineError) { winner = 1 - index; reason = engineError.message; break; }
          let played;
          try { played = chess.move({ from: move.slice(0, 2), to: move.slice(2, 4), promotion: move[4] }); } catch { /* Illegal moves forfeit. */ }
          if (!played) { winner = 1 - index; reason = `Illegal move: ${move}`; break; }
          moves.push(move); this.state.clocks[turn] += this.config.increment * 1000;
          this.state.history.push(played.san); this.state.fen = chess.fen(); this.state.turn = chess.turn(); this.state.lastMove = [played.from, played.to]; this.publish();
          if (moves.length >= 800) { reason = 'Move limit (400 full moves)'; break; }
        }
        if (this.cancelled) break;
        if (chess.isCheckmate()) { winner = chess.turn() === 'w' ? 1 - white : white; reason = 'Checkmate'; }
        else if (!reason) reason = chess.isStalemate() ? 'Stalemate' : chess.isThreefoldRepetition() ? 'Threefold repetition' : chess.isInsufficientMaterial() ? 'Insufficient material' : 'Fifty-move rule';
        const result = winner === null ? '1/2-1/2' : winner === white ? '1-0' : '0-1';
        chess.header('Event', 'Engine Arena', 'Date', new Date().toISOString().slice(0, 10).replaceAll('-', '.'), 'Round', String(game), 'White', this.engines[white].name, 'Black', this.engines[1 - white].name, 'Result', result, 'Termination', reason, 'TimeControl', `${this.config.minutes * 60}+${this.config.increment}`);
        this.state.results.push({ game, white, winner, result, reason, pgn: chess.pgn(), moves: [...this.state.history], fen: chess.fen() });
        if (winner === null) { this.state.scores[0] += 0.5; this.state.scores[1] += 0.5; } else this.state.scores[winner]++;
        this.state.message = `Game ${game}: ${reason}`; this.publish();
        // Restart both engines between games, also clearing any timed-out searches.
        if (game < this.config.games) {
          for (const session of this.sessions) session.close();
          this.sessions = [this.createSession(0), this.createSession(1)];
          for (const session of this.sessions) await session.open();
        }
      }
      if (!this.cancelled) { this.state.status = 'finished'; this.state.thinkingAt = null; this.state.message = 'Match complete'; this.publish(); }
    } catch (error) {
      if (!this.cancelled) { this.state.status = 'error'; this.state.thinkingAt = null; this.state.message = error.message; this.publish(); }
    } finally { this.sessions.forEach(s => s.close()); }
  }
}
module.exports = { Match };
