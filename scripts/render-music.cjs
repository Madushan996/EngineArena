// Original score and deterministic piano rendering. No borrowed samples or recordings.
// Render with: node scripts/render-music.cjs
const fs = require('node:fs');
const path = require('node:path');
const RATE = 44100, BPM = 80, BEAT = 60 / BPM, BARS = 32;
const DURATION = BARS * 4 * BEAT, FRAMES = Math.round(DURATION * RATE);
const left = new Float64Array(FRAMES), right = new Float64Array(FRAMES);
let seed = 20261004;
function random() { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; }

// C minor: a quiet opening, a questioning middle, and a dominant that returns
// naturally to the first C-minor bar. The second pass varies the melody/voicing.
const harmony = [
  { name: 'Cm(add9)', bass: 36, tones: [48, 55, 62, 63] },
  { name: 'Abmaj7', bass: 32, tones: [48, 55, 56, 63] },
  { name: 'Ebmaj9', bass: 39, tones: [50, 55, 58, 65] },
  { name: 'Bb(add9)', bass: 34, tones: [48, 53, 58, 62] },
  { name: 'Fm9', bass: 41, tones: [48, 55, 56, 63] },
  { name: 'Abmaj7', bass: 32, tones: [48, 55, 56, 63] },
  { name: 'Dm7b5', bass: 38, tones: [48, 53, 56, 62] },
  { name: 'G7', bass: 31, tones: [47, 53, 55, 62] },
  { name: 'Cm9', bass: 36, tones: [48, 55, 58, 63] },
  { name: 'Bb/D', bass: 38, tones: [50, 53, 58, 62] },
  { name: 'Abmaj7', bass: 32, tones: [48, 55, 56, 63] },
  { name: 'Eb/G', bass: 31, tones: [46, 51, 55, 58] },
  { name: 'Fm9', bass: 41, tones: [48, 55, 56, 63] },
  { name: 'Abmaj7', bass: 32, tones: [48, 55, 56, 63] },
  { name: 'Gsus4', bass: 31, tones: [48, 53, 55, 62] },
  { name: 'G7', bass: 31, tones: [47, 53, 55, 62] },
];
// [beat, MIDI pitch, held beats]. Space between phrases matters as much as notes.
const phrases = [
  [[0, 75, 1.3], [1.5, 74, .45], [2, 72, 1.5]],
  [[.5, 70, .8], [1.5, 72, .8], [2.5, 75, 1.15]],
  [[0, 79, 1.4], [1.5, 77, .4], [2, 75, 1.6]],
  [[.5, 74, .7], [1.5, 72, .6], [2.5, 70, 1.15]],
  [[0, 72, .8], [1, 75, .8], [2, 77, 1.65]],
  [[0, 75, 1.25], [1.5, 72, .8], [3, 70, .7]],
  [[.5, 74, 1.2], [2, 72, .8], [3, 68, .75]],
  [[0, 71, 1.3], [1.5, 74, .7], [2.5, 79, 1.1]],
  [[0, 79, .8], [1, 75, .8], [2, 74, .6], [3, 72, .8]],
  [[.5, 74, .8], [1.5, 77, 1.15], [3, 70, .7]],
  [[0, 75, 1.3], [1.5, 72, .6], [2.5, 68, 1.2]],
  [[.5, 70, .8], [1.5, 67, .8], [2.5, 75, 1.15]],
  [[0, 77, 1.2], [1.5, 75, .8], [2.5, 72, 1.1]],
  [[0, 75, 1.3], [1.5, 72, .7], [2.5, 70, 1.1]],
  [[0, 72, 1.6], [2, 74, .8], [3, 72, .75]],
  [[0, 71, 1.35], [1.5, 74, .6], [2.5, 71, 1.15]],
];
const events = [];
function note(midi, beat, held, velocity, voice) {
  events.push({ midi, seconds: beat * BEAT, held: held * BEAT, velocity, voice });
}
for (let bar = 0; bar < BARS; bar++) {
  const chord = harmony[bar % 16], offset = bar * 4, reprise = bar >= 16;
  const swell = 1 + .09 * Math.sin(bar / BARS * Math.PI * 2 - .7);
  note(chord.bass, offset, 3.35, .23 * swell, 'bass');
  // Gentle rolled upper chord and an unhurried eighth-note accompaniment.
  chord.tones.slice(1).forEach((pitch, i) => note(pitch, offset + .025 * i, 1.8, .052 * swell, 'chord'));
  const pattern = reprise ? [0, 2, 1, 3, 1, 2, 0, 3] : [0, 1, 2, 3, 1, 2, 0, 2];
  pattern.forEach((index, step) => note(chord.tones[index], offset + step * .5 + (step % 2 ? .012 : 0), .62, (.086 + (step % 4 === 0 ? .015 : 0)) * swell, 'arp'));
  const melody = phrases[bar % 16].map(value => [...value]);
  // A short answering turn in the reprise; the final dominant stays restrained.
  if (reprise && [0, 4, 8, 12].includes(bar % 16)) {
    melody[0][1] += 12; melody[0][2] = .65;
    melody.splice(1, 0, [.85, melody[0][1] - 12, .5]);
  }
  melody.forEach(([beat, pitch, held], i) => note(pitch, offset + beat + .025, held, (.20 - i * .011) * swell, 'melody'));
}

function renderNote(event) {
  const { midi, seconds, held, velocity, voice } = event;
  const freq = 440 * 2 ** ((midi - 69) / 12);
  const duration = held + (voice === 'bass' ? 2.8 : 2.15);
  const frames = Math.ceil(duration * RATE), start = Math.round(seconds * RATE);
  const pan = Math.max(-.32, Math.min(.32, (midi - 60) / 65));
  const gainL = Math.cos((pan + 1) * Math.PI / 4), gainR = Math.sin((pan + 1) * Math.PI / 4);
  // Inharmonic struck-string partials, quicker decay in the high harmonics,
  // and a very quiet detuned string create a softer, less organ-like piano.
  const stiffness = .000025 * 2 ** ((midi - 48) / 24);
  const levels = [1, .42, .21, .11, .052, .027, .013];
  const partials = levels.map((level, i) => {
    const harmonic = i + 1, f = freq * harmonic * Math.sqrt(1 + stiffness * harmonic * harmonic);
    const angle = 2 * Math.PI * f / RATE, phase = (random() - .5) * .06;
    const decay = (midi < 48 ? 3.3 : 2.25) / (1 + i * .55);
    return { sin: Math.sin(phase), cos: Math.cos(phase), a: Math.cos(angle), b: Math.sin(angle), gain: level, decay: Math.exp(-1 / (RATE * decay)) };
  });
  const detune = 2 * Math.PI * freq * 1.0008 / RATE;
  let dSin = 0, dCos = 1, dGain = .13;
  const dA = Math.cos(detune), dB = Math.sin(detune), dDecay = Math.exp(-1 / (RATE * 1.6));
  const attackFrames = Math.round(.0045 * RATE), releaseStart = Math.round(held * RATE);
  const releaseDecay = Math.exp(-1 / (RATE * .48));
  let damp = 1, hammer = .014;
  const hammerDecay = Math.exp(-1 / (RATE * .004));
  for (let i = 0; i < frames; i++) {
    let sample = 0;
    for (const p of partials) {
      sample += p.sin * p.gain;
      const next = p.sin * p.a + p.cos * p.b;
      p.cos = p.cos * p.a - p.sin * p.b; p.sin = next; p.gain *= p.decay;
    }
    sample += dSin * dGain + (random() * 2 - 1) * hammer;
    const next = dSin * dA + dCos * dB;
    dCos = dCos * dA - dSin * dB; dSin = next; dGain *= dDecay; hammer *= hammerDecay;
    if (i > releaseStart) damp *= releaseDecay;
    const attack = Math.min(1, i / attackFrames);
    // Smoothly bring the negligible tail to zero; no truncation edge.
    const tail = Math.min(1, (frames - 1 - i) / (RATE * .025));
    sample *= velocity * attack * damp * tail;
    const index = (start + i) % FRAMES;
    left[index] += sample * gainL; right[index] += sample * gainR;
  }
}
console.log(`Rendering Midnight Gambit: ${BARS} bars, ${BPM} BPM, ${DURATION} seconds, ${events.length} piano notes.`);
events.forEach(renderNote);

// A finite stereo room response wraps at the musical boundary. Unlike fading
// out then restarting, the last bar's resonance is present under the first.
const roomL = new Float64Array(left), roomR = new Float64Array(right);
for (const [delay, gain, cross] of [[.071, .12, false], [.113, .095, true], [.197, .08, true], [.311, .067, false], [.479, .052, true], [.677, .045, false], [.911, .036, true], [1.229, .029, false], [1.613, .02, true], [2.071, .013, false]]) {
  const shift = Math.round(delay * RATE);
  for (let i = 0; i < FRAMES; i++) {
    const source = (i - shift + FRAMES) % FRAMES;
    roomL[i] += (cross ? right[source] : left[source]) * gain;
    roomR[i] += (cross ? left[source] : right[source]) * gain;
  }
}
let meanL = 0, meanR = 0;
for (let i = 0; i < FRAMES; i++) { meanL += roomL[i]; meanR += roomR[i]; }
meanL /= FRAMES; meanR /= FRAMES;
let peak = 0;
for (let i = 0; i < FRAMES; i++) { roomL[i] -= meanL; roomR[i] -= meanR; peak = Math.max(peak, Math.abs(roomL[i]), Math.abs(roomR[i])); }
const scale = .68 / peak;
const wav = Buffer.alloc(44 + FRAMES * 4);
wav.write('RIFF', 0); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVE', 8); wav.write('fmt ', 12);
wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(2, 22);
wav.writeUInt32LE(RATE, 24); wav.writeUInt32LE(RATE * 4, 28); wav.writeUInt16LE(4, 32); wav.writeUInt16LE(16, 34);
wav.write('data', 36); wav.writeUInt32LE(FRAMES * 4, 40);
let squares = 0, maxJump = 0;
for (let i = 0; i < FRAMES; i++) {
  const l = roomL[i] * scale, r = roomR[i] * scale;
  wav.writeInt16LE(Math.round(l * 32767), 44 + i * 4); wav.writeInt16LE(Math.round(r * 32767), 46 + i * 4);
  squares += l * l + r * r;
  if (i > 0) maxJump = Math.max(maxJump, Math.abs(l - roomL[i - 1] * scale), Math.abs(r - roomR[i - 1] * scale));
}
const output = path.resolve(__dirname, '..', 'public', 'audio');
fs.mkdirSync(output, { recursive: true });
fs.writeFileSync(path.join(output, 'midnight-gambit.wav'), wav);
const seamJump = Math.max(Math.abs(roomL[0] - roomL[FRAMES - 1]), Math.abs(roomR[0] - roomR[FRAMES - 1])) * scale;
const report = { title: 'Midnight Gambit', original: true, instrument: 'Locally synthesized piano', bpm: BPM, bars: BARS, key: 'C minor', duration: DURATION, sampleRate: RATE, channels: 2, peak: .68, rms: Math.sqrt(squares / (FRAMES * 2)), seamJump, maxJump, notes: events.length };
fs.writeFileSync(path.join(output, 'midnight-gambit.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
