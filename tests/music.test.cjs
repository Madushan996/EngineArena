const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('original piano asset is a full-length stereo PCM loop without clipping or a silent boundary', () => {
  const directory = path.join(__dirname, '..', 'public', 'audio');
  const wav = fs.readFileSync(path.join(directory, 'midnight-gambit.wav'));
  const metadata = JSON.parse(fs.readFileSync(path.join(directory, 'midnight-gambit.json'), 'utf8'));
  assert.equal(wav.toString('ascii', 0, 4), 'RIFF');
  assert.equal(wav.toString('ascii', 8, 12), 'WAVE');
  assert.equal(wav.readUInt16LE(20), 1);
  assert.equal(wav.readUInt16LE(22), 2);
  assert.equal(wav.readUInt16LE(34), 16);
  const rate = wav.readUInt32LE(24), frames = wav.readUInt32LE(40) / 4;
  assert.equal(rate, 44100); assert.equal(frames / rate, 96);
  assert.equal(wav.length, frames * 4 + 44);
  assert.ok(metadata.peak < .9 && metadata.rms > .05 && metadata.rms < .25);
  assert.ok(metadata.seamJump < .01, `Unexpected boundary jump: ${metadata.seamJump}`);
  // No abrupt silent intro/outro: the score and room tails wrap at the bar line.
  for (const start of [0, frames - rate / 4]) {
    let energy = 0;
    for (let i = start; i < start + rate / 4; i++) {
      const sample = wav.readInt16LE(44 + i * 4) / 32768; energy += sample * sample;
    }
    assert.ok(Math.sqrt(energy / (rate / 4)) > .01);
  }
  for (let i = 44; i < wav.length; i += 2) assert.ok(Math.abs(wav.readInt16LE(i)) < 30000);
});

test('Midnight Gambit is available by default without replacing existing soundtrack choices', async () => {
  const { readPreferences } = await import('../src/preferences.js');
  const original = global.localStorage;
  try {
    global.localStorage = { getItem: () => '{}' };
    assert.equal(readPreferences().musicTrack, 'gambit');
    assert.equal(readPreferences().musicEnabled, false);
    for (const musicTrack of ['gambit', 'study', 'hall', 'custom']) {
      global.localStorage = { getItem: () => JSON.stringify({ musicTrack }) };
      assert.equal(readPreferences().musicTrack, musicTrack);
    }
  } finally { if (original === undefined) delete global.localStorage; else global.localStorage = original; }
});
