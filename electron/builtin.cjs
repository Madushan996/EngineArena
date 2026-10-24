// Small, local UCI engines supplied for trying the arena. Not Stockfish strength.
const { Chess } = require('chess.js');
const readline = require('node:readline');
const board = new Chess();
const variant = process.argv[2] || 'atlas';
const values = { p: 100, n: 320, b: 335, r: 500, q: 900, k: 0 };
let nodes = 0, deadline = 0;
function evaluate() {
  if (board.isCheckmate()) return board.turn() === 'w' ? -100000 : 100000;
  if (board.isDraw()) return 0;
  let score = 0;
  const squares = board.board();
  for (let r = 0; r < 8; r++) for (let f = 0; f < 8; f++) {
    const p = squares[r][f];
    if (!p) continue;
    const center = 7 - Math.abs(3.5 - f) - Math.abs(3.5 - r);
    const progress = p.color === 'w' ? 6 - r : r - 1;
    score += (p.color === 'w' ? 1 : -1) * (values[p.type] + (p.type === 'p' ? progress * 9 : center * (variant === 'volt' ? 8 : 6)));
  }
  return score;
}
function search(depth, alpha, beta) {
  nodes++;
  if (!depth || board.isGameOver() || Date.now() > deadline) return evaluate() * (board.turn() === 'w' ? 1 : -1);
  let best = -Infinity;
  const moves = board.moves({ verbose: true }).sort((a, b) => (values[b.captured] || 0) - (values[a.captured] || 0));
  for (const move of moves) {
    board.move(move); const score = -search(depth - 1, -beta, -alpha); board.undo();
    best = Math.max(best, score); alpha = Math.max(alpha, score);
    if (alpha >= beta || Date.now() > deadline) break;
  }
  return best;
}
readline.createInterface({ input: process.stdin }).on('line', line => {
  if (line === 'uci') console.log(`id name ${variant === 'volt' ? 'Volt' : 'Atlas'}\nid author Engine Arena\noption name Threads type spin default 1 min 1 max 1\noption name Hash type spin default 64 min 1 max 1024\nuciok`);
  else if (line === 'isready') console.log('readyok');
  else if (line === 'ucinewgame') board.reset();
  else if (line.startsWith('position startpos')) {
    board.reset(); const moves = line.split(' moves ')[1];
    if (moves) for (const move of moves.split(' ')) board.move({ from: move.slice(0, 2), to: move.slice(2, 4), promotion: move[4] });
  } else if (line.startsWith('go ')) {
    const start = Date.now(); nodes = 0;
    const remaining = Number(line.match(new RegExp(`${board.turn()}time (\\d+)`))?.[1] || 1000);
    deadline = start + Math.min(350, Math.max(10, remaining / 35));
    const moves = board.moves({ verbose: true });
    let best = moves[0], bestScore = -Infinity;
    for (const move of moves) {
      board.move(move); const score = -search(1, -Infinity, Infinity); board.undo();
      if (score > bestScore) { best = move; bestScore = score; }
      if (Date.now() > deadline) break;
    }
    console.log(`info depth 2 nodes ${nodes} nps ${Math.round(nodes * 1000 / Math.max(1, Date.now() - start))} score cp ${Number.isFinite(bestScore) ? Math.round(bestScore) : 0}`);
    console.log(`bestmove ${best ? best.from + best.to + (best.promotion || '') : '0000'}`);
  } else if (line === 'quit') process.exit(0);
});
