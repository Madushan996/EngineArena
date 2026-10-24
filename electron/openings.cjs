// Opening books for rating gauntlets: a built-in generic book and EPD/PGN suites.
// CCRL allows any generic book of at most 12 moves per side, the same for every engine.
const fs = require('node:fs/promises');
const path = require('node:path');
const { Chess } = require('chess.js');
const MAX_PLIES = 24, MAX_POSITIONS = 250000;
const builtinLines = [
  ['Ruy Lopez, Closed', 'e4 e5 Nf3 Nc6 Bb5 a6 Ba4 Nf6 O-O Be7 Re1 b5 Bb3 d6 c3 O-O'],
  ['Ruy Lopez, Berlin', 'e4 e5 Nf3 Nc6 Bb5 Nf6 O-O Nxe4 d4 Nd6 Bxc6 dxc6 dxe5 Nf5'],
  ['Ruy Lopez, Exchange', 'e4 e5 Nf3 Nc6 Bb5 a6 Bxc6 dxc6 O-O f6 d4 exd4 Nxd4 c5 Nb3 Qxd1 Rxd1'],
  ['Italian, Giuoco Pianissimo', 'e4 e5 Nf3 Nc6 Bc4 Bc5 c3 Nf6 d3 d6 O-O O-O'],
  ['Italian, Two Knights', 'e4 e5 Nf3 Nc6 Bc4 Nf6 d3 Be7 O-O O-O Re1 d6'],
  ['Scotch Game', 'e4 e5 Nf3 Nc6 d4 exd4 Nxd4 Nf6 Nxc6 bxc6 e5 Qe7 Qe2 Nd5 c4'],
  ['Petrov Defence', 'e4 e5 Nf3 Nf6 Nxe5 d6 Nf3 Nxe4 d4 d5 Bd3 Nc6 O-O Be7'],
  ['Four Knights, Spanish', 'e4 e5 Nf3 Nc6 Nc3 Nf6 Bb5 Bb4 O-O O-O d3 d6'],
  ['Vienna Game', 'e4 e5 Nc3 Nf6 f4 d5 fxe5 Nxe4 Nf3 Be7 d4 O-O Bd3 f5'],
  ['Philidor Defence', 'e4 d6 d4 Nf6 Nc3 e5 Nf3 Nbd7 Bc4 Be7 O-O O-O Re1 c6 a4'],
  ['Sicilian, Najdorf', 'e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 a6 Be2 e5 Nb3 Be7 O-O O-O'],
  ['Sicilian, Najdorf English Attack', 'e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 a6 Be3 e5 Nb3 Be6 f3'],
  ['Sicilian, Classical', 'e4 c5 Nf3 Nc6 d4 cxd4 Nxd4 Nf6 Nc3 d6 Bg5 e6 Qd2 a6 O-O-O Bd7'],
  ['Sicilian, Sveshnikov', 'e4 c5 Nf3 Nc6 d4 cxd4 Nxd4 Nf6 Nc3 e5 Ndb5 d6 Bg5 a6 Na3 b5'],
  ['Sicilian, Taimanov', 'e4 c5 Nf3 e6 d4 cxd4 Nxd4 Nc6 Nc3 Qc7 Be2 a6 O-O Nf6'],
  ['Sicilian, Kan', 'e4 c5 Nf3 e6 d4 cxd4 Nxd4 a6 Bd3 Nf6 O-O Qc7 Qe2 d6 c4'],
  ['Sicilian, Dragon', 'e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 g6 Be3 Bg7 f3 O-O Qd2 Nc6'],
  ['Sicilian, Rossolimo', 'e4 c5 Nf3 Nc6 Bb5 g6 O-O Bg7 Re1 Nf6 c3 O-O d4 cxd4 cxd4 d5 e5 Ne4'],
  ['Sicilian, Alapin', 'e4 c5 c3 Nf6 e5 Nd5 d4 cxd4 Nf3 Nc6 cxd4 d6 Bc4 Nb6 Bb5'],
  ['Sicilian, Closed', 'e4 c5 Nc3 Nc6 g3 g6 Bg2 Bg7 d3 d6 f4 e6 Nf3 Nge7 O-O O-O'],
  ['French, Winawer', 'e4 e6 d4 d5 Nc3 Bb4 e5 c5 a3 Bxc3+ bxc3 Ne7 Qg4 O-O'],
  ['French, Classical', 'e4 e6 d4 d5 Nc3 Nf6 Bg5 Be7 e5 Nfd7 Bxe7 Qxe7 f4 O-O Nf3 c5'],
  ['French, Tarrasch', 'e4 e6 d4 d5 Nd2 Nf6 e5 Nfd7 Bd3 c5 c3 Nc6 Ne2 cxd4 cxd4 f6'],
  ['French, Advance', 'e4 e6 d4 d5 e5 c5 c3 Nc6 Nf3 Qb6 a3 c4 Nbd2 Na5'],
  ['Caro-Kann, Classical', 'e4 c6 d4 d5 Nc3 dxe4 Nxe4 Bf5 Ng3 Bg6 h4 h6 Nf3 Nd7 h5 Bh7 Bd3 Bxd3 Qxd3'],
  ['Caro-Kann, Advance', 'e4 c6 d4 d5 e5 Bf5 Nf3 e6 Be2 c5 Be3 Nd7 O-O Ne7'],
  ['Caro-Kann, Panov', 'e4 c6 d4 d5 exd5 cxd5 c4 Nf6 Nc3 e6 Nf3 Bb4 cxd5 Nxd5'],
  ['Caro-Kann, Exchange', 'e4 c6 d4 d5 exd5 cxd5 Bd3 Nc6 c3 Nf6 Bf4 Bg4 Qb3 Qd7 Nd2 e6'],
  ['Pirc Defence', 'e4 d6 d4 Nf6 Nc3 g6 Nf3 Bg7 Be2 O-O O-O c6 a4'],
  ['Alekhine, Modern', 'e4 Nf6 e5 Nd5 d4 d6 Nf3 dxe5 Nxe5 c6 Be2 Bf5 O-O Nd7'],
  ['Scandinavian', 'e4 d5 exd5 Qxd5 Nc3 Qa5 d4 Nf6 Nf3 c6 Bc4 Bf5 Bd2 e6'],
  ["Queen's Gambit Declined", 'd4 d5 c4 e6 Nc3 Nf6 Bg5 Be7 e3 O-O Nf3 h6 Bh4 b6'],
  ['QGD, Exchange', 'd4 d5 c4 e6 Nc3 Nf6 cxd5 exd5 Bg5 c6 Qc2 Be7 e3 Nbd7 Bd3 O-O'],
  ['QGD, Ragozin', 'd4 Nf6 c4 e6 Nf3 d5 Nc3 Bb4 Bg5 h6 Bxf6 Qxf6 e3 O-O Rc1 dxc4 Bxc4 c5'],
  ['Tarrasch Defence', 'd4 d5 c4 e6 Nc3 c5 cxd5 exd5 Nf3 Nc6 g3 Nf6 Bg2 Be7 O-O O-O'],
  ["Queen's Gambit Accepted", 'd4 d5 c4 dxc4 Nf3 Nf6 e3 e6 Bxc4 c5 O-O a6 dxc5 Qxd1 Rxd1 Bxc5'],
  ['Slav Defence', 'd4 d5 c4 c6 Nf3 Nf6 Nc3 dxc4 a4 Bf5 e3 e6 Bxc4 Bb4 O-O O-O'],
  ['Slav, Exchange', 'd4 d5 c4 c6 cxd5 cxd5 Nc3 Nf6 Bf4 Nc6 e3 Bf5 Nf3 e6'],
  ['Semi-Slav, Meran', 'd4 d5 c4 c6 Nf3 Nf6 Nc3 e6 e3 Nbd7 Bd3 dxc4 Bxc4 b5 Bd3 Bb7'],
  ['Nimzo-Indian, Rubinstein', 'd4 Nf6 c4 e6 Nc3 Bb4 e3 O-O Bd3 d5 Nf3 c5 O-O Nc6'],
  ['Nimzo-Indian, Classical', 'd4 Nf6 c4 e6 Nc3 Bb4 Qc2 O-O a3 Bxc3+ Qxc3 b6 Bg5 Bb7'],
  ["Queen's Indian", 'd4 Nf6 c4 e6 Nf3 b6 g3 Ba6 b3 Bb4+ Bd2 Be7 Bg2 c6 Bc3 d5'],
  ['Bogo-Indian', 'd4 Nf6 c4 e6 Nf3 Bb4+ Bd2 Qe7 g3 Nc6 Bg2 Bxd2+ Nbxd2 d6 O-O O-O'],
  ['Catalan, Open', 'd4 Nf6 c4 e6 g3 d5 Bg2 Be7 Nf3 O-O O-O dxc4 Qc2 a6 Qxc4 b5 Qc2 Bb7'],
  ["King's Indian, Classical", 'd4 Nf6 c4 g6 Nc3 Bg7 e4 d6 Nf3 O-O Be2 e5 O-O Nc6 d5 Ne7'],
  ["King's Indian, Sämisch", 'd4 Nf6 c4 g6 Nc3 Bg7 e4 d6 f3 O-O Be3 e5 d5 Nh5 Qd2 f5'],
  ['Grünfeld, Exchange', 'd4 Nf6 c4 g6 Nc3 d5 cxd5 Nxd5 e4 Nxc3 bxc3 Bg7 Nf3 c5 Be3 Qa5 Qd2 O-O'],
  ['Grünfeld, Russian', 'd4 Nf6 c4 g6 Nc3 d5 Nf3 Bg7 Qb3 dxc4 Qxc4 O-O e4 Bg4 Be3 Nfd7'],
  ['Modern Benoni', 'd4 Nf6 c4 c5 d5 e6 Nc3 exd5 cxd5 d6 e4 g6 Nf3 Bg7 Be2 O-O O-O Re8'],
  ['Dutch, Leningrad', 'd4 f5 g3 Nf6 Bg2 g6 Nf3 Bg7 O-O O-O c4 d6 Nc3 Qe8'],
  ['Dutch, Stonewall', 'd4 e6 c4 f5 g3 Nf6 Bg2 d5 Nf3 c6 O-O Bd6 b3 Qe7'],
  ['London System', 'd4 d5 Nf3 Nf6 Bf4 c5 e3 Nc6 c3 Qb6 Qb3 c4 Qc2 Bg4'],
  ['Trompowsky', 'd4 Nf6 Bg5 e6 e4 h6 Bxf6 Qxf6 Nf3 d6 Nc3 g6 Qd2 Bg7'],
  ['English, Symmetrical', 'c4 c5 Nc3 Nc6 g3 g6 Bg2 Bg7 Nf3 e6 O-O Nge7 d3 O-O'],
  ['English, Reversed Sicilian', 'c4 e5 Nc3 Nf6 Nf3 Nc6 g3 d5 cxd5 Nxd5 Bg2 Nb6 O-O Be7'],
  ['English, Four Knights', 'c4 Nf6 Nc3 e5 Nf3 Nc6 e3 Bb4 Qc2 O-O Nd5 Re8'],
  ['English, Agincourt', 'c4 e6 Nc3 d5 d4 Nf6 Nf3 Be7 Bf4 O-O e3 c5 dxc5 Bxc5'],
  ['Réti Opening', 'Nf3 d5 g3 Nf6 Bg2 c6 O-O Bg4 d3 Nbd7 Nbd2 e5 e4'],
  ["King's Indian Attack", 'Nf3 Nf6 g3 g6 Bg2 Bg7 O-O O-O d3 d6 e4 e5 Nc3 Nc6'],
  ["Bird's Opening", 'f4 d5 Nf3 Nf6 e3 g6 Be2 Bg7 O-O O-O d3 c5'],
];
function fromSan(start, sans, maxPlies = MAX_PLIES) {
  const chess = new Chess(start || undefined), moves = [], played = [];
  for (const san of sans.slice(0, maxPlies)) {
    const move = chess.move(san);
    moves.push(move.from + move.to + (move.promotion || '')); played.push(move.san);
  }
  return { fen: start || null, moves, sans: played };
}
const builtinBook = (maxPlies = MAX_PLIES) => builtinLines.map(([name, line]) => ({ name, ...fromSan(null, line.split(' '), maxPlies) }));
function normalizeFen(line) {
  const fields = line.trim().split(/\s+/);
  if (fields.length < 4) return null;
  const clocks = /^\d+$/.test(fields[4] || '') && /^\d+$/.test(fields[5] || '') ? [fields[4], fields[5]] : [
    line.match(/\bhmvc\s+(\d+)/)?.[1] || '0', line.match(/\bfmvn\s+(\d+)/)?.[1] || '1'];
  const fen = [...fields.slice(0, 4), ...clocks].join(' ');
  try { return new Chess(fen).fen(); } catch { return null; }
}
function parseEpd(text) {
  const book = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim() || line.startsWith('#')) continue;
    const fen = normalizeFen(line);
    if (fen) book.push({ name: line.match(/\bid\s+"([^"]+)"/)?.[1] || null, fen, moves: [], sans: [] });
    if (book.length >= MAX_POSITIONS) break;
  }
  return book;
}
function parsePgn(text, maxPlies = MAX_PLIES) {
  const book = [];
  for (const chunk of text.replace(/\r/g, '').split(/\n\s*\n(?=\s*\[)/)) {
    if (!chunk.trim()) continue;
    try {
      const chess = new Chess(); chess.loadPgn(chunk);
      const start = chunk.match(/\[FEN\s+"([^"]+)"\]/)?.[1] || null;
      const name = chunk.match(/\[Opening\s+"([^"]+)"\]/)?.[1] || chunk.match(/\[ECO\s+"([^"]+)"\]/)?.[1] || null;
      book.push({ name, ...fromSan(start, chess.history(), maxPlies) });
    } catch { /* Skip unreadable games; the remaining suite is still usable. */ }
    if (book.length >= MAX_POSITIONS) break;
  }
  return book;
}
async function loadBook(source = { type: 'builtin' }, maxPlies = MAX_PLIES) {
  const plies = Math.max(0, Math.min(MAX_PLIES, Math.floor(maxPlies)));
  if (source.type !== 'file') return builtinBook(plies);
  const text = await fs.readFile(source.path, 'utf8');
  const book = path.extname(source.path).toLowerCase() === '.pgn' ? parsePgn(text, plies) : parseEpd(text);
  if (!book.length) throw new Error(`No usable openings were found in ${path.basename(source.path)}.`);
  return book;
}
// PGN of the built-in book, for fastchess (which needs a file).
const builtinPgn = () => builtinBook().map((line, i) => `[Event "Engine Arena book ${i + 1}"]\n[Opening "${line.name}"]\n\n${line.sans.map((san, j) => (j % 2 ? '' : `${j / 2 + 1}. `) + san).join(' ')} *\n`).join('\n');
module.exports = { builtinBook, builtinPgn, loadBook, parseEpd, parsePgn, MAX_PLIES };
