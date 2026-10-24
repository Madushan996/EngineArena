import { useEffect, useRef, useState } from 'react';
import { Soundscape } from './audio.js';
export default function useArenaAudio(match, preferences, notify) {
  const player = useRef(null), settings = useRef(preferences), report = useRef(notify), previous = useRef({ game: 1, moves: 0, results: 0, status: 'idle' });
  const [musicStatus, setMusicStatus] = useState('stopped');
  settings.current = preferences; report.current = notify;
  useEffect(() => {
    const soundscape = new Soundscape(setMusicStatus, error => report.current(error.message, true));
    soundscape.configure(settings.current); player.current = soundscape;
    const unlock = () => soundscape.unlock().catch(error => report.current(error.message, true));
    document.addEventListener('pointerdown', unlock); document.addEventListener('keydown', unlock);
    return () => { document.removeEventListener('pointerdown', unlock); document.removeEventListener('keydown', unlock); soundscape.dispose(); player.current = null; };
  }, []);
  useEffect(() => { player.current?.configure(preferences); }, [preferences]);
  useEffect(() => {
    const before = previous.current, prefs = settings.current, audio = player.current;
    if (match.results.length > before.results) { if (prefs.resultSounds) audio?.effect('result'); }
    else if (match.game === before.game && match.history.length > before.moves) {
      const san = match.history.at(-1) || '';
      if (san.includes('x') && prefs.captureSounds) audio?.effect('capture');
      else if (!san.includes('x') && prefs.moveSounds) audio?.effect('move');
      if ((san.includes('+') || san.includes('#')) && prefs.checkSounds) audio?.effect('check');
    }
    if (match.status === 'running' && ['idle', 'starting', 'stopped', 'finished', 'error'].includes(before.status)) audio?.effect('start');
    previous.current = { game: match.game, moves: match.history.length, results: match.results.length, status: match.status };
  }, [match.game, match.history.length, match.results.length, match.status]);
  return {
    musicStatus,
    preview: async () => { await player.current.unlock(); player.current.effect('move'); setTimeout(() => player.current?.effect('capture'), 250); setTimeout(() => player.current?.effect('check'), 520); },
    importMusic: async file => { await player.current.unlock(); await player.current.importMusic(file); },
  };
}
