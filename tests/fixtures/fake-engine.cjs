const readline = require('node:readline');
const { Chess } = require('chess.js');
const chess = new Chess();
const mode = process.argv[2] || 'legal';
readline.createInterface({ input: process.stdin }).on('line', line => {
  if (line === 'uci') console.log('id name TestEngine\nuciok');
  else if (line === 'isready') console.log('readyok');
  else if (line.startsWith('position startpos')) {
    chess.reset();
    for (const move of (line.split(' moves ')[1] || '').split(' ').filter(Boolean)) chess.move({ from: move.slice(0, 2), to: move.slice(2, 4), promotion: move[4] });
  } else if (line.startsWith('go ')) {
    if (mode === 'hang') return;
    if (mode === 'crash') process.exit(3);
    if (mode === 'illegal') return console.log('bestmove e2e5');
    const move = chess.moves({ verbose: true })[0];
    console.log(`bestmove ${move.from}${move.to}${move.promotion || ''}`);
  } else if (line === 'quit') process.exit(0);
});
