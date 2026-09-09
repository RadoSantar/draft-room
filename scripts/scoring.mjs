// Liga-Scoring-Näherung auf Basis von ESPN-Saison-Projektionen.
// Muss inhaltlich mit den Formeln in ../shared.js (projectedPoints/findSeasonProjection)
// übereinstimmen – dort läuft die Browser-Version für Punkterechner/Draft Board,
// hier die Node-Version für den automatischen Sync-Workflow. Bei Scoring-Änderungen
// bitte beide Stellen anpassen.

export const STAT = {
  passAtt: 0, passCmp: 1, passYds: 3, passTD: 4, passInt: 20,
  rushAtt: 23, rushYds: 24, rushTD: 25,
  rec: 41, recYds: 42, recTD: 43,
  fumLost: 72,
  fgMade50Plus: 74, fgMade40to49: 77, fgMade0to39: 80,
  fgMissedTotal: 85, patMade: 86, patMissed: 88,
  ptsAllowed: 120, yardsAllowed: 127, sacks: 99, gamesPlayed: 210
};

export const POS_MAP = { 1: 'QB', 2: 'RB', 3: 'WR', 4: 'TE', 5: 'K', 16: 'DST' };

export const TEAM_ABBR = {
  1: 'ATL', 2: 'BUF', 3: 'CHI', 4: 'CIN', 5: 'CLE', 6: 'DAL', 7: 'DEN', 8: 'DET', 9: 'GB', 10: 'TEN',
  11: 'IND', 12: 'KC', 13: 'LV', 14: 'LAR', 15: 'MIA', 16: 'MIN', 17: 'NE', 18: 'NO', 19: 'NYG', 20: 'NYJ',
  21: 'PHI', 22: 'ARI', 23: 'PIT', 24: 'LAC', 25: 'SF', 26: 'SEA', 27: 'TB', 28: 'WSH', 29: 'CAR', 30: 'JAX',
  33: 'BAL', 34: 'HOU'
};

export const STARTER_SLOTS = [
  ['QB', ['QB'], 1],
  ['RB', ['RB'], 2],
  ['WR', ['WR'], 2],
  ['FLEX', ['RB', 'WR'], 2],
  ['TE', ['TE'], 2],
  ['K', ['K'], 1],
  ['DEF', ['DST'], 1]
];

function ptsAllowedBonus(pa) {
  if (pa === 0) return 10;
  if (pa <= 6) return 7;
  if (pa <= 13) return 4;
  if (pa <= 17) return 1;
  if (pa <= 27) return 0;
  if (pa <= 34) return -4;
  if (pa <= 45) return -7;
  return -10;
}

function yardsAllowedBonus(ya) {
  if (ya < 100) return 5;
  if (ya <= 199) return 3;
  if (ya <= 349) return 0;
  if (ya <= 399) return -0.5;
  if (ya <= 449) return -1;
  if (ya <= 499) return -3;
  if (ya <= 549) return -5;
  return -8;
}

export function projectedPoints(pos, stats) {
  if (!stats) return null;
  const s = (id) => stats[String(id)] || 0;
  let pts = 0;
  if (pos === 'QB') {
    pts += s(STAT.passYds) / 25;
    pts += s(STAT.passCmp) * 0.5;
    pts += s(STAT.passTD) * 6;
    pts += s(STAT.passInt) * -2;
    pts += s(STAT.rushYds) / 10;
    pts += s(STAT.rushTD) * 6;
    pts += s(STAT.fumLost) * -2;
  } else if (pos === 'RB' || pos === 'WR' || pos === 'TE') {
    pts += s(STAT.rushYds) / 10;
    pts += s(STAT.rushTD) * 6;
    pts += s(STAT.recYds) / 10;
    pts += s(STAT.rec) * 1;
    pts += s(STAT.recTD) * 6;
    pts += s(STAT.fumLost) * -2;
  } else if (pos === 'K') {
    pts += s(STAT.fgMade0to39) * 3;
    pts += s(STAT.fgMade40to49) * 4;
    pts += s(STAT.fgMade50Plus) * 5;
    pts += s(STAT.fgMissedTotal) * -0.5;
    pts += s(STAT.patMade) * 1;
    pts += s(STAT.patMissed) * -1;
  } else if (pos === 'DST') {
    const games = s(STAT.gamesPlayed) || 17;
    const avgPA = s(STAT.ptsAllowed) / games;
    const avgYA = s(STAT.yardsAllowed) / games;
    pts += (ptsAllowedBonus(avgPA) + yardsAllowedBonus(avgYA)) * games;
    pts += s(STAT.sacks) * 1;
  } else {
    return null;
  }
  return pts;
}

export function findSeasonProjection(playerStats) {
  if (!playerStats) return null;
  const candidates = playerStats.filter((s) => s.statSourceId === 1 && s.statSplitTypeId === 0);
  if (!candidates.length) return null;
  candidates.sort((a, b) => (b.seasonId || 0) - (a.seasonId || 0));
  return candidates[0].stats;
}

export function buildOptimalLineup(roster) {
  const pools = {};
  ['QB', 'RB', 'WR', 'TE', 'K', 'DST'].forEach((pos) => {
    pools[pos] = roster.filter((p) => p.pos === pos).slice().sort((a, b) => (b.proj || -999) - (a.proj || -999));
  });
  const starters = [];
  STARTER_SLOTS.forEach(([label, positions, count]) => {
    for (let i = 0; i < count; i++) {
      let best = null;
      let bestPos = null;
      positions.forEach((pos) => {
        if (pools[pos].length) {
          const cand = pools[pos][0];
          if (!best || (cand.proj || -999) > (best.proj || -999)) {
            best = cand;
            bestPos = pos;
          }
        }
      });
      if (best) {
        pools[bestPos].shift();
        starters.push({ slot: label, ...best });
      }
    }
  });
  const bench = [];
  Object.keys(pools).forEach((pos) => bench.push(...pools[pos]));
  return { starters, bench };
}
