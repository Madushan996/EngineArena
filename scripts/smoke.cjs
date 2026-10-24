// Native end-to-end verification. Uses an isolated app-data folder, never the user's library.
const { app, dialog, nativeImage } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');
const assert = require('node:assert/strict');
const artifactDir = path.resolve(__dirname, '..', 'artifacts');
app.setPath('userData', path.join(artifactDir, `smoke-data-${Date.now()}`));
const errors = [];
app.on('browser-window-created', (_, win) => {
  win.webContents.on('console-message', (_, level, message) => { if (level === 3) errors.push(message); });
  win.webContents.once('did-finish-load', () => verify(win).catch(async error => {
    console.error(error);
    const states = await win.webContents.executeJavaScript('window.smokeStates || []').catch(() => []);
    const audio = await win.webContents.executeJavaScript(`({preferences:localStorage.getItem('arena-preferences'), contexts:(window.testAudio || []).map(ctx => ({state:ctx.state,time:ctx.currentTime,gains:ctx.testGains.slice(0,2).map(g => g.gain.value)}))})`).catch(() => null);
    await fs.writeFile(path.join(artifactDir, 'smoke-error.json'), JSON.stringify({ error: error.stack, states: states.slice(-3), audio, errors }, null, 2));
    app.exit(1);
  }));
});
async function verify(win) {
  await fs.mkdir(artifactDir, { recursive: true });
  const evaluate = code => win.webContents.executeJavaScript(code, true);
  const waitFor = async (code, timeout = 15000) => {
    const start = Date.now();
    while (!await evaluate(code)) { if (Date.now() - start > timeout) throw new Error(`Timed out: ${code}`); await new Promise(r => setTimeout(r, 100)); }
  };
  await waitFor("document.querySelector('h1')?.textContent === 'Let the engines battle.'");
  assert.equal(await evaluate("typeof window.arena.start"), 'function');
  assert.equal((await evaluate('window.arena.engines()')).length, 2);
  const screenshot = async name => { const page = await win.webContents.capturePage(); await fs.writeFile(path.join(artifactDir, name), page.toPNG()); };
  await screenshot('desktop-arena.png');
  await verifyPreferences(win, evaluate, waitFor, screenshot);
  await evaluate("window.smokeStates = []; window.arena.onState(s => window.smokeStates.push(s)); void 0;");
  // Start through the UI so the original match configuration is captured for sharing.
  await evaluate(`(() => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    for (const [label, value] of [['Number of games', '2'], ['Minutes per engine', '0.05']]) {
      const input = document.querySelector('[aria-label="' + label + '"]'); setter.call(input, value); input.dispatchEvent(new Event('input', {bubbles:true}));
    }
  })(); void 0;`);
  await waitFor("JSON.parse(localStorage.getItem('arena-config')).minutes === .05 && JSON.parse(localStorage.getItem('arena-config')).games === 2");
  await evaluate("document.querySelector('.start-btn').click(); void 0;");
  await waitFor("document.querySelector('.move-row') !== null");
  await screenshot('desktop-live.png');
  await waitFor("window.smokeStates.at(-1)?.status === 'finished'", 20000);
  const final = await evaluate('window.smokeStates.at(-1)');
  assert.equal(final.results.length, 2); assert.equal(final.scores[0] + final.scores[1], 2);
  assert.deepEqual(final.results.map(r => r.white), [0, 1]);
  await waitFor("document.querySelector('[aria-label=\"Final match score\"]') !== null");
  await screenshot('desktop-results.png');
  const history = await evaluate('window.arena.history()');
  assert.ok(history.length >= 1); assert.equal(history[0].state.results.length, 2);
  // Exercise the native save dialog path with a deterministic fixture destination.
  const exportPath = path.join(artifactDir, 'smoke-match.pgn');
  dialog.showSaveDialog = async () => ({ canceled: false, filePath: exportPath });
  assert.equal(await evaluate(`window.arena.exportPgn(${JSON.stringify(final.results.map(r => r.pgn).join('\n\n'))})`), true);
  assert.match(await fs.readFile(exportPath, 'utf8'), /\[White "/);
  await verifyShare(win, evaluate, waitFor, screenshot, final, history[0]);
  // Verify logo import and engine metadata updates through the real preload/IPC bridge.
  dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path.join(artifactDir, 'desktop-arena.png')] });
  const updated = await evaluate("window.arena.chooseLogo('atlas')"); assert.match(updated.logo, /^data:image\/png;base64,/);
  const renamed = await evaluate("window.arena.updateEngine({id:'atlas',name:'Atlas test'})"); assert.equal(renamed.name, 'Atlas test');
  assert.equal(errors.length, 0, errors.join('\n'));
  console.log('Native smoke passed: result image previews and PNG/JPEG export in all three formats, cancellation/invalid payloads, history sharing, bundled music, themes, native UCI match, PGN, logos.');
  console.log(`Screenshots: ${artifactDir}`);
  await fs.writeFile(path.join(artifactDir, 'smoke-success.json'), JSON.stringify({ version: '1.4.0', resultSharing: 'passed', appearanceAndAudio: 'passed', bundledPianoLoop: 'passed', results: final.results.length, scores: final.scores, errors }, null, 2));
  app.exit(0);
}
async function verifyShare(win, evaluate, waitFor, screenshot, final, savedMatch) {
  const click = async label => {
    const selector = `[aria-label=${JSON.stringify(label)}]`;
    await evaluate(`document.querySelector(${JSON.stringify(selector)}).click(); void 0;`);
  };
  await click('Share final result');
  await waitFor("document.querySelector('.share-preview img')?.complete");
  const modelAlt = await evaluate("document.querySelector('.share-preview img').alt");
  assert.match(modelAlt, new RegExp(`${final.scores[0]} to ${final.scores[1]}`));
  assert.equal(await evaluate("document.querySelector('.share-preview img').dataset.timeControl"), '3 sec + 0 sec');
  for (const [name, height, id] of [['Square', 1080, 'square'], ['Portrait', 1350, 'portrait'], ['Status / Story', 1920, 'story']]) {
    await click(`${name} result image`);
    await waitFor(`document.querySelector('.share-preview img')?.dataset.exportHeight === '${height}'`);
    const destination = path.join(artifactDir, `share-result-${id}.png`);
    dialog.showSaveDialog = async (_, options) => { assert.match(options.defaultPath, new RegExp(`-${id}\\.png$`)); return { canceled: false, filePath: destination }; };
    await click('Download result image');
    await waitFor("document.querySelector('[aria-label=\"Download result image\"]')?.disabled === false");
    const bytes = await fs.readFile(destination), image = nativeImage.createFromBuffer(bytes);
    assert.deepEqual(image.getSize(), { width: 1080, height }); assert.ok(bytes.length > 10000);
    assert.equal(bytes.toString('ascii', 1, 4), 'PNG');
  }
  await click('Square result image'); await waitFor("document.querySelector('.share-preview img')?.dataset.exportHeight === '1080'");
  await screenshot('desktop-share.png');
  const dataUrl = await evaluate("document.querySelector('.share-preview img').src");
  const jpegPath = path.join(artifactDir, 'share-result-square.jpg');
  dialog.showSaveDialog = async () => ({ canceled: false, filePath: jpegPath });
  assert.equal(await evaluate(`window.arena.exportResultImage({dataUrl:${JSON.stringify(dataUrl)}, filename:'Engine-Arena.png'})`), true);
  const jpeg = await fs.readFile(jpegPath); assert.equal(jpeg.readUInt16BE(0), 0xffd8);
  assert.deepEqual(nativeImage.createFromBuffer(jpeg).getSize(), { width: 1080, height: 1080 });
  dialog.showSaveDialog = async () => ({ canceled: true });
  assert.equal(await evaluate(`window.arena.exportResultImage({dataUrl:${JSON.stringify(dataUrl)}, filename:'Engine-Arena.png'})`), false);
  assert.equal(await evaluate("window.arena.exportResultImage({dataUrl:'data:image/png;base64,AAAA'}).then(() => false, () => true)"), true);
  await click('Close dialog'); await waitFor("document.querySelector('[aria-label=\"Final match score\"]') !== null");
  await click('Close dialog');
  // Changing next-match options must not alter the exported match's time control.
  await evaluate(`(() => { const input = document.querySelector('[aria-label="Minutes per engine"]'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, '10'); input.dispatchEvent(new Event('input', {bubbles:true})); })(); void 0;`);
  await waitFor("JSON.parse(localStorage.getItem('arena-config')).minutes === 10");
  await click('Share scoreboard result'); await waitFor("document.querySelector('.share-preview img')?.complete");
  assert.equal(await evaluate("document.querySelector('.share-preview img').dataset.timeControl"), '3 sec + 0 sec');
  await click('Close dialog');
  await evaluate("[...document.querySelectorAll('.nav-item')].find(b => b.textContent.includes('Match history')).click(); void 0;");
  await waitFor("document.querySelector('.history-row') !== null");
  await evaluate("document.querySelector('.history-row').click(); void 0;");
  await click('Share scoreboard result'); await waitFor("document.querySelector('.share-preview img')?.complete");
  assert.equal(await evaluate("document.querySelector('.share-preview img').dataset.timeControl"), `${savedMatch.config.minutes * 60} sec + 0 sec`);
  await click('Close dialog');
}
async function verifyPreferences(win, evaluate, waitFor, screenshot) {
  const click = async label => {
    const selector = `[aria-label=${JSON.stringify(label)}]`;
    await evaluate(`document.querySelector(${JSON.stringify(selector)}).click(); void 0;`);
  };
  const installAudioProbe = () => evaluate(`
    window.testAudio = []; window.testAudioStarts = 0;
    window.AudioContext = class extends window.AudioContext {
      constructor(...args) { super(...args); this.testGains = []; this.testSources = []; this.testAnalyser = this.createAnalyser(); this.testAnalyser.fftSize = 1024; window.testAudio.push(this); }
      createGain() { const node = super.createGain(); this.testGains.push(node); return node; }
      createDynamicsCompressor() { const node = super.createDynamicsCompressor(); node.connect(this.testAnalyser); return node; }
      createOscillator() { const node = super.createOscillator(); const start = node.start.bind(node); node.start = (...args) => { window.testAudioStarts++; return start(...args); }; return node; }
      createBufferSource() { const node = super.createBufferSource(); this.testSources.push(node); const start = node.start.bind(node); node.start = (...args) => { window.testAudioStarts++; if (window.testLoopBoundary && node.loop && Math.abs(node.buffer.duration - 96) < .01) { node.testStartTime = this.currentTime; return start(this.currentTime, 95.5); } return start(...args); }; return node; }
    }; void 0;
  `);
  const audible = `(() => { const ctx = window.testAudio.at(-1); if (!ctx || ctx.state !== 'running') return false; const data = new Float32Array(1024); ctx.testAnalyser.getFloatTimeDomainData(data); return data.some(v => Math.abs(v) > .0001); })()`;
  const verifyMute = async bus => {
    // An inactive gain may retain its last rendered value. Drive it with a short
    // probe so we verify the actual rendered mute, not a stale AudioParam reading.
    await evaluate(`(() => { const ctx = window.testAudio.at(-1); const probe = ctx.createOscillator(); probe.connect(ctx.testGains[${bus}]); probe.start(); probe.stop(ctx.currentTime + 1); probe.onended = () => probe.disconnect(); })(); void 0;`);
    await waitFor(`window.testAudio.at(-1).testGains[${bus}].gain.value < .001`);
    await waitFor(`!(${audible})`);
  };
  await installAudioProbe();
  await click('Board and piece themes');
  await waitFor("document.querySelector('#tab-appearance') !== null");
  for (const [label, id] of [['Lichess', 'lichess'], ['Chess.com', 'chesscom'], ['Walnut', 'walnut'], ['Mahogany', 'mahogany'], ['Marble', 'marble'], ['Arena', 'emerald']]) {
    await click(`${label} board`);
    await waitFor(`document.querySelector('.board').dataset.boardTheme === '${id}'`);
    assert.equal(await evaluate("document.querySelectorAll('.board .square').length"), 64);
  }
  for (const [label, id] of [['Lichess', 'cburnett'], ['Staunton', 'staunton'], ['Heirloom', 'heirloom'], ['Arena', 'arena']]) {
    await click(`${label} pieces`);
    await waitFor(`document.querySelectorAll('.board [data-piece-style="${id}"]').length === 32`);
  }
  await click('Walnut board'); await click('Heirloom pieces');
  await screenshot('desktop-preferences.png');
  await evaluate("document.getElementById('tab-audio').click(); void 0;");
  await evaluate("[...document.querySelectorAll('button')].find(b => b.textContent.includes('Preview sounds')).click(); void 0;");
  await waitFor('window.testAudioStarts > 0'); await waitFor(audible);
  await click('Chess sounds');
  await verifyMute(0);
  assert.equal(await evaluate("JSON.parse(localStorage.getItem('arena-preferences')).soundsEnabled"), false);
  assert.equal(await evaluate("document.querySelector('[aria-label=\"Background soundtrack\"]').value"), 'gambit');
  await evaluate('window.testLoopBoundary = true; void 0;');
  await click('Background music');
  await waitFor("document.querySelector('.music-player').dataset.musicState === 'playing'"); await waitFor(audible);
  await waitFor('window.testAudio.at(-1).testSources.some(s => s.loop && Math.abs(s.buffer.duration - 96) < .01)');
  await waitFor('window.testAudio.at(-1).testSources.some(s => s.testStartTime !== undefined && window.testAudio.at(-1).currentTime - s.testStartTime > 1)');
  await waitFor(audible);
  assert.equal(await evaluate("JSON.parse(localStorage.getItem('arena-preferences')).musicTrack"), 'gambit');
  await screenshot('desktop-gambit.png');
  await evaluate('window.testLoopBoundary = false; void 0;');
  await evaluate("const studySelect = document.querySelector('[aria-label=\"Background soundtrack\"]'); studySelect.value = 'study'; studySelect.dispatchEvent(new Event('change', {bubbles:true})); void 0;");
  await waitFor("document.querySelector('.music-player strong').textContent === 'Quiet study'"); await waitFor(audible);
  await evaluate("const select = document.querySelector('[aria-label=\"Background soundtrack\"]'); select.value = 'hall'; select.dispatchEvent(new Event('change', {bubbles:true})); void 0;");
  await waitFor("document.querySelector('.music-player strong').textContent === 'Grand hall'"); await waitFor(audible);
  await screenshot('desktop-audio.png');
  await click('Pause background music');
  await waitFor("document.querySelector('.music-player').dataset.musicState === 'stopped'");
  await verifyMute(1);
  // Import a real PCM WAV through the same file input used by a native picker.
  await evaluate(`
    const rate = 16000, count = rate * 2, bytes = new ArrayBuffer(44 + count * 2), data = new DataView(bytes);
    const text = (offset, value) => [...value].forEach((ch, i) => data.setUint8(offset + i, ch.charCodeAt(0)));
    text(0, 'RIFF'); data.setUint32(4, 36 + count * 2, true); text(8, 'WAVE'); text(12, 'fmt ');
    data.setUint32(16, 16, true); data.setUint16(20, 1, true); data.setUint16(22, 1, true);
    data.setUint32(24, rate, true); data.setUint32(28, rate * 2, true); data.setUint16(32, 2, true); data.setUint16(34, 16, true);
    text(36, 'data'); data.setUint32(40, count * 2, true);
    for (let i = 0; i < count; i++) data.setInt16(44 + i * 2, Math.sin(i / rate * Math.PI * 2 * 220) * 1500, true);
    const transfer = new DataTransfer(); transfer.items.add(new File([bytes], 'Arena-test.wav', {type:'audio/wav'}));
    const input = document.querySelector('[aria-label="Choose background music file"]'); input.files = transfer.files; input.dispatchEvent(new Event('change', {bubbles:true})); void 0;
  `);
  await waitFor("document.querySelector('.music-player strong').textContent === 'Arena-test.wav'");
  await waitFor('window.testAudio.at(-1).testSources.some(s => s.loop && Math.abs(s.buffer.duration - 2) < .01)'); await waitFor(audible);
  await click('Pause background music');
  await waitFor("JSON.parse(localStorage.getItem('arena-preferences')).musicEnabled === false");
  // Reload verifies settings and IndexedDB file persistence, with no unsolicited music.
  const loaded = new Promise(resolve => win.webContents.once('did-finish-load', resolve)); win.webContents.reload(); await loaded;
  await waitFor("document.querySelector('.board')?.dataset.boardTheme === 'walnut'");
  assert.equal(await evaluate("document.querySelectorAll('.board [data-piece-style=heirloom]').length"), 32);
  assert.equal(await evaluate("JSON.parse(localStorage.getItem('arena-preferences')).soundsEnabled"), false);
  await installAudioProbe(); await click('Board and piece themes');
  await evaluate("document.getElementById('tab-audio').click(); void 0;");
  assert.equal(await evaluate("document.querySelector('.music-player strong').textContent"), 'Arena-test.wav');
  await evaluate("document.querySelector('[aria-label=\"Play background music\"]').dispatchEvent(new PointerEvent('pointerdown',{bubbles:true})); void 0;");
  await click('Play background music');
  await waitFor("document.querySelector('.music-player').dataset.musicState === 'playing'"); await waitFor(audible);
  await click('Pause background music'); await waitFor("document.querySelector('.music-player').dataset.musicState === 'stopped'");
  await click('Close dialog'); await screenshot('desktop-classical.png');
}
require('../electron/main.cjs');
