// Rating statistics shared by the CCRL-style gauntlet and the fastchess quick test.
// Pentanomial Elo, nElo, LOS and the SPRT log-likelihood ratio follow the fishtest/fastchess
// maximum-likelihood formulas, so live numbers match what fastchess itself reports.
const LN10 = Math.log(10), Z95 = 1.959963984540054, NELO_SCALE = 800 / LN10;
const clampScore = s => Math.min(1 - 1e-9, Math.max(1e-9, s));
const scoreToElo = s => -400 * Math.log10(1 / clampScore(s) - 1);
const eloToScore = elo => 1 / (1 + 10 ** (-elo / 400));
const sum = values => values.reduce((a, b) => a + b, 0);
function phi(x) { // Standard normal CDF (Abramowitz–Stegun 7.1.26).
  const t = 1 / (1 + .3275911 * Math.abs(x) / Math.SQRT2);
  const erf = 1 - t * (.254829592 + t * (-.284496736 + t * (1.421413741 + t * (-1.453152027 + t * 1.061405429)))) * Math.exp(-x * x / 2);
  return x >= 0 ? (1 + erf) / 2 : (1 - erf) / 2;
}
function moments(pdf) {
  const mu = sum(pdf.map(([a, p]) => a * p));
  return { mu, variance: sum(pdf.map(([a, p]) => p * (a - mu) ** 2)) };
}
// Solves sum(p * a / (1 + x * a)) = 0 on the interval where every 1 + x * a stays positive.
function secular(pdf) {
  const values = pdf.map(([a]) => a), low = Math.min(...values), high = Math.max(...values);
  if (!(low < 0 && high > 0)) return 0;
  let lo = -1 / high + 1e-12, hi = -1 / low - 1e-12;
  const f = x => sum(pdf.map(([a, p]) => p * a / (1 + x * a)));
  for (let i = 0; i < 200; i++) { const mid = (lo + hi) / 2; if (f(mid) > 0) lo = mid; else hi = mid; }
  return (lo + hi) / 2;
}
function mleExpected(pdf, s) {
  const shifted = pdf.map(([a, p]) => [a - s, p]), x = secular(shifted);
  return pdf.map(([a, p]) => [a, p / (1 + x * (a - s))]);
}
function mleTValue(pdf, ref, t) {
  let mle = pdf.map(([a]) => [a, 1 / pdf.length]);
  for (let i = 0; i < 10; i++) {
    const previous = mle, { mu, variance } = moments(mle), sigma = Math.sqrt(variance);
    const shifted = pdf.map(([a, p]) => [a - ref - t * sigma * (1 + ((mu - a) / sigma) ** 2) / 2, p]);
    const x = secular(shifted);
    mle = pdf.map(([a, p], j) => [a, p / (1 + x * shifted[j][0])]);
    if (Math.max(...mle.map(([, p], j) => Math.abs(p - previous[j][1]))) < 1e-9) break;
  }
  return mle;
}
// counts: [LL, LD, DD+WL, WD, WW] pairs (pentanomial) or [L, D, W] games (trinomial).
function llr(counts, { elo0, elo1, model = 'normalized' }) {
  const regularized = counts.map(c => c || 1e-3), total = sum(regularized);
  if (sum(counts) === 0) return 0;
  const step = 1 / (counts.length - 1);
  const pdf = regularized.map((c, i) => [i * step, c / total]);
  let pdf0, pdf1;
  if (model === 'normalized') {
    const scale = counts.length === 5 ? Math.SQRT2 : 1;
    pdf0 = mleTValue(pdf, .5, elo0 / NELO_SCALE * scale); pdf1 = mleTValue(pdf, .5, elo1 / NELO_SCALE * scale);
  } else {
    pdf0 = mleExpected(pdf, eloToScore(elo0)); pdf1 = mleExpected(pdf, eloToScore(elo1));
  }
  return total * sum(pdf.map(([, p], i) => p * Math.log(pdf1[i][1] / pdf0[i][1])));
}
const sprtBounds = ({ alpha = .05, beta = .05 } = {}) => ({ lower: Math.log(beta / (1 - alpha)), upper: Math.log((1 - beta) / alpha) });
// Head-to-head statistics from a pentanomial, as printed by fastchess.
function pentanomialStats(ptnml, sprt) {
  const pairs = sum(ptnml);
  if (!pairs) return null;
  const pdf = ptnml.map((c, i) => [i / 4, c / pairs]), { mu, variance } = moments(pdf);
  const stderr = Math.sqrt(variance / pairs);
  const low = scoreToElo(mu - Z95 * stderr), high = scoreToElo(mu + Z95 * stderr);
  const result = {
    pairs, score: mu, elo: scoreToElo(mu), error: (high - low) / 2,
    nElo: variance > 0 ? (mu - .5) / Math.sqrt(2 * variance) * NELO_SCALE : null,
    nEloError: Z95 * NELO_SCALE / Math.sqrt(2 * pairs),
    los: stderr > 0 ? phi((mu - .5) / stderr) : mu > .5 ? 1 : mu < .5 ? 0 : .5,
  };
  if (sprt) Object.assign(result, { llr: llr(ptnml, sprt), ...sprtBounds(sprt) });
  return result;
}
/**
 * Anchored performance rating. games: [{ rating, score, group }] where score is the tested
 * engine's result (1, ½, 0) and games sharing a group (an opening pair) are treated as one
 * correlated sample for the error estimate.
 */
function performanceRating(games) {
  if (!games.length) return null;
  const n = games.length, points = sum(games.map(g => g.score));
  const ratings = games.map(g => g.rating);
  let bound = null, target = points;
  if (points <= 0) { bound = 'below'; target = .5; } else if (points >= n) { bound = 'above'; target = n - .5; }
  const expectedTotal = r => sum(ratings.map(a => eloToScore(r - a)));
  let lo = Math.min(...ratings) - 2000, hi = Math.max(...ratings) + 2000;
  for (let i = 0; i < 100; i++) { const mid = (lo + hi) / 2; if (expectedTotal(mid) < target) lo = mid; else hi = mid; }
  const elo = (lo + hi) / 2;
  const groups = new Map();
  for (const g of games) {
    const key = g.group ?? Symbol(), entry = groups.get(key) || { actual: 0, expected: 0 };
    entry.actual += g.score; entry.expected += eloToScore(elo - g.rating); groups.set(key, entry);
  }
  const variance = sum([...groups.values()].map(g => (g.actual - g.expected) ** 2));
  const slope = sum(ratings.map(a => { const p = eloToScore(elo - a); return p * (1 - p); })) * LN10 / 400;
  const error = slope > 0 ? Z95 * Math.sqrt(variance) / slope : null;
  return { elo, error, low: error === null ? null : elo - error, high: error === null ? null : elo + error, games: n, points, score: points / n, bound };
}
module.exports = { scoreToElo, eloToScore, llr, sprtBounds, pentanomialStats, performanceRating, phi };
