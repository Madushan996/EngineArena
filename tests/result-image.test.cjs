const { test } = require('node:test');
const assert = require('node:assert/strict');
const { validateResultPng, safeResultFilename } = require('../electron/result-image.cjs');
const engines = [{ name: 'Atlas', builtin: 'atlas' }, { name: 'Volt', builtin: 'volt' }];
const state = winners => ({ status: 'finished', total: winners.length, results: winners.map(winner => ({ winner })) });
const config = { minutes: 1, increment: 2 };
const date = '2026-10-04T12:00:00Z';

test('share model derives accurate fractional scores and W/D/L from completed games', async () => {
  const { resultModel, resultScore } = await import('../src/resultModel.js');
  const model = resultModel({ state: state([0, null, 1, 0, null]), engines, config, date });
  assert.deepEqual(model.scores, [3, 2]); assert.equal(model.winner, 0);
  assert.deepEqual(model.contenders.map(e => [e.wins, e.draws, e.losses]), [[2, 2, 1], [1, 2, 2]]);
  assert.equal(model.timeControl, '1 min + 2 sec'); assert.equal(model.complete, true);
  assert.equal(resultScore(.5), '½'); assert.equal(resultScore(1.5), '1½');
});
test('tied, stopped, and browser-demo results are labeled truthfully', async () => {
  const { resultModel } = await import('../src/resultModel.js');
  const tie = resultModel({ state: state([0, 1]), engines, config, date });
  assert.equal(tie.winner, null); assert.equal(tie.verdict, 'A battle of equals.');
  const partial = resultModel({ state: { ...state([0, null]), status: 'stopped', total: 10 }, engines, config: { minutes: .05, increment: 0 }, date, preview: true });
  assert.equal(partial.complete, false); assert.equal(partial.games, 2); assert.equal(partial.plannedGames, 10);
  assert.equal(partial.timeControl, '3 sec + 0 sec'); assert.equal(partial.preview, true);
  assert.match(partial.subtitle, /leads/);
});
test('sharing requires terminal results and excludes non-local logos and private paths', async () => {
  const { resultModel } = await import('../src/resultModel.js');
  for (const status of ['idle', 'running', 'paused', 'starting']) assert.throws(() => resultModel({ state: { ...state([0]), status }, engines, config }), /Finish or stop/);
  assert.throws(() => resultModel({ state: state([]), engines, config }), /Finish or stop/);
  assert.throws(() => resultModel({ state: state([2]), engines, config }), /invalid result/);
  const model = resultModel({ state: state([0]), engines: [{ name: '  Long\nengine  ', logo: 'https://example.com/logo.png', path: 'PRIVATE-EXECUTABLE' }, engines[1]], config, date });
  assert.equal(model.contenders[0].name, 'Long engine'); assert.equal(model.contenders[0].logo, null);
  assert.ok(!JSON.stringify(model).includes('PRIVATE-EXECUTABLE'));
});
test('download names cannot contain directory separators or reserved path characters', async () => {
  const { resultModel, resultFilename } = await import('../src/resultModel.js');
  const model = resultModel({ state: state([0]), engines: [{ name: '../C:\\Engine:*?' }, engines[1]], config, date });
  const filename = resultFilename(model, 'square');
  assert.ok(!/[<>:"/\\|?*]/.test(filename)); assert.match(filename, /^Engine-Arena-.*-square\.png$/);
  assert.equal(safeResultFilename('../../match.png'), 'Engine-Arena-match.png');
  assert.equal(safeResultFilename(null), 'Engine-Arena-Result.png');
});
test('native export validates PNG headers, bounded payloads, and supported image dimensions', () => {
  const png = height => {
    const bytes = Buffer.alloc(33); Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(bytes);
    bytes.writeUInt32BE(13, 8); bytes.write('IHDR', 12); bytes.writeUInt32BE(1080, 16); bytes.writeUInt32BE(height, 20);
    return 'data:image/png;base64,' + bytes.toString('base64');
  };
  for (const height of [1080, 1350, 1920]) assert.equal(validateResultPng(png(height)).height, height);
  assert.throws(() => validateResultPng(png(40000)), /Unsupported/);
  for (const invalid of [null, 'data:image/jpeg;base64,AAAA', 'data:image/png;base64,AAAA', 'file:///secret.png', 'data:image/png;base64,' + 'A'.repeat(12_000_000)]) assert.throws(() => validateResultPng(invalid));
});
