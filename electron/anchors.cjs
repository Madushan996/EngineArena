// Anchor engines with their published CCRL ratings (CCRL Blitz and CCRL 40/15 single-CPU entries,
// both lists computed on 3 October 2026). Engines are matched by the name they report over UCI.
const fs = require('node:fs/promises');
const path = require('node:path');
const LIST_DATE = '2026-10-03';
const anchors = [
  { name: 'Stockfish 8', ccrl: 'Stockfish 8 64-bit', blitz: 3421, classical: 3358, match: /^stockfish 8\b/ },
  { name: 'Monolith 3', ccrl: 'Monolith 3 64-bit', blitz: 3258, classical: 3233, match: /^monolith 3(\.0)?\b/ },
  { name: 'Weiss 2.0', ccrl: 'Weiss 2.0 64-bit', blitz: 3319, classical: 3263, match: /^weiss 2\.0\b/ },
  { name: 'Sturddle 2.6.0', ccrl: 'Sturddle 2.6.0 64-bit', blitz: 3342, classical: 3316, match: /^sturddle 2\.6\.0\b/ },
  { name: 'Vajolet2 3.2', ccrl: 'Vajolet2 3.2 64-bit', blitz: 3404, classical: 3337, match: /^vajolet2 3\.2\b/ },
  { name: 'Avalanche 3.0.0', ccrl: 'Avalanche 3.0.0 64-bit', blitz: 3417, classical: 3347, match: /^avalanche 3\.0\.0\b/ },
  { name: 'Sable 3.0.0', ccrl: 'Sable 3.0.0 64-bit', blitz: 3453, classical: 3382, match: /^sable 3\.0\.0\b/ },
  { name: 'Fire 9', ccrl: 'Fire 9 64-bit', blitz: 3482, classical: 3434, match: /^fire 9\b/ },
  { name: 'Tucano 12.00', ccrl: 'Tucano 12.00 64-bit', blitz: 3491, classical: 3433, match: /^tucano 12\.00\b/ },
  { name: 'Yukari 2025.11.1', ccrl: 'Yukari 2025.11.1 64-bit', blitz: 3539, classical: 3451, match: /^yukari 2025\.11\.1\b/ },
  { name: 'Patricia 5.0', ccrl: 'Patricia 5.0 64-bit', blitz: 3539, classical: 3459, match: /^patricia 5(\.0)?\b/ },
  { name: 'Winter 5.0', ccrl: 'Winter 5.0 64-bit', blitz: 3544, classical: 3466, match: /^winter 5\.0\b/ },
  { name: 'Gyatso 1.6.0', ccrl: 'Gyatso 1.6.0 64-bit', blitz: 3568, classical: 3553, match: /^gyatso 1\.6\.0\b/ },
  { name: 'Lizard 11.2', ccrl: 'Lizard 11.2 64-bit', blitz: 3694, classical: 3569, match: /^lizard 11\.2\b/ },
  { name: 'Motor 0.9.0', ccrl: 'Motor 0.9.0 64-bit', blitz: 3695, classical: 3571, match: /^motor 0\.9\.0\b/ },
  { name: 'Quanticade Cronus 3.0', ccrl: 'Quanticade Cronus 3.0 64-bit', blitz: 3717, classical: 3588, match: /^quanticade (cronus )?3\.0\b/ },
  { name: 'Halogen 16.0.0', ccrl: 'Halogen 16.0.0 64-bit', blitz: 3721, classical: 3593, match: /^halogen 16(\.0\.0)?\b/ },
  { name: 'Astra 7.0', ccrl: 'Astra 7.0 64-bit', blitz: 3731, classical: 3594, match: /^astra 7\.0\b/ },
  { name: 'Stormphrax 8.0.0', ccrl: 'Stormphrax 8.0.0 64-bit', blitz: 3745, classical: 3608, match: /^stormphrax 8\.0\.0\b/ },
  { name: 'Reckless 0.9.0', ccrl: 'Reckless 0.9.0 64-bit', blitz: 3766, classical: 3622, match: /^reckless 0\.9\.0\b/ },
  { name: 'PlentyChess 8.0.0', ccrl: 'PlentyChess 8.0.0 64-bit', blitz: 3774, classical: 3617, match: /^plentychess 8\.0\.0\b/ },
  { name: 'Stockfish 19', ccrl: 'Stockfish 19 64-bit', blitz: 3792, classical: 3629, match: /^stockfish 19\b/ },
];
// Engines that were tried as anchors and failed local calibration; importing them explains why they are skipped.
const rejected = [
  { match: /^kociolek[- ]2\.1\b/, reason: 'The common Kociolek 2.1 download lacks its network file and plays about 600 Elo below its rating.' },
  { match: /^mantissa v?3\.7\.2\b/, reason: 'Mantissa 3.7.2 scored about 80 Elo below its CCRL Blitz rating at short time controls.' },
];
const rejectedReason = idName => rejected.find(r => r.match.test(String(idName || '').trim().toLowerCase()))?.reason || null;
const findAnchor = idName => anchors.find(a => a.match.test(String(idName || '').trim().toLowerCase())) || null;
const anchorRatings = anchor => Object.fromEntries([['blitz', anchor.blitz], ['classical', anchor.classical]].filter(([, v]) => Number.isFinite(v)));
const families = [...new Set([...anchors.map(a => a.name.split(' ')[0].toLowerCase()), 'kociolek', 'mantissa'])];
// When a folder holds several builds of one engine, try the fastest instruction sets first.
const buildRank = file => /nopopcnt|[-_]old\b|generic|x86-64(?!-)/i.test(file) ? 2 : /sse|popcnt/i.test(file) && !/avx|bmi|pext/i.test(file) ? 1 : 0;
// Only executables whose file name mentions an anchor family are started for identification.
async function candidateFiles(folder, depth = 3) {
  const found = [];
  async function walk(dir, level) {
    let entries;
    try { entries = await fs.readdir(dir, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory() && level < depth) await walk(full, level + 1);
      else if (entry.isFile() && /\.exe$/i.test(entry.name) && families.some(f => entry.name.toLowerCase().includes(f))) found.push(full);
      if (found.length >= 200) return;
    }
  }
  await walk(folder, 0);
  return found.sort((a, b) => path.dirname(a).localeCompare(path.dirname(b)) || buildRank(a) - buildRank(b));
}
module.exports = { anchors, findAnchor, anchorRatings, rejectedReason, candidateFiles, LIST_DATE };
