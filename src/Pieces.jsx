import React, { useId } from 'react';
import CburnettPiece from './CburnettPieces.jsx';

const original = {
  p: <><circle cx="22.5" cy="12" r="5.5" /><path d="M18 17c-1 3-1 7-3 10l-2 4h19l-2-4c-2-3-2-7-3-10Z" /><path d="M12 32h21v5H12z" /></>,
  r: <><path d="M11 8h5v5h4V8h5v5h4V8h5v10l-5 4v8H16v-8l-5-4Z" /><path d="M14 30h17v3H14zM11 33h23v5H11z" /><path d="M16 18h13" /></>,
  n: <><path d="M12 33c0-8 5-13 13-16l-8 2-7 4-3-4 6-9 7-1 4-6 1 7c9 2 12 11 9 23Z" /><path d="m13 12 5 3M11 33h24v5H11z" /><circle cx="20" cy="13" r="1" /><path d="M29 14c4 5 3 11 0 15" fill="none" /></>,
  b: <><path d="M23 5c-4 4-9 7-9 13 0 4 4 7 9 7s9-3 9-7c0-6-5-9-9-13Z" /><path d="m24 10-5 7M19 25l-3 7h14l-3-7M12 33h22v5H12z" /></>,
  q: <><path d="m10 13 5 18h16l5-18-8 8-5-12-5 12Z" /><circle cx="9" cy="11" r="2.5" /><circle cx="23" cy="7" r="2.5" /><circle cx="37" cy="11" r="2.5" /><path d="M14 31h18v3H14zM11 34h24v4H11z" /></>,
  k: <><path d="M23 3v10M19 7h8" fill="none" strokeWidth="2.5" /><path d="M23 15c-4-8-14-4-12 3l6 12h12l6-12c2-7-8-11-12-3Z" /><path d="M16 30h14v4H16zM12 34h22v4H12z" /><path d="M23 15v9" fill="none" /></>,
};
const plinth = <><path d="M14 32h17l3 4H11z" /><path d="M10 36h25v4H10z" /><path d="M13 37.5h19" fill="none" opacity=".45" /></>;
const staunton = {
  p: <><circle cx="22.5" cy="11" r="5.4" /><path d="M17 17h11v3H17z" /><path d="M19 20h7c-1 5 1 8 4 12H15c3-4 5-7 4-12Z" />{plinth}</>,
  r: <><path d="M11 7h5v5h4V7h5v5h4V7h5v11H11Z" /><path d="M12 18h21v3H12zM17 21h11v9H17zM15 30h15v3H15z" /><path d="M17 23h11" fill="none" opacity=".5" />{plinth}</>,
  n: <><path d="M12 32c0-9 4-13 12-16l-6 1-7 5-3-4 7-9 5-1 5-5 1 7c9 2 11 12 7 22Z" /><path d="m16 11 3 3M29 14c4 4 3 10 0 14" fill="none" /><circle cx="22" cy="13" r="1.25" className="piece-eye" /><path d="m10 19 3-1" fill="none" />{plinth}</>,
  b: <><circle cx="22.5" cy="5.5" r="2.4" /><path d="M22.5 8c-5 3-9 7-9 12 0 3 4 5 9 5s9-2 9-5c0-5-4-9-9-12Z" /><path d="m25 12-6 7" fill="none" strokeWidth="1.8" /><path d="M18 25h9v3h-9zM19 28h7l4 5H15z" />{plinth}</>,
  q: <><path d="m9 13 6 13h15l6-13-8 8-5.5-12L17 21Z" /><circle cx="8" cy="11" r="2.3" /><circle cx="15" cy="8.5" r="2" /><circle cx="22.5" cy="6" r="2.5" /><circle cx="30" cy="8.5" r="2" /><circle cx="37" cy="11" r="2.3" /><path d="M15 26h15v3H15zM18 29h9l3 4H15z" />{plinth}</>,
  k: <><path d="M22.5 3v10M18.5 7h8" fill="none" strokeWidth="2.7" /><path d="M22.5 16c-5-8-14-3-11 4l5 7h12l5-7c3-7-6-12-10.5-4Z" /><path d="M16 27h13v3H16zM18 30h9l3 3H15z" /><path d="M22.5 16v8" fill="none" />{plinth}</>,
};
const turnedBase = <><ellipse cx="22.5" cy="33" rx="10" ry="2" /><path d="M14 33c1 2-2 3-3 4v2h23v-2c-1-1-4-2-3-4" /><ellipse cx="22.5" cy="39" rx="11.5" ry="2" /><path d="M15 36h15" fill="none" opacity=".5" /></>;
const heirloom = {
  p: <><circle cx="22.5" cy="10.5" r="5" /><ellipse cx="22.5" cy="17" rx="6" ry="2" /><path d="M20 19h5c-1 5 0 8 4 13H16c4-5 5-8 4-13Z" />{turnedBase}</>,
  r: <><path d="M12 7h5v5h3V7h5v5h3V7h5v11l-4 3H16l-4-3Z" /><ellipse cx="22.5" cy="21" rx="7" ry="1.7" /><path d="M18 23h9v7l3 3H15l3-3Z" /><path d="M21 24v5" fill="none" opacity=".3" />{turnedBase}</>,
  n: <><path d="M13 33c-1-7 2-12 10-16l-5 1-5 4-5-4 7-9 7-2 3-4 1 7c8 4 12 10 8 23Z" /><path d="M25 11c5 4 7 10 3 17M29 13l3-1M31 17l3-1M32 21h3M31 25l3 1M17 11l2 3" fill="none" /><circle cx="22" cy="13" r="1.15" className="piece-eye" />{turnedBase}</>,
  b: <><circle cx="22.5" cy="5" r="2" /><path d="M22.5 7c-5 5-8 9-8 13 0 3 3 5 8 5s8-2 8-5c0-4-3-8-8-13Z" /><path d="m25 12-6 8" fill="none" strokeWidth="1.8" /><ellipse cx="22.5" cy="26" rx="6.5" ry="1.7" /><path d="M20 28h5l4 5H16z" />{turnedBase}</>,
  q: <><path d="m10 12 5 12h15l5-12-7 6-5.5-10L17 18Z" /><circle cx="9" cy="10" r="2" /><circle cx="22.5" cy="6" r="2.5" /><circle cx="36" cy="10" r="2" /><ellipse cx="22.5" cy="25" rx="8" ry="2" /><path d="M18 27h9c-1 2 0 4 3 6H15c3-2 4-4 3-6Z" /><path d="M20 28v3M25 28v3" fill="none" opacity=".4" />{turnedBase}</>,
  k: <><path d="M22.5 2.5v10M18.5 6.5h8" fill="none" strokeWidth="2.5" /><path d="M22.5 15c-4-7-12-3-10 3l4 7h13l4-7c2-6-6-10-10.5-3Z" /><path d="M22.5 15v7" fill="none" /><ellipse cx="22.5" cy="26" rx="8" ry="2" /><path d="M19 28h7l4 5H15z" />{turnedBase}</>,
};
export default function Piece({ type, color, style = 'cburnett' }) {
  const id = useId().replace(/:/g, '');
  if (style === 'cburnett') return <CburnettPiece type={type} color={color} />;
  const light = color === 'w', wood = style === 'heirloom';
  const palette = light ? wood ? ['#fff0c7', '#dfbb7e', '#b88a4e'] : ['#fffdf4', '#e9dcc1', '#c7af8c'] : wood ? ['#825839', '#452b1c', '#25170f'] : ['#57534b', '#262520', '#12130f'];
  const stroke = light ? '#66513a' : '#bca57d';
  return <svg className={`chess-piece piece-${style} ${light ? 'white-piece' : 'black-piece'}`} data-piece-style={style} viewBox="0 0 45 45" aria-hidden="true">
    <defs><linearGradient id={id} x1="0" x2="1" y1="0" y2=".35"><stop offset="0" stopColor={palette[2]} /><stop offset=".32" stopColor={palette[0]} /><stop offset=".65" stopColor={palette[1]} /><stop offset="1" stopColor={palette[2]} /></linearGradient></defs>
    <g fill={style === 'arena' ? light ? '#f4f0e8' : '#23302c' : `url(#${id})`} stroke={stroke} strokeWidth={style === 'arena' ? '1.3' : '1.05'} strokeLinecap="round" strokeLinejoin="round" style={{ '--eye': light ? '#493621' : '#ebd9aa' }}>{({ arena: original, staunton, heirloom }[style] || staunton)[type]}</g>
  </svg>;
}
