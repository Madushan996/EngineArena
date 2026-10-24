export const boardThemes = [
  { id: 'lichess', name: 'Lichess', description: 'The classic lichess.org brown', light: '#f0d9b5', dark: '#b58863' },
  { id: 'chesscom', name: 'Chess.com', description: 'The familiar green & cream', light: '#ebecd0', dark: '#739552' },
  { id: 'walnut', name: 'Walnut', description: 'Warm wood & honey squares', light: '#dbc39a', dark: '#916b49' },
  { id: 'mahogany', name: 'Mahogany', description: 'A traditional club table', light: '#e4c8a2', dark: '#885342' },
  { id: 'marble', name: 'Marble', description: 'Ivory & charcoal stone', light: '#deded3', dark: '#69716e' },
  { id: 'emerald', name: 'Arena', description: 'The original sage green', light: '#bfcab0', dark: '#657c60' },
];
export const pieceStyles = [
  { id: 'cburnett', name: 'Lichess', description: 'cburnett · the lichess.org default' },
  { id: 'staunton', name: 'Staunton', description: 'Classic ivory & ebony' },
  { id: 'heirloom', name: 'Heirloom', description: 'Carved boxwood & rosewood' },
  { id: 'arena', name: 'Arena', description: 'Original modern silhouettes' },
];
export const defaultPreferences = {
  boardTheme: 'lichess', pieceStyle: 'cburnett', appearanceVersion: 2,
  soundsEnabled: true, soundVolume: 55, moveSounds: true, captureSounds: true, checkSounds: true, resultSounds: true,
  musicEnabled: false, musicVolume: 25, musicTrack: 'gambit', customTrackName: '',
};
export function readPreferences() {
  try {
    const saved = JSON.parse(localStorage.getItem('arena-preferences') || '{}');
    const prefs = { ...defaultPreferences };
    for (const key of Object.keys(prefs)) if (typeof saved[key] === typeof prefs[key]) prefs[key] = saved[key];
    // Version 2 introduced the Lichess board and pieces as the default look; adopt it once.
    if (saved.appearanceVersion !== defaultPreferences.appearanceVersion) Object.assign(prefs, { boardTheme: defaultPreferences.boardTheme, pieceStyle: defaultPreferences.pieceStyle, appearanceVersion: defaultPreferences.appearanceVersion });
    if (!boardThemes.some(t => t.id === prefs.boardTheme)) prefs.boardTheme = defaultPreferences.boardTheme;
    if (!pieceStyles.some(s => s.id === prefs.pieceStyle)) prefs.pieceStyle = defaultPreferences.pieceStyle;
    if (!['gambit', 'study', 'hall', 'custom'].includes(prefs.musicTrack)) prefs.musicTrack = defaultPreferences.musicTrack;
    for (const key of ['soundVolume', 'musicVolume']) prefs[key] = Number.isFinite(prefs[key]) ? Math.max(0, Math.min(100, prefs[key])) : defaultPreferences[key];
    return prefs;
  } catch { return { ...defaultPreferences }; }
}
