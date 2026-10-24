// Drives the fastchess CLI for quick head-to-head strength tests (SPRT or fixed games) and STC rating
// gauntlets against rated anchors, and turns its console output into live statistics.
const { spawn, execFile } = require('node:child_process');
const { EventEmitter } = require('node:events');
const path = require('node:path');
const { pentanomialStats, performanceRating } = require('./rating.cjs');
const LOG_LIMIT = 400;
function fastchessVersion(executable) {
  return new Promise((resolve, reject) => {
    execFile(executable, ['-version'], { timeout: 8000, windowsHide: true }, (error, stdout = '', stderr = '') => {
      const line = `${stdout}\n${stderr}`.split(/\r?\n/).map(s => s.replace(/\x1b\[[0-9;]*m/g, '').trim()).find(s => /^fastchess\b/i.test(s));
      if (line) resolve(line.replace(/\s+compiled.*$/i, '')); else reject(new Error(error?.message || 'This file did not identify itself as fastchess.'));
    });
  });
}
function engineNames(engines) {
  const clean = name => String(name).replace(/[\r\n]/g, ' ').replace(/\s+vs\s+/gi, ' v. ').trim().slice(0, 60) || 'Engine';
  const names = engines.map(e => clean(e.name));
  if (names.length === 2) return names[0] === names[1] ? [`${names[0]} (dev)`, `${names[1]} (base)`] : names;
  return names.map((name, i) => names.indexOf(name) === i ? name : `${name} (${i + 1})`);
}
function buildArgs(config, engines, { bookPath, pgnPath }) {
  const names = engineNames(engines), args = [];
  engines.forEach((engine, i) => args.push('-engine', `cmd=${engine.path}`, `name=${names[i]}`, `dir=${path.dirname(engine.path)}`));
  args.push('-each', 'proto=uci', `tc=${config.tc}`, `timemargin=${config.timeMargin ?? 100}`, `option.Threads=${config.threads}`, `option.Hash=${config.hash}`);
  args.push('-openings', `file=${bookPath}`, `format=${path.extname(bookPath).toLowerCase() === '.pgn' ? 'pgn' : 'epd'}`, 'order=random');
  if (config.mode === 'gauntlet') args.push('-tournament', 'gauntlet', '-seeds', '1', '-rounds', String(config.gamesPerOpponent / 2));
  else args.push('-rounds', String(Math.ceil((config.mode === 'sprt' ? config.maxGames : config.games) / 2)));
  args.push('-repeat', '-concurrency', String(config.concurrency), '-recover');
  if (config.mode === 'sprt') args.push('-sprt', `elo0=${config.sprt.elo0}`, `elo1=${config.sprt.elo1}`, `alpha=${config.sprt.alpha}`, `beta=${config.sprt.beta}`, `model=${config.sprt.model}`);
  if (config.adjudicate) args.push('-draw', 'movenumber=40', 'movecount=8', 'score=10', '-resign', 'movecount=4', 'score=1000', 'twosided=true');
  args.push('-ratinginterval', '10', '-report', 'penta=true');
  if (pgnPath) args.push('-pgnout', `file=${pgnPath}`, 'notation=san');
  return { args, names };
}
const number = value => { const n = Number(value); return Number.isFinite(n) ? n : null; };
class FastchessRun extends EventEmitter {
  constructor(config, engines, { executable, bookPath, bookName, pgnPath }) {
    super();
    const { args, names } = buildArgs(config, engines, { bookPath, pgnPath });
    Object.assign(this, { config, executable, pgnPath, args, names, pairs: new Map(), running: new Set(), publishTimer: null, stopped: false, lastError: '' });
    this.state = {
      mode: 'fastchess', status: 'starting', message: 'Starting fastchess…', startedAt: Date.now(), finishedAt: null,
      devId: engines[0].id, baseId: engines[1].id, names, tc: config.tc, hash: config.hash, threads: config.threads, concurrency: config.concurrency,
      testMode: config.mode, sprt: config.mode === 'sprt' ? config.sprt : null, planned: config.mode === 'sprt' ? config.maxGames : config.games, book: bookName,
      games: 0, wins: 0, losses: 0, draws: 0, ptnml: [0, 0, 0, 0, 0], stats: null, reported: null, verdict: null, active: 0, warnings: 0,
      log: [`$ fastchess ${args.map(a => /\s/.test(a) ? `"${a}"` : a).join(' ')}`],
    };
    if (config.mode === 'gauntlet') {
      this.records = [];
      Object.assign(this.state, {
        subjectId: engines[0].id, list: config.list, planned: config.gamesPerOpponent * (engines.length - 1), points: 0,
        opponents: engines.slice(1).map((e, i) => ({ id: e.id, name: names[i + 1], rating: config.ratings[i], games: 0, wins: 0, draws: 0, losses: 0, points: 0, performance: null })),
        estimate: null, timeline: [], recent: [],
      });
    }
    this.done = new Promise(resolve => { this.resolveDone = resolve; });
  }
  publish() { clearTimeout(this.publishTimer); this.publishTimer = null; this.emit('state', structuredClone(this.state)); }
  touch() { if (!this.publishTimer) this.publishTimer = setTimeout(() => this.publish(), 200); }
  log(line) { this.state.log.push(line); if (this.state.log.length > LOG_LIMIT) this.state.log.splice(0, this.state.log.length - LOG_LIMIT); this.touch(); }
  start() {
    this.proc = spawn(this.executable, this.args, { cwd: path.dirname(this.executable), windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    for (const stream of [this.proc.stdout, this.proc.stderr]) {
      let buffer = '';
      stream.on('data', data => {
        buffer += data.toString(); let i;
        while ((i = buffer.indexOf('\n')) !== -1) { this.line(buffer.slice(0, i)); buffer = buffer.slice(i + 1); }
        if (buffer.length > 1048576) buffer = '';
      });
    }
    this.proc.on('error', error => this.finish('error', `fastchess could not start: ${error.message}`));
    this.proc.on('exit', code => {
      if (this.stopped) this.finish('stopped', `Test stopped after ${this.state.games} games.`);
      else if (code === 0) this.finish('finished', this.state.verdict ? `SPRT finished: ${this.state.verdict} accepted` : this.config.mode === 'gauntlet' ? 'Gauntlet complete' : 'Test complete');
      else this.finish('error', this.lastError || `fastchess exited with code ${code}.`);
    });
    this.state.status = 'running'; this.state.message = 'Engines are playing'; this.publish();
    return this.done;
  }
  line(raw) {
    const line = raw.replace(/\x1b\[[0-9;]*m/g, '').trimEnd(), s = this.state;
    if (!line.trim() || /^(Info|Position|Moves);/.test(line)) return;
    if (line.startsWith('Warning;')) { s.warnings++; if (!/PV|[Bb]estmove does not match/.test(line)) this.log(line); return; }
    let m;
    if ((m = line.match(/^Started game (\d+) of (\d+)/))) { this.running.add(Number(m[1])); s.active = this.running.size; return this.touch(); }
    if ((m = line.match(/^Finished game (\d+) \((.*)\): (1-0|0-1|1\/2-1\/2|\*) \{(.*)\}/))) { this.game(Number(m[1]), m[2], m[3]); return this.log(line); }
    if ((m = line.match(/^Elo: (\S+) \+\/- (\S+), nElo: (\S+) \+\/- (\S+)/))) s.reported = { ...s.reported, elo: number(m[1]), error: number(m[2]), nElo: number(m[3]), nEloError: number(m[4]) };
    else if ((m = line.match(/^LOS: (\S+) %/))) s.reported = { ...s.reported, los: number(m[1]) };
    else if ((m = line.match(/^LLR: (\S+) \([^)]*\) \((\S+), (\S+)\)/))) s.reported = { ...s.reported, llr: number(m[1]), lower: number(m[2]), upper: number(m[3]) };
    else if ((m = line.match(/^Games: (\d+), Wins: (\d+), Losses: (\d+), Draws: (\d+)/))) s.reported = { ...s.reported, games: Number(m[1]) };
    else if ((m = line.match(/^SPRT .* - (H0|H1) was accepted/))) s.verdict = m[1];
    else if (/^(Error|Fatal)|error:/i.test(line)) this.lastError = line;
    this.log(line);
  }
  game(id, pairing, result) {
    if (this.config.mode === 'gauntlet') return this.gauntletGame(id, pairing, result);
    const s = this.state, [dev, base] = this.names;
    this.running.delete(id); s.active = this.running.size;
    const devWhite = pairing === `${dev} vs ${base}`;
    if (result === '*' || (!devWhite && pairing !== `${base} vs ${dev}`)) return;
    const score = result === '1/2-1/2' ? .5 : (result === '1-0') === devWhite ? 1 : 0;
    s.games++; s[score === 1 ? 'wins' : score === 0 ? 'losses' : 'draws']++;
    // fastchess plays each opening twice with colours reversed: games 2k-1 and 2k form a pair.
    const key = Math.ceil(id / 2), pair = [...(this.pairs.get(key) || []), score];
    if (pair.length === 2) { s.ptnml[(pair[0] + pair[1]) * 2]++; this.pairs.delete(key); } else this.pairs.set(key, pair);
    s.stats = pentanomialStats(s.ptnml, s.sprt);
    s.message = `${s.games} games played`;
  }
  gauntletGame(id, pairing, result) {
    const s = this.state, subject = this.names[0];
    this.running.delete(id); s.active = this.running.size;
    const index = s.opponents.findIndex(o => pairing === `${subject} vs ${o.name}` || pairing === `${o.name} vs ${subject}`);
    if (result === '*' || index < 0) return;
    const subjectWhite = pairing.startsWith(`${subject} vs `), standing = s.opponents[index];
    const score = result === '1/2-1/2' ? .5 : (result === '1-0') === subjectWhite ? 1 : 0, key = score === 1 ? 'wins' : score === 0 ? 'losses' : 'draws';
    s.games++; s.points += score; s[key]++; standing.games++; standing.points += score; standing[key]++;
    // With -repeat, games 2k-1 and 2k share an opening and opponent, colours reversed.
    this.records.push({ rating: standing.rating, score, group: Math.ceil(id / 2), opponent: index });
    const versus = performanceRating(this.records.filter(r => r.opponent === index));
    standing.performance = { elo: versus.elo, bound: versus.bound };
    s.estimate = performanceRating(this.records);
    s.timeline.push({ games: s.games, elo: s.estimate.elo, low: s.estimate.low, high: s.estimate.high });
    if (s.timeline.length > 600) s.timeline = s.timeline.filter((_, i, all) => i % 2 === 0 || i === all.length - 1);
    s.recent = [{ game: id, opponent: index, subjectWhite, score, result }, ...s.recent].slice(0, 40);
    s.message = `${s.games} of ${s.planned} games played`;
  }
  finish(status, message) {
    if (this.state.finishedAt) return;
    Object.assign(this.state, { status, message, finishedAt: Date.now(), active: 0 });
    this.publish(); this.resolveDone(this.state);
  }
  stop() {
    if (this.stopped || this.state.finishedAt || !this.proc) return;
    this.stopped = true; this.state.message = 'Stopping fastchess…'; this.publish();
    // fastchess owns the engine processes, so end the whole tree.
    if (process.platform === 'win32') execFile('taskkill', ['/pid', String(this.proc.pid), '/T', '/F'], { windowsHide: true }, () => {});
    else this.proc.kill('SIGINT');
  }
}
module.exports = { FastchessRun, fastchessVersion, buildArgs, engineNames };
