# Engine Arena

A Windows desktop battleground for UCI chess engines. Built with Electron, React, and chess.js. The dark arena includes a live board, engine logos, clocks, move history, search telemetry, and final match scores.

## Open the app

Double-click `release/Engine-Arena-1.5.1.exe`. This is a portable application; no separate Node installation is needed. If Windows shows a publisher prompt, the build is unsigned.

1. Click **Load engine** and select one or more UCI-compatible `.exe` files. The app starts it briefly to verify UCI support and read its name and author. Executables run with your user permissions, so use engines you trust.
2. Choose two different engines, a game count, minutes per engine, and an optional increment in seconds. For ten one-minute games, select **10 games**, **1 min**, **0 sec**.
3. Click **Start battle**. Colors alternate after each game. A win earns 1 point; a draw earns ½ point for each engine.
4. Watch the board, clocks, moves, and engine analysis. Pause takes effect after the current search finishes; that search continues to consume its clock. Stopping discards the current game and saves completed games.
5. The final score appears with both engines' logos. Review any completed game and export all completed games to a PGN file.

In **Engine library**, use the engine's three-dot button to rename it, upload a PNG/JPG/WebP logo (up to 5 MB), or remove an imported engine from the library. Removing an engine leaves its executable untouched. Threads and hash memory can be set in **Preferences**. Only options supported by an engine take effect.

Atlas and Volt are included lightweight UCI engines for trying the app. They are not competitive substitutes for Stockfish or other strong engines. Engines that need additional files (for example neural-network weights) should be kept with those files in their normal directory; the app uses that directory as the engine's working directory. Engines that require custom command-line arguments or custom UCI options are not configured by this version.

## Rating gauntlet (CCRL-style estimates)

Open **Rating gauntlet** to estimate an engine's rating on the CCRL scale. Your engine plays every selected *anchor* engine, and its performance is solved against the anchors' published ratings.

1. Load the anchor engines in the **Engine library**. In each engine's three-dot menu (or directly in the gauntlet's opponent table), enter its **CCRL Blitz** and/or **CCRL 40/15** rating. Ratings are saved with the engine. Use the rating of the exact version and build you load.
2. Choose the engine under test and a time control:
   - **Short blitz** — 1 min + 1 sec, measured against CCRL Blitz ratings
   - **Long blitz** — 4 min + 2 sec, measured against CCRL Blitz ratings
   - **Classical** — 12 min + 8 sec, measured against CCRL 40/15 ratings
3. Tick the opponents, set games per opponent and parallel games, and click **Start gauntlet**.

CCRL testing conditions are applied: one thread per engine, ponder off, 128 or 256 MB hash for Blitz and 256 or 512 MB for 40/15 (256 MB by default), and a generic opening book of at most 12 moves per side, identical for all engines. Use the built-in 60-line book, or load your own EPD/PGN suite (for example UHO or 8moves); PGN lines are cut to 12 moves per side. Every opening is played twice with colours reversed against the same opponent, and opponents are interleaved so the estimate uses every anchor from the start. Optional: a Syzygy folder (sent to engines that support `SyzygyPath`) and adjudication (resign when both engines see ±10 pawns for 4 moves each; draw after move 40 when both stay within ±0.10 for 8 moves each).

While it runs, the page shows the live estimate with a 95% interval, every running board with engine logos, CCRL ratings (the tested engine shows its current estimate), clocks, depth and evaluation, the standings and performance against each anchor, and recent results. Completed games are written to a PGN as they finish; export it from the result screen or from **Past gauntlets**. The final estimate is saved on the engine card.

The rating is the value R where the sum of expected scores against the anchors equals the points scored. The interval treats each colour-reversed opening pair as one sample. It excludes anchor uncertainty and differences between your hardware and CCRL's, so it is an approximation, not an official rating. For a useful interval, plan several hundred games across four or more anchors rated near your engine.

## Anchor engines and CCRL ratings

Engine Arena knows the published CCRL ratings of 22 anchor engines between 3200 and 3800 (CCRL Blitz and CCRL 40/15, single-CPU entries, lists computed on 3 October 2026). In **Engine library**, click **Import anchors** and choose the folders that hold your engines. Only executables whose file name mentions a known anchor are started; each is identified by the name it reports over UCI, so a file named `patricia_v3.exe` that reports *Patricia 5.0* gets Patricia 5.0's ratings. Anchors added with **Load engine** are rated automatically too.

| Anchor | CCRL Blitz | CCRL 40/15 |
|---|---|---|
| Stockfish 8 | — | 3358 |
| Monolith 3 | 3258 | 3233 |
| Weiss 2.0 | 3319 | 3263 |
| Sturddle 2.6.0 | 3342 | 3316 |
| Vajolet2 3.2 | 3404 | 3337 |
| Avalanche 3.0.0 | 3417 | 3347 |
| Sable 3.0.0 | 3453 | 3382 |
| Fire 9 | 3482 | 3434 |
| Tucano 12.00 | 3491 | 3433 |
| Yukari 2025.11.1 | 3539 | 3451 |
| Patricia 5.0 | 3539 | 3459 |
| Winter 5.0 | 3544 | 3466 |
| Gyatso 1.6.0 | 3568 | — |
| Lizard 11.2 | 3694 | 3569 |
| Motor 0.9.0 | 3695 | 3571 |
| Quanticade Cronus 3.0 | 3717 | 3588 |
| Halogen 16.0.0 | 3721 | 3593 |
| Astra 7.0 | 3731 | 3594 |
| Stormphrax 8.0.0 | 3745 | 3608 |
| Reckless 0.9.0 | 3766 | 3622 |
| PlentyChess 8.0.0 | 3774 | 3617 |
| Stockfish 19 | 3792 | 3629 |

Stockfish 8 has no CCRL Blitz entry and Gyatso 1.6.0 has no 40/15 entry, so they serve as anchors on one list only. Every anchor was checked locally; two were dropped: the common Kociolek 2.1 download lacks its network file and played about 600 Elo below its rating, and Mantissa 3.7.2 scored about 80 Elo below its Blitz rating at short time controls. Import explains this if it finds them. Tucano 12.00 needs `tucano_nn03.bin` next to its executable. If an engine prints a startup error while loading (for example a missing network file), its library card shows a warning and Import anchors skips it. Use builds your CPU supports: x86-64-v4 or AVX-512 builds exit immediately on CPUs without those instructions. Engines that refuse increment-free time controls unless `EnableWeirdTCs` is set (Stormphrax) get that option automatically.

## Quick test (fastchess)

Open **Quick test** to measure small strength differences between two builds with [fastchess](https://github.com/Disservin/fastchess). Engine Arena uses `fastchess.exe` from your PATH, or click **Locate fastchess.exe** once. fastchess is not bundled.

Choose the new (dev) and reference (base) engines, a short time control (Hyper 5+0.05, STC 8+0.08, Fishtest STC 10+0.1, LTC 60+0.6, or custom seconds+increment), hash, threads, concurrency, and an opening suite. Choose an SPRT preset — **Gainer** [0, 5], **Big gain** [0, 10], **Non-regression** [−5, 0] — or edit elo0/elo1, α/β and the Elo model (normalized or logistic). **Fixed games** plays a set number of games instead.

The live view shows the Elo difference with its 95% error, normalized Elo, LOS, the LLR moving between its H0 and H1 bounds, the pentanomial distribution of opening pairs, W/D/L, speed, and fastchess's own output. The statistics are computed from each finished pair with the same formulas fastchess uses, and match its reports. fastchess stops as soon as the SPRT decides. Results and PGNs are kept under **Recent tests**. Built-in demo engines cannot be used here.

**Rating estimate (STC gauntlet).** Switch the Quick test to *Rating estimate · STC gauntlet* to estimate a rating in minutes instead of hours. Pick the engine to rate, a list (CCRL Blitz or 40/15), anchors and games per anchor, and a short time control. fastchess plays a gauntlet with colour-reversed opening pairs. The page shows the anchored estimate with its 95% interval updating after every game, a chart of the estimate converging with the anchors drawn as dashed lines, standings with the performance against each anchor, and fastchess's output. The last STC estimate is saved on the engine card. Very short games can stretch or compress rating gaps compared with CCRL's longer games, so confirm important numbers with a CCRL-style gauntlet.

## Share a rating card

After a rating gauntlet or an STC rating estimate (or later, from **Past gauntlets** / **Recent tests**), click **Share rating**. The card is drawn in a gothic black-notebook style: the engine's name hand-written in red ink with its author and logo, the estimated rating and its ± margin and 95% interval, the result written as numbered rules (games, time control, anchors, score, W/D/L), and the strongest anchors it faced with its score against each. Choose **Instagram post · 4:5** (1080 × 1350), **Square post · 1:1** (1080 × 1080, Instagram grid and WhatsApp chats), or **Story / Status · 9:16** (1080 × 1920, Instagram Stories and WhatsApp Status, with text kept clear of the top and bottom bars), then save as PNG or JPG. The design is an original homage to a gothic notebook aesthetic and uses fonts that ship with Windows and Office (Old English Text MT, Ink Free, Palatino); other fonts are substituted if those are missing.

Only one job — a battle, a gauntlet, or a quick test — runs at a time, so tests don't compete for the CPU. Keep parallel games at or below your physical core count and leave the computer otherwise idle.

## Board themes, pieces and audio

Open **Preferences → Appearance** (or the palette button above the board). Choose the **Lichess** brown board, the **Chess.com** green board, **Walnut**, **Mahogany**, **Marble**, or the original **Arena** board. Mix these with the **Lichess** (cburnett) pieces, **Staunton** ivory/ebony pieces, **Heirloom** carved wood pieces, or the original **Arena** pieces. The default look is the Lichess board with Lichess pieces, and version 1.4 switches existing installations to it once; you can switch back at any time. Changes apply immediately, including during a match, and are saved automatically. The Lichess pieces are Colin M.L. Burnett's cburnett set, used under its BSD licence option. Chess.com's own piece sets are proprietary, so only its board colours are reproduced.

In **Preferences → Audio**, enable or mute chess sounds, choose which move/capture/check/result cues play, adjust their volume, and use **Preview sounds**. The speaker button above the board toggles chess sounds independently of music.

Background music has its own play/pause switch, volume, and soundtrack selector. **Midnight Gambit** is an original 96-second piano nocturne in C minor, at 80 BPM. Its 32 bars include a varied reprise and a returning dominant; piano resonance and room tails wrap seamlessly across the boundary rather than fading out. The stereo WAV is bundled for offline playback and available separately at `public/audio/midnight-gambit.wav`. It was composed and rendered locally, not recorded on OnlinePianist. New installations select it by default; existing music selections are preserved. **Quiet study** is the original gentle piano pattern; **Grand hall** uses slow synthesized strings. All three loop locally without streaming. Choose **your own music** to import an MP3, WAV, OGG, FLAC, or another supported audio file up to 50 MB. Playback support depends on the codec; the app verifies the file before saving it. The imported audio is saved in the app's local IndexedDB library and loops until paused. It is never uploaded. Music is off by default; restored music starts after your first interaction if the audio system requires a gesture. The music-note button above the board is a quick play/pause control.

Board, piece, and audio preferences are saved in the desktop renderer's local storage. Sound cues and the earlier built-in music are generated using Web Audio; Midnight Gambit is rendered from our original score with a deterministic additive piano synthesizer. There are no third-party samples, music recordings, or streaming services. These interface preferences are separate from UCI match configuration. `npm run render:music` reproduces the WAV and its audio-quality metadata from `scripts/render-music.cjs`.

## Share a result image

After a match, click **Share result image** on the final score screen, or **Share result** on the scoreboard. Select **Square** (1080 × 1080), **Portrait** (1080 × 1350), or **Status / Story** (1080 × 1920). The preview includes engine logos and names, scores, win/draw/loss totals, games played, the match's original time control, and date. Long engine names are fitted to the card. Missing or unreadable logos use a built-in emblem or initial.

Click **Download result image**, choose a destination, and save as PNG or JPG. Attach the saved image in WhatsApp or Facebook yourself; the app does not sign in, upload anything, or post automatically. PNG retains the sharpest text. You can also open a saved match from **Match history** and share it from its scoreboard. Stopped matches export completed games only and are clearly marked as partial results. Browser-preview exports are labeled as demo results and download as PNG. No executable paths or private engine resource settings are included in the image.

## Match rules

Every game starts from the standard initial position. Checkmate, stalemate, insufficient material, the fifty-move rule, and threefold repetition are detected by chess.js. Repetition and fifty-move draws are automatically claimed. Time expiration, illegal moves, and an engine crash lose the game; startup/handshake failure stops the match with an error. A safety draw applies after 400 full moves. There is no evaluation-based adjudication, opening book, or pondering. Both engines use the same requested threads and hash allocation.

Match history retains the most recent 100 matches with completed games. Executable paths, logo data, and history are saved in `arena.json` in Electron's local `userData` directory beneath `%APPDATA%`. Match history saves game scores and PGNs; it does not retain every intermediate board clock or search event. You can export PGNs for long-term storage.

## Develop

Requires Node.js 22 or later and npm.

```powershell
npm install
npm run desktop
```

Other commands:

```powershell
npm run build       # Build the interface
npm start           # Open the built desktop app
npm test            # Real UCI subprocess and match lifecycle tests
npm run package     # Build the portable Windows executable
```

`npm test` includes the gauntlet, opening-book, statistics and fastchess-parser tests. The statistics are checked against fastchess 1.8.2 reports. To include a real fastchess run, set `FASTCHESS_PATH` and `UCI_ENGINE_PATH` first. `scripts/lab-smoke.cjs` drives a real gauntlet and quick test through the desktop UI and saves screenshots. It needs `ENGINE_SUBJECT`, `ENGINE_ANCHOR_A`, `ANCHOR_A_RATING`, `ENGINE_ANCHOR_B`, `ANCHOR_B_RATING` and `FASTCHESS_PATH`; run it with `node scripts/launch.cjs scripts/lab-smoke.cjs`.

`npm run dev` provides a browser preview at `http://127.0.0.1:5173`. It uses legal-move demo opponents and explicitly identifies itself as a preview. Browsers cannot launch native UCI engines; real engine loading requires the desktop app.

For native end-to-end verification after building, run `npm run test:native`. It uses an isolated app-data directory under `artifacts/`, runs a real two-game UCI match, checks the preload bridge, scores, history, PGN saving, logos, and renaming, and saves three screenshots. Close other test instances first. Do not ship the artifacts folder.

## Implementation

- `electron/uci.cjs`: UCI handshake, process transport, bounded responses, readiness and best-move timeouts, cleanup.
- `electron/match.cjs`: main-process match orchestration and authoritative clocks, legal moves, scorekeeping, PGN generation.
- `electron/gauntlet.cjs`: parallel CCRL-style gauntlet with colour-reversed opening pairs, adjudication, live anchored rating.
- `electron/rating.cjs`: anchored performance rating, pentanomial Elo/nElo/LOS, and the SPRT log-likelihood ratio (fishtest/fastchess method).
- `electron/openings.cjs`: built-in generic book and EPD/PGN opening suites.
- `electron/fastchess.cjs`: fastchess command line, output parsing, process-tree shutdown.
- `electron/main.cjs` and `electron/preload.cjs`: native dialogs, local persistence, restricted IPC bridge. The renderer has no Node access.
- `src/`: React arena, rating gauntlet (`GauntletView.jsx`), quick test (`QuickTestView.jsx`), engine library, saved matches, custom vector chess pieces, browser demo.

Protocol and library references: [Stockfish UCI documentation](https://official-stockfish.github.io/docs/stockfish-wiki/UCI-%26-Commands.html), [Electron context isolation](https://www.electronjs.org/docs/latest/tutorial/context-isolation), [chess.js](https://github.com/jhlywa/chess.js), [CCRL Blitz conditions](https://computerchess.org.uk/404/about.html), [CCRL 40/15 conditions](https://computerchess.org.uk/4040/about.html), [fastchess](https://github.com/Disservin/fastchess).
