import React, { useEffect, useRef, useState } from 'react';
import { ArrowDownToLine, ArrowRight, BookOpen, CircleCheck, CircleX, Clock3, Cpu, FlaskConical, FolderOpen, Gauge, Info, Layers3, LoaderCircle, Medal, RotateCcw, Share2, ShieldCheck, Square, Swords, Target, Terminal, TriangleAlert, Users } from 'lucide-react';
import { api, isDesktop } from './api.js';
import { Badge, EngineSelect, Field, duration } from './ui.jsx';
import { formatRating, gameDuration, ratingLists, signed } from './ratings.js';
import AnchorPicker, { useRatingDrafts } from './AnchorPicker.jsx';
import EstimateChart from './EstimateChart.jsx';
import { ratingCardModel } from './ratingCard.js';

const tcPresets = [
  { id: 'hyper', name: 'Hyper', tc: '5+0.05', note: 'Fastest signal' },
  { id: 'stc', name: 'STC', tc: '8+0.08', note: 'Recommended' },
  { id: 'fishtest', name: 'Fishtest STC', tc: '10+0.1', note: 'Stockfish standard' },
  { id: 'ltc', name: 'LTC', tc: '60+0.6', note: 'Confirmation' },
];
const testPresets = [
  { id: 'gainer', name: 'Gainer', elo0: 0, elo1: 5, note: 'Is the patch an improvement?' },
  { id: 'big', name: 'Big gain', elo0: 0, elo1: 10, note: 'Quick verdict for large changes' },
  { id: 'nonreg', name: 'Non-regression', elo0: -5, elo1: 0, note: 'Simplifications and refactors' },
  { id: 'games', name: 'Fixed games', note: 'Measure Elo over N games' },
];
const defaults = { testKind: 'h2h', subjectId: '', anchorIds: [], list: 'blitz', gamesPerAnchor: 50, devId: '', baseId: '', tc: '8+0.08', hash: 16, threads: 1, concurrency: 0, preset: 'gainer', elo0: 0, elo1: 5, alpha: .05, beta: .05, model: 'normalized', maxGames: 20000, games: 1000, book: { type: 'builtin' }, adjudicate: true };
function readConfig() { try { return { ...defaults, ...JSON.parse(localStorage.getItem('arena-quicktest') || '{}') }; } catch { return defaults; } }
const liveStatuses = ['starting', 'running'];
const fixed = (value, digits = 2) => Number.isFinite(value) ? value.toFixed(digits) : '—';
const ptnmlLabels = ['LL', 'LD', 'DD + WL', 'WD', 'WW'];

const tcSeconds = tc => { const [base, inc] = String(tc).split('+').map(Number); return { minutes: (base || 0) / 60, increment: inc || 0 }; };
export default function QuickTestView({ engines, state, history, cores, notify, attempt, refreshHistory, refreshEngines, otherJob, onShare }) {
  const [config, setConfig] = useState(readConfig), [status, setStatus] = useState(null), [busy, setBusy] = useState(false), [dismissed, setDismissed] = useState(null), [confirmStop, setConfirmStop] = useState(false), [now, setNow] = useState(Date.now());
  const update = patch => setConfig(c => ({ ...c, ...patch }));
  const pool = engines.filter(e => !e.builtin), concurrency = config.concurrency || Math.max(1, cores - 1);
  const ratingMode = config.testKind === 'rating', drafts = useRatingDrafts(config.list, { notify, attempt, refreshEngines });
  const anchorPool = pool.filter(e => e.id !== config.subjectId), selectedAnchors = anchorPool.filter(e => config.anchorIds.includes(e.id));
  const unrated = selectedAnchors.filter(e => !drafts.validRating(e));
  useEffect(() => { try { localStorage.setItem('arena-quicktest', JSON.stringify(config)); } catch { /* Preferences are optional. */ } }, [config]);
  useEffect(() => { api.fastchess.status().then(setStatus).catch(() => setStatus({ path: null })); }, []);
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 500); return () => clearInterval(timer); }, []);
  useEffect(() => {
    const ids = pool.map(e => e.id), patch = {};
    if (!ids.includes(config.devId)) patch.devId = ids.find(id => id !== config.baseId) || '';
    if (!ids.includes(config.baseId) || config.baseId === (patch.devId ?? config.devId)) patch.baseId = ids.find(id => id !== (patch.devId ?? config.devId)) || '';
    if (!ids.includes(config.subjectId)) patch.subjectId = ids[0] || '';
    if (Object.keys(patch).length) update(patch);
  }, [engines]);
  useEffect(() => { if (!liveStatuses.includes(state?.status)) setConfirmStop(false); }, [state?.status]);

  async function locate() { const found = await attempt(() => api.fastchess.locate()); if (found) { setStatus(found); notify(`${found.version} is ready.`); } }
  async function chooseBook() {
    setBusy(true);
    const book = await attempt(() => api.chooseBook());
    if (book) { update({ book: { type: 'file', ...book } }); notify(`${book.name}: ${book.count.toLocaleString()} openings ready.`); }
    setBusy(false);
  }
  async function start() {
    if (ratingMode) return startRating();
    if (!config.devId || !config.baseId || config.devId === config.baseId) return notify('Choose two different engines.', true);
    setBusy(true);
    const sprt = config.preset !== 'games';
    const started = await attempt(() => api.fastchess.start({
      devId: config.devId, baseId: config.baseId, tc: config.tc.trim(), hash: config.hash, threads: config.threads, concurrency,
      mode: sprt ? 'sprt' : 'games', games: config.games, maxGames: config.maxGames, adjudicate: config.adjudicate,
      sprt: sprt ? { elo0: config.elo0, elo1: config.elo1, alpha: config.alpha, beta: config.beta, model: config.model } : null,
      book: config.book.type === 'file' ? { type: 'file', path: config.book.path } : { type: 'builtin' },
    }));
    if (started) setDismissed(null);
    setBusy(false);
  }
  async function startRating() {
    if (!config.subjectId) return notify('Choose the engine to rate.', true);
    if (!selectedAnchors.length) return notify('Choose at least one rated anchor.', true);
    if (unrated.length) return notify(`Enter a ${ratingLists[config.list].name} rating for ${unrated.map(e => e.name).join(', ')}.`, true);
    setBusy(true);
    const started = await attempt(() => api.fastchess.start({
      mode: 'gauntlet', subjectId: config.subjectId, list: config.list, gamesPerOpponent: config.gamesPerAnchor,
      opponents: selectedAnchors.map(e => ({ id: e.id, rating: Number(drafts.ratingInput(e)) })),
      tc: config.tc.trim(), hash: config.hash, threads: config.threads, concurrency, adjudicate: config.adjudicate,
      book: config.book.type === 'file' ? { type: 'file', path: config.book.path } : { type: 'builtin' },
    }));
    if (started) { setDismissed(null); drafts.clearDrafts(); refreshEngines(); }
    setBusy(false);
  }

  const onNew = () => { setDismissed(state.id); refreshHistory(); };
  if (state && state.id !== dismissed && state.testMode === 'gauntlet') return <LiveRating {...{ state, engines, now, attempt, notify, confirmStop, setConfirmStop, onShare, onNew }} />;
  if (state && state.id !== dismissed) return <LiveTest {...{ state, engines, now, attempt, notify, confirmStop, setConfirmStop, onNew }} />;

  const dev = engines.find(e => e.id === config.devId), base = engines.find(e => e.id === config.baseId);
  const sprt = config.preset !== 'games';
  return <>
    {!isDesktop && <div className="lab-notice"><Info size={16} />fastchess runs real engine executables, so quick tests run in the desktop app.</div>}
    <div className="mode-switch" role="tablist" aria-label="Quick test type">
      <button role="tab" aria-selected={!ratingMode} className={!ratingMode ? 'chosen' : ''} onClick={() => update({ testKind: 'h2h' })}><Swords size={15} />Head-to-head · SPRT</button>
      <button role="tab" aria-selected={ratingMode} className={ratingMode ? 'chosen' : ''} onClick={() => update({ testKind: 'rating' })}><Medal size={15} />Rating estimate · STC gauntlet</button>
    </div>
    <div className="lab-layout">
      <div className="lab-main">
        {ratingMode && <>
          <section className="lab-panel">
            <div className="panel-heading"><div><Target size={17} /><h2>Engine under test</h2></div><span className="subtle-tag">PLAYS EVERY ANCHOR · PAIRED OPENINGS</span></div>
            <div className="lab-panel-body">
              <div className="lab-fields three rating-setup">
                <Field label="Engine to rate"><EngineSelect engines={pool} value={config.subjectId} onChange={id => update({ subjectId: id, anchorIds: config.anchorIds.filter(x => x !== id) })} label="Engine to rate" /></Field>
                <Field label="Rating list"><div className="segmented">{Object.values(ratingLists).map(l => <button key={l.id} className={config.list === l.id ? 'chosen' : ''} onClick={() => update({ list: l.id })}>{l.name}</button>)}</div></Field>
                <Field label="Games per anchor" hint="Even"><div className="number-with-label"><input type="number" min="2" max="2000" step="2" value={config.gamesPerAnchor} onChange={e => update({ gamesPerAnchor: Math.max(2, Math.min(2000, Math.round(Number(e.target.value) / 2) * 2 || 2)) })} aria-label="Games per anchor" /><span>games</span></div></Field>
              </div>
              <div className="game-presets">{[20, 50, 100, 200].map(n => <button key={n} className={config.gamesPerAnchor === n ? 'chosen' : ''} onClick={() => update({ gamesPerAnchor: n })}>{n} per anchor</button>)}</div>
              <p className="lab-hint"><Info size={13} />Short time controls put engines closer together or further apart than CCRL’s longer games, so treat an STC estimate as a fast approximation. Confirm important results with a CCRL-style gauntlet.</p>
            </div>
          </section>
          <AnchorPicker candidates={anchorPool} list={config.list} selectedIds={config.anchorIds} onChange={ids => update({ anchorIds: ids })} drafts={drafts} games={config.gamesPerAnchor} title="Anchor engines" icon={Users} />
        </>}
        {!ratingMode && <section className="lab-panel">
          <div className="panel-heading"><div><Swords size={17} /><h2>Head-to-head</h2></div><span className="subtle-tag">DEV VS BASE · PAIRED OPENINGS</span></div>
          <div className="lab-panel-body versus-row">
            <Field label="New version (dev)"><EngineSelect engines={pool} value={config.devId} exclude={config.baseId} onChange={id => update({ devId: id })} label="Development engine" /></Field>
            <div className="versus-mark"><FlaskConical size={18} /></div>
            <Field label="Reference (base)"><EngineSelect engines={pool} value={config.baseId} exclude={config.devId} onChange={id => update({ baseId: id })} label="Base engine" /></Field>
          </div>
          {pool.length < 2 && <p className="lab-hint"><Info size={13} />Load at least two engine executables in the Engine library. Built-in demo engines can’t be run by fastchess.</p>}
        </section>}
        <section className="lab-panel">
          <div className="panel-heading"><div><Clock3 size={17} /><h2>Time control</h2></div><span className="subtle-tag">SECONDS + INCREMENT</span></div>
          <div className="lab-panel-body">
            <div className="tc-cards four">{tcPresets.map(p => <button key={p.id} className={`tc-card ${config.tc === p.tc ? 'chosen' : ''}`} aria-pressed={config.tc === p.tc} onClick={() => update({ tc: p.tc, hash: p.id === 'ltc' ? 64 : 16 })}><strong>{p.name}</strong><span className="tc-card-time">{p.tc}</span><span className="tc-card-list">{p.note}</span></button>)}</div>
            <div className="lab-fields three">
              <Field label="Custom" hint="sec+inc"><div className="number-with-label"><Clock3 size={14} /><input value={config.tc} onChange={e => update({ tc: e.target.value.replace(/[^\d.+]/g, '') })} aria-label="Time control" /></div></Field>
              <Field label="Hash" hint="MB"><div className="number-with-label"><input type="number" min="1" max="4096" value={config.hash} onChange={e => update({ hash: Math.max(1, Math.min(4096, Math.round(Number(e.target.value)) || 1)) })} aria-label="Hash MB" /><span>MB</span></div></Field>
              <Field label="Threads"><div className="number-with-label"><Cpu size={14} /><input type="number" min="1" max={cores} value={config.threads} onChange={e => update({ threads: Math.max(1, Math.min(cores, Math.round(Number(e.target.value)) || 1)) })} aria-label="Threads per engine" /></div></Field>
            </div>
          </div>
        </section>
        {!ratingMode && <section className="lab-panel">
          <div className="panel-heading"><div><Gauge size={17} /><h2>Test</h2></div><span className="subtle-tag">{sprt ? `SPRT · ${config.model.toUpperCase()} ELO` : 'FIXED GAMES'}</span></div>
          <div className="lab-panel-body">
            <div className="tc-cards four">{testPresets.map(p => <button key={p.id} className={`tc-card ${config.preset === p.id ? 'chosen' : ''}`} aria-pressed={config.preset === p.id} onClick={() => update(p.id === 'games' ? { preset: p.id } : { preset: p.id, elo0: p.elo0, elo1: p.elo1 })}><strong>{p.name}</strong><span className="tc-card-time">{p.id === 'games' ? `${config.games.toLocaleString()} games` : `[${p.elo0}, ${p.elo1}]`}</span><span className="tc-card-list">{p.note}</span></button>)}</div>
            {sprt ? <div className="lab-fields four">
              <Field label="elo0"><div className="number-with-label"><input type="number" step="0.5" value={config.elo0} onChange={e => update({ elo0: Number(e.target.value) })} aria-label="SPRT elo0" /></div></Field>
              <Field label="elo1"><div className="number-with-label"><input type="number" step="0.5" value={config.elo1} onChange={e => update({ elo1: Number(e.target.value) })} aria-label="SPRT elo1" /></div></Field>
              <Field label="α / β"><div className="number-with-label"><input type="number" step="0.01" min="0.01" max="0.2" value={config.alpha} onChange={e => update({ alpha: Number(e.target.value), beta: Number(e.target.value) })} aria-label="SPRT alpha and beta" /></div></Field>
              <Field label="Elo model"><div className="segmented"><button className={config.model === 'normalized' ? 'chosen' : ''} onClick={() => update({ model: 'normalized' })}>nElo</button><button className={config.model === 'logistic' ? 'chosen' : ''} onClick={() => update({ model: 'logistic' })}>Elo</button></div></Field>
            </div> : <div className="lab-fields three"><Field label="Games" hint="Even number"><div className="number-with-label"><input type="number" min="2" step="2" value={config.games} onChange={e => update({ games: Math.max(2, Math.round(Number(e.target.value) / 2) * 2 || 2) })} aria-label="Number of games" /><span>games</span></div></Field></div>}
            <p className="lab-hint"><Info size={13} />{sprt ? `fastchess stops as soon as the evidence decides between “≤ ${config.elo0}” (H0) and “≥ ${config.elo1}” (H1) ${config.model === 'normalized' ? 'normalized ' : ''}Elo, capped at ${config.maxGames.toLocaleString()} games. Narrow bounds find small gains but need more games.` : 'Plays exactly this many games and reports Elo with a 95% error margin.'}</p>
          </div>
        </section>}
      </div>
      <aside className="lab-side">
        <section className={`setup-panel fastchess-status ${status?.path ? 'ready' : ''}`}>
          <div className="panel-heading"><div><Terminal size={17} /><h2>fastchess</h2></div>{status?.path ? <span className="status-pill"><span className="live-dot" />READY</span> : <span className="status-pill"><span className="live-dot muted" />{status ? 'NOT FOUND' : 'CHECKING'}</span>}</div>
          <div className="setup-body">
            {status?.path ? <><strong className="fc-version">{status.version}</strong><p className="fc-path">{status.path}</p><button className="text-btn" onClick={locate}><FolderOpen size={13} />Use a different fastchess.exe</button></>
              : <><p className="fc-path">Engine Arena drives the fastchess command-line tool. Download a release from github.com/Disservin/fastchess/releases, then locate fastchess.exe.</p><button className="secondary-btn wide" onClick={locate} disabled={!isDesktop}><FolderOpen size={15} />Locate fastchess.exe</button></>}
          </div>
        </section>
        <section className="setup-panel">
          <div className="panel-heading"><div><ShieldCheck size={17} /><h2>Conditions</h2></div><span className="subtle-tag">FASTCHESS</span></div>
          <div className="setup-body">
            <Field label="Concurrent games" hint={`${cores} CPU threads`}><div className="number-with-label"><Layers3 size={14} /><input type="number" min="1" max={cores} value={concurrency} onChange={e => update({ concurrency: Math.max(1, Math.min(cores, Math.round(Number(e.target.value)) || 1)) })} aria-label="Concurrent games" /></div></Field>
            <Field label="Opening suite" hint="Each played with both colours">
              <div className="book-choice"><button className={config.book.type === 'builtin' ? 'chosen' : ''} onClick={() => update({ book: { type: 'builtin' } })}><BookOpen size={14} /><span><strong>Built-in generic book</strong><small>60 balanced lines</small></span></button>
                <button className={config.book.type === 'file' ? 'chosen' : ''} disabled={busy} onClick={chooseBook}><FolderOpen size={14} /><span><strong>{config.book.type === 'file' ? config.book.name : 'Load EPD / PGN suite'}</strong><small>{config.book.type === 'file' ? `${config.book.count?.toLocaleString()} openings · click to change` : 'UHO suites resolve small gaps fastest'}</small></span></button></div>
            </Field>
            <label className="preference-toggle compact"><div><strong>Adjudicate decided games</strong><span>Saves time without changing results</span></div><input type="checkbox" role="switch" checked={config.adjudicate} onChange={e => update({ adjudicate: e.target.checked })} /></label>
            <div className="match-summary lab-summary">{ratingMode ? <><span><Users size={13} />{selectedAnchors.length} anchors · {(selectedAnchors.length * config.gamesPerAnchor).toLocaleString()} games</span><span><Clock3 size={13} />About {duration(selectedAnchors.length * config.gamesPerAnchor * gameDuration(tcSeconds(config.tc).minutes, tcSeconds(config.tc).increment) / concurrency)}</span></> : <span><Swords size={13} />{dev?.name || 'Dev'} vs {base?.name || 'Base'}</span>}<span><Cpu size={13} />{config.tc} · {config.threads} thread{config.threads > 1 ? 's' : ''} · {config.hash} MB · ×{concurrency}</span></div>
            <button className="primary-btn start-btn" onClick={start} disabled={busy || !status?.path || pool.length < 2 || !!otherJob}>{busy ? <LoaderCircle size={17} className="spin" /> : ratingMode ? <Medal size={18} /> : <FlaskConical size={18} />}{ratingMode ? 'Start rating estimate' : 'Start test'}<ArrowRight size={17} /></button>
            <p className="setup-footnote">{otherJob ? `${otherJob} is running. Wait for it to finish for clean results.` : 'Keep the computer otherwise idle while a test runs.'}</p>
          </div>
        </section>
      </aside>
    </div>
    <TestHistory history={history} engines={engines} attempt={attempt} notify={notify} onShare={onShare} />
  </>;
}

function Verdict({ state }) {
  const [dev] = state.names;
  if (state.status === 'error') return <div className="verdict error"><TriangleAlert size={22} /><div><strong>fastchess stopped with an error</strong><span>{state.message}</span></div></div>;
  if (state.verdict === 'H1') return <div className="verdict pass"><CircleCheck size={22} /><div><strong>Passed · H1 accepted</strong><span>{dev} is consistent with a gain of at least {state.sprt.elo1} {state.sprt.model === 'normalized' ? 'nElo' : 'Elo'}.</span></div></div>;
  if (state.verdict === 'H0') return <div className="verdict fail"><CircleX size={22} /><div><strong>Failed · H0 accepted</strong><span>No evidence that {dev} is better than {state.sprt.elo0} {state.sprt.model === 'normalized' ? 'nElo' : 'Elo'}.</span></div></div>;
  if (state.status === 'finished') return <div className="verdict neutral"><Info size={22} /><div><strong>{state.testMode === 'sprt' ? 'Game limit reached without a verdict' : 'Test complete'}</strong><span>{state.games} games played.</span></div></div>;
  if (state.status === 'stopped') return <div className="verdict neutral"><Square size={20} /><div><strong>Test stopped</strong><span>{state.message}</span></div></div>;
  return null;
}

function LiveTest({ state, engines, now, attempt, notify, confirmStop, setConfirmStop, onNew }) {
  const running = liveStatuses.includes(state.status), stats = state.stats;
  const dev = engines.find(e => e.id === state.devId) || { name: state.names[0] }, base = engines.find(e => e.id === state.baseId) || { name: state.names[1], accent: 'purple' };
  const elapsed = (state.finishedAt || now) - state.startedAt, perMinute = state.games / Math.max(elapsed / 60000, 1 / 60);
  const log = useRef(null);
  useEffect(() => { if (log.current) log.current.scrollTop = log.current.scrollHeight; }, [state.log.length]);
  const lower = stats?.lower ?? state.reported?.lower, upper = stats?.upper ?? state.reported?.upper, llr = stats?.llr ?? null;
  const llrPosition = llr === null || lower === undefined ? 50 : Math.min(100, Math.max(0, (llr - lower) / (upper - lower) * 100));
  const maxPair = Math.max(1, ...state.ptnml);
  async function exportPgn() { if (await attempt(() => api.fastchess.exportPgn(state.id))) notify('Test games exported as PGN.'); }
  return <>
    <section className="quick-hero">
      <div className="quick-contenders">
        <div className="contender"><Badge engine={dev} /><div><h3>{dev.name}</h3><span><i className="engine-dot green" />Dev</span></div></div>
        <div className="quick-versus"><strong>{state.tc}</strong><small>{state.threads}T · {state.hash} MB · ×{state.concurrency}</small></div>
        <div className="contender second"><div><h3>{base.name}</h3><span>Base<i className="engine-dot purple" /></span></div><Badge engine={base} /></div>
      </div>
      <div className="rating-hero-actions">
        <span className="status-pill"><span className={`live-dot ${running ? 'pulsing' : 'muted'}`} />{running ? `${state.active} games running` : state.status === 'finished' ? 'Complete' : state.status === 'stopped' ? 'Stopped' : 'Error'}</span>
        {running ? (confirmStop ? <button className="danger-btn" onClick={() => attempt(() => api.fastchess.stop())}><Square size={14} fill="currentColor" />Confirm stop</button> : <button className="stop-btn" title="Stop test" aria-label="Stop test" onClick={() => setConfirmStop(true)}><Square size={15} fill="currentColor" /></button>)
          : <><button className="secondary-btn" disabled={!state.games} onClick={exportPgn}><ArrowDownToLine size={15} />Export PGN</button><button className="primary-btn" onClick={onNew}><RotateCcw size={15} />New test</button></>}
      </div>
    </section>
    <Verdict state={state} />
    <div className="quick-stats">
      <div className="quick-stat hero"><small>ELO DIFFERENCE</small><strong>{stats ? signed(stats.elo, 2) : '—'}<span>{stats ? `± ${fixed(stats.error)}` : ''}</span></strong><em>{stats ? `95% · ${signed(stats.elo - stats.error, 1)} to ${signed(stats.elo + stats.error, 1)}` : 'After the first opening pair'}</em></div>
      <div className="quick-stat"><small>NORMALIZED ELO</small><strong>{stats?.nElo !== null && stats ? signed(stats.nElo, 2) : '—'}</strong><em>{stats ? `± ${fixed(stats.nEloError)}` : '—'}</em></div>
      <div className="quick-stat"><small>LOS</small><strong>{stats ? `${(stats.los * 100).toFixed(1)}%` : '—'}</strong><em>Likelihood of superiority</em></div>
      <div className="quick-stat"><small>GAMES</small><strong>{state.games.toLocaleString()}</strong><em className="wdl-text"><b>+{state.wins}</b> ={state.draws} <i>−{state.losses}</i></em></div>
      <div className="quick-stat"><small>SPEED</small><strong>{perMinute.toFixed(1)}<span>/min</span></strong><em>{duration(elapsed)} elapsed</em></div>
    </div>
    <div className="quick-grid">
      <div className="quick-charts">
        {state.testMode === 'sprt' && <section className="lab-panel">
          <div className="panel-heading"><div><Gauge size={17} /><h2>Log-likelihood ratio</h2></div><span className="subtle-tag">[{state.sprt.elo0}, {state.sprt.elo1}] · α {state.sprt.alpha} · β {state.sprt.beta}</span></div>
          <div className="lab-panel-body">
            <div className="llr-figure"><strong>{fixed(llr)}</strong><span>{llr !== null && upper ? `${Math.round(Math.abs(llr) / (llr >= 0 ? upper : -lower) * 100)}% of the way to ${llr >= 0 ? 'H1' : 'H0'}` : 'Waiting for games'}</span></div>
            <div className="llr-track" role="img" aria-label={`LLR ${fixed(llr)} between ${fixed(lower)} and ${fixed(upper)}`}><span className="llr-zero" /><span className="llr-marker" style={{ left: `${llrPosition}%` }} /></div>
            <div className="llr-scale"><span>H0 · {fixed(lower)}</span><span>0</span><span>{fixed(upper)} · H1</span></div>
          </div>
        </section>}
        <section className="lab-panel">
          <div className="panel-heading"><div><Layers3 size={17} /><h2>Pentanomial</h2></div><span className="subtle-tag">{state.ptnml.reduce((a, b) => a + b, 0)} OPENING PAIRS · DEV’S SCORE</span></div>
          <div className="lab-panel-body ptnml-chart">{state.ptnml.map((count, i) => <div className="ptnml-bar" key={i} title={`${ptnmlLabels[i]}: ${count} pairs`}><span className="ptnml-count">{count}</span><span className="ptnml-track"><span style={{ height: `${count / maxPair * 100}%` }} /></span><small>{ptnmlLabels[i]}</small><em>{i / 2} pts</em></div>)}</div>
          <div className="wdl-bar" role="img" aria-label={`${state.wins} wins, ${state.draws} draws, ${state.losses} losses`}>{[['win', state.wins], ['draw', state.draws], ['loss', state.losses]].map(([kind, n]) => n ? <span key={kind} className={kind} style={{ flexGrow: n }} title={`${n} ${kind === 'win' ? 'wins' : kind === 'draw' ? 'draws' : 'losses'}`} /> : null)}</div>
          <div className="wdl-legend"><span><i className="win" />Wins {state.wins}</span><span><i className="draw" />Draws {state.draws}</span><span><i className="loss" />Losses {state.losses}</span></div>
        </section>
      </div>
      <section className="lab-panel console-panel">
        <div className="panel-heading"><div><Terminal size={17} /><h2>fastchess output</h2></div><span className="subtle-tag">{state.warnings ? `${state.warnings} WARNINGS · ` : ''}{state.book.toUpperCase()}</span></div>
        <pre className="console" ref={log}>{state.log.join('\n')}</pre>
      </section>
    </div>
  </>;
}

export const shareModelFor = (state, engines) => ratingCardModel({ engine: engines.find(e => e.id === state.subjectId) || { name: state.names?.[0] }, state, kind: 'STC gauntlet', tcLabel: state.tc, date: state.date || state.finishedAt });
function LiveRating({ state, engines, now, attempt, notify, confirmStop, setConfirmStop, onShare, onNew }) {
  const running = liveStatuses.includes(state.status), estimate = state.estimate, list = ratingLists[state.list] || ratingLists.blitz;
  const subject = engines.find(e => e.id === state.subjectId) || { name: state.names[0] };
  const anchor = i => engines.find(e => e.id === state.opponents[i]?.id) || { name: state.opponents[i]?.name, accent: 'purple' };
  const elapsed = (state.finishedAt || now) - state.startedAt, perMinute = state.games / Math.max(elapsed / 60000, 1 / 60);
  const remaining = state.games ? elapsed / state.games * (state.planned - state.games) : null;
  const log = useRef(null);
  useEffect(() => { if (log.current) log.current.scrollTop = log.current.scrollHeight; }, [state.log.length]);
  async function exportPgn() { if (await attempt(() => api.fastchess.exportPgn(state.id))) notify('Gauntlet games exported as PGN.'); }
  return <>
    <section className="rating-hero">
      <div className="rating-hero-subject"><Badge engine={subject} /><div><span className="eyebrow">STC GAUNTLET · {state.tc} · {state.opponents.length} ANCHORS</span><h2>{subject.name}</h2><span className="status-pill"><span className={`live-dot ${running ? 'pulsing' : 'muted'}`} />{running ? `${state.active} games running` : state.status === 'finished' ? 'Gauntlet complete' : state.status === 'stopped' ? 'Stopped' : 'Error'}</span></div></div>
      <div className="rating-hero-figure"><small>ESTIMATED {list.name.toUpperCase()}</small><strong>{estimate ? formatRating(estimate) : '—'}{estimate?.error ? <span>±{Math.round(estimate.error)}</span> : null}</strong><em>{estimate?.error ? `95% interval ${Math.round(estimate.low)} – ${Math.round(estimate.high)}` : estimate ? 'The interval appears once results vary' : 'Appears after the first finished game'}</em></div>
      <div className="rating-hero-stats">
        <div><small>GAMES</small><strong>{state.games}<span>/ {state.planned}</span></strong></div>
        <div><small>SCORE</small><strong>{state.games ? `${(state.points / state.games * 100).toFixed(1)}%` : '—'}</strong></div>
        <div><small>W · D · L</small><strong className="wdl-text"><b>{state.wins}</b> · {state.draws} · <i>{state.losses}</i></strong></div>
        <div><small>{running ? 'TIME LEFT' : 'SPEED'}</small><strong>{running ? duration(remaining) : `${perMinute.toFixed(1)}/min`}</strong></div>
      </div>
      <div className="rating-hero-actions">
        {running ? (confirmStop ? <button className="danger-btn" onClick={() => attempt(() => api.fastchess.stop())}><Square size={14} fill="currentColor" />Confirm stop</button> : <button className="stop-btn" title="Stop gauntlet" aria-label="Stop gauntlet" onClick={() => setConfirmStop(true)}><Square size={15} fill="currentColor" /></button>)
          : <><button className="secondary-btn" disabled={!estimate} onClick={() => onShare(shareModelFor(state, engines))}><Share2 size={15} />Share rating</button><button className="secondary-btn" disabled={!state.games} onClick={exportPgn}><ArrowDownToLine size={15} />PGN</button><button className="primary-btn" onClick={onNew}><RotateCcw size={15} />New test</button></>}
      </div>
      <div className="rating-hero-progress"><span style={{ width: `${state.games / state.planned * 100}%` }} /></div>
    </section>
    {state.status === 'error' && <div className="lab-notice error"><Info size={16} />{state.message}</div>}
    <div className="quick-grid">
      <div className="quick-charts">
        <section className="lab-panel">
          <div className="panel-heading"><div><Gauge size={17} /><h2>Live estimate</h2></div><span className="subtle-tag">95% BAND · DASHED LINES ARE ANCHORS</span></div>
          <EstimateChart timeline={state.timeline} anchors={state.opponents} label={`Estimated ${list.name}`} />
        </section>
        <section className="lab-panel">
          <div className="panel-heading"><div><Users size={17} /><h2>Standings</h2></div><span className="subtle-tag">PERFORMANCE VS EACH ANCHOR</span></div>
          <div className="standings">
            <div className="standing-head"><span>Anchor</span><span>Rating</span><span>Games</span><span>+ = −</span><span>Score</span></div>
            {state.opponents.map((o, i) => <div className="standing-row" key={o.id}>
              <span className="standing-name"><Badge engine={anchor(i)} small /><strong>{o.name}</strong></span><span>{o.rating}</span><span>{o.games}</span>
              <span className="wdl-text"><b>{o.wins}</b> {o.draws} <i>{o.losses}</i></span>
              <span className="standing-score"><strong>{o.games ? `${(o.points / o.games * 100).toFixed(1)}%` : '—'}</strong><small>{o.performance ? `perf ${o.performance.bound === 'above' ? '>' : o.performance.bound === 'below' ? '<' : ''}${Math.round(o.performance.elo)}` : ''}</small></span>
            </div>)}
          </div>
        </section>
      </div>
      <section className="lab-panel console-panel">
        <div className="panel-heading"><div><Terminal size={17} /><h2>fastchess output</h2></div><span className="subtle-tag">{state.warnings ? `${state.warnings} WARNINGS · ` : ''}{state.book.toUpperCase()}</span></div>
        <pre className="console" ref={log}>{state.log.join('\n')}</pre>
      </section>
    </div>
    <p className="lab-hint wide"><Info size={13} />Anchored to the {list.name} ratings shown, with a paired-opening error allowance. Short time controls and your hardware differ from CCRL, so this is an approximation, not an official rating.</p>
  </>;
}

function TestHistory({ history, engines, attempt, notify, onShare }) {
  if (!history.length) return null;
  const find = brief => engines.find(e => e.id === brief.id) || brief;
  return <section className="lab-panel lab-history">
    <div className="panel-heading"><div><FlaskConical size={17} /><h2>Recent tests</h2><span className="label-chip">{history.length}</span></div></div>
    {history.slice(0, 12).map(item => { const rating = item.testMode === 'gauntlet'; return <div className="lab-history-row" key={item.id}>
      <span className="standing-name"><span className="stacked-badges"><Badge engine={find(item.engines[0])} small /><Badge engine={find(item.engines[1])} small /></span><span><strong>{rating ? <>{item.names[0]} <em>vs</em> {item.opponents.length} anchors</> : <>{item.names[0]} <em>vs</em> {item.names[1]}</>}</strong><small>{item.tc} · {rating ? `STC gauntlet · ${ratingLists[item.list]?.name}` : item.testMode === 'sprt' ? `SPRT [${item.sprt.elo0}, ${item.sprt.elo1}]` : `${item.planned} games`} · {item.book}</small></span></span>
      {rating ? <span className="lab-history-figure"><strong>{formatRating(item.estimate)}</strong><small>{item.estimate?.error ? `±${Math.round(item.estimate.error)} ` : ''}{ratingLists[item.list]?.short}</small></span>
        : <span className="lab-history-figure"><strong>{item.stats ? signed(item.stats.elo, 1) : '—'}</strong><small>{item.stats ? `±${item.stats.error.toFixed(1)} Elo` : ''}</small></span>}
      <span className="lab-history-meta">{item.verdict ? <b className={`verdict-chip ${item.verdict === 'H1' ? 'pass' : 'fail'}`}>{item.verdict === 'H1' ? 'PASSED' : 'FAILED'}</b> : null}{item.games.toLocaleString()} games<small>{new Date(item.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</small></span>
      <span className="lab-history-buttons">{rating && item.estimate && <button className="icon-btn" title="Share rating card" aria-label={`Share rating card for ${item.names[0]}`} onClick={() => onShare(shareModelFor(item, engines))}><Share2 size={15} /></button>}<button className="icon-btn" title="Export PGN" aria-label={`Export games from ${item.names[0]}`} onClick={async () => { if (await attempt(() => api.fastchess.exportPgn(item.id))) notify('Test games exported as PGN.'); }}><ArrowDownToLine size={16} /></button></span>
    </div>; })}
  </section>;
}
