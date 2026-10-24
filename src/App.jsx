import React, { useEffect, useRef, useState } from 'react';
import { Activity, ArrowDownToLine, ArrowLeft, ArrowRight, ArrowUpRight, BookOpen, Check, ChevronDown, ChevronRight, CircleHelp, Clock3, Cpu, Crosshair, Flag, FolderOpen, Gauge, History, ImagePlus, Layers3, LoaderCircle, Maximize2, MoreHorizontal, Pause, Play, Plus, RotateCcw, Settings2, ShieldCheck, Sparkles, Square, Swords, Trash2, Trophy, Volume2, VolumeX, X, Zap } from 'lucide-react';
import { Chess } from 'chess.js';
import Chessboard from './Chessboard.jsx';
import { api, blankState, builtins, isDesktop } from './api.js';
import { Music2, Palette, Share2 } from 'lucide-react';
import PreferencesPanel from './PreferencesPanel.jsx';
import { readPreferences } from './preferences.js';
import useArenaAudio from './useArenaAudio.js';
import ShareResult from './ShareResult.jsx';
import { resultModel } from './resultModel.js';
import { Badge, EngineSelect, Field, RatingTag, clock, formatScore } from './ui.jsx';
import { gauntletControls, listForTime, ratingLists } from './ratings.js';
import GauntletView from './GauntletView.jsx';
import QuickTestView from './QuickTestView.jsx';
import RatingShare from './RatingShare.jsx';
import { FlaskConical, Medal } from 'lucide-react';
const views = {
  arena: { label: 'Battle arena', eyebrow: 'THE ULTIMATE ENGINE SHOWDOWN', title: 'Let the engines battle.', body: 'Set the stage. Pick your contenders. Watch intelligence compete.' },
  gauntlet: { label: 'Rating gauntlet', eyebrow: 'MEASURED THE CCRL WAY', title: 'Find your engine’s rating.', body: 'Play rated anchor engines under CCRL conditions and watch the estimate converge.' },
  quicktest: { label: 'Quick test', eyebrow: 'FASTCHESS · SPRT · STC RATING', title: 'Test fast. Rate fast.', body: 'Resolve small Elo differences between builds, or estimate a rating against CCRL anchors in minutes.' },
  engines: { label: 'Engine library', eyebrow: 'MEET YOUR CONTENDERS', title: 'Power your next match.', body: 'Load your favorite UCI engines and give each one its own identity.' },
  history: { label: 'Match history', eyebrow: 'EVERY BATTLE HAS A STORY', title: 'The record speaks.', body: 'Revisit your matches, compare results, and take the games with you.' },
};
const jobRunning = job => ['starting', 'running', 'paused'].includes(job?.status);

const defaults = { engineIds: ['atlas', 'volt'], games: 10, minutes: 1, increment: 0, threads: 1, hash: 64 };
function readPrefs() { try { return { ...defaults, ...JSON.parse(localStorage.getItem('arena-config') || '{}') }; } catch { return defaults; } }
function Modal({ children, onClose, wide, label }) {
  const ref = useRef(null);
  useEffect(() => {
    const before = document.activeElement; ref.current?.focus();
    const key = event => {
      if (event.key === 'Escape') onClose();
      if (event.key === 'Tab') {
        const items = [...ref.current.querySelectorAll('button,input,select,[tabindex="0"]')].filter(el => !el.disabled && el.tabIndex >= 0 && el.getClientRects().length);
        const first = items[0], last = items.at(-1);
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    };
    document.addEventListener('keydown', key); return () => { document.removeEventListener('keydown', key); before?.focus(); };
  }, []);
  return <div className="modal-backdrop" onMouseDown={e => e.target === e.currentTarget && onClose()}><section className={`modal ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true" aria-label={label} tabIndex={-1} ref={ref}><button className="icon-btn close-modal" aria-label="Close dialog" onClick={onClose}><X size={20} /></button>{children}</section></div>;
}
export default function App() {
  const [view, setView] = useState('arena'), [engines, setEngines] = useState(builtins), [config, setConfig] = useState(readPrefs), [match, setMatch] = useState(() => blankState(readPrefs()));
  const [history, setHistory] = useState([]), [modal, setModal] = useState(null), [toast, setToast] = useState(null), [busy, setBusy] = useState(false), [flipped, setFlipped] = useState(false);
  const [now, setNow] = useState(Date.now()), [inspectedGame, setInspectedGame] = useState(null), [reviewMatch, setReviewMatch] = useState(null);
  const [preferences, setPreferences] = useState(readPreferences), [preferencesTab, setPreferencesTab] = useState('appearance');
  const [rename, setRename] = useState(''), [selectedEdit, setSelectedEdit] = useState(null), [focusBoard, setFocusBoard] = useState(false);
  const [shareModel, setShareModel] = useState(null), [ratingCard, setRatingCard] = useState(null), [ratingDraft, setRatingDraft] = useState({ blitz: '', classical: '' });
  const [enginesReady, setEnginesReady] = useState(false), [gauntletState, setGauntletState] = useState(null), [testState, setTestState] = useState(null), [gauntletHistory, setGauntletHistory] = useState([]), [testHistory, setTestHistory] = useState([]), [cores, setCores] = useState(navigator.hardwareConcurrency || 4);
  const moveList = useRef(null), matchEngines = useRef(null), matchConfig = useRef(null), matchDate = useRef(null), toastTimer = useRef(null), shareReturn = useRef(null);
  const notify = (message, error = false) => { clearTimeout(toastTimer.current); setToast({ message, error }); toastTimer.current = setTimeout(() => setToast(null), 5500); };
  const audio = useArenaAudio(match, preferences, notify);
  const updatePreferences = patch => setPreferences(current => ({ ...current, ...patch }));
  const attempt = async action => { try { return await action(); } catch (error) { notify(error.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, ''), true); } };
  const refreshEngines = async () => setEngines(await api.engines());
  const refreshGauntlets = async () => setGauntletHistory(await api.gauntlet.list());
  const refreshTests = async () => setTestHistory(await api.fastchess.list());
  useEffect(() => {
    api.systemInfo().then(info => setCores(info.cores)).catch(() => {});
    api.gauntlet.current().then(state => state && setGauntletState(state)).catch(() => {});
    api.fastchess.current().then(state => state && setTestState(state)).catch(() => {});
    refreshGauntlets().catch(() => {}); refreshTests().catch(() => {});
    const offGauntlet = api.gauntlet.onState(state => {
      setGauntletState(state);
      if (['finished', 'stopped', 'error'].includes(state.status)) { refreshGauntlets(); refreshEngines(); if (state.status === 'error') notify(state.message, true); }
    });
    const offTest = api.fastchess.onState(state => { setTestState(state); if (state.finishedAt) refreshTests(); });
    return () => { offGauntlet(); offTest(); };
  }, []);
  useEffect(() => {
    api.engines().then(list => {
      setEngines(list); setEnginesReady(true); setConfig(c => ({ ...c, engineIds: c.engineIds.every(id => list.some(e => e.id === id)) ? c.engineIds : [list[0].id, list[1].id] }));
    }).catch(error => notify(error.message, true));
    return api.onState(state => {
      setMatch(state); setNow(Date.now());
      if (['finished', 'stopped', 'error'].includes(state.status)) matchDate.current = new Date().toISOString();
      if (state.status === 'finished') { setInspectedGame(null); setModal('results'); api.history().then(setHistory); }
      if (state.status === 'error') notify(state.message, true);
    });
  }, []);
  useEffect(() => { localStorage.setItem('arena-config', JSON.stringify(config)); }, [config]);
  useEffect(() => { localStorage.setItem('arena-preferences', JSON.stringify(preferences)); }, [preferences]);
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 100); return () => clearInterval(timer); }, []);
  useEffect(() => { if (moveList.current) moveList.current.scrollTop = moveList.current.scrollHeight; }, [match.history.length, inspectedGame]);
  const active = ['running', 'paused', 'starting'].includes(match.status);
  const labJob = jobRunning(gauntletState) ? 'A rating gauntlet' : jobRunning(testState) ? 'A fastchess test' : null;
  const anyJob = active || !!labJob;
  const data = reviewMatch?.state || match;
  const competitors = reviewMatch?.engines || (active || match.status !== 'idle' ? matchEngines.current : null) || config.engineIds.map(id => engines.find(e => e.id === id) || builtins[0]);
  const selectedGame = inspectedGame !== null ? data.results.find(r => r.game === inspectedGame) : null;
  const displayed = selectedGame ? { ...data, fen: selectedGame.fen, history: selectedGame.moves, white: selectedGame.white, telemetry: [{}, {}], thinkingAt: null, lastMove: null } : data;
  const whiteEngine = competitors[displayed.white], blackEngine = competitors[1 - displayed.white];
  const elapsed = displayed.thinkingAt ? Math.max(0, now - displayed.thinkingAt) : 0;
  const time = color => clock(displayed.clocks[color] - (displayed.turn === color ? elapsed : 0));
  const change = (key, value) => { setConfig(c => ({ ...c, [key]: value })); if (!active && match.status === 'idle') setMatch(blankState({ ...config, [key]: value })); };
  async function start() {
    if (!config.engineIds[0] || config.engineIds[0] === config.engineIds[1]) return notify('Choose two different engines.', true);
    if (!Number.isInteger(config.games) || config.games < 1 || config.games > 1000 || config.minutes < .05 || config.minutes > 180 || config.increment < 0 || config.increment > 120) return notify('Use 1–1000 games, 0.05–180 minutes, and 0–120 seconds increment.', true);
    setBusy(true); setReviewMatch(null); setInspectedGame(null); matchEngines.current = config.engineIds.map(id => engines.find(e => e.id === id));
    matchConfig.current = structuredClone(config); matchDate.current = null;
    await attempt(() => api.start(config)); setBusy(false);
  }
  async function loadEngine() {
    setBusy(true);
    const result = await attempt(() => api.addEngine());
    if (result) {
      await refreshEngines();
      const names = result.added.map(e => e.name), warned = result.added.filter(e => e.warning);
      if (warned.length) { notify(`${warned.map(e => e.name).join(', ')} started with a problem: “${warned[0].warning}”. It may play far below its strength; check that its network or data files are next to the executable.`, true); setBusy(false); return; }
      notify(`${names.length === 1 ? names[0] + ' is' : `${names.length} engines are`} ready to battle.${result.failed.length ? ` ${result.failed.map(f => f.file).join(', ')} could not be loaded.` : ''}`, result.failed.length > 0);
    }
    setBusy(false);
  }
  function openRatingCard(model) { setRatingCard(model); setModal('rating'); }
  async function importAnchors() {
    setBusy(true);
    const result = await attempt(() => api.importAnchors());
    if (result) {
      await refreshEngines();
      const parts = [`${result.added.length} anchor${result.added.length === 1 ? '' : 's'} added`];
      if (result.updated.length) parts.push(`${result.updated.length} rated`);
      if (result.failed.length) parts.push(`${result.failed.length} could not start (${result.failed.map(f => f.file).join(', ')})`);
      notify(`${parts.join(' · ')}. CCRL ratings as of ${result.listDate}.`, result.failed.length > 0 && !result.added.length);
    }
    setBusy(false);
  }
  function editEngine(engine) { setSelectedEdit(engine); setRename(engine.name); setRatingDraft({ blitz: String(engine.ratings?.blitz ?? ''), classical: String(engine.ratings?.classical ?? '') }); setModal('engine'); }
  async function exportPgn() { const games = selectedGame ? [selectedGame] : data.results; if (!games.length) return notify('PGN export becomes available after a game finishes.'); const saved = await attempt(() => api.exportPgn(games.map(r => r.pgn).join('\n\n'))); if (saved) notify('Games exported as PGN.'); }
  function shareResult() {
    try {
      const model = resultModel({ state: data, engines: competitors, config: reviewMatch?.config || matchConfig.current || config, date: reviewMatch?.date || matchDate.current, preview: !isDesktop });
      setShareModel(model); shareReturn.current = modal === 'results' ? 'results' : null; setModal('share');
    } catch (error) { notify(error.message, true); }
  }
  async function navigate(next) { setView(next); if (next === 'history') setHistory(await api.history()); }
  function newMatch() { setReviewMatch(null); setInspectedGame(null); setMatch(blankState(config)); matchEngines.current = null; setModal(null); }
  const shownConfig = reviewMatch?.config || (match.status !== 'idle' && matchConfig.current) || config;
  const arenaList = listForTime(shownConfig.minutes, shownConfig.increment);
  const wins = index => data.results.filter(r => r.winner === index).length;
  const draws = data.results.filter(r => r.winner === null).length;
  const progress = Math.round(data.results.length / data.total * 100);
  const status = reviewMatch ? 'Saved match' : { idle: 'Ready to battle', starting: 'Connecting', running: 'Match in progress', paused: 'Match paused', stopped: 'Match stopped', finished: 'Match complete', error: 'Engine error' }[match.status];
  const telemetry = displayed.telemetry[displayed.turn === 'w' ? displayed.white : 1 - displayed.white] || {};
  const evaluation = telemetry.score ? telemetry.score.type === 'mate' ? `M${telemetry.score.value}` : `${telemetry.score.value >= 0 ? '+' : ''}${(telemetry.score.value / 100).toFixed(2)}` : '—';

  return <div className="app-shell">
    <aside className="sidebar">
      <a className="brand" href="#" onClick={e => { e.preventDefault(); navigate('arena'); }}><div className="brand-mark"><Swords size={24} /></div><div>engine<span>arena</span><small>THE CHESS BATTLEGROUND</small></div></a>
      <div className="nav-label">WORKSPACE</div>
      <nav>{[{ key: 'arena', label: 'Battle arena', icon: Swords }, { key: 'gauntlet', label: 'Rating gauntlet', icon: Medal, job: jobRunning(gauntletState) }, { key: 'quicktest', label: 'Quick test', icon: FlaskConical, job: jobRunning(testState) }, { key: 'engines', label: 'Engine library', icon: Cpu }, { key: 'history', label: 'Match history', icon: History }].map(({ key, label, icon: Icon, job }) => <button key={key} className={`nav-item ${view === key ? 'selected' : ''}`} onClick={() => navigate(key)}><Icon size={19} /><span>{label}</span>{key === 'engines' && <span className="nav-count">{engines.length}</span>}{job && <span className="live-dot pulsing nav-live" title="Running" />}{view === key && !job && <span className="nav-dot" />}</button>)}</nav>
      <div className="sidebar-feature"><div className="feature-symbol"><Crosshair size={23} /><span className="orbit-dot" /></div><h3>Every move.<br />A new possibility.</h3><p>Your engines. Your rules.<br />Let the best one win.</p><div className="mini-board">{Array.from({ length: 16 }, (_, i) => <span key={i} />)}</div></div>
      <div className="sidebar-bottom"><button className="nav-item" onClick={() => setModal('settings')}><Settings2 size={19} />Preferences</button><button className="nav-item" onClick={() => setModal('help')}><CircleHelp size={19} />Getting started<ArrowUpRight size={15} /></button><div className="local-status"><span className="live-dot" /><div>{isDesktop ? 'Running locally' : 'Browser preview'}<small>{isDesktop ? 'Private. Offline. All yours.' : 'Try a demo engine battle.'}</small></div><ShieldCheck size={17} /></div></div>
    </aside>
    <main className="main">
      <header className="topbar"><div className="breadcrumb">Workspace <ChevronRight size={14} /><span>{views[view].label}</span></div><div className="topbar-right"><span className="version">DESKTOP EDITION <span>v1.5.1</span></span><button className="icon-btn" title="Preferences" aria-label="Preferences" onClick={() => setModal('settings')}><Settings2 size={18} /></button><div className="user-avatar">M</div></div></header>
      <div className="page-content">
        <section className="page-heading"><div><div className="eyebrow"><span /> {views[view].eyebrow}</div><h1>{views[view].title}</h1><p>{views[view].body}</p></div><button className="secondary-btn heading-action" onClick={() => view === 'history' ? (navigate('arena'), !active && newMatch()) : loadEngine()} disabled={busy || (view !== 'history' && anyJob)}>{view === 'history' ? <Swords size={17} /> : <Plus size={18} />}{view === 'history' ? 'Back to arena' : 'Load engine'}</button></section>
        {view === 'arena' && <>
          <div className="arena-layout">
            <section className={`arena-panel ${focusBoard ? 'focus-board' : ''}`}>
              <div className="panel-heading"><div><span className={`live-dot ${active && match.status !== 'paused' ? 'pulsing' : 'muted'}`} /><h2>Live arena</h2><span className="label-chip">{active ? 'LIVE' : reviewMatch || match.status !== 'idle' ? 'MATCH' : 'READY'}</span></div><div className="arena-heading-actions"><button className="icon-btn" title="Board and piece themes" aria-label="Board and piece themes" onClick={() => { setPreferencesTab('appearance'); setModal('settings'); }}><Palette size={17} /></button><button className={`icon-btn ${preferences.musicEnabled ? 'audio-active' : ''}`} title={preferences.musicEnabled ? 'Pause background music' : 'Play background music'} aria-label="Toggle background music" aria-pressed={preferences.musicEnabled} onClick={() => updatePreferences({ musicEnabled: !preferences.musicEnabled })}><Music2 size={17} /></button><button className="icon-btn" title={preferences.soundsEnabled ? 'Mute chess sounds' : 'Enable chess sounds'} aria-label="Toggle chess sounds" aria-pressed={preferences.soundsEnabled} onClick={() => updatePreferences({ soundsEnabled: !preferences.soundsEnabled })}>{preferences.soundsEnabled ? <Volume2 size={17} /> : <VolumeX size={17} />}</button><button className="icon-btn" title="Expand board" aria-label="Expand board" onClick={() => setFocusBoard(s => !s)}>{focusBoard ? <X size={17} /> : <Maximize2 size={16} />}</button></div></div>
              <div className="matchup"><div className="contender"><Badge engine={competitors[0]} /><div><h3>{competitors[0]?.name}</h3><span><i className="engine-dot green" />Contender 01<RatingTag engine={competitors[0]} list={arenaList} /></span></div></div><div className="match-score"><div>{formatScore(data.scores[0])}<span>:</span>{formatScore(data.scores[1])}</div><small>{data.results.length} / {data.total} GAMES</small></div><div className="contender second"><div><h3>{competitors[1]?.name}</h3><span><RatingTag engine={competitors[1]} list={arenaList} />Contender 02<i className="engine-dot purple" /></span></div><Badge engine={competitors[1]} /></div></div>
              <div className="board-area"><div className="board-column">
                <div className="player-strip"><div><span className={`color-chip ${flipped ? 'white' : 'black'}`} /><span>{flipped ? whiteEngine?.name : blackEngine?.name}</span><small>{flipped ? 'White' : 'Black'}</small></div><span className={`clock ${active && displayed.turn === (flipped ? 'w' : 'b') && !selectedGame ? 'ticking' : ''}`}>{selectedGame ? '—' : time(flipped ? 'w' : 'b')}<Clock3 size={13} /></span></div>
                <Chessboard fen={displayed.fen} flipped={flipped} lastMove={displayed.lastMove} theme={preferences.boardTheme} pieceStyle={preferences.pieceStyle} />
                <div className="player-strip bottom"><div><span className={`color-chip ${flipped ? 'black' : 'white'}`} /><span>{flipped ? blackEngine?.name : whiteEngine?.name}</span><small>{flipped ? 'Black' : 'White'}</small></div><span className={`clock ${active && displayed.turn === (flipped ? 'b' : 'w') && !selectedGame ? 'ticking' : ''}`}>{selectedGame ? '—' : time(flipped ? 'b' : 'w')}<Clock3 size={13} /></span></div>
              </div><aside className="moves-panel"><div className="moves-heading"><Layers3 size={15} /><span>Move list</span><small>{Math.ceil(displayed.history.length / 2)}</small></div><div className="move-table-head"><span>#</span><span>White</span><span>Black</span></div><div className="move-scroll" ref={moveList}>{displayed.history.length ? Array.from({ length: Math.ceil(displayed.history.length / 2) }, (_, i) => <div className="move-row" key={i}><span>{i + 1}.</span><span className={i * 2 === displayed.history.length - 1 ? 'latest' : ''}>{displayed.history[i * 2]}</span><span className={i * 2 + 1 === displayed.history.length - 1 ? 'latest' : ''}>{displayed.history[i * 2 + 1] || '…'}</span></div>) : <div className="move-empty"><Crosshair size={26} /><p>The first move<br />starts the story.</p><small>Moves will appear here</small></div>}</div><div className="analysis-mini"><div><Activity size={14} /><span>Engine evaluation</span></div><strong>{evaluation}</strong><span className="eval-note">{telemetry.score ? 'From the thinking engine’s side' : 'Waiting for engine analysis'}</span><div className="evaluation-track"><span style={{ width: telemetry.score?.type === 'cp' ? `${Math.min(95, Math.max(5, 50 + telemetry.score.value / 20))}%` : '50%' }} /></div></div></aside></div>
              <div className="board-footer"><div><Crosshair size={14} /><span>{selectedGame ? `Reviewing game ${selectedGame.game}` : match.status === 'idle' ? 'Starting position' : data.message}</span></div><div><button className="icon-btn" title="Flip board" aria-label="Flip board" onClick={() => setFlipped(f => !f)}><RotateCcw size={15} /></button><button className="icon-btn" title="Export PGN" aria-label="Export PGN" onClick={exportPgn}><ArrowDownToLine size={16} /></button></div></div>
            </section>
            <aside className="setup-column"><section className="setup-panel"><div className="panel-heading"><div><Settings2 size={17} /><h2>Match setup</h2></div><span className="subtle-tag">UCI</span></div><div className="setup-body"><Field label="Contender 01"><EngineSelect engines={engines} value={config.engineIds[0]} exclude={config.engineIds[1]} disabled={active} onChange={id => change('engineIds', [id, config.engineIds[1]])} /></Field><div className="versus-divider"><span /><Swords size={15} /><span /></div><Field label="Contender 02"><EngineSelect engines={engines} value={config.engineIds[1]} exclude={config.engineIds[0]} disabled={active} onChange={id => change('engineIds', [config.engineIds[0], id])} /></Field>
              <div className="setup-rule" /><Field label="Number of games" hint="Alternating colors"><div className="number-with-label"><input type="number" min="1" max="1000" value={config.games} disabled={active} onChange={e => change('games', Number(e.target.value))} aria-label="Number of games" /><span>games</span></div></Field><div className="game-presets">{[2, 10, 20, 50].map(n => <button key={n} disabled={active} className={config.games === n ? 'chosen' : ''} onClick={() => change('games', n)}>{n}</button>)}</div>
              <div className="time-fields"><Field label="Time per engine"><div className="number-with-label"><Clock3 size={15} /><input type="number" min="0.05" max="180" step="0.5" value={config.minutes} disabled={active} onChange={e => change('minutes', Number(e.target.value))} aria-label="Minutes per engine" /><span>min</span></div></Field><Field label="Increment"><div className="number-with-label"><Plus size={14} /><input type="number" min="0" max="120" value={config.increment} disabled={active} onChange={e => change('increment', Number(e.target.value))} aria-label="Increment seconds" /><span>sec</span></div></Field></div>
              <div className="time-presets">{[{ label: 'Bullet', min: 1 }, { label: 'Blitz', min: 3 }, { label: 'Rapid', min: 10 }].map(p => <button disabled={active} key={p.label} className={config.minutes === p.min ? 'chosen' : ''} onClick={() => change('minutes', p.min)}>{p.label === 'Bullet' ? <Zap size={12} /> : p.label === 'Blitz' ? <Gauge size={12} /> : <Clock3 size={12} />}{p.label}</button>)}</div>
              <div className="match-summary"><span><RotateCcw size={13} />Colors swap each game</span><span><ShieldCheck size={13} />{config.threads} thread{config.threads > 1 ? 's' : ''} · {config.hash} MB hash</span></div>
              {active ? <div className="match-controls"><button className="primary-btn" disabled={match.status === 'starting'} onClick={() => attempt(() => api.pause())}>{match.status === 'paused' ? <Play size={17} fill="currentColor" /> : <Pause size={17} fill="currentColor" />}{match.status === 'paused' ? 'Resume match' : 'Pause match'}</button><button className="stop-btn" title="Stop match" aria-label="Stop match" onClick={() => setModal('stop')}><Square size={16} fill="currentColor" /></button></div> : <button className="primary-btn start-btn" onClick={start} disabled={busy || !!labJob}>{busy ? <LoaderCircle size={17} className="spin" /> : <Swords size={18} />}Start battle<ArrowRight size={17} /></button>}
              <p className="setup-footnote">{labJob ? `${labJob} is running. Battles can start when it ends.` : isDesktop ? 'All battles run locally on your machine.' : 'Browser demo · Load real engines in the desktop app.'}</p>
            </div></section>
            <section className="pulse-panel"><div className="pulse-title"><Activity size={16} /><h2>Arena pulse</h2><span className={`live-dot ${active ? 'pulsing' : 'muted'}`} /></div><div className="pulse-stats"><div><small>SEARCH DEPTH</small><strong>{telemetry.depth || '—'}<span>{telemetry.depth ? 'ply' : ''}</span></strong></div><div><small>NODES / SEC</small><strong>{telemetry.nps ? telemetry.nps >= 1000000 ? `${(telemetry.nps / 1000000).toFixed(1)}M` : `${(telemetry.nps / 1000).toFixed(1)}k` : '—'}</strong></div></div><div className="pulse-bottom"><span className="live-dot muted" />{active ? (isDesktop ? 'Live engine telemetry' : 'Demo · telemetry unavailable') : 'Waiting for the next battle'}</div></section>
            </aside>
          </div>
          <section className="results-panel"><div className="results-top"><div><Trophy size={17} /><h2>Match scoreboard</h2><span className="status-pill"><span className={`live-dot ${active ? 'pulsing' : 'muted'}`} />{status}</span></div><div className="scoreboard-actions">{data.results.length > 0 && ['finished', 'stopped', 'error'].includes(data.status) && <button className="text-btn" aria-label="Share scoreboard result" onClick={shareResult}><Share2 size={14} />Share result</button>}<button className="text-btn" onClick={exportPgn}><ArrowDownToLine size={14} />Export PGN</button></div></div><div className="scoreboard-content"><div className="score-details">{competitors.map((engine, i) => <div className="score-row" key={`${engine?.id}-${i}`}><Badge engine={engine} small /><span>{engine?.name}</span><div className="win-draw-loss"><span><b>{wins(i)}</b> W</span><span><b>{draws}</b> D</span><span><b>{wins(1 - i)}</b> L</span></div><strong>{formatScore(data.scores[i])}<small>pts</small></strong></div>)}</div><div className="round-progress"><div><span>Battle progress</span><strong>{data.results.length}<small> / {data.total} games</small></strong></div><div className="progress-track"><span style={{ width: `${progress}%` }} /></div><div className="round-dots">{Array.from({ length: Math.min(data.total, 20) }, (_, i) => { const result = data.results[i]; return <button key={i} disabled={!result} className={`${result ? result.winner === 0 ? 'green' : result.winner === 1 ? 'purple' : 'drawn' : ''} ${inspectedGame === i + 1 ? 'inspected' : ''}`} title={result ? `Game ${i + 1}: ${result.reason}` : `Game ${i + 1}`} aria-label={`Review game ${i + 1}`} onClick={() => setInspectedGame(inspectedGame === i + 1 ? null : i + 1)}>{result ? result.winner === null ? '½' : <Check size={11} /> : i + 1}</button>; })}{data.total > 20 && <span>+{data.total - 20}</span>}</div><p>{data.results.length ? 'Select a completed game to review its moves.' : 'Your results will build here, one game at a time.'}</p></div></div></section>
          <div className="page-footer"><span><ShieldCheck size={13} />Built for the love of the game.</span><span>UCI compatible<span className="footer-dot">·</span>100% local</span></div>
        </>}
        {enginesReady && view === 'gauntlet' && <GauntletView engines={engines} state={gauntletState} history={gauntletHistory} cores={cores} preferences={preferences} notify={notify} attempt={attempt} refreshEngines={refreshEngines} refreshHistory={refreshGauntlets} onShare={openRatingCard} otherJob={active ? 'A match' : jobRunning(testState) ? 'A fastchess test' : null} />}
        {enginesReady && view === 'quicktest' && <QuickTestView engines={engines} state={testState} history={testHistory} cores={cores} notify={notify} attempt={attempt} refreshHistory={refreshTests} refreshEngines={refreshEngines} onShare={openRatingCard} otherJob={active ? 'A match' : jobRunning(gauntletState) ? 'A rating gauntlet' : null} />}
        {view === 'engines' && <><div className="library-banner"><div className="banner-icon"><Cpu size={26} /></div><div><h3>Your next champion is one upload away.</h3><p>Choose one or more UCI engine executables. We’ll verify each and read its name automatically.</p></div><div className="library-banner-actions"><button className="secondary-btn" onClick={importAnchors} disabled={anyJob || busy} title="Scan folders for known CCRL anchor engines"><Medal size={16} />Import anchors</button><button className="primary-btn" onClick={loadEngine} disabled={anyJob || busy}><FolderOpen size={17} />Browse engines</button></div></div><div className="section-title"><h2>Your contenders <span>{engines.length}</span></h2><span><span className="live-dot" />Ready for the arena</span></div><div className="engine-grid">{engines.map(engine => <article className="engine-card" key={engine.id}><div className="engine-card-top"><Badge engine={engine} /><span className="label-chip">{engine.builtin ? 'BUILT-IN' : 'UCI ENGINE'}</span><button className="icon-btn" aria-label={`Edit ${engine.name}`} onClick={() => editEngine(engine)}><MoreHorizontal size={20} /></button></div><h3>{engine.name}</h3><p>{engine.author || 'Local chess engine'}</p><div className="engine-character"><span className={`engine-dot ${engine.accent}`} />{engine.description}</div><div className="engine-ratings">{Object.values(ratingLists).map(list => <RatingTag key={list.id} engine={engine} list={list.id} />)}{gauntletControls.filter(c => engine.estimates?.[c.id]).map(c => <span key={c.id} className="rating-tag estimate" title={`${c.name} gauntlet estimate over ${engine.estimates[c.id].games} games`}><small>{c.name}</small>≈{engine.estimates[c.id].elo}{engine.estimates[c.id].error ? <small>±{engine.estimates[c.id].error}</small> : null}</span>)}</div>{engine.warning && <div className="engine-warning" title={engine.warning}><CircleHelp size={13} />Startup problem: {engine.warning}</div>}<div className="engine-path">{engine.path || 'Included with Engine Arena'}</div><div className="engine-card-bottom"><span><span className="live-dot" />Ready</span><button className="text-btn" disabled={anyJob} onClick={() => { const ids = [...config.engineIds]; ids[ids[0] === engine.id ? 0 : 1] = engine.id; if (ids[0] === ids[1]) ids[1] = engines.find(e => e.id !== engine.id).id; change('engineIds', ids); navigate('arena'); }}>Send to arena<ArrowUpRight size={15} /></button></div></article>)}<button className="add-engine-card" onClick={loadEngine} disabled={anyJob || busy}><div><Plus size={27} /></div><h3>Add a contender</h3><p>Load a local UCI engine</p><span>.exe · UCI compatible</span></button></div><div className="library-note"><CircleHelp size={18} /><p>The built-in Atlas and Volt engines are lightweight opponents for trying the arena. For stronger battles, load engines such as Stockfish, your own engine, or another UCI-compatible executable.</p></div></>}
        {view === 'history' && <><div className="history-stat-row"><div><Trophy size={21} /><span>Matches played<strong>{history.length}</strong></span></div><div><Layers3 size={21} /><span>Games completed<strong>{history.reduce((n, h) => n + h.state.results.length, 0)}</strong></span></div><div><Cpu size={21} /><span>Engines in your library<strong>{engines.length}</strong></span></div></div>{history.length ? <section className="history-list"><div className="history-list-heading"><span>MATCH</span><span>FINAL SCORE</span><span>PLAYED</span><span /></div>{history.map(item => <button className="history-row" key={item.id} disabled={active} onClick={() => { setReviewMatch(item); setInspectedGame(null); navigate('arena'); }}><div className="history-opponents"><div className="stacked-badges"><Badge engine={item.engines[0]} small /><Badge engine={item.engines[1]} small /></div><div><strong>{item.engines[0].name}<span>vs</span>{item.engines[1].name}</strong><small>{item.state.results.length} games · {item.config.minutes} min + {item.config.increment} sec · {item.state.status === 'finished' ? 'Completed' : 'Stopped early'}</small></div></div><div className="history-score">{formatScore(item.state.scores[0])}<span>:</span>{formatScore(item.state.scores[1])}</div><span className="history-date">{new Date(item.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</span><ArrowUpRight size={18} /></button>)}</section> : <div className="history-empty"><div><History size={34} /></div><h2>A clean slate. A world of possibilities.</h2><p>Your completed matches will appear here.<br />Start a battle and write your first chapter.</p><button className="primary-btn" onClick={() => navigate('arena')}><Swords size={18} />Go to arena<ArrowRight size={17} /></button></div>}</>}
      </div>
    </main>
    {toast && <div className={`toast ${toast.error ? 'error' : ''}`} role={toast.error ? 'alert' : 'status'}>{toast.error ? <CircleHelp size={18} /> : <Check size={18} />}<span>{toast.message}</span><button className="icon-btn" aria-label="Dismiss notification" onClick={() => setToast(null)}><X size={16} /></button></div>}
    {modal === 'settings' && <Modal label="Preferences" wide onClose={() => setModal(null)}><PreferencesPanel preferences={preferences} update={updatePreferences} audio={audio} config={config} changeConfig={change} active={active} initialTab={preferencesTab} notify={notify} onDone={() => { setModal(null); notify('Preferences saved.'); }} /></Modal>}
    {modal === 'help' && <Modal label="Getting started" onClose={() => setModal(null)}><div className="modal-symbol"><Swords size={28} /></div><div className="eyebrow">YOUR FIRST SHOWDOWN</div><h2>From engine to arena.</h2><div className="help-steps">{[{ title: 'Choose your contenders', body: 'Try Atlas vs Volt, or load two UCI engine executables from your computer.', icon: Cpu }, { title: 'Set the ground rules', body: 'Choose how many games to play, each engine’s time, and the increment. Colors alternate automatically.', icon: Clock3 }, { title: 'Watch the battle unfold', body: 'Follow the live board, clocks, moves, and engine analysis. A win earns 1 point; a draw earns ½ each.', icon: Swords }, { title: 'Keep the story', body: 'See the final score with engine logos, review completed games, and export a PGN of the match.', icon: Trophy }].map(({ title, body, icon: Icon }, i) => <div className="help-step" key={title}><span>{i + 1}</span><div><h3>{title}</h3><p>{body}</p></div><Icon size={19} /></div>)}</div><button className="primary-btn" onClick={() => setModal(null)}>Let’s battle<ArrowRight size={17} /></button></Modal>}
    {modal === 'stop' && <Modal label="Stop match" onClose={() => setModal(null)}><div className="modal-symbol"><Flag size={28} /></div><h2>End this battle?</h2><p className="modal-intro">The current game will be discarded. The scores and PGNs of completed games will be kept in match history.</p><div className="modal-buttons"><button className="secondary-btn" onClick={() => setModal(null)}>Keep playing</button><button className="danger-btn" onClick={async () => { await attempt(() => api.stop()); setModal(null); }}>Stop match</button></div></Modal>}
    {modal === 'results' && <Modal label="Final match score" wide onClose={() => setModal(null)}><div className="results-celebration">
      <div className="trophy-ring"><Trophy size={37} /></div><div className="eyebrow">THE BATTLE IS OVER</div>
      <h2>{data.scores[0] === data.scores[1] ? 'A battle of equals.' : `${competitors[data.scores[0] > data.scores[1] ? 0 : 1]?.name} takes the crown.`}</h2><p>{data.results.length} games. Every move mattered.</p>
      <div className="final-matchup"><div><Badge engine={competitors[0]} /><h3>{competitors[0]?.name}</h3><span>{wins(0)} wins · {draws} draws</span></div><div className="final-score">{formatScore(data.scores[0])}<span>:</span>{formatScore(data.scores[1])}</div><div><Badge engine={competitors[1]} /><h3>{competitors[1]?.name}</h3><span>{wins(1)} wins · {draws} draws</span></div></div>
      <div className="final-scorebar"><span style={{ width: `${data.scores[0] / Math.max(1, data.results.length) * 100}%` }} /></div>
      <button className="secondary-btn result-share-button" aria-label="Share final result" onClick={shareResult}><Share2 size={17} />Share result image</button>
      <div className="modal-buttons"><button className="secondary-btn" onClick={exportPgn}><ArrowDownToLine size={17} />Export games</button><button className="primary-btn" onClick={newMatch}><Swords size={17} />New battle<ArrowRight size={17} /></button></div>
      <button className="text-btn review-results-btn" onClick={() => setModal(null)}>Review the match<ArrowUpRight size={15} /></button>
    </div></Modal>}
    {modal === 'rating' && ratingCard && <Modal label="Share rating card" wide onClose={() => setModal(null)}><RatingShare model={ratingCard} notify={notify} /></Modal>}
    {modal === 'share' && shareModel && <Modal label="Share match result" wide onClose={() => setModal(shareReturn.current)}><ShareResult model={shareModel} notify={notify} /></Modal>}
    {modal === 'engine' && selectedEdit && <Modal label="Engine details" onClose={() => setModal(null)}><Badge engine={selectedEdit} /><h2>Make it a contender.</h2><p className="modal-intro">Give your engine a name, a logo, and its CCRL ratings for gauntlets.</p><Field label="Display name"><input maxLength="80" value={rename} onChange={e => setRename(e.target.value)} /></Field><div className="settings-fields rating-fields">{Object.values(ratingLists).map(list => <Field key={list.id} label={`${list.name} rating`} hint="Optional"><input inputMode="numeric" placeholder="e.g. 3421" aria-label={`${list.name} rating`} value={ratingDraft[list.id]} onChange={e => setRatingDraft(d => ({ ...d, [list.id]: e.target.value.replace(/[^\d]/g, '').slice(0, 4) }))} /></Field>)}</div><button className="secondary-btn logo-button" onClick={async () => { const updated = await attempt(() => api.chooseLogo(selectedEdit.id)); if (updated) { setSelectedEdit(updated); setEngines(await api.engines()); notify('Engine logo updated.'); } }}><ImagePlus size={17} />Choose logo<small>PNG, JPG or WebP · up to 5 MB</small></button><div className="engine-details"><span>Author<strong>{selectedEdit.author || 'Unknown'}</strong></span><span>Location<strong>{selectedEdit.path || 'Built-in engine'}</strong></span></div><div className="modal-buttons">{!selectedEdit.builtin && <button className="danger-btn" disabled={anyJob} onClick={async () => { const list = await attempt(() => api.removeEngine(selectedEdit.id)); if (list) { setEngines(list); if (config.engineIds.includes(selectedEdit.id)) change('engineIds', [list[0].id, list[1].id]); setModal(null); notify('Engine removed from library. Its executable was kept.'); } }}><Trash2 size={16} />Remove</button>}<button className="primary-btn" disabled={!rename.trim() || anyJob} onClick={async () => { const updated = await attempt(() => api.updateEngine({ id: selectedEdit.id, name: rename, ratings: { blitz: ratingDraft.blitz || null, classical: ratingDraft.classical || null } })); if (updated) { setEngines(await api.engines()); setModal(null); notify('Engine updated.'); } }}><Check size={17} />Save changes</button></div></Modal>}
  </div>;
}
