// Native end-to-end check of the rating gauntlet and fastchess quick test, driven through the UI.
// Needs real engines: ENGINE_SUBJECT, ENGINE_ANCHOR_A (CCRL Blitz rating ANCHOR_A_RATING), ENGINE_ANCHOR_B
// (ANCHOR_B_RATING) and FASTCHESS_PATH. Uses an isolated app-data folder under artifacts/.
const { app, dialog } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');
const assert = require('node:assert/strict');
const artifactDir = path.resolve(__dirname, '..', 'artifacts');
const env = name => { if (!process.env[name]) { console.error(`Set ${name}.`); process.exit(2); } return process.env[name]; };
const engines = [
  { id: 'atlas', name: 'Atlas', author: 'Engine Arena', builtin: 'atlas', accent: 'green', description: 'Positional · Built-in engine' },
  { id: 'volt', name: 'Volt', author: 'Engine Arena', builtin: 'volt', accent: 'purple', description: 'Dynamic · Built-in engine' },
  { id: 'subject', name: 'Engine under test', path: env('ENGINE_SUBJECT'), accent: 'green', description: 'Local UCI engine' },
  { id: 'anchor-a', name: 'Anchor A', path: env('ENGINE_ANCHOR_A'), accent: 'purple', description: 'Local UCI engine', ratings: { blitz: Number(env('ANCHOR_A_RATING')) } },
  { id: 'anchor-b', name: 'Anchor B', path: env('ENGINE_ANCHOR_B'), accent: 'green', description: 'Local UCI engine', ratings: { blitz: Number(env('ANCHOR_B_RATING')) } },
];
const userData = path.join(artifactDir, `lab-smoke-${Date.now()}`);
app.setPath('userData', userData);
const errors = [];
app.on('browser-window-created', (_, win) => {
  win.webContents.on('console-message', (_, level, message) => { if (level === 3) errors.push(message); });
  win.webContents.once('did-finish-load', () => verify(win).catch(async error => {
    console.error(error);
    const debug = await win.webContents.executeJavaScript(`(async () => ({ matchup: document.querySelector('.matchup')?.innerText, config: localStorage.getItem('arena-config'), engines: (await window.arena.engines()).map(e => [e.id, e.ratings]) }))()`).catch(e => e.message);
    console.error(JSON.stringify(debug, null, 1), errors);
    await fs.writeFile(path.join(artifactDir, 'lab-smoke-failure.png'), (await win.webContents.capturePage()).toPNG()).catch(() => {});
    app.exit(1);
  }));
});
async function verify(win) {
  // Opens the share dialog from the result screen, renders all three formats, and saves the 4:5 card.
  async function verifyRatingCard(name) {
    await clickText('.rating-hero-actions button', 'Share rating');
    for (const height of [1080, 1920, 1350]) {
      const label = { 1080: 'Square post rating card', 1920: 'Story / Status rating card', 1350: 'Instagram post rating card' }[height];
      await evaluate(`document.querySelector('[aria-label="${label}"]').click(); void 0;`);
      await waitFor(`document.querySelector('.rating-share .share-preview img')?.dataset.exportHeight === '${height}'`, 20000);
    }
    await screenshot(`${name}-dialog.png`);
    const file = path.join(artifactDir, `${name}.png`);
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: file });
    await evaluate(`document.querySelector('[aria-label="Download rating card"]').click(); void 0;`);
    await waitFor(`document.querySelector('.toast')?.textContent.includes('Rating card saved')`, 20000);
    const bytes = await fs.readFile(file);
    assert.equal(bytes.readUInt32BE(16), 1080); assert.equal(bytes.readUInt32BE(20), 1350);
    await evaluate(`document.querySelector('[aria-label="Close dialog"]').click(); void 0;`);
  }
  const evaluate = code => win.webContents.executeJavaScript(code, true);
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const waitFor = async (code, timeout = 20000) => { const start = Date.now(); while (!await evaluate(code)) { if (Date.now() - start > timeout) throw new Error(`Timed out: ${code}`); await sleep(250); } };
  const screenshot = async name => { win.show(); win.focus(); win.webContents.invalidate(); await sleep(700); await fs.writeFile(path.join(artifactDir, name), (await win.webContents.capturePage()).toPNG()); console.log(`saved ${name}`); };
  const nav = label => evaluate(`[...document.querySelectorAll('.nav-item')].find(b => b.textContent.includes(${JSON.stringify(label)})).click(); void 0;`);
  const clickText = (selector, text) => evaluate(`[...document.querySelectorAll(${JSON.stringify(selector)})].find(b => b.textContent.includes(${JSON.stringify(text)})).click(); void 0;`);
  await waitFor("document.querySelector('h1')?.textContent === 'Let the engines battle.'");
  await sleep(1000);
  await evaluate(`localStorage.setItem('arena-config', JSON.stringify({ engineIds: ['anchor-a', 'subject'], games: 2, minutes: 3, increment: 2, threads: 1, hash: 64 }));
    localStorage.setItem('arena-gauntlet', JSON.stringify({ subjectId: 'subject', tc: 'short', opponentIds: ['anchor-a', 'anchor-b'], gamesPerOpponent: 2, concurrency: 4, hash: 256, adjudicate: true }));
    localStorage.setItem('arena-quicktest', JSON.stringify({ devId: 'anchor-a', baseId: 'subject', tc: '1+0.01', hash: 16, threads: 1, concurrency: 4, preset: 'big', elo0: 0, elo1: 10, model: 'normalized', subjectId: 'subject', anchorIds: ['anchor-a', 'anchor-b'], gamesPerAnchor: 4, list: 'blitz' }));
    void 0;`);
  const reloaded = new Promise(resolve => win.webContents.once('did-finish-load', resolve));
  win.webContents.reload(); await reloaded; await sleep(500);
  await waitFor("document.querySelector('h1')?.textContent === 'Let the engines battle.'");
  await waitFor("/Blitz\\d+/.test(document.querySelector('.contender .rating-tag')?.textContent || '')");
  assert.match(await evaluate("document.querySelector('.contender .rating-tag').textContent"), /Blitz\d+/);
  await screenshot('lab-arena.png');

  await evaluate("document.querySelector('[aria-label=\"Board and piece themes\"]').click(); void 0;");
  await waitFor("document.querySelector('.theme-option.selected')?.textContent.includes('Lichess') && document.querySelector('.piece-option.selected')?.textContent.includes('Lichess')");
  assert.equal(await evaluate("document.querySelectorAll('.board [data-piece-style=cburnett]').length"), 32);
  await screenshot('lab-themes.png');
  await evaluate("document.querySelector('[aria-label=\"Close dialog\"]').click(); void 0;");
  await nav('Engine library'); await waitFor("document.querySelectorAll('.engine-card').length === 5");
  await screenshot('lab-library.png');
  await evaluate("document.querySelector('[aria-label=\"Edit Anchor A\"]').click(); void 0;");
  await waitFor("document.querySelector('[aria-label=\"CCRL Blitz rating\"]')?.value.length === 4");
  await screenshot('lab-engine-ratings.png');
  await evaluate("document.querySelector('[aria-label=\"Close dialog\"]').click(); void 0;");

  await nav('Rating gauntlet'); await waitFor("document.querySelectorAll('.opponent-row.on').length === 2");
  await screenshot('lab-gauntlet-setup.png');
  await clickText('button', 'Start gauntlet');
  await waitFor("document.querySelector('.rating-hero') !== null");
  await waitFor("document.querySelectorAll('.board-tabs button').length === 4", 30000);
  await waitFor("document.querySelectorAll('.lab-board .rating-tag').length === 2 && document.querySelectorAll('.lab-strip img, .lab-strip .engine-badge').length === 2");
  await sleep(15000); await screenshot('lab-gauntlet-live.png');
  await waitFor("window.arena.gauntlet.current().then(s => s.finished >= 1)", 360000);
  await screenshot('lab-gauntlet-progress.png');
  await waitFor("window.arena.gauntlet.current().then(s => s.status === 'finished')", 600000);
  const gauntlet = await evaluate('window.arena.gauntlet.current()');
  assert.equal(gauntlet.finished, 4); assert.ok(Number.isFinite(gauntlet.estimate.elo));
  await waitFor("document.querySelector('.rating-hero-actions .primary-btn') !== null");
  await screenshot('lab-gauntlet-done.png');
  const subject = (await evaluate('window.arena.engines()')).find(e => e.id === 'subject');
  assert.equal(subject.estimates.short.games, 4);
  assert.equal((await evaluate('window.arena.gauntlet.list()')).length, 1);
  await verifyRatingCard('lab-card-gauntlet');
  await clickText('.rating-hero-actions button', 'New gauntlet');
  await waitFor("document.querySelector('.lab-history-row') !== null");

  await nav('Quick test'); await waitFor("document.querySelector('.fastchess-status.ready') !== null", 15000);
  await screenshot('lab-quicktest-setup.png');
  await clickText('button', 'Start test');
  await waitFor("document.querySelector('.quick-hero') !== null");
  await waitFor("window.arena.fastchess.current().then(s => s.games >= 20)", 120000);
  await screenshot('lab-quicktest-live.png');
  await waitFor("window.arena.fastchess.current().then(s => !!s.finishedAt)", 600000);
  const run = await evaluate('window.arena.fastchess.current()');
  assert.equal(run.status, 'finished', run.message); assert.ok(run.verdict);
  await waitFor("document.querySelector('.verdict') !== null");
  await screenshot('lab-quicktest-done.png');
  // STC rating estimate through fastchess, then its rating card.
  await clickText('.rating-hero-actions button', 'New test');
  await clickText('.mode-switch button', 'Rating estimate');
  await waitFor("document.querySelectorAll('.opponent-row.on').length === 2");
  await screenshot('lab-stc-setup.png');
  await clickText('button', 'Start rating estimate');
  await waitFor("document.querySelector('.estimate-chart svg') !== null", 120000);
  await screenshot('lab-stc-live.png');
  await waitFor("window.arena.fastchess.current().then(s => !!s.finishedAt)", 600000);
  const stc = await evaluate('window.arena.fastchess.current()');
  assert.equal(stc.status, 'finished', stc.message); assert.equal(stc.games, 8); assert.ok(Number.isFinite(stc.estimate.elo));
  assert.deepEqual(stc.opponents.map(o => o.games), [4, 4]);
  assert.equal((await evaluate('window.arena.engines()')).find(e => e.id === 'subject').estimates.stc.games, 8);
  await screenshot('lab-stc-done.png');
  await verifyRatingCard('lab-card-stc');
  // Anchor import from a real folder fills in CCRL ratings by UCI name.
  dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [process.env.ANCHOR_FOLDER || path.dirname(process.env.ENGINE_ANCHOR_A)] });
  const imported = await evaluate('window.arena.importAnchors()');
  assert.ok(imported.added.length >= 1, JSON.stringify(imported.failed));
  assert.ok(imported.added.every(e => e.anchor && Object.keys(e.ratings).length));
  assert.equal(errors.length, 0, errors.join('\n'));
  await fs.writeFile(path.join(artifactDir, 'lab-smoke-success.json'), JSON.stringify({ gauntlet: { finished: gauntlet.finished, estimate: gauntlet.estimate, opponents: gauntlet.opponents }, quickTest: { games: run.games, ptnml: run.ptnml, stats: run.stats, reported: run.reported, verdict: run.verdict }, stc: { games: stc.games, estimate: stc.estimate, opponents: stc.opponents }, imported: imported.added.map(e => [e.name, e.ratings]) }, null, 2));
  console.log('Lab smoke passed.');
  app.exit(0);
}
(async () => {
  await fs.mkdir(userData, { recursive: true });
  await fs.writeFile(path.join(userData, 'arena.json'), JSON.stringify({ engines, history: [], gauntlets: [], tests: [], settings: { fastchessPath: env('FASTCHESS_PATH') } }));
  require('../electron/main.cjs');
})();
