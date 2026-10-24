import React from 'react';
import { Chess } from 'chess.js';
import ClassicalPiece from './Pieces.jsx';

export default function Chessboard({ fen, flipped, lastMove, theme = 'walnut', pieceStyle = 'staunton' }) {
  const chess = new Chess(fen), squares = chess.board().flat();
  const arranged = flipped ? [...squares].reverse() : squares;
  const files = flipped ? 'hgfedcba' : 'abcdefgh';
  const checked = chess.isCheck() ? squares.find(p => p?.type === 'k' && p.color === chess.turn())?.square : null;
  return <div className={`board theme-${theme}`} data-board-theme={theme} role="img" aria-label={`Chessboard, ${chess.turn() === 'w' ? 'White' : 'Black'} to move`}>
    {arranged.map((piece, index) => {
      const r = Math.floor(index / 8), f = index % 8;
      const square = files[f] + (flipped ? r + 1 : 8 - r);
      return <div key={square} className={`square ${(r + f) % 2 ? 'dark' : 'light'} ${lastMove?.includes(square) ? 'last-move' : ''} ${checked === square ? 'in-check' : ''}`}>
        {f === 0 && <span className="rank-label">{flipped ? r + 1 : 8 - r}</span>}
        {r === 7 && <span className="file-label">{files[f]}</span>}
        {piece && <ClassicalPiece type={piece.type} color={piece.color} style={pieceStyle} />}
      </div>;
    })}
  </div>;
}
