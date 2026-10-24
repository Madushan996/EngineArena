const { app, BrowserWindow, ipcMain, dialog, nativeImage } = require('electron');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { randomUUID } = require('node:crypto');
const { Match } = require('./match.cjs');
const { Gauntlet } = require('./gauntlet.cjs');
const { FastchessRun, fastchessVersion } = require('./fastchess.cjs');
const { loadBook, builtinPgn, MAX_PLIES } = require('./openings.cjs');
const { UciEngine } = require('./uci.cjs');
const { findAnchor, anchorRatings, rejectedReason, candidateFiles, LIST_DATE } = require('./anchors.cjs');
const { validateResultPng, safeResultFilename } = require('./result-image.cjs');
let window, match, gauntlet, test, store, writeQueue = Promise.resolve();
// CCRL conditions: Blitz allows 128 or 256 MB hash, 40/15 allows 256 or 512 MB; one CPU each.
const gauntletControls = {
  short: { minutes: 1, increment: 1, list: 'blitz', hash: [128, 256] },
  long: { minutes: 4, increment: 2, list: 'blitz', hash: [128, 256] },
  classical: { minutes: 12, increment: 8, list: 'classical', hash: [256, 512] },
};
const cores = () => os.availableParallelism?.() || os.cpus().length || 1;
const defaults = [
  { id: 'atlas', name: 'Atlas', author: 'Engine Arena', builtin: 'atlas', accent: 'green', description: 'Positional · Built-in engine' },
  { id: 'volt', name: 'Volt', author: 'Engine Arena', builtin: 'volt', accent: 'purple', description: 'Dynamic · Built-in engine' },
];
const file = () => path.join(app.getPath('userData'), 'arena.json');
function save() {
  const snapshot = JSON.stringify(store, null, 2);
  writeQueue = writeQueue.catch(() => {}).then(async () => {
    await fs.mkdir(path.dirname(file()), { recursive: true });
    await fs.writeFile(file() + '.tmp', snapshot); await fs.rename(file() + '.tmp', file());
  });
  return writeQueue;
}
const running = job => job && ['starting', 'running', 'paused'].includes(job.state.status);
const busy = () => running(match) ? 'A match' : running(gauntlet) ? 'A rating gauntlet' : running(test) ? 'A fastchess test' : null;
const active = () => !!busy();
const send = (channel, state) => { if (window && !window.isDestroyed()) window.webContents.send(channel, state); };
const finite = (value, min, max) => Number.isFinite(value) && value >= min && value <= max;
const brief = engine => ({ id: engine.id, name: engine.name, builtin: engine.builtin, accent: engine.accent });
async function probeEngine(file) {
  const engine = { id: randomUUID(), path: file, name: path.basename(file, path.extname(file)), accent: store.engines.length % 2 ? 'purple' : 'green', description: 'Local UCI engine' };
  const probe = new UciEngine(engine);
  // Startup errors (e.g. a missing neural-network file) leave an engine running but badly weakened.
  const issues = [], problem = /\b(error|failed|cannot|can't|could not|unable|not found|missing)\b/i;
  probe.on('line', line => {
    if (line.startsWith('id name ')) engine.name = engine.uciName = line.slice(8);
    else if (line.startsWith('id author ')) engine.author = line.slice(10);
    else if (!line.startsWith('option ') && problem.test(line)) issues.push(line.replace(/^info string\s*/, ''));
  });
  probe.on('stderr', line => { if (problem.test(line)) issues.push(line); });
  try { await probe.open(); } finally { probe.close(); }
  if (issues.length) engine.warning = issues[0].slice(0, 200);
  return applyAnchor(engine);
}
// Known anchors get their published CCRL ratings automatically.
function applyAnchor(engine) {
  const anchor = findAnchor(engine.uciName || engine.name);
  if (anchor) Object.assign(engine, { ratings: { ...anchorRatings(anchor), ...engine.ratings }, anchor: anchor.ccrl, description: `CCRL anchor · ${anchor.ccrl}` });
  return engine;
}
async function exportPgnFile(source, defaultPath) {
  let text;
  try { text = await fs.readFile(source, 'utf8'); } catch { throw new Error('No completed games have been saved for this run yet.'); }
  const result = await dialog.showSaveDialog(window, { defaultPath, filters: [{ name: 'Chess games', extensions: ['pgn'] }] });
  if (result.canceled) return false;
  await fs.writeFile(result.filePath, text); return true;
}
async function chooseBook() {
  const result = await dialog.showOpenDialog(window, { title: 'Choose an opening suite', properties: ['openFile'], filters: [{ name: 'Opening suites', extensions: ['epd', 'pgn'] }] });
  if (result.canceled) return null;
  const book = await loadBook({ type: 'file', path: result.filePaths[0] });
  return { path: result.filePaths[0], name: path.basename(result.filePaths[0]), count: book.length };
}
async function fastchessStatus() {
  const saved = store.settings.fastchessPath;
  if (saved) { try { return { path: saved, version: await fastchessVersion(saved) }; } catch { /* Fall through to discovery. */ } }
  const found = await new Promise(resolve => execFile(process.platform === 'win32' ? 'where' : 'which', ['fastchess'], { windowsHide: true, timeout: 5000 }, (error, stdout) => resolve(error ? null : stdout.split(/\r?\n/)[0].trim() || null)));
  if (found) {
    try { const version = await fastchessVersion(found); store.settings.fastchessPath = found; await save(); return { path: found, version }; } catch { /* Not usable. */ }
  }
  return { path: null, version: null };
}
app.whenReady().then(async () => {
  try { store = JSON.parse(await fs.readFile(file(), 'utf8')); } catch { store = { engines: defaults, history: [] }; }
  store.gauntlets ??= []; store.tests ??= []; store.settings ??= {};
  ipcMain.handle('engines:list', () => store.engines);
  ipcMain.handle('engines:add', async () => {
    if (active()) throw new Error('Finish or stop the current match before changing engines.');
    const result = await dialog.showOpenDialog(window, { title: 'Load UCI chess engines', properties: ['openFile', 'multiSelections'], filters: [{ name: 'Chess engine executable', extensions: process.platform === 'win32' ? ['exe'] : ['*'] }] });
    if (result.canceled) return null;
    const added = [], failed = [];
    for (const file of result.filePaths) {
      try { const engine = await probeEngine(file); store.engines.push(engine); added.push(engine); }
      catch (error) { failed.push({ file: path.basename(file), message: error.message }); }
    }
    if (added.length) await save();
    if (!added.length) throw new Error(failed.length === 1 ? `${failed[0].file} could not be loaded: ${failed[0].message}` : 'None of the selected files responded as UCI engines.');
    return { added, failed };
  });
  ipcMain.handle('engines:importAnchors', async () => {
    if (active()) throw new Error('Finish or stop the current job before changing engines.');
    const result = await dialog.showOpenDialog(window, { title: 'Choose folders that contain anchor engines', properties: ['openDirectory', 'multiSelections'] });
    if (result.canceled) return null;
    const files = [...new Set((await Promise.all(result.filePaths.map(folder => candidateFiles(folder)))).flat())];
    const known = new Set(store.engines.map(e => e.path?.toLowerCase()).filter(Boolean));
    const added = [], updated = [], failed = [], ignored = [];
    for (const file of files) {
      if (known.has(file.toLowerCase())) continue;
      try {
        const engine = await probeEngine(file);
        if (!engine.anchor) { const reason = rejectedReason(engine.uciName); if (reason) failed.push({ file: path.basename(file), message: reason }); else ignored.push(engine.name); continue; }
        if (engine.warning) { failed.push({ file: path.basename(file), message: `${engine.name} reported a startup problem: ${engine.warning}` }); continue; }
        if (store.engines.some(e => e.anchor === engine.anchor)) { ignored.push(`${engine.name} (already in library)`); continue; }
        engine.name = findAnchor(engine.uciName).name;
        store.engines.push(engine); added.push(engine);
      } catch (error) { failed.push({ file: path.basename(file), message: error.message }); }
    }
    // Library engines that are anchors but lack ratings are filled in too.
    for (const engine of store.engines) {
      const anchor = !engine.builtin && findAnchor(engine.uciName || engine.name);
      if (!anchor || added.includes(engine)) continue;
      const ratings = { ...anchorRatings(anchor), ...engine.ratings };
      if (JSON.stringify(ratings) !== JSON.stringify(engine.ratings || {}) || !engine.anchor) { Object.assign(engine, { ratings, anchor: anchor.ccrl }); updated.push(engine.name); }
    }
    if (added.length || updated.length) await save();
    return { added, updated, failed, ignored, scanned: files.length, listDate: LIST_DATE };
  });
  ipcMain.handle('engines:update', async (_, data) => {
    const engine = store.engines.find(e => e.id === data.id); if (!engine) throw new Error('Engine not found.');
    if (data.name !== undefined) {
      if (typeof data.name !== 'string' || !data.name.trim()) throw new Error('Enter an engine name.');
      engine.name = data.name.trim().slice(0, 80);
    }
    if (data.ratings !== undefined) {
      const ratings = {};
      for (const list of ['blitz', 'classical']) {
        const value = data.ratings?.[list];
        if (value === null || value === undefined || value === '') continue;
        if (!finite(Number(value), 0, 5000)) throw new Error('Ratings must be between 0 and 5000.');
        ratings[list] = Math.round(Number(value));
      }
      engine.ratings = ratings;
    }
    await save(); return engine;
  });
  ipcMain.handle('engines:remove', async (_, id) => {
    if (active()) throw new Error('Stop the current match first.');
    if (defaults.some(e => e.id === id)) throw new Error('Built-in engines cannot be removed.');
    store.engines = store.engines.filter(e => e.id !== id); await save(); return store.engines;
  });
  ipcMain.handle('engines:logo', async (_, id) => {
    const engine = store.engines.find(e => e.id === id); if (!engine) throw new Error('Engine not found.');
    const result = await dialog.showOpenDialog(window, { title: 'Choose engine logo', properties: ['openFile'], filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp'] }] });
    if (result.canceled) return null;
    const info = await fs.stat(result.filePaths[0]); if (info.size > 5 * 1024 * 1024) throw new Error('Choose a logo smaller than 5 MB.');
    const ext = path.extname(result.filePaths[0]).slice(1).toLowerCase();
    engine.logo = `data:image/${ext === 'jpg' ? 'jpeg' : ext};base64,${(await fs.readFile(result.filePaths[0])).toString('base64')}`;
    await save(); return engine;
  });
  ipcMain.handle('match:start', (_, config) => {
    if (active()) throw new Error(`${busy()} is already running.`);
    for (const [key, min, max] of [['games', 1, 1000], ['minutes', 0.05, 180], ['increment', 0, 120], ['threads', 1, 64], ['hash', 1, 4096]]) {
      if (!Number.isFinite(config[key]) || config[key] < min || config[key] > max || (['games', 'threads', 'hash'].includes(key) && !Number.isInteger(config[key]))) throw new Error(`Invalid ${key}.`);
    }
    const engines = config.engineIds?.map(id => store.engines.find(e => e.id === id));
    if (engines?.length !== 2 || engines.some(e => !e) || engines[0].id === engines[1].id) throw new Error('Choose two different engines.');
    match = new Match(config, engines);
    let recorded = false;
    match.on('state', state => {
      if (!window.isDestroyed()) window.webContents.send('match:state', state);
      if (!recorded && ['finished', 'stopped', 'error'].includes(state.status) && state.results.length) {
        recorded = true; store.history.unshift({ id: randomUUID(), date: new Date().toISOString(), engines: engines.map(e => ({ ...e })), config, state }); store.history = store.history.slice(0, 100); save().catch(console.error);
      }
    });
    match.publish(); match.run(); return { ok: true };
  });
  ipcMain.handle('match:pause', () => { if (active() && match.state.status !== 'starting') match.pause(); });
  ipcMain.handle('match:stop', () => { if (active()) match.stop(); });
  ipcMain.handle('history:list', () => store.history);
  ipcMain.handle('system:info', () => ({ cores: cores(), cpu: os.cpus()[0]?.model?.trim() || 'Unknown CPU' }));
  ipcMain.handle('book:choose', () => chooseBook());
  ipcMain.handle('folder:choose', async (_, title) => {
    const result = await dialog.showOpenDialog(window, { title: typeof title === 'string' ? title : 'Choose a folder', properties: ['openDirectory'] });
    return result.canceled ? null : result.filePaths[0];
  });
  ipcMain.handle('gauntlet:start', async (_, config) => {
    if (active()) throw new Error(`${busy()} is already running.`);
    const control = gauntletControls[config?.tc];
    if (!control) throw new Error('Choose a gauntlet time control.');
    const subject = store.engines.find(e => e.id === config.subjectId);
    if (!subject) throw new Error('Choose the engine to rate.');
    if (!Array.isArray(config.opponents) || !config.opponents.length) throw new Error('Choose at least one rated opponent.');
    if (config.opponents.length > 40 || new Set(config.opponents.map(o => o.id)).size !== config.opponents.length) throw new Error('Choose up to 40 different opponents.');
    const opponents = config.opponents.map(o => {
      const engine = store.engines.find(e => e.id === o.id);
      if (!engine || engine.id === subject.id) throw new Error('An opponent is no longer in the library.');
      if (!finite(Number(o.rating), 0, 5000)) throw new Error(`Enter a rating for ${engine.name}.`);
      return { ...engine, rating: Math.round(Number(o.rating)) };
    });
    if (!Number.isInteger(config.gamesPerOpponent) || config.gamesPerOpponent < 2 || config.gamesPerOpponent > 2000 || config.gamesPerOpponent % 2) throw new Error('Games per opponent must be an even number from 2 to 2000.');
    if (!Number.isInteger(config.concurrency) || !finite(config.concurrency, 1, cores())) throw new Error(`Parallel games must be between 1 and ${cores()}.`);
    if (!control.hash.includes(config.hash)) throw new Error(`Use ${control.hash.join(' or ')} MB hash for this list.`);
    if (config.syzygyPath && (typeof config.syzygyPath !== 'string' || config.syzygyPath.length > 2000)) throw new Error('Invalid tablebase folder.');
    const source = config.book?.type === 'file' && typeof config.book.path === 'string' ? { type: 'file', path: config.book.path } : { type: 'builtin' };
    let book;
    try { book = await loadBook(source, MAX_PLIES); } catch (error) { throw new Error(`The opening suite could not be read: ${error.message}`); }
    for (const opponent of opponents) {
      const engine = store.engines.find(e => e.id === opponent.id);
      engine.ratings = { ...engine.ratings, [control.list]: opponent.rating };
    }
    const id = randomUUID(), folder = path.join(app.getPath('userData'), 'gauntlets');
    await fs.mkdir(folder, { recursive: true }); await save();
    const settings = { minutes: control.minutes, increment: control.increment, gamesPerOpponent: config.gamesPerOpponent, concurrency: config.concurrency, hash: config.hash,
      adjudicate: config.adjudicate !== false, syzygyPath: config.syzygyPath || '', tc: config.tc, list: control.list, bookName: source.type === 'file' ? path.basename(source.path) : 'Built-in generic book' };
    gauntlet = new Gauntlet(settings, subject, opponents, book, { pgnPath: path.join(folder, `${id}.pgn`) });
    gauntlet.id = id;
    let recorded = false;
    gauntlet.on('state', state => {
      send('gauntlet:state', { ...state, id });
      if (recorded || !['finished', 'stopped', 'error'].includes(state.status)) return;
      recorded = true;
      if (!state.finished) return;
      const { boards, recent, ...summary } = state;
      store.gauntlets.unshift({ ...summary, id, date: new Date().toISOString(), subject: brief(subject), pgnPath: gauntlet.pgnPath });
      store.gauntlets = store.gauntlets.slice(0, 100);
      const engine = store.engines.find(e => e.id === subject.id);
      if (engine && state.estimate) engine.estimates = { ...engine.estimates, [config.tc]: { elo: Math.round(state.estimate.elo), error: state.estimate.error === null ? null : Math.round(state.estimate.error), bound: state.estimate.bound, games: state.finished, list: control.list, date: new Date().toISOString(), complete: state.status === 'finished' } };
      save().catch(console.error);
    });
    gauntlet.publish(); gauntlet.run(); return { ok: true, id };
  });
  ipcMain.handle('gauntlet:current', () => gauntlet ? structuredClone({ ...gauntlet.state, id: gauntlet.id }) : null);
  ipcMain.handle('gauntlet:pause', () => { if (running(gauntlet)) gauntlet.pause(); });
  ipcMain.handle('gauntlet:stop', () => { if (running(gauntlet)) gauntlet.stop(); });
  ipcMain.handle('gauntlet:list', () => store.gauntlets);
  ipcMain.handle('gauntlet:export', (_, id) => {
    const source = gauntlet?.id === id ? gauntlet.pgnPath : store.gauntlets.find(g => g.id === id)?.pgnPath;
    if (!source) throw new Error('This gauntlet was not found.');
    return exportPgnFile(source, 'Engine-Arena-gauntlet.pgn');
  });
  ipcMain.handle('fastchess:status', () => fastchessStatus());
  ipcMain.handle('fastchess:locate', async () => {
    const result = await dialog.showOpenDialog(window, { title: 'Locate fastchess', properties: ['openFile'], filters: [{ name: 'fastchess executable', extensions: process.platform === 'win32' ? ['exe'] : ['*'] }] });
    if (result.canceled) return null;
    const version = await fastchessVersion(result.filePaths[0]);
    store.settings.fastchessPath = result.filePaths[0]; await save();
    return { path: result.filePaths[0], version };
  });
  ipcMain.handle('fastchess:start', async (_, config) => {
    if (active()) throw new Error(`${busy()} is already running.`);
    const status = await fastchessStatus();
    if (!status.path) throw new Error('Locate fastchess.exe before starting a test.');
    const gauntletMode = config?.mode === 'gauntlet';
    let engines, ratings = [];
    if (gauntletMode) {
      const subject = store.engines.find(e => e.id === config.subjectId);
      if (!subject) throw new Error('Choose the engine to rate.');
      if (!Array.isArray(config.opponents) || !config.opponents.length || config.opponents.length > 40) throw new Error('Choose 1–40 rated anchor engines.');
      if (new Set([subject.id, ...config.opponents.map(o => o.id)]).size !== config.opponents.length + 1) throw new Error('Each anchor must be a different engine from the one being rated.');
      if (!['blitz', 'classical'].includes(config.list)) throw new Error('Choose a rating list.');
      if (!Number.isInteger(config.gamesPerOpponent) || !finite(config.gamesPerOpponent, 2, 2000) || config.gamesPerOpponent % 2) throw new Error('Games per anchor must be an even number from 2 to 2000.');
      const opponents = config.opponents.map(o => store.engines.find(e => e.id === o.id));
      if (opponents.some(e => !e)) throw new Error('An anchor is no longer in the library.');
      ratings = config.opponents.map((o, i) => { if (!finite(Number(o.rating), 0, 5000)) throw new Error(`Enter a rating for ${opponents[i].name}.`); return Math.round(Number(o.rating)); });
      engines = [subject, ...opponents];
    } else {
      engines = [config?.devId, config?.baseId].map(id => store.engines.find(e => e.id === id));
      if (engines.some(e => !e) || engines[0].id === engines[1].id) throw new Error('Choose two different engines.');
    }
    if (engines.some(e => e.builtin)) throw new Error('fastchess tests need engine executables. The built-in demo engines run only in the arena.');
    if (typeof config.tc !== 'string' || !/^\d+(\.\d+)?\+\d+(\.\d+)?$/.test(config.tc)) throw new Error('Enter the time control as seconds+increment, for example 8+0.08.');
    if (!Number.isInteger(config.hash) || !finite(config.hash, 1, 4096)) throw new Error('Hash must be 1–4096 MB.');
    if (!Number.isInteger(config.threads) || !finite(config.threads, 1, 64)) throw new Error('Threads must be 1–64.');
    if (!Number.isInteger(config.concurrency) || !finite(config.concurrency * config.threads, 1, cores())) throw new Error(`Concurrency × threads must not exceed ${cores()} hardware threads.`);
    if (config.mode === 'sprt') {
      const { elo0, elo1, alpha, beta, model } = config.sprt || {};
      if (!finite(elo0, -500, 500) || !finite(elo1, -500, 500) || elo0 >= elo1) throw new Error('SPRT needs elo0 lower than elo1.');
      if (!finite(alpha, .001, .5) || !finite(beta, .001, .5) || !['normalized', 'logistic'].includes(model)) throw new Error('Invalid SPRT settings.');
      if (!Number.isInteger(config.maxGames) || !finite(config.maxGames, 2, 1000000)) throw new Error('Invalid game limit.');
    } else if (!gauntletMode && (config.mode !== 'games' || !Number.isInteger(config.games) || !finite(config.games, 2, 1000000))) throw new Error('Choose how many games to play.');
    if (gauntletMode) {
      engines.slice(1).forEach((engine, i) => { engine.ratings = { ...engine.ratings, [config.list]: ratings[i] }; });
      await save();
    }
    const folder = path.join(app.getPath('userData'), 'fastchess');
    await fs.mkdir(folder, { recursive: true });
    let bookPath, bookName;
    if (config.book?.type === 'file' && typeof config.book.path === 'string') {
      try { await fs.access(config.book.path); } catch { throw new Error('The opening suite file could not be found.'); }
      bookPath = config.book.path; bookName = path.basename(bookPath);
    } else { bookPath = path.join(folder, 'engine-arena-book.pgn'); bookName = 'Built-in generic book'; await fs.writeFile(bookPath, builtinPgn()); }
    const id = randomUUID(), pgnPath = path.join(folder, `${id}.pgn`);
    const settings = { tc: config.tc, hash: config.hash, threads: config.threads, concurrency: config.concurrency, mode: config.mode, games: config.games, maxGames: config.maxGames, sprt: config.mode === 'sprt' ? config.sprt : null, adjudicate: config.adjudicate !== false,
      gamesPerOpponent: config.gamesPerOpponent, ratings, list: config.list };
    const run = test = new FastchessRun(settings, engines, { executable: status.path, bookPath, bookName, pgnPath });
    run.id = id;
    run.on('state', state => {
      send('fastchess:state', { ...state, id });
      if (!state.finishedAt || run.recorded) return;
      run.recorded = true;
      if (!state.games) return;
      const { log, ...summary } = state;
      store.tests.unshift({ ...summary, id, date: new Date().toISOString(), engines: engines.map(brief), pgnPath });
      store.tests = store.tests.slice(0, 100);
      const subject = gauntletMode && state.estimate && store.engines.find(e => e.id === state.subjectId);
      if (subject) subject.estimates = { ...subject.estimates, stc: { elo: Math.round(state.estimate.elo), error: state.estimate.error === null ? null : Math.round(state.estimate.error), bound: state.estimate.bound, games: state.games, list: config.list, tc: config.tc, date: new Date().toISOString(), complete: state.status === 'finished' } };
      save().catch(console.error);
    });
    run.start(); return { ok: true, id };
  });
  ipcMain.handle('fastchess:current', () => test ? structuredClone({ ...test.state, id: test.id }) : null);
  ipcMain.handle('fastchess:stop', () => { if (running(test)) test.stop(); });
  ipcMain.handle('fastchess:list', () => store.tests);
  ipcMain.handle('fastchess:export', (_, id) => {
    const source = test?.id === id ? test.pgnPath : store.tests.find(t => t.id === id)?.pgnPath;
    if (!source) throw new Error('This test was not found.');
    return exportPgnFile(source, 'Engine-Arena-fastchess.pgn');
  });
  ipcMain.handle('pgn:export', async (_, text) => {
    if (typeof text !== 'string' || text.length > 50_000_000) throw new Error('Invalid PGN.');
    const result = await dialog.showSaveDialog(window, { defaultPath: 'Engine-Arena.pgn', filters: [{ name: 'Chess games', extensions: ['pgn'] }] });
    if (!result.canceled) { await fs.writeFile(result.filePath, text); return true; } return false;
  });
  ipcMain.handle('result:image', async (_, data) => {
    const { bytes, width, height } = validateResultPng(data?.dataUrl);
    const image = nativeImage.createFromBuffer(bytes);
    if (image.isEmpty() || image.getSize().width !== width || image.getSize().height !== height) throw new Error('This result image could not be decoded.');
    const result = await dialog.showSaveDialog(window, {
      title: 'Save a shareable match result', defaultPath: safeResultFilename(data.filename),
      filters: [{ name: 'PNG image', extensions: ['png'] }, { name: 'JPEG image', extensions: ['jpg', 'jpeg'] }],
      properties: ['createDirectory', 'showOverwriteConfirmation'],
    });
    if (result.canceled) return false;
    const extension = path.extname(result.filePath).toLowerCase();
    if (!['.png', '.jpg', '.jpeg'].includes(extension)) throw new Error('Save your result with a .png or .jpg filename.');
    await fs.writeFile(result.filePath, extension === '.png' ? image.toPNG() : image.toJPEG(92));
    return true;
  });
  window = new BrowserWindow({ width: 1480, height: 960, minWidth: 1080, minHeight: 760, backgroundColor: '#101414', title: 'Engine Arena', autoHideMenuBar: true, webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true } });
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', event => event.preventDefault());
  if (process.env.ARENA_DEV) await window.loadURL('http://127.0.0.1:5173'); else await window.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  window.on('closed', () => { match?.stop(); gauntlet?.stop(); test?.stop(); });
});
app.on('window-all-closed', () => app.quit());
