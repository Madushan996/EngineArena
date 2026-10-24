const { spawn } = require('node:child_process');
const { EventEmitter } = require('node:events');
const path = require('node:path');

class UciEngine extends EventEmitter {
  constructor(engine, options = {}) {
    super();
    this.engine = engine;
    this.options = options;
    this.waiters = new Set();
    this.supported = new Set();
    this.dead = false;
  }
  async open() {
    const builtin = this.engine.builtin;
    const builtinPath = path.join(__dirname, 'builtin.cjs').replace(/app\.asar([\\/])/, 'app.asar.unpacked$1');
    this.proc = spawn(builtin ? process.execPath : this.engine.path,
      builtin ? [builtinPath, builtin] : (this.engine.args || []), {
        cwd: builtin ? path.dirname(builtinPath) : path.dirname(this.engine.path),
        windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env, ...(builtin ? { ELECTRON_RUN_AS_NODE: '1' } : {}) },
      });
    this.proc.on('error', error => this.fail(new Error(`${this.engine.name}: ${error.message}`)));
    this.proc.on('exit', code => this.fail(new Error(`${this.engine.name} exited (${code ?? 'terminated'}).`)));
    this.proc.stdin.on('error', error => this.fail(error));
    this.proc.stderr.on('data', data => { for (const line of data.toString().split(/\r?\n/)) if (line.trim()) this.emit('stderr', line.trim().slice(0, 300)); });
    let buffer = '';
    this.proc.stdout.on('data', data => {
      buffer += data.toString();
      if (buffer.length > 1048576) return this.fail(new Error('Engine sent an oversized protocol response.'));
      let i;
      while ((i = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, i).trim(); buffer = buffer.slice(i + 1);
        if (line.startsWith('option name ')) this.supported.add(line.slice(12).split(' type ')[0].trim().toLowerCase());
        this.emit('line', line);
        for (const waiter of [...this.waiters]) if (waiter.match(line)) waiter.resolve(line);
      }
    });
    const hello = this.wait(line => line === 'uciok', 10000);
    this.send('uci');
    await hello;
    this.send(`setoption name Threads value ${this.options.threads || 1}`);
    this.send(`setoption name Hash value ${this.options.hash || 64}`);
    if (this.supported.has('ponder')) this.send('setoption name Ponder value false');
    // Some engines (e.g. Stormphrax) refuse increment-free time controls unless this is enabled.
    if (this.supported.has('enableweirdtcs')) this.send('setoption name EnableWeirdTCs value true');
    if (this.options.syzygyPath && this.supported.has('syzygypath')) this.send(`setoption name SyzygyPath value ${this.options.syzygyPath}`);
    await this.ready();
  }
  wait(match, timeout) {
    return new Promise((resolve, reject) => {
      if (this.dead) return reject(new Error(`${this.engine.name} is not running.`));
      const waiter = { match, resolve: line => finish(null, line), reject: error => finish(error) };
      const timer = setTimeout(() => finish(new Error(`${this.engine.name} did not respond in time.`)), timeout);
      const finish = (error, line) => { clearTimeout(timer); this.waiters.delete(waiter); error ? reject(error) : resolve(line); };
      this.waiters.add(waiter);
    });
  }
  send(command) { if (!this.dead && this.proc?.stdin.writable) this.proc.stdin.write(command + '\n'); }
  async ready() { const promise = this.wait(line => line === 'readyok', 10000); this.send('isready'); await promise; }
  async newGame() { this.send('ucinewgame'); await this.ready(); }
  async move(moves, clocks, increment, turn, startFen = null) {
    const promise = this.wait(line => line.startsWith('bestmove '), clocks[turn] + 2000);
    this.send(`position ${startFen ? `fen ${startFen}` : 'startpos'}${moves.length ? ' moves ' + moves.join(' ') : ''}`);
    this.send(`go wtime ${Math.max(1, Math.floor(clocks.w))} btime ${Math.max(1, Math.floor(clocks.b))} winc ${increment} binc ${increment}`);
    return (await promise).split(/\s+/)[1];
  }
  fail(error) { this.dead = true; for (const waiter of [...this.waiters]) waiter.reject(error); }
  close() {
    this.send('stop'); this.send('quit');
    this.fail(new Error('Engine stopped.'));
    const proc = this.proc;
    const timer = setTimeout(() => { if (proc && proc.exitCode === null) proc.kill(); }, 300);
    timer.unref();
  }
}
module.exports = { UciEngine };
