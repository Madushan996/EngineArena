import React, { useEffect, useMemo, useState } from 'react';
import { Share2 } from 'lucide-react';
import EstimateChart from './EstimateChart.jsx';
import { ratingCardModel } from './ratingCard.js';
import { ArrowDownToLine, ArrowRight, BookOpen, Check, Clock3, Cpu, Database, FolderOpen, Gauge, Info, Layers3, LoaderCircle, Medal, Pause, Play, RotateCcw, ShieldCheck, Square, Swords, Target, Trophy, Users, X, Zap } from 'lucide-react';
import Chessboard from './Chessboard.jsx';
import { api, isDesktop } from './api.js';
import { Badge, EngineSelect, Field, RatingTag, clock, duration, formatScore } from './ui.jsx';
import AnchorPicker, { useRatingDrafts } from './AnchorPicker.jsx';
import { controlById, formatRating, gameDuration, gauntletControls, ratingLists, ratingOf } from './ratings.js';

const defaults = { subjectId: '', tc: 'short', opponentIds: [], gamesPerOpponent: 50, concurrency: 1, hash: 256, book: { type: 'builtin' }, adjudicate: true, syzygyPath: '' };
function readConfig() { try { return { ...defaults, ...JSON.parse(localStorage.getItem('arena-gauntlet') || '{}') }; } catch { return defaults; } }
const liveStatuses = ['starting', 'running', 'paused'];
const evalText = score => !score ? '' : score.type === 'mate' ? `M${score.value}` : `${score.value >= 0 ? '+' : ''}${(score.value / 100).toFixed(2)}`;
const pct = (points, games) => games ? `${(points / games * 100).toFixed(1)}%` : '—';
const controlIcon = { short: Zap, long: Gauge, classical: Clock3 };

function PlayerStrip({ engine, color, board, list, estimate, ticking, now }) {
  const telemetry = board.telemetry[color] || {};
  const left = board.clocks[color] - (ticking && board.thinkingAt ? Math.max(0, now - board.thinkingAt) : 0);
  return <div className="lab-strip">
    <Badge engine={engine} small />
    <div className="lab-strip-name"><strong>{engine?.name || 'Engine'}</strong><span><i className={`color-chip ${color === 'w' ? 'white' : 'black'}`} />{color === 'w' ? 'White' : 'Black'}{telemetry.depth ? ` · d${telemetry.depth}` : ''}{telemetry.score ? ` · ${evalText(telemetry.score)}` : ''}</span></div>
    <RatingTag engine={engine} list={list} estimate={estimate} />
    <span className={`clock ${ticking ? 'ticking' : ''}`}>{clock(left)}<Clock3 size={13} /></span>
  </div>;
}

function LiveBoard({ board, subject, opponent, list, estimate, preferences, now, active }) {
  const top = board.subjectWhite ? 'b' : 'w', bottom = top === 'w' ? 'b' : 'w';
  const engineFor = color => (color === 'w') === board.subjectWhite ? subject : opponent;
  const estimateFor = color => engineFor(color) === subject ? estimate : null;
  const strip = color => <PlayerStrip engine={engineFor(color)} color={color} board={board} list={list} estimate={estimateFor(color)} ticking={active && board.turn === color && !!board.thinkingAt} now={now} />;
  const gameMoves = Math.max(0, board.history.length - board.bookPlies);
  return <div className="lab-board">
    {strip(top)}
    <Chessboard fen={board.fen} flipped={!board.subjectWhite} lastMove={board.lastMove} theme={preferences.boardTheme} pieceStyle={preferences.pieceStyle} />
    {strip(bottom)}
    <div className="lab-board-footer"><span><BookOpen size={13} />{board.opening || 'Opening suite position'}</span><span>Game {board.game} · {board.bookPlies ? `${board.bookPlies} book plies · ` : ''}{gameMoves} engine plies</span></div>
  </div>;
}

const shareModelFor = (state, engines) => ratingCardModel({ engine: engines.find(e => e.id === (state.subjectId || state.subject?.id)) || state.subject, state, kind: 'CCRL-style gauntlet', tcLabel: controlById(state.tc).label, date: state.date || state.finishedAt });
export default function GauntletView({ engines, state, history, cores, preferences, notify, attempt, refreshEngines, refreshHistory, otherJob, onShare }) {
  const [config, setConfig] = useState(readConfig), [busy, setBusy] = useState(false);
  const [dismissed, setDismissed] = useState(null), [featured, setFeatured] = useState(0), [confirmStop, setConfirmStop] = useState(false), [now, setNow] = useState(Date.now());
  const control = controlById(config.tc), list = control.list;
  const update = patch => setConfig(c => ({ ...c, ...patch }));
  useEffect(() => { try { localStorage.setItem('arena-gauntlet', JSON.stringify(config)); } catch { /* Preferences are optional. */ } }, [config]);
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 200); return () => clearInterval(timer); }, []);
  useEffect(() => { if (!control.hash.includes(config.hash)) update({ hash: 256 }); }, [config.tc]);
  useEffect(() => { if (config.concurrency > cores) update({ concurrency: cores }); }, [cores]);
  useEffect(() => { if (!engines.some(e => e.id === config.subjectId) && engines.length) update({ subjectId: engines.find(e => !e.builtin)?.id || engines[0].id }); }, [engines]);
  useEffect(() => { if (!liveStatuses.includes(state?.status)) setConfirmStop(false); }, [state?.status]);

  const live = state && state.id !== dismissed;
  const running = liveStatuses.includes(state?.status);
  const subject = engines.find(e => e.id === config.subjectId);
  const candidates = engines.filter(e => e.id !== config.subjectId);
  const drafts = useRatingDrafts(list, { notify, attempt, refreshEngines }), { ratingInput } = drafts;
  const selected = candidates.filter(e => config.opponentIds.includes(e.id));
  const unrated = selected.filter(e => !drafts.validRating(e));
  const totalGames = selected.length * config.gamesPerOpponent;
  const averageRating = selected.length && !unrated.length ? Math.round(selected.reduce((sum, e) => sum + Number(ratingInput(e)), 0) / selected.length) : null;

  async function chooseBook() {
    setBusy(true);
    const book = await attempt(() => api.chooseBook());
    if (book) { update({ book: { type: 'file', ...book } }); notify(`${book.name}: ${book.count.toLocaleString()} openings ready.`); }
    setBusy(false);
  }
  async function chooseTablebases() { const folder = await attempt(() => api.chooseFolder('Choose a Syzygy tablebase folder')); if (folder) update({ syzygyPath: folder }); }
  async function start() {
    if (!subject) return notify('Choose the engine to rate.', true);
    if (!selected.length) return notify('Choose at least one rated opponent.', true);
    if (unrated.length) return notify(`Enter a ${ratingLists[list].name} rating for ${unrated.map(e => e.name).join(', ')}.`, true);
    setBusy(true);
    const started = await attempt(() => api.gauntlet.start({
      subjectId: subject.id, tc: config.tc, gamesPerOpponent: config.gamesPerOpponent, concurrency: config.concurrency, hash: config.hash,
      opponents: selected.map(e => ({ id: e.id, rating: Number(ratingInput(e)) })), adjudicate: config.adjudicate, syzygyPath: config.syzygyPath,
      book: config.book.type === 'file' ? { type: 'file', path: config.book.path } : { type: 'builtin' },
    }));
    if (started) { drafts.clearDrafts(); setDismissed(null); setFeatured(0); refreshEngines(); }
    setBusy(false);
  }

  if (live) return <LiveGauntlet {...{ state, engines, preferences, now, featured, setFeatured, confirmStop, setConfirmStop, attempt, notify, refreshHistory, onShare }} onNew={() => setDismissed(state.id)} />;

  const estimateFor = id => engines.find(e => e.id === id)?.estimates || {};
  return <>
    {!isDesktop && <div className="lab-notice"><Info size={16} />Rating gauntlets launch real UCI engines, so they run in the desktop app. You can still explore the setup here.</div>}
    <div className="lab-layout">
      <div className="lab-main">
        <section className="lab-panel">
          <div className="panel-heading"><div><Target size={17} /><h2>Engine under test</h2></div><span className="subtle-tag">1 THREAD · PONDER OFF</span></div>
          <div className="lab-panel-body subject-row">
            <Badge engine={subject} />
            <div className="subject-select"><EngineSelect engines={engines} value={config.subjectId} disabled={running} onChange={id => update({ subjectId: id, opponentIds: config.opponentIds.filter(x => x !== id) })} label="Engine to rate" /></div>
            <div className="subject-estimates">{gauntletControls.map(c => { const e = estimateFor(config.subjectId)[c.id]; return <div key={c.id}><small>{c.name}</small><strong>{e ? `${e.bound === 'above' ? '>' : e.bound === 'below' ? '<' : '≈'}${e.elo}` : '—'}{e?.error ? <span>±{e.error}</span> : null}</strong></div>; })}</div>
          </div>
        </section>
        <section className="lab-panel">
          <div className="panel-heading"><div><Clock3 size={17} /><h2>Time control</h2></div><span className="subtle-tag">MEASURED ON THE CCRL SCALE</span></div>
          <div className="lab-panel-body tc-cards">{gauntletControls.map(c => { const Icon = controlIcon[c.id]; return <button key={c.id} className={`tc-card ${config.tc === c.id ? 'chosen' : ''}`} aria-pressed={config.tc === c.id} onClick={() => update({ tc: c.id })}>
            <span className="tc-card-top"><Icon size={16} />{config.tc === c.id && <Check size={14} />}</span><strong>{c.name}</strong><span className="tc-card-time">{c.label}</span><span className="tc-card-list">{ratingLists[c.list].name} ratings</span>
          </button>; })}</div>
        </section>
        <AnchorPicker candidates={candidates} list={list} selectedIds={config.opponentIds} onChange={ids => update({ opponentIds: ids })} drafts={drafts} games={config.gamesPerOpponent} icon={Users} />
      </div>
      <aside className="lab-side">
        <section className="setup-panel">
          <div className="panel-heading"><div><ShieldCheck size={17} /><h2>CCRL conditions</h2></div><span className="subtle-tag">GAUNTLET</span></div>
          <div className="setup-body">
            <Field label="Games per opponent" hint="Colour-reversed pairs"><div className="number-with-label"><input type="number" min="2" max="2000" step="2" value={config.gamesPerOpponent} onChange={e => update({ gamesPerOpponent: Math.max(2, Math.min(2000, Math.round(Number(e.target.value) / 2) * 2 || 2)) })} aria-label="Games per opponent" /><span>games</span></div></Field>
            <div className="game-presets">{[20, 50, 100, 200].map(n => <button key={n} className={config.gamesPerOpponent === n ? 'chosen' : ''} onClick={() => update({ gamesPerOpponent: n })}>{n}</button>)}</div>
            <div className="lab-fields">
              <Field label="Parallel games" hint={`max ${cores}`}><div className="number-with-label"><Layers3 size={14} /><input type="number" min="1" max={cores} value={config.concurrency} onChange={e => update({ concurrency: Math.max(1, Math.min(cores, Math.round(Number(e.target.value)) || 1)) })} aria-label="Parallel games" /></div></Field>
              <Field label="Hash per engine"><div className="segmented">{control.hash.map(h => <button key={h} className={config.hash === h ? 'chosen' : ''} onClick={() => update({ hash: h })}>{h} MB</button>)}</div></Field>
            </div>
            <Field label="Opening book" hint="≤ 12 moves per side">
              <div className="book-choice"><button className={config.book.type === 'builtin' ? 'chosen' : ''} onClick={() => update({ book: { type: 'builtin' } })}><BookOpen size={14} /><span><strong>Built-in generic book</strong><small>60 balanced lines</small></span></button>
                <button className={config.book.type === 'file' ? 'chosen' : ''} disabled={busy} onClick={chooseBook}><FolderOpen size={14} /><span><strong>{config.book.type === 'file' ? config.book.name : 'Load EPD / PGN suite'}</strong><small>{config.book.type === 'file' ? `${config.book.count?.toLocaleString()} openings · click to change` : 'e.g. UHO or 8moves'}</small></span></button></div>
            </Field>
            <label className="preference-toggle compact"><div><strong>Adjudicate decided games</strong><span>Resign at ±10 pawns, draw after move 40 near 0.00</span></div><input type="checkbox" role="switch" checked={config.adjudicate} onChange={e => update({ adjudicate: e.target.checked })} /></label>
            <div className="tb-row"><Database size={14} /><span>{config.syzygyPath ? config.syzygyPath : 'Syzygy tablebases (optional)'}</span>{config.syzygyPath ? <button className="icon-btn" aria-label="Remove tablebase folder" onClick={() => update({ syzygyPath: '' })}><X size={14} /></button> : <button className="text-btn" onClick={chooseTablebases}>Choose</button>}</div>
            <div className="match-summary lab-summary"><span><Swords size={13} />{selected.length} opponents · {totalGames.toLocaleString()} games{averageRating ? ` · avg ${averageRating}` : ''}</span><span><Cpu size={13} />{control.label} · 1 thread · {config.hash} MB hash</span><span><Clock3 size={13} />About {duration(totalGames * gameDuration(control.minutes, control.increment) / config.concurrency)}</span></div>
            <button className="primary-btn start-btn" onClick={start} disabled={busy || !!otherJob || !isDesktop}>{busy ? <LoaderCircle size={17} className="spin" /> : <Medal size={18} />}Start gauntlet<ArrowRight size={17} /></button>
            <p className="setup-footnote">{otherJob ? `${otherJob} is running. Results are only meaningful with a quiet CPU.` : 'Run gauntlets on an otherwise idle computer. Keep parallel games below your physical core count.'}</p>
          </div>
        </section>
      </aside>
    </div>
    <GauntletHistory history={history} engines={engines} attempt={attempt} notify={notify} onShare={onShare} />
  </>;
}

function LiveGauntlet({ state, engines, preferences, now, featured, setFeatured, confirmStop, setConfirmStop, attempt, notify, onNew, onShare }) {
  const running = liveStatuses.includes(state.status), list = state.list, control = controlById(state.tc);
  const subject = engines.find(e => e.id === state.subjectId) || { name: 'Engine under test' };
  const opponentEngine = i => engines.find(e => e.id === state.opponents[i]?.id) || { name: state.opponents[i]?.name, accent: 'purple' };
  const board = state.boards.find(b => b.slot === featured) || state.boards[0];
  const elapsed = (state.finishedAt || now) - state.startedAt;
  const remaining = state.finished ? elapsed / state.finished * (state.planned - state.finished) : state.planned * gameDuration(state.minutes, state.increment) / state.concurrency;
  const estimate = state.estimate, progress = state.finished / state.planned * 100;
  const verdict = { finished: 'Gauntlet complete', stopped: 'Gauntlet stopped', error: 'Gauntlet ended with an error', paused: 'Paused', starting: 'Starting engines', running: 'Gauntlet in progress' }[state.status];
  async function exportPgn() { const saved = await attempt(() => api.gauntlet.exportPgn(state.id)); if (saved) notify('Gauntlet games exported as PGN.'); }
  return <>
    <section className="rating-hero">
      <div className="rating-hero-subject"><Badge engine={subject} /><div><span className="eyebrow">{control.name.toUpperCase()} · {control.label.toUpperCase()}</span><h2>{subject.name}</h2><span className="status-pill"><span className={`live-dot ${running && state.status !== 'paused' ? 'pulsing' : 'muted'}`} />{verdict}</span></div></div>
      <div className="rating-hero-figure"><small>ESTIMATED {ratingLists[list].name.toUpperCase()}</small><strong>{estimate ? formatRating(estimate) : '—'}{estimate?.error ? <span>±{Math.round(estimate.error)}</span> : null}</strong><em>{estimate?.error ? `95% interval ${Math.round(estimate.low)} – ${Math.round(estimate.high)}` : estimate ? 'The interval appears once results vary' : 'Appears after the first finished game'}</em></div>
      <div className="rating-hero-stats">
        <div><small>GAMES</small><strong>{state.finished}<span>/ {state.planned}</span></strong></div>
        <div><small>SCORE</small><strong>{pct(state.points, state.finished)}</strong></div>
        <div><small>W · D · L</small><strong className="wdl-text"><b>{state.wins}</b> · {state.draws} · <i>{state.losses}</i></strong></div>
        <div><small>{running ? 'TIME LEFT' : 'DURATION'}</small><strong>{running ? duration(remaining) : duration(elapsed)}</strong></div>
      </div>
      <div className="rating-hero-actions">
        {running ? <>
          <button className="secondary-btn" disabled={state.status === 'starting'} onClick={() => attempt(() => api.gauntlet.pause())}>{state.status === 'paused' ? <Play size={15} /> : <Pause size={15} />}{state.status === 'paused' ? 'Resume' : 'Pause'}</button>
          {confirmStop ? <button className="danger-btn" onClick={() => attempt(() => api.gauntlet.stop())}><Square size={14} fill="currentColor" />Confirm stop</button> : <button className="stop-btn" title="Stop gauntlet" aria-label="Stop gauntlet" onClick={() => setConfirmStop(true)}><Square size={15} fill="currentColor" /></button>}
        </> : <>
          <button className="secondary-btn" disabled={!estimate} onClick={() => onShare(shareModelFor(state, engines))}><Share2 size={15} />Share rating</button>
          <button className="secondary-btn" disabled={!state.finished} onClick={exportPgn}><ArrowDownToLine size={15} />PGN</button>
          <button className="primary-btn" onClick={onNew}><RotateCcw size={15} />New gauntlet</button>
        </>}
      </div>
      <div className="rating-hero-progress"><span style={{ width: `${progress}%` }} /></div>
    </section>
    {state.status === 'error' && <div className="lab-notice error"><Info size={16} />{state.message}</div>}
    <div className="gauntlet-live">
      <section className="arena-panel lab-board-panel">
        <div className="panel-heading"><div><span className={`live-dot ${running ? 'pulsing' : 'muted'}`} /><h2>{running ? 'Live boards' : 'Boards'}</h2>{running && <span className="label-chip">{state.boards.length} PLAYING</span>}</div><span className="subtle-tag">{state.concurrency} PARALLEL · {state.hash} MB · {state.book.toUpperCase()}</span></div>
        {state.boards.length > 1 && <div className="board-tabs" role="tablist" aria-label="Running games">{state.boards.map(b => <button key={b.slot} role="tab" aria-selected={b === board} className={b === board ? 'chosen' : ''} onClick={() => setFeatured(b.slot)}><Badge engine={opponentEngine(b.opponent)} small /><span><strong>Game {b.game}</strong><small>vs {opponentEngine(b.opponent).name} · {b.subjectWhite ? 'White' : 'Black'}</small></span></button>)}</div>}
        {board ? <LiveBoard board={board} subject={subject} opponent={opponentEngine(board.opponent)} list={list} estimate={estimate} preferences={preferences} now={now} active={state.status === 'running'} />
          : <div className="lab-board-idle"><Trophy size={30} /><p>{running ? 'Starting the next games…' : state.message}</p></div>}
      </section>
      <div className="gauntlet-side">
        <section className="lab-panel">
          <div className="panel-heading"><div><Gauge size={17} /><h2>Live estimate</h2></div><span className="subtle-tag">95% BAND · DASHED LINES ARE ANCHORS</span></div>
          <EstimateChart timeline={state.timeline || []} anchors={state.opponents} label={`Estimated ${ratingLists[list].name}`} />
        </section>
        <section className="lab-panel">
          <div className="panel-heading"><div><Users size={17} /><h2>Standings</h2></div><span className="subtle-tag">PERFORMANCE VS EACH ANCHOR</span></div>
          <div className="standings">
            <div className="standing-head"><span>Opponent</span><span>Rating</span><span>Games</span><span>+ = −</span><span>Score</span></div>
            {state.opponents.map((o, i) => <div className="standing-row" key={o.id}>
              <span className="standing-name"><Badge engine={opponentEngine(i)} small /><strong>{o.name}</strong></span><span>{o.rating}</span><span>{o.games}</span>
              <span className="wdl-text"><b>{o.wins}</b> {o.draws} <i>{o.losses}</i></span>
              <span className="standing-score"><strong>{pct(o.points, o.games)}</strong><small>{o.performance ? `perf ${o.performance.bound === 'above' ? '>' : o.performance.bound === 'below' ? '<' : ''}${Math.round(o.performance.elo)}` : ''}</small></span>
            </div>)}
          </div>
        </section>
        <section className="lab-panel">
          <div className="panel-heading"><div><Swords size={17} /><h2>Recent games</h2></div><span className="subtle-tag">{state.adjudicated} ADJUDICATED · {state.forfeits} ON TIME</span></div>
          <div className="recent-games">{state.recent.length ? state.recent.slice(0, 14).map(r => <div key={r.game} className="recent-row"><span className={`result-dot ${r.score === 1 ? 'win' : r.score === 0 ? 'loss' : 'draw'}`}>{r.score === 1 ? 'W' : r.score === 0 ? 'L' : '½'}</span><span><strong>vs {state.opponents[r.opponent]?.name}</strong><small>Game {r.game} · {r.subjectWhite ? 'White' : 'Black'} · {r.reason}</small></span><span className="recent-result">{r.result}</span></div>) : <p className="lab-empty">Finished games will appear here.</p>}</div>
        </section>
      </div>
    </div>
    <p className="lab-hint wide"><Info size={13} />Local estimate anchored to the ratings you supplied, with a paired-opening error allowance. Hardware speed, opponents and openings differ from CCRL, so treat it as an approximation, not an official rating.</p>
  </>;
}

function GauntletHistory({ history, engines, attempt, notify, onShare }) {
  if (!history.length) return null;
  return <section className="lab-panel lab-history">
    <div className="panel-heading"><div><Trophy size={17} /><h2>Past gauntlets</h2><span className="label-chip">{history.length}</span></div></div>
    {history.slice(0, 12).map(item => { const engine = engines.find(e => e.id === item.subject.id) || item.subject, control = controlById(item.tc); return <div className="lab-history-row" key={item.id}>
      <span className="standing-name"><Badge engine={engine} small /><span><strong>{item.subject.name}</strong><small>{control.name} · {control.label} · {item.opponents.length} opponents</small></span></span>
      <span className="lab-history-figure"><strong>{formatRating(item.estimate)}</strong><small>{item.estimate?.error ? `±${Math.round(item.estimate.error)} ` : ''}{ratingLists[item.list].short}</small></span>
      <span className="lab-history-meta">{item.finished}/{item.planned} games · {formatScore(item.points)} pts<small>{item.status === 'finished' ? 'Complete' : 'Stopped early'} · {new Date(item.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</small></span>
      <span className="lab-history-buttons">{item.estimate && <button className="icon-btn" title="Share rating card" aria-label={`Share rating card for ${item.subject.name}`} onClick={() => onShare(shareModelFor(item, engines))}><Share2 size={15} /></button>}<button className="icon-btn" title="Export PGN" aria-label={`Export games from ${item.subject.name} gauntlet`} onClick={async () => { if (await attempt(() => api.gauntlet.exportPgn(item.id))) notify('Gauntlet games exported as PGN.'); }}><ArrowDownToLine size={16} /></button></span>
    </div>; })}
  </section>;
}
