// Original synthesized cues and music; no network, samples, or third-party recordings.
export const musicTracks = [
  { id: 'gambit', name: 'Midnight Gambit', description: 'Original piano nocturne · 96-second seamless loop' },
  { id: 'study', name: 'Quiet study', description: 'Gentle piano · original composition' },
  { id: 'hall', name: 'Grand hall', description: 'Slow strings · original composition' },
  { id: 'custom', name: 'Your music', description: 'A local audio file on repeat' },
];
const frequency = midi => 440 * 2 ** ((midi - 69) / 12);
function musicDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('engine-arena-audio', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('tracks');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error('Could not open the local music library.'));
  });
}
export async function storedMusic(file) {
  const db = await musicDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const transaction = db.transaction('tracks', file ? 'readwrite' : 'readonly');
      const request = file ? transaction.objectStore('tracks').put(file, 'custom') : transaction.objectStore('tracks').get('custom');
      transaction.oncomplete = () => resolve(file || request.result || null);
      transaction.onerror = () => reject(new Error('Could not save your music. The local storage may be full.'));
      transaction.onabort = () => reject(new Error('Saving your music was interrupted.'));
    });
  } finally { db.close(); }
}

export class Soundscape {
  constructor(onStatus = () => {}, onError = () => {}) {
    this.onStatus = onStatus; this.onError = onError;
    this.settings = {}; this.musicVoices = new Set(); this.effectVoices = new Set(); this.disposed = false; this.generation = 0;
  }
  context() {
    if (this.disposed) throw new Error('Audio player is closed.');
    if (!this.ctx) {
      const Audio = window.AudioContext || window.webkitAudioContext;
      if (!Audio) throw new Error('Audio playback is unavailable on this device.');
      this.ctx = new Audio();
      this.effects = this.ctx.createGain(); this.music = this.ctx.createGain();
      const compressor = this.ctx.createDynamicsCompressor();
      compressor.threshold.value = -12; compressor.ratio.value = 4;
      this.effects.connect(compressor); this.music.connect(compressor); compressor.connect(this.ctx.destination);
      this.setVolumes();
    }
    return this.ctx;
  }
  async unlock() {
    const ctx = this.context();
    if (ctx.state === 'suspended') await ctx.resume();
    if (this.disposed) return;
    if (ctx.state === 'running' && this.settings.musicEnabled && !this.playingTrack && !this.failedTrack) await this.startMusic();
  }
  configure(settings) {
    const changed = this.settings.musicTrack !== settings.musicTrack;
    if (changed || this.settings.musicEnabled !== settings.musicEnabled) this.failedTrack = null;
    this.settings = { ...settings }; this.setVolumes();
    if (!settings.musicEnabled || changed) this.stopMusic();
    if (settings.musicEnabled && this.ctx?.state === 'running' && !this.playingTrack && !this.failedTrack) this.startMusic().catch(this.onError);
    else if (settings.musicEnabled && !this.playingTrack && !this.failedTrack) this.onStatus('waiting');
  }
  setVolumes() {
    if (!this.ctx) return;
    this.effects.gain.setTargetAtTime(this.settings.soundsEnabled ? (this.settings.soundVolume ?? 55) / 100 : 0, this.ctx.currentTime, .025);
    this.music.gain.setTargetAtTime(this.settings.musicEnabled ? (this.settings.musicVolume ?? 25) / 100 : 0, this.ctx.currentTime, .07);
  }
  voice(node, envelope, group) {
    group.add(node);
    node.onended = () => { group.delete(node); node.disconnect(); envelope.disconnect(); };
  }
  note(midi, when, duration, volume, target, mode = 'piano', group = this.musicVoices) {
    const ctx = this.ctx;
    // A soft fundamental with quiet harmonics keeps the piano warm rather than buzzy.
    for (const [harmonic, level] of mode === 'strings' ? [[1, 1], [2, .18], [3, .04]] : [[1, 1], [2, .22], [3, .06]]) {
      const oscillator = ctx.createOscillator(), envelope = ctx.createGain();
      oscillator.type = 'sine'; oscillator.frequency.value = frequency(midi) * harmonic;
      envelope.gain.setValueAtTime(0, when);
      envelope.gain.linearRampToValueAtTime(volume * level, when + (mode === 'strings' ? .65 : .008));
      envelope.gain.exponentialRampToValueAtTime(.0001, when + duration);
      oscillator.connect(envelope); envelope.connect(target);
      this.voice(oscillator, envelope, group); oscillator.start(when); oscillator.stop(when + duration + .02);
    }
  }
  knock(when, capture = false) {
    const ctx = this.ctx, duration = capture ? .13 : .085;
    const buffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * duration), ctx.sampleRate);
    const samples = buffer.getChannelData(0);
    for (let i = 0; i < samples.length; i++) samples[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ctx.sampleRate * .018));
    const noise = ctx.createBufferSource(), filter = ctx.createBiquadFilter(), envelope = ctx.createGain();
    noise.buffer = buffer; filter.type = 'bandpass'; filter.frequency.value = capture ? 850 : 1450; filter.Q.value = .7;
    envelope.gain.setValueAtTime(capture ? .75 : .48, when);
    envelope.gain.exponentialRampToValueAtTime(.0001, when + duration);
    noise.connect(filter); filter.connect(envelope); envelope.connect(this.effects);
    this.voice(noise, envelope, this.effectVoices); noise.onended = () => { this.effectVoices.delete(noise); noise.disconnect(); filter.disconnect(); envelope.disconnect(); };
    noise.start(when); noise.stop(when + duration);
    this.note(capture ? 46 : 54, when, .1, .18, this.effects, 'piano', this.effectVoices);
  }
  effect(kind, force = false) {
    if (!this.ctx || this.ctx.state !== 'running' || (!force && !this.settings.soundsEnabled)) return;
    const when = this.ctx.currentTime + .005;
    if (kind === 'move' || kind === 'capture') {
      this.knock(when, kind === 'capture'); if (kind === 'capture') this.knock(when + .065, false);
    } else {
      const notes = kind === 'result' ? [72, 76, 79] : kind === 'start' ? [60, 67] : [81, 76];
      notes.forEach((midi, i) => this.note(midi, when + i * .11, .65, .1, this.effects, 'piano', this.effectVoices));
    }
  }
  async importMusic(file) {
    if (file.size > 50 * 1024 * 1024) throw new Error('Choose an audio file smaller than 50 MB.');
    if (!file.size) throw new Error('This audio file is empty.');
    const ctx = this.context();
    let buffer;
    try { buffer = await ctx.decodeAudioData(await file.arrayBuffer()); }
    catch { throw new Error('This audio file could not be played. Try an MP3, WAV, OGG, or FLAC file.'); }
    await storedMusic(file);
    this.stopMusic(); this.customBuffer = buffer; this.failedTrack = null;
  }
  async startMusic() {
    if (this.disposed || !this.settings.musicEnabled || this.playingTrack || this.ctx?.state !== 'running') return;
    const track = this.settings.musicTrack;
    this.playingTrack = track; const generation = ++this.generation;
    if (track === 'custom' || track === 'gambit') {
      try {
        let buffer = track === 'gambit' ? this.gambitBuffer : this.customBuffer;
        if (!buffer) {
          this.onStatus('loading');
          let bytes;
          if (track === 'gambit') {
            const response = await fetch(`${import.meta.env.BASE_URL}audio/midnight-gambit.wav`);
            if (!response.ok) throw new Error('The bundled piano track could not be loaded.');
            bytes = await response.arrayBuffer();
          } else {
            const file = await storedMusic();
            if (!file) throw new Error('Choose an audio file in Preferences → Audio first.');
            bytes = await file.arrayBuffer();
          }
          const decoded = await this.ctx.decodeAudioData(bytes);
          if (this.disposed || generation !== this.generation) return;
          buffer = decoded;
          if (track === 'gambit') this.gambitBuffer = decoded;
          else this.customBuffer = decoded;
        }
        if (this.disposed || generation !== this.generation || !this.settings.musicEnabled) return;
        const source = this.ctx.createBufferSource(); source.buffer = buffer; source.loop = true;
        source.connect(this.music); this.musicVoices.add(source);
        source.onended = () => { this.musicVoices.delete(source); source.disconnect(); };
        source.start();
      } catch (error) { if (generation === this.generation) { this.stopMusic(); this.failedTrack = track; this.onStatus('error'); throw error; } return; }
    } else {
      this.step = 0; this.nextNote = this.ctx.currentTime + .1;
      const schedule = () => {
        if (this.ctx.state !== 'running') return;
        // Skip stale beats after a background timer was throttled; never pile up missed notes.
        if (this.nextNote < this.ctx.currentTime) this.nextNote = this.ctx.currentTime + .08;
        while (this.nextNote < this.ctx.currentTime + .7) { this.musicStep(track, this.step++, this.nextNote); this.nextNote += track === 'hall' ? 1.25 : .8; }
      };
      schedule(); this.scheduler = setInterval(schedule, 200);
    }
    this.onStatus('playing');
  }
  musicStep(track, beat, when) {
    const chords = [[45, 52, 60, 64], [41, 48, 57, 60], [48, 55, 60, 64], [43, 50, 59, 62]];
    const chord = chords[Math.floor(beat / 8) % chords.length];
    if (track === 'hall') {
      if (beat % 8 === 0) chord.forEach(midi => this.note(midi, when, 9.6, .08, this.music, 'strings'));
      if (beat % 2 === 0) this.note([76, 72, 69, 72, 77, 76, 72, 69, 79, 76, 72, 76, 74, 71, 67, 71][Math.floor(beat / 2) % 16], when, 2.5, .06, this.music);
    } else {
      this.note(chord[[0, 2, 1, 3, 0, 2, 1, 3][beat % 8]], when, 1.8, .13, this.music);
      if (beat % 2 === 0) this.note([76, 72, 69, 71, 72, 77, 76, 72, 79, 76, 74, 72, 71, 74, 67, 71][Math.floor(beat / 2) % 16], when + .04, 2.1, .085, this.music);
    }
  }
  stopMusic() {
    ++this.generation; clearInterval(this.scheduler); this.scheduler = null; this.playingTrack = null;
    for (const source of this.musicVoices) { try { source.stop(); } catch { /* Already ended. */ } }
    this.musicVoices.clear(); if (!this.disposed) this.onStatus('stopped');
  }
  dispose() {
    this.disposed = true; this.stopMusic();
    for (const source of this.effectVoices) { try { source.stop(); } catch { /* Already ended. */ } }
    this.effectVoices.clear(); this.ctx?.close().catch(() => {});
  }
}
