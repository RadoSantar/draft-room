// Holt Draft/Roster/Standings/Scoreboard/Transaktionen aus der privaten ESPN-Liga und
// schreibt die Ergebnisse nach ../data/*.json. Läuft per GitHub Actions (siehe
// .github/workflows/espn-sync.yml) oder lokal mit ESPN_S2/ESPN_SWID als Env-Vars.
//
// Schreibt NIE team-content.json (die handgeschriebenen Analysen/Ausblicke) – das bleibt
// ausschliesslich manuell gepflegt.
import { POS_MAP, TEAM_ABBR, projectedPoints, findSeasonProjection, buildOptimalLineup } from './scoring.mjs';
import { generateRecapsForGames } from './generate-recaps.mjs';
import { SEASON, fetchLeague, readJsonSafe, writeJson, nowIso } from './espn-client.mjs';

// Conference-Zuordnung – deckungsgleich mit TEAM_CONF in power-rankings.html/schedule.html.
// ESPNs API liefert für diese Liga keine nutzbare Conference/Division-Info, daher von Hand gepflegt.
const TEAM_CONF = {
  'Tackleberry Finn': 'NFC', 'Apukalypse Now': 'NFC', 'Hopp Schwiiz': 'NFC', 'Buhaaner': 'NFC',
  'Run CMC': 'AFC', 'Queen of Chaos': 'AFC', 'Sherlock Mahomes': 'AFC', 'TM06': 'AFC',
  'Saints of Anarchy': 'NFC', 'Zurich City Ravens': 'AFC'
};

const DEFAULTS_URL = `https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/${SEASON}/segments/0/leaguedefaults/3?view=kona_player_info`;

async function fetchProjections(ids) {
  if (!ids.length) return {};
  const filter = JSON.stringify({ players: { filterIds: { value: ids } } });
  const res = await fetch(DEFAULTS_URL, { headers: { 'x-fantasy-filter': filter } });
  if (!res.ok) throw new Error(`Projektions-Fetch fehlgeschlagen (${res.status})`);
  const data = await res.json();
  const out = {};
  (data.players || []).forEach((pe) => {
    const p = pe.player;
    const pos = POS_MAP[p.defaultPositionId] || '?';
    const stats = findSeasonProjection(p.stats);
    out[p.id] = {
      name: p.fullName,
      pos,
      proTeam: TEAM_ABBR[p.proTeamId] || '',
      adp: (p.ownership && p.ownership.averageDraftPosition) || 999,
      proj: projectedPoints(pos, stats)
    };
  });
  return out;
}

// ESPN-Lineup-Slot-IDs: 20 = Bench, 21 = IR – alle anderen sind Start-Slots (QB/RB/WR/TE/FLEX/K/DEF).
const BENCH_SLOT_ID = 20;
const IR_SLOT_ID = 21;

// Holt für eine abgeschlossene Woche je Team, wer tatsächlich startete/auf der Bank sass und was
// jeder Spieler in genau dieser Woche wirklich erzielt hat (ESPNs appliedStatTotal, nach unseren
// eigenen Liga-Scoring-Regeln – genauer als unsere Saison-Projektion, aber nur für vergangene Wochen
// verfügbar). Dient ausschliesslich dazu, Claude beim Recap echte "Bank-Reue"/Standout-Momente zu
// liefern. Bei Fehlern (z.B. unerwartete API-Form) einfach ein leeres Ergebnis zurückgeben – der
// Recap läuft dann ohne diese Zusatz-Storylines ganz normal weiter, siehe findKeyMoments().
async function fetchWeeklyKeyMomentsByTeam(week) {
  try {
    const data = await fetchLeague(['mBoxscore', 'mMatchupScore'], week);
    const byTeam = {};
    (data.schedule || []).forEach((matchup) => {
      if (matchup.matchupPeriodId !== week) return;
      [matchup.home, matchup.away].forEach((side) => {
        if (!side || !side.teamId) return;
        const starters = [];
        const bench = [];
        (side.rosterForCurrentScoringPeriod?.entries || []).forEach((e) => {
          const p = e.playerPoolEntry?.player;
          if (!p) return;
          const entry = {
            playerId: p.id,
            name: p.fullName,
            pos: POS_MAP[p.defaultPositionId] || '?',
            points: e.playerPoolEntry.appliedStatTotal || 0
          };
          if (e.lineupSlotId === BENCH_SLOT_ID || e.lineupSlotId === IR_SLOT_ID) bench.push(entry);
          else starters.push(entry);
        });
        byTeam[side.teamId] = { starters, bench };
      });
    });
    return byTeam;
  } catch (e) {
    console.error('Wochen-Boxscore konnte nicht geladen werden, Recaps laufen ohne Zusatz-Storylines weiter:', e.message);
    return {};
  }
}

// Grösster gleichpositioneller Bank-vs-Starter-Punktegewinn für ein Team – immer ein regelkonform
// möglicher Tausch (gleiche Position), keine Vermutung über Flex-Berechtigung nötig.
function benchRegret(perf, teamName) {
  if (!perf || !perf.bench.length || !perf.starters.length) return null;
  const byPos = {};
  perf.bench.forEach((p) => { (byPos[p.pos] = byPos[p.pos] || []).push(p); });
  let best = null;
  perf.starters.forEach((starter) => {
    (byPos[starter.pos] || []).forEach((benchPlayer) => {
      const gain = benchPlayer.points - starter.points;
      if (gain > 0 && (!best || gain > best.gain)) best = { benchPlayer, starter, gain };
    });
  });
  if (!best) return null;
  return { team: teamName, benchPlayer: best.benchPlayer, starter: best.starter, gain: best.gain };
}

// Falls eine einzelne Positionsgruppe (z.B. alle RBs) eines Teams allein schon mehr Punkte holte
// als das GESAMTE gegnerische Team – eine griffige "carried by"-Storyline.
function findPositionalDominance(game, homePerf, awayPerf) {
  const groupTotals = (perf) => {
    const totals = {};
    (perf?.starters || []).forEach((p) => { totals[p.pos] = (totals[p.pos] || 0) + p.points; });
    return totals;
  };
  const candidates = [];
  Object.entries(groupTotals(homePerf)).forEach(([pos, total]) => {
    if (total > game.awayScore) candidates.push({ team: game.homeName, opponent: game.awayName, pos, groupTotal: total, opponentTotal: game.awayScore });
  });
  Object.entries(groupTotals(awayPerf)).forEach(([pos, total]) => {
    if (total > game.homeScore) candidates.push({ team: game.awayName, opponent: game.homeName, pos, groupTotal: total, opponentTotal: game.homeScore });
  });
  if (!candidates.length) return null;
  return candidates.sort((a, b) => (b.groupTotal - b.opponentTotal) - (a.groupTotal - a.opponentTotal))[0];
}

// Nennenswerte Sieges-/Niederlagenserie (ab 2) unter den beiden beteiligten Teams, laut ESPNs
// eigener Serien-Zählung (spiegelt bereits den Stand nach der soeben abgeschlossenen Woche).
function findStreakFact(game, standingsById) {
  const candidates = [game.homeId, game.awayId]
    .map((id) => standingsById[id])
    .filter((s) => s && (s.streakType === 'WIN' || s.streakType === 'LOSS') && s.streakLength >= 2)
    .sort((a, b) => b.streakLength - a.streakLength);
  if (!candidates.length) return null;
  const s = candidates[0];
  return { team: s.name, streakType: s.streakType, streakLength: s.streakLength };
}

// Positionsgruppe (QB/RB/WR/TE/K/DST) mit dem grössten Punktegewinn, falls eine Aufstellung nach
// STARTER_SLOTS (inkl. Flex) aus dem KOMPLETTEN Kader (Starter+Bank) dieser Woche mehr geholt hätte
// als die tatsächlich gespielte – nutzt dieselbe buildOptimalLineup()-Logik wie die Power Rankings,
// nur mit den echten Wochenpunkten statt der Saison-Projektion als "proj".
function findOptimalLineupGap(perf, teamName) {
  if (!perf || !perf.starters.length) return null;
  const actualTotal = perf.starters.reduce((sum, p) => sum + p.points, 0);
  const fullRoster = [...perf.starters, ...perf.bench].map((p) => ({ ...p, proj: p.points }));
  const optimal = buildOptimalLineup(fullRoster);
  const optimalTotal = optimal.starters.reduce((sum, p) => sum + (p.proj || 0), 0);
  const gap = Math.round((optimalTotal - actualTotal) * 10) / 10;
  if (gap < 3) return null;
  return { team: teamName, actualTotal: Math.round(actualTotal * 10) / 10, optimalTotal: Math.round(optimalTotal * 10) / 10, gap };
}

// Conference-Tabellenstand nach diesem Spiel (primär das, wonach in der Liga eigentlich geschaut
// wird – nicht die projektionsbasierten Power Rankings). Ist aus dem Vorwochen-Snapshot ein
// Rang-Wechsel bekannt, wird der grössere Wechsel der beiden Teams bevorzugt; sonst einfach die
// aktuelle Position des Siegers (bzw. Heimteams bei Unentschieden).
function findConferenceStandingFact(game, confStandings, prevConfRankById) {
  const info = (id, name) => {
    const cur = confStandings[id];
    if (!cur) return null;
    const prevRank = prevConfRankById[id];
    return { team: name, conf: cur.conf, rank: cur.rank, wins: cur.wins, losses: cur.losses, ties: cur.ties, prevRank: prevRank != null ? prevRank : null };
  };
  const home = info(game.homeId, game.homeName);
  const away = info(game.awayId, game.awayName);
  const withMovement = [home, away].filter((t) => t && t.prevRank != null && t.prevRank !== t.rank);
  if (withMovement.length) {
    return withMovement.sort((a, b) => Math.abs(b.prevRank - b.rank) - Math.abs(a.prevRank - a.rank))[0];
  }
  return game.winner === 'AWAY' ? away : home;
}

// Saison-Bestwert/Negativrekord: prüft, ob eines der beiden Teams in DIESEM Spiel die höchste bzw.
// niedrigste Wochenpunktzahl der bisherigen Saison erzielt hat.
function findSeasonExtremeFact(game, scoreboard, lastCompletedWeek) {
  const allScores = [];
  scoreboard.forEach((wk) => {
    if (wk.week > lastCompletedWeek) return;
    wk.games.forEach((g) => {
      if (g.winner === 'UNDECIDED') return;
      allScores.push({ team: g.homeName, score: g.homeScore, week: wk.week });
      allScores.push({ team: g.awayName, score: g.awayScore, week: wk.week });
    });
  });
  if (!allScores.length) return null;
  const maxEntry = allScores.reduce((a, b) => (b.score > a.score ? b : a));
  const minEntry = allScores.reduce((a, b) => (b.score < a.score ? b : a));
  const thisWeek = [{ team: game.homeName, score: game.homeScore }, { team: game.awayName, score: game.awayScore }];
  const isHigh = thisWeek.find((t) => t.team === maxEntry.team && t.score === maxEntry.score && maxEntry.week === game.week);
  if (isHigh) return { type: 'high', team: isHigh.team, score: isHigh.score };
  const isLow = thisWeek.find((t) => t.team === minEntry.team && t.score === minEntry.score && minEntry.week === game.week);
  if (isLow) return { type: 'low', team: isLow.team, score: isLow.score };
  return null;
}

// Gegner der kommenden Woche je Team, inkl. dessen aktueller Bilanz und Conference-Rang – damit
// generate-recaps.mjs daraus einen echten kleinen Teaser bauen kann statt nur den nackten Namen zu
// nennen.
function findNextOpponent(teamId, scoreboard, nextWeek, standingsById, confStandings) {
  const wk = scoreboard.find((w) => w.week === nextWeek);
  if (!wk) return null;
  const g = wk.games.find((gg) => gg.homeId === teamId || gg.awayId === teamId);
  if (!g) return null;
  const oppId = g.homeId === teamId ? g.awayId : g.homeId;
  const oppName = g.homeId === teamId ? g.awayName : g.homeName;
  const rec = standingsById?.[oppId];
  const conf = confStandings?.[oppId];
  return {
    name: oppName,
    wins: rec?.wins ?? null,
    losses: rec?.losses ?? null,
    ties: rec?.ties ?? null,
    confRank: conf?.rank ?? null,
    conf: conf?.conf ?? null
  };
}

// Bildet ESPNs echtes 4-Team-Playoff-Bracket nach: die 2 Conference-Sieger (Seed 1/2, sortiert nach
// Gesamt-Bilanz) plus die 2 besten Nicht-Conference-Sieger nach Gesamt-Bilanz als Wildcards
// (Seed 3/4) – Quelle: ESPNs eigene Fan-Support-Doku ("Division winners always occupy the top
// seeds... the team with the best winning percentage earns the higher seed" für die Wildcards,
// Tiebreaker zuerst Points For). Bewusst KEINE Tiebreaker über Punkte simuliert (nur Siege, dann
// Punkte als Tiebreak wie überall sonst in diesem Script) – bei echten Gleichständen kann ESPNs
// exakte Einordnung leicht abweichen, das ist hier nur die Grundlage fürs Playoff-Rennen-Narrativ,
// nicht die offizielle Quelle für den tatsächlichen Bracket.
function computePlayoffPicture(standings, confStandings) {
  const confLeaders = standings.filter((s) => confStandings[s.id]?.rank === 1);
  const leaderIds = new Set(confLeaders.map((s) => s.id));
  const seeded12 = confLeaders.slice().sort((a, b) => b.wins - a.wins || b.pointsFor - a.pointsFor);
  const wildcardPool = standings
    .filter((s) => !leaderIds.has(s.id))
    .slice()
    .sort((a, b) => b.wins - a.wins || b.pointsFor - a.pointsFor);
  const seeded34 = wildcardPool.slice(0, 2);
  const outside = wildcardPool.slice(2);
  const playoffTeams = [...seeded12, ...seeded34].map((t, i) => ({ ...t, seed: i + 1 }));
  const cutoffWins = seeded34.length ? seeded34[seeded34.length - 1].wins : (seeded12[seeded12.length - 1]?.wins ?? 0);
  return { playoffTeams, outside, cutoffWins };
}

// Playoff-Rennen-Kontext ab Woche 8: steht ein Team aktuell auf einem Playoff-Platz (mit wie viel
// Polster), jagt es den letzten Platz noch ein, oder ist es rechnerisch schon draussen (Elimination
// hier als einfache Maximal-Siege-Schranke: selbst mit ausschliesslich Siegen aus allen verbleibenden
// Spielen würde es nicht mehr an den aktuellen 4. Seed herankommen – eine bewusst simple Näherung
// ohne Restspielplan-Simulation, aber als "rechnerisch chancenlos"-Aussage korrekt). Nur für Wochen
// 8-15 relevant, danach steht der Bracket fest (siehe playoffTier).
function findPlayoffRaceFact(game, standings, confStandings) {
  if (game.week < 8 || game.week > 15) return null;
  const { playoffTeams, outside, cutoffWins } = computePlayoffPicture(standings, confStandings);
  const remainingGames = 15 - game.week;

  const describe = (teamId, teamName) => {
    const seeded = playoffTeams.find((t) => t.id === teamId);
    if (seeded) {
      const firstOut = outside[0];
      const cushion = firstOut ? seeded.wins - firstOut.wins : null;
      return { team: teamName, status: 'in', seed: seeded.seed, cushion };
    }
    const out = standings.find((s) => s.id === teamId);
    if (!out) return null;
    const maxPossibleWins = out.wins + remainingGames;
    if (maxPossibleWins < cutoffWins) return { team: teamName, status: 'eliminated' };
    return { team: teamName, status: 'chasing', winsBehind: cutoffWins - out.wins };
  };

  const home = describe(game.homeId, game.homeName);
  const away = describe(game.awayId, game.awayName);
  const priority = { eliminated: 0, chasing: 1, in: 2 };
  return [home, away].filter(Boolean).sort((a, b) => priority[a.status] - priority[b.status])[0] || null;
}

// Pechvogel der Woche: verliert, hätte mit diesem Score aber mindestens eines der ANDEREN Spiele
// dieser Woche gewonnen. Reine Woche-intern-Betrachtung, braucht keine Zusatz-Fetches.
function findUnluckyLoserFact(game, weekGames) {
  if (game.winner !== 'HOME' && game.winner !== 'AWAY') return null;
  const loserName = game.winner === 'HOME' ? game.awayName : game.homeName;
  const loserScore = game.winner === 'HOME' ? game.awayScore : game.homeScore;
  const beatenCount = weekGames.filter((g) => {
    if (g.homeId === game.homeId && g.awayId === game.awayId) return false;
    const otherWinnerScore = g.winner === 'HOME' ? g.homeScore : g.winner === 'AWAY' ? g.awayScore : null;
    return otherWinnerScore != null && loserScore > otherWinnerScore;
  }).length;
  if (!beatenCount) return null;
  return { team: loserName, score: loserScore, beatenCount };
}

// Hässlicher Sieg: gewinnt mit der niedrigsten Siegerpunktzahl der gesamten Woche.
function findUglyWinFact(game, weekGames) {
  if (game.winner !== 'HOME' && game.winner !== 'AWAY') return null;
  const winnerName = game.winner === 'HOME' ? game.homeName : game.awayName;
  const winnerScore = game.winner === 'HOME' ? game.homeScore : game.awayScore;
  const allWinningScores = weekGames
    .filter((g) => g.winner === 'HOME' || g.winner === 'AWAY')
    .map((g) => (g.winner === 'HOME' ? g.homeScore : g.awayScore));
  if (allWinningScores.length < 2) return null;
  if (winnerScore !== Math.min(...allWinningScores)) return null;
  return { team: winnerName, score: winnerScore };
}

// Revanche: die beiden Teams sind sich diese Saison schon einmal begegnet (Conference-Gegner
// spielen zweimal) – Verweis auf das erste Duell inkl. ob's diesmal Revanche gab oder Wiederholung.
function findRematchFact(game, scoreboard) {
  const pairKey = (a, b) => [a, b].sort((x, y) => x - y).join('-');
  const thisKey = pairKey(game.homeId, game.awayId);
  let earlier = null;
  scoreboard.forEach((wk) => {
    if (wk.week >= game.week) return;
    wk.games.forEach((g) => {
      if (g.winner === 'UNDECIDED') return;
      if (pairKey(g.homeId, g.awayId) === thisKey) earlier = { ...g, week: wk.week };
    });
  });
  if (!earlier) return null;
  const earlierWinner = earlier.winner === 'HOME' ? earlier.homeName : earlier.winner === 'AWAY' ? earlier.awayName : null;
  const thisWinner = game.winner === 'HOME' ? game.homeName : game.winner === 'AWAY' ? game.awayName : null;
  return {
    week: earlier.week,
    winner: earlierWinner,
    scoreLine: `${earlier.homeName} ${earlier.homeScore.toFixed(1)} : ${earlier.awayScore.toFixed(1)} ${earlier.awayName}`,
    isRevenge: !!(earlierWinner && thisWinner && earlierWinner !== thisWinner)
  };
}

// Kicker/Defense hat's entschieden: der Sieg-Vorsprung ist kleiner oder gleich dem, was ein
// einzelner K/DST-Starter des Siegers allein beisteuerte – ohne den hätte es nicht gereicht.
function findKickerDecisiveFact(game, homePerf, awayPerf) {
  if (game.winner !== 'HOME' && game.winner !== 'AWAY') return null;
  const margin = Math.abs(game.homeScore - game.awayScore);
  if (margin <= 0) return null;
  const winnerName = game.winner === 'HOME' ? game.homeName : game.awayName;
  const winnerPerf = game.winner === 'HOME' ? homePerf : awayPerf;
  if (!winnerPerf) return null;
  const decisive = winnerPerf.starters
    .filter((p) => p.pos === 'K' || p.pos === 'DST')
    .find((p) => p.points >= margin);
  if (!decisive) return null;
  return { team: winnerName, name: decisive.name, pos: decisive.pos, points: decisive.points, margin };
}

// Waiver-Wire-Karma: einer der beiden Teams hatte diese Saison schon mal einen Spieler abgeworfen,
// der jetzt im Kader (Start oder Bank) des GEGNERS steht und dort ordentlich punktet. Braucht die
// transactions.json-Drop-Einträge (playerId/teamId) gegen die echten Wochen-Boxscore-Daten.
function findWaiverKarmaFact(game, homePerf, awayPerf, transactions) {
  if (!transactions?.length) return null;
  const dropsByTeam = {};
  transactions.forEach((t) => {
    if (t.type === 'FREEAGENT' && t.playerId != null && t.teamId != null && t.id?.startsWith('drop-')) {
      (dropsByTeam[t.teamId] = dropsByTeam[t.teamId] || new Set()).add(t.playerId);
    }
  });

  const check = (droppingTeamId, droppingTeamName, opponentPerf, opponentName) => {
    const dropped = dropsByTeam[droppingTeamId];
    if (!dropped || !opponentPerf) return null;
    const allOpp = [...opponentPerf.starters, ...opponentPerf.bench];
    const karmaPlayer = allOpp.find((p) => dropped.has(p.playerId) && p.points >= 10);
    if (!karmaPlayer) return null;
    return { droppingTeam: droppingTeamName, karmaTeam: opponentName, player: karmaPlayer };
  };

  return check(game.homeId, game.homeName, awayPerf, game.awayName)
    || check(game.awayId, game.awayName, homePerf, game.homeName)
    || null;
}

// Extrahiert für dieses eine Spiel die Score-Differenz (Heim minus Auswärts) aus jedem
// Live-Zwischenstand der Woche, in chronologischer Reihenfolge, plus den Endstand als letzten Punkt.
// Basis für findComebackFact()/findLeadChangesFact() – kommt von snapshot-live-scores.mjs, das
// mehrmals pro Spieltag läuft (siehe .github/workflows/espn-live-snapshot.yml). Ohne diese Snapshots
// (z.B. weil das Zusatz-Feature nicht aktiv ist) einfach leeres Array – die beiden Fakten bleiben
// dann schlicht aus, kein Fehler.
function extractDiffTimeline(game, liveSnapshots) {
  const diffs = [];
  (liveSnapshots || []).forEach((s) => {
    const g = s.games.find((gg) => gg.homeId === game.homeId && gg.awayId === game.awayId);
    if (g) diffs.push(g.homeScore - g.awayScore);
  });
  diffs.push(game.homeScore - game.awayScore);
  return diffs;
}

// Kollaps/Comeback: eines der beiden Teams lag laut unseren Zwischenständen irgendwann deutlich
// (≥15 Punkte) vorne, verlor am Ende aber trotzdem. Bewusst als Näherung kommuniziert ("laut unseren
// Zwischenständen") – wir sehen nur die paar Momentaufnahmen, an denen tatsächlich snapshotted wurde,
// nicht den kompletten Verlauf.
function findComebackFact(game, liveSnapshots) {
  if (game.winner !== 'HOME' && game.winner !== 'AWAY') return null;
  const diffs = extractDiffTimeline(game, liveSnapshots);
  if (diffs.length < 2) return null;
  const maxHomeLead = Math.max(0, ...diffs);
  const maxAwayLead = Math.max(0, ...diffs.map((d) => -d));

  if (game.winner === 'AWAY' && maxHomeLead >= 15) {
    return { collapsedTeam: game.homeName, peakLead: maxHomeLead, winnerTeam: game.awayName };
  }
  if (game.winner === 'HOME' && maxAwayLead >= 15) {
    return { collapsedTeam: game.awayName, peakLead: maxAwayLead, winnerTeam: game.homeName };
  }
  return null;
}

// Nervenkrieg: wie oft wechselte die Führung laut unseren Zwischenständen den Besitzer.
function findLeadChangesFact(game, liveSnapshots) {
  if (game.winner === 'TIE') return null;
  const diffs = extractDiffTimeline(game, liveSnapshots);
  let changes = 0;
  let lastSign = 0;
  diffs.forEach((d) => {
    const sign = d > 0 ? 1 : d < 0 ? -1 : 0;
    if (sign !== 0 && lastSign !== 0 && sign !== lastSign) changes++;
    if (sign !== 0) lastSign = sign;
  });
  if (changes < 2) return null;
  return { changes };
}

// Schnellstarter/Spätzünder: Anteil des Endstands, den ein Team schon beim ALLERERSTEN Snapshot der
// Woche (meist Donnerstagabend) draufhatte – relativ statt absolut gemessen, damit es unabhängig vom
// genauen Scoring-Niveau dieser Liga funktioniert.
function findPaceFact(game, liveSnapshots) {
  if (!liveSnapshots?.length) return null;
  const first = liveSnapshots[0];
  const check = (teamId, teamName, finalScore) => {
    if (finalScore < 20) return null;
    const g = first.games.find((gg) => gg.homeId === teamId || gg.awayId === teamId);
    if (!g) return null;
    const earlyScore = g.homeId === teamId ? g.homeScore : g.awayScore;
    const share = earlyScore / finalScore;
    if (share >= 0.35) return { type: 'fast', team: teamName, earlyScore, finalScore };
    if (share <= 0.05) return { type: 'slow', team: teamName, earlyScore, finalScore };
    return null;
  };
  return check(game.homeId, game.homeName, game.homeScore) || check(game.awayId, game.awayName, game.awayScore) || null;
}

// Zittersieg: das SIEGER-Team lag laut unseren Zwischenständen irgendwann mit ≥20 Punkten vorne,
// dieser Vorsprung schmolz aber um ≥15 Punkte, bevor es am Ende doch noch reichte – anders als
// findComebackFact() (das nur greift, wenn das führende Team am Ende WIRKLICH verliert).
function findSurvivedScareFact(game, liveSnapshots) {
  if (game.winner !== 'HOME' && game.winner !== 'AWAY') return null;
  const diffs = extractDiffTimeline(game, liveSnapshots);
  if (diffs.length < 2) return null;
  const winnerIsHome = game.winner === 'HOME';
  const peakOwnLead = winnerIsHome ? Math.max(0, ...diffs) : Math.max(0, ...diffs.map((d) => -d));
  const finalMargin = Math.abs(game.homeScore - game.awayScore);
  const shrink = peakOwnLead - finalMargin;
  if (peakOwnLead >= 20 && shrink >= 15) {
    return { team: winnerIsHome ? game.homeName : game.awayName, peakLead: peakOwnLead, finalMargin, shrink };
  }
  return null;
}

// Monday-Night-Rettung: das Team lag beim letzten Snapshot VOR Montagabend (grosszügig: vor 18:00
// UTC Montag, weit vor jedem realistischen MNF-Kickoff, siehe espn-live-snapshot.yml) noch zurück,
// gewann das Spiel am Ende aber trotzdem – kann also nur dank der Montagabend-Spieler passiert sein.
function findMondayNightRescueFact(game, liveSnapshots) {
  if (game.winner !== 'HOME' && game.winner !== 'AWAY') return null;
  if (!liveSnapshots?.length) return null;
  const preMonday = liveSnapshots.filter((s) => {
    const d = new Date(s.at);
    return d.getUTCDay() !== 1 || d.getUTCHours() < 18;
  }).slice(-1)[0];
  if (!preMonday) return null;
  const g = preMonday.games.find((gg) => gg.homeId === game.homeId && gg.awayId === game.awayId);
  if (!g) return null;
  const preDiff = g.homeScore - g.awayScore;
  if (game.winner === 'HOME' && preDiff < -1) return { team: game.homeName, deficitBeforeMonday: Math.abs(preDiff) };
  if (game.winner === 'AWAY' && preDiff > 1) return { team: game.awayName, deficitBeforeMonday: Math.abs(preDiff) };
  return null;
}

// Nagelbeisser über mehrere Checkpoints: der Vorsprung war nicht nur am Ende knapp, sondern über
// mindestens 3 aufeinanderfolgende Snapshots hinweg unter 5 Punkten – mehr Dauerspannung als der
// simple Nailbiter-Badge (der nur den Endstand betrachtet).
function findSustainedNailbiterFact(game, liveSnapshots) {
  if (!liveSnapshots?.length || liveSnapshots.length < 2) return null;
  const diffs = extractDiffTimeline(game, liveSnapshots);
  let streak = 0, maxStreak = 0;
  diffs.forEach((d) => {
    if (Math.abs(d) < 5) { streak++; maxStreak = Math.max(maxStreak, streak); }
    else streak = 0;
  });
  if (maxStreak < 3) return null;
  return { streak: maxStreak };
}

// Saison-Persönlichkeit: aus data/season-personality.json (siehe archiveLiveSnapshotWeek() weiter
// unten) – ein Team, das über mehrere Wochen hinweg auffällig oft comebackt/kollabiert/im
// Nervenkrieg steckt/von vorne bis hinten führt, bekommt dafür einen wiederkehrenden Beinamen. Erst
// ab 3 Spielen mit Live-Daten aussagekräftig, sonst zu kleine Stichprobe.
function findSeasonPersonalityFact(game, archive) {
  if (!archive?.teams) return null;
  const MIN_GAMES = 3;
  const TRAIT_DEFS = [
    { key: 'comebackWins', label: 'notorischer Last-Minute-Held' },
    { key: 'collapseLosses', label: 'notorischer Vorsprungs-Verspieler' },
    { key: 'sustainedNailbiters', label: 'Dauergast in Nervenkriegen' },
    { key: 'ledWireToWire', label: 'Kontrollfreak (führt am liebsten von Anfang bis Ende durch)' }
  ];
  const describe = (teamId, teamName) => {
    const t = archive.teams[teamId];
    if (!t || t.games < MIN_GAMES) return null;
    const traits = TRAIT_DEFS
      .map((def) => ({ ...def, count: t[def.key] || 0 }))
      .filter((tr) => tr.count >= 2 && tr.count / t.games >= 0.4)
      .sort((a, b) => b.count / t.games - a.count / t.games);
    if (!traits.length) return null;
    return { team: teamName, key: traits[0].key, label: traits[0].label, count: traits[0].count, games: t.games };
  };
  return describe(game.homeId, game.homeName) || describe(game.awayId, game.awayName) || null;
}

// Aktualisiert data/season-personality.json um die gerade abgeschlossene Woche – einmalig pro Woche
// dank weeksArchived-Guard (idempotent bei mehrfachen Sync-Läufen). Läuft NACH der Recap-Generierung
// (siehe main()), damit findSeasonPersonalityFact() im Recap dieser Woche noch die Persönlichkeit
// VOR diesem Spiel zeigt, nicht bereits inklusive seines eigenen Ergebnisses.
async function archiveLiveSnapshotWeek(week, weekGames, liveSnapshots) {
  const archive = await readJsonSafe('season-personality.json', { weeksArchived: [], teams: {} });
  if (archive.weeksArchived.includes(week)) return;

  const bump = (teamId, patch) => {
    const t = archive.teams[teamId] || { games: 0, comebackWins: 0, collapseLosses: 0, sustainedNailbiters: 0, ledWireToWire: 0 };
    t.games++;
    Object.keys(patch).forEach((k) => { if (patch[k]) t[k]++; });
    archive.teams[teamId] = t;
  };

  weekGames.forEach((g) => {
    if (g.winner !== 'HOME' && g.winner !== 'AWAY') return;
    const diffs = extractDiffTimeline(g, liveSnapshots);
    if (diffs.length < 2) return;
    const maxHomeLead = Math.max(0, ...diffs);
    const maxAwayLead = Math.max(0, ...diffs.map((d) => -d));
    const homeNeverTrailed = diffs.every((d) => d >= -1);
    const awayNeverTrailed = diffs.every((d) => d <= 1);
    let streak = 0, maxStreak = 0;
    diffs.forEach((d) => { if (Math.abs(d) < 5) { streak++; maxStreak = Math.max(maxStreak, streak); } else streak = 0; });
    const sustainedNailbiter = maxStreak >= 3;

    bump(g.homeId, {
      comebackWins: g.winner === 'HOME' && maxAwayLead >= 15,
      collapseLosses: g.winner === 'AWAY' && maxHomeLead >= 15,
      sustainedNailbiters: sustainedNailbiter,
      ledWireToWire: g.winner === 'HOME' && homeNeverTrailed
    });
    bump(g.awayId, {
      comebackWins: g.winner === 'AWAY' && maxHomeLead >= 15,
      collapseLosses: g.winner === 'HOME' && maxAwayLead >= 15,
      sustainedNailbiters: sustainedNailbiter,
      ledWireToWire: g.winner === 'AWAY' && awayNeverTrailed
    });
  });

  archive.weeksArchived.push(week);
  await writeJson('season-personality.json', archive);
}

// Baut aus den echten Wochendaten einen Pool möglicher Storyline-Fakten für ein Spiel. Welche davon
// tatsächlich in den Recap einfliessen, entscheidet generate-recaps.mjs per Zufallsauswahl – so
// liest sich nicht jedes Spiel nach demselben Schema (siehe buildPrompt() dort).
function findKeyMoments(game, homePerf, awayPerf, ctx) {
  const result = {};

  const bestStarter = (perf, side) => {
    if (!perf || !perf.starters.length) return null;
    const best = perf.starters.slice().sort((a, b) => b.points - a.points)[0];
    return { ...best, side };
  };
  const standout = [bestStarter(homePerf, 'home'), bestStarter(awayPerf, 'away')]
    .filter(Boolean)
    .sort((a, b) => b.points - a.points)[0];
  if (standout) result.standout = standout;

  const homeRegret = benchRegret(homePerf, game.homeName);
  const awayRegret = benchRegret(awayPerf, game.awayName);
  if (game.winner === 'HOME') {
    if (awayRegret) result.loserBenchRegret = { ...awayRegret, wouldHaveWon: awayRegret.gain >= (game.homeScore - game.awayScore) };
    if (homeRegret) result.winnerBenchRegret = homeRegret;
  } else if (game.winner === 'AWAY') {
    if (homeRegret) result.loserBenchRegret = { ...homeRegret, wouldHaveWon: homeRegret.gain >= (game.awayScore - game.homeScore) };
    if (awayRegret) result.winnerBenchRegret = awayRegret;
  }

  const dominance = findPositionalDominance(game, homePerf, awayPerf);
  if (dominance) result.positionalDominance = dominance;

  if (ctx?.standingsById) {
    const streak = findStreakFact(game, ctx.standingsById);
    if (streak) result.streak = streak;
  }

  const homeGap = findOptimalLineupGap(homePerf, game.homeName);
  const awayGap = findOptimalLineupGap(awayPerf, game.awayName);
  const biggerGap = [homeGap, awayGap].filter(Boolean).sort((a, b) => b.gap - a.gap)[0];
  if (biggerGap) result.optimalLineupGap = biggerGap;

  if (ctx?.confStandings) {
    const confStanding = findConferenceStandingFact(game, ctx.confStandings, ctx.prevConfRankById || {});
    if (confStanding) result.confStanding = confStanding;
  }

  if (ctx?.standings && ctx?.confStandings) {
    const playoffRace = findPlayoffRaceFact(game, ctx.standings, ctx.confStandings);
    if (playoffRace) result.playoffRace = playoffRace;
  }

  if (ctx?.scoreboard) {
    const extreme = findSeasonExtremeFact(game, ctx.scoreboard, game.week);
    if (extreme) result.seasonExtreme = extreme;
  }

  if (ctx?.scoreboard) {
    const homeNextOpp = findNextOpponent(game.homeId, ctx.scoreboard, game.week + 1, ctx.standingsById, ctx.confStandings);
    const awayNextOpp = findNextOpponent(game.awayId, ctx.scoreboard, game.week + 1, ctx.standingsById, ctx.confStandings);
    if (homeNextOpp) result.homeNextOpp = homeNextOpp;
    if (awayNextOpp) result.awayNextOpp = awayNextOpp;
  }

  if (ctx?.weekGames) {
    const unluckyLoser = findUnluckyLoserFact(game, ctx.weekGames);
    if (unluckyLoser) result.unluckyLoser = unluckyLoser;
    const uglyWin = findUglyWinFact(game, ctx.weekGames);
    if (uglyWin) result.uglyWin = uglyWin;
  }

  if (ctx?.scoreboard) {
    const rematch = findRematchFact(game, ctx.scoreboard);
    if (rematch) result.rematch = rematch;
  }

  const kickerDecisive = findKickerDecisiveFact(game, homePerf, awayPerf);
  if (kickerDecisive) result.kickerDecisive = kickerDecisive;

  if (ctx?.transactions) {
    const waiverKarma = findWaiverKarmaFact(game, homePerf, awayPerf, ctx.transactions);
    if (waiverKarma) result.waiverKarma = waiverKarma;
  }

  if (ctx?.liveSnapshots) {
    const comeback = findComebackFact(game, ctx.liveSnapshots);
    if (comeback) result.comeback = comeback;
    const leadChanges = findLeadChangesFact(game, ctx.liveSnapshots);
    if (leadChanges) result.leadChanges = leadChanges;
    const pace = findPaceFact(game, ctx.liveSnapshots);
    if (pace) result.pace = pace;
    const survivedScare = findSurvivedScareFact(game, ctx.liveSnapshots);
    if (survivedScare) result.survivedScare = survivedScare;
    const mondayRescue = findMondayNightRescueFact(game, ctx.liveSnapshots);
    if (mondayRescue) result.mondayRescue = mondayRescue;
    const sustainedNailbiter = findSustainedNailbiterFact(game, ctx.liveSnapshots);
    if (sustainedNailbiter) result.sustainedNailbiter = sustainedNailbiter;
  }

  if (ctx?.seasonPersonality) {
    const personality = findSeasonPersonalityFact(game, ctx.seasonPersonality);
    if (personality) result.seasonPersonality = personality;
  }

  return result;
}

async function main() {
  console.log('Lade Liga-Daten von ESPN…');
  const teamData = await fetchLeague(['mTeam', 'mRoster', 'mStandings']);
  const scoreData = await fetchLeague(['mMatchupScore', 'mScoreboard']);
  const draftData = await fetchLeague(['mDraftDetail']);

  const teamNames = {};
  teamData.teams.forEach((t) => { teamNames[t.id] = (t.name || '').trim(); });

  // ---- Aktuelle Kader + Spieler-Pool (für Namen/Positionen/Team) ----
  const playerPool = {};
  const currentRosterIds = {}; // teamId -> [playerId]
  teamData.teams.forEach((t) => {
    currentRosterIds[t.id] = [];
    (t.roster?.entries || []).forEach((e) => {
      const p = e.playerPoolEntry.player;
      const pos = POS_MAP[p.defaultPositionId] || '?';
      playerPool[p.id] = {
        name: p.fullName,
        pos,
        proTeam: TEAM_ABBR[p.proTeamId] || '',
        adp: (p.ownership && p.ownership.averageDraftPosition) || 999
      };
      currentRosterIds[t.id].push(p.id);
    });
  });

  // ---- Draft-Picks für die "board"-Historie ----
  const picks = draftData.draftDetail?.picks || [];
  const draftedIds = [...new Set(picks.map((p) => p.playerId))];
  const missingIds = draftedIds.filter((id) => !playerPool[id]);
  const allNeededIds = [...new Set([...draftedIds, ...Object.values(currentRosterIds).flat()])];
  const idsNeedingProjection = allNeededIds; // projections come from the same bulk fetch, always fresh
  const projections = await fetchProjections(idsNeedingProjection);

  function playerInfo(id) {
    const proj = projections[id];
    if (proj) return proj;
    const pooled = playerPool[id];
    if (pooled) return { ...pooled, proj: null };
    return { name: 'Unbekannter Spieler #' + id, pos: '?', proTeam: '', adp: 999, proj: null };
  }

  // ---- Power Rankings: aktuelle Kader -> optimale Aufstellung -> Rangliste ----
  const oldPower = await readJsonSafe('power-rankings.json', { data: [] });
  const oldRankById = {};
  (oldPower.data || []).forEach((t) => { oldRankById[t.id] = t.rank; });

  const rosterByTeam = {};
  const teamsComputed = teamData.teams.map((t) => {
    const roster = currentRosterIds[t.id].map((id) => {
      const info = playerInfo(id);
      return { playerId: id, name: info.name, pos: info.pos, proTeam: info.proTeam, proj: info.proj, adp: info.adp };
    });
    const { starters, bench } = buildOptimalLineup(roster);
    rosterByTeam[t.id] = { id: t.id, name: teamNames[t.id], starters, bench };
    const starterTotal = starters.reduce((sum, p) => sum + (p.proj || 0), 0);
    const benchTotal = bench.reduce((sum, p) => sum + (p.proj || 0), 0);
    const posTotals = {};
    roster.forEach((p) => { posTotals[p.pos] = (posTotals[p.pos] || 0) + (p.proj || 0); });

    const board = picks
      .filter((p) => p.teamId === t.id)
      .sort((a, b) => a.overallPickNumber - b.overallPickNumber)
      .map((p) => {
        const info = playerInfo(p.playerId);
        return { r: p.roundId, rp: p.roundPickNumber, ov: p.overallPickNumber, pos: info.pos, name: info.name, team: info.proTeam, proj: info.proj, adp: info.adp };
      });

    return {
      id: t.id,
      name: teamNames[t.id],
      starterTotal: Math.round(starterTotal * 10) / 10,
      benchTotal: Math.round(benchTotal * 10) / 10,
      posTotals: Object.fromEntries(Object.entries(posTotals).map(([k, v]) => [k, Math.round(v * 10) / 10])),
      board
    };
  });

  teamsComputed.sort((a, b) => b.starterTotal - a.starterTotal);
  teamsComputed.forEach((t, i) => {
    t.previousRank = oldRankById[t.id] || i + 1;
    t.rank = i + 1;
  });

  await writeJson('power-rankings.json', { lastUpdated: nowIso(), data: teamsComputed });

  // ---- Kompletter aktueller Kader je Team (Starter/Bench inkl. adp) für my-team.html ----
  await writeJson('roster.json', { lastUpdated: nowIso(), data: Object.values(rosterByTeam) });

  // ---- Alle aktuell irgendwo rostered player-IDs (liga-öffentlich) für Free-Agent-Filterung ----
  const rosteredIds = [...new Set(Object.values(currentRosterIds).flat())];
  await writeJson('rostered-ids.json', { lastUpdated: nowIso(), ids: rosteredIds });

  // ---- Standings ----
  const standings = teamData.teams.map((t) => {
    const r = t.record.overall;
    return {
      id: t.id,
      name: teamNames[t.id],
      wins: r.wins,
      losses: r.losses,
      ties: r.ties,
      pointsFor: Math.round(r.pointsFor * 10) / 10,
      pointsAgainst: Math.round(r.pointsAgainst * 10) / 10,
      streakType: r.streakType,
      streakLength: r.streakLength
    };
  }).sort((a, b) => b.wins - a.wins || b.pointsFor - a.pointsFor);
  await writeJson('standings.json', { lastUpdated: nowIso(), data: standings });

  // ---- Conference-Tabellenstand (für Recap-Storylines "vor allem" relevant, nicht die
  // projektionsbasierten Power Rankings – siehe findConferenceStandingFact()) ----
  const confStandings = {};
  ['NFC', 'AFC'].forEach((conf) => {
    standings
      .filter((s) => TEAM_CONF[s.name] === conf)
      .slice()
      .sort((a, b) => b.wins - a.wins || b.pointsFor - a.pointsFor)
      .forEach((s, i) => { confStandings[s.id] = { conf, rank: i + 1, wins: s.wins, losses: s.losses, ties: s.ties }; });
  });

  // ---- Scoreboard (Regular Season Wochen 1-15 + Playoff-Wochen danach) ----
  // Kein hartes Limit auf Woche 15 mehr: ESPN liefert im selben Schedule auch die Playoff-Wochen
  // (bei dieser Liga aktuell 2), die einfach mit übernommen werden – die Zahl 25 ist nur eine grobe
  // Notbremse gegen kaputte/unerwartete Daten, keine echte funktionale Grenze. Playoff-Matchups mit
  // einem Freilos (kein echter Gegner) werden übersprungen, da für diese kein sinnvoller Recap/
  // Vergleich möglich ist.
  // ESPN markiert Playoff-Matchups selbst mit playoffTierType ('WINNERS_BRACKET' = Championship-Jagd,
  // 'LOSERS_BRACKET' = Platzierungsspiele/Toilet Bowl, 'NONE'/fehlend = normale Regular-Season-Partie).
  // Wir bilden ESPNs eigene Playoff-Seeding-Logik damit NICHT selbst nach – wir übernehmen nur, wie
  // ESPN das jeweilige Spiel bereits selbst einordnet.
  const weeksMap = {};
  (scoreData.schedule || []).forEach((e) => {
    const wk = e.matchupPeriodId;
    if (wk > 25) return;
    if (!e.home?.teamId || !e.away?.teamId) return;
    (weeksMap[wk] = weeksMap[wk] || []).push({
      homeId: e.home.teamId, homeName: teamNames[e.home.teamId], homeScore: Math.round(e.home.totalPoints * 10) / 10,
      awayId: e.away.teamId, awayName: teamNames[e.away.teamId], awayScore: Math.round(e.away.totalPoints * 10) / 10,
      playoffTier: e.playoffTierType && e.playoffTierType !== 'NONE' ? e.playoffTierType : null,
      winner: e.winner
    });
  });
  const scoreboard = Object.keys(weeksMap).map(Number).sort((a, b) => a - b).map((wk) => ({ week: wk, games: weeksMap[wk] }));
  await writeJson('scoreboard.json', { lastUpdated: nowIso(), data: scoreboard });

  // ---- Power-Ranking-Verlauf: ein Snapshot pro abgeschlossenem Spieltag ----
  // ("Nach dem Draft" und "Vor dem 1. Spieltag" sind einmalig von Hand gesetzt und
  // werden hier nie verändert; ab der ersten komplett gewerteten Woche kommt pro
  // Woche automatisch ein neuer bzw. aktualisierter Snapshot dazu.)
  let lastCompletedWeek = 0;
  for (const wk of scoreboard) {
    if (wk.games.length && wk.games.every((g) => g.winner !== 'UNDECIDED')) lastCompletedWeek = wk.week;
    else break;
  }
  if (lastCompletedWeek > 0) {
    const history = await readJsonSafe('power-rankings-history.json', { snapshots: [] });
    const key = 'week-' + lastCompletedWeek;
    const snapshotTeams = teamsComputed.map((t) => ({ id: t.id, name: t.name, rank: t.rank, starterTotal: t.starterTotal }));
    const newSnapshot = { key, label: 'Nach Woche ' + lastCompletedWeek, date: new Date().toLocaleDateString('de-CH'), teams: snapshotTeams };
    const idx = history.snapshots.findIndex((s) => s.key === key);
    if (idx >= 0) history.snapshots[idx] = newSnapshot;
    else history.snapshots.push(newSnapshot);
    await writeJson('power-rankings-history.json', { lastUpdated: nowIso(), snapshots: history.snapshots });
  }

  // ---- Conference-Standings-Verlauf: analog zum Power-Ranking-Verlauf, ein Snapshot pro
  // abgeschlossenem Spieltag. Dient hier primär dazu, im Recap eine Rang-Bewegung ("klettert von
  // Platz 4 auf Platz 2") erkennen zu können – der Vorwochen-Snapshot wird VOR dem Überschreiben
  // ausgelesen, siehe prevConfRankById unten.
  let prevConfRankById = {};
  if (lastCompletedWeek > 0) {
    const confHistory = await readJsonSafe('conference-standings-history.json', { snapshots: [] });
    const prevKey = 'week-' + (lastCompletedWeek - 1);
    const prevSnapshot = confHistory.snapshots.find((s) => s.key === prevKey);
    if (prevSnapshot) prevSnapshot.teams.forEach((t) => { prevConfRankById[t.id] = t.rank; });

    const key = 'week-' + lastCompletedWeek;
    const snapshotTeams = Object.entries(confStandings).map(([id, c]) => ({ id: Number(id), name: teamNames[id], ...c }));
    const newSnapshot = { key, label: 'Nach Woche ' + lastCompletedWeek, date: new Date().toLocaleDateString('de-CH'), teams: snapshotTeams };
    const idx = confHistory.snapshots.findIndex((s) => s.key === key);
    if (idx >= 0) confHistory.snapshots[idx] = newSnapshot;
    else confHistory.snapshots.push(newSnapshot);
    await writeJson('conference-standings-history.json', { lastUpdated: nowIso(), snapshots: confHistory.snapshots });
  }

  // ---- Spiel-Recaps (von Claude geschrieben, im Stil des Saison-Ausblicks) ----
  // Nur für die Woche, die gerade komplett abgeschlossen wurde – läuft ohne
  // ANTHROPIC_API_KEY einfach nicht (siehe generate-recaps.mjs).
  if (lastCompletedWeek > 0) {
    const starterTotalById = Object.fromEntries(teamsComputed.map((t) => [t.id, t.starterTotal]));
    const weekGames = scoreboard.find((w) => w.week === lastCompletedWeek)?.games || [];
    const keyMomentsByTeam = await fetchWeeklyKeyMomentsByTeam(lastCompletedWeek);
    const standingsById = Object.fromEntries(standings.map((s) => [s.id, s]));
    const existingTransactions = (await readJsonSafe('transactions.json', { data: [] })).data || [];
    const liveSnapshotData = await readJsonSafe('live-snapshots.json', { week: null, snapshots: [] });
    const liveSnapshots = liveSnapshotData.week === lastCompletedWeek ? liveSnapshotData.snapshots : null;
    const seasonPersonality = await readJsonSafe('season-personality.json', { weeksArchived: [], teams: {} });
    const ctx = { standingsById, standings, confStandings, prevConfRankById, scoreboard, weekGames, transactions: existingTransactions, liveSnapshots, seasonPersonality };
    const enrichedGames = weekGames.map((g) => {
      const base = {
        ...g,
        week: lastCompletedWeek,
        homeProj: starterTotalById[g.homeId] || 0,
        awayProj: starterTotalById[g.awayId] || 0
      };
      return { ...base, ...findKeyMoments(base, keyMomentsByTeam[g.homeId], keyMomentsByTeam[g.awayId], ctx) };
    });

    const oldRecaps = await readJsonSafe('game-recaps.json', { data: {} });
    const existing = oldRecaps.data || {};
    const newRecaps = await generateRecapsForGames(enrichedGames, existing);
    if (Object.keys(newRecaps).length) {
      await writeJson('game-recaps.json', { lastUpdated: nowIso(), data: { ...existing, ...newRecaps } });
    }

    if (liveSnapshots) {
      await archiveLiveSnapshotWeek(lastCompletedWeek, weekGames, liveSnapshots);
    }
  }

  // ---- Transaktionen: Roster-Diff gegen letzten Snapshot (erkennt Trades/Adds/Drops generisch) ----
  const currentWeek = teamData.status?.currentMatchupPeriod || teamData.scoringPeriodId || 1;
  const snapshot = await readJsonSafe('roster-snapshot.json', {});
  const oldTx = await readJsonSafe('transactions.json', { data: [] });
  const existingTx = oldTx.data || [];
  const newTx = [];
  const todayStr = new Date().toLocaleDateString('de-CH');

  const gainedByTeam = {}, lostByTeam = {};
  teamData.teams.forEach((t) => {
    const prevIds = new Set(snapshot[t.id] || []);
    const currIds = new Set(currentRosterIds[t.id]);
    gainedByTeam[t.id] = [...currIds].filter((id) => !prevIds.has(id));
    lostByTeam[t.id] = [...prevIds].filter((id) => !currIds.has(id));
  });

  const isFirstRun = Object.keys(snapshot).length === 0;
  if (!isFirstRun) {
    // Trades: ein Spieler, den Team A verliert und Team B im selben Lauf gewinnt.
    const consumed = new Set();
    teamData.teams.forEach((tA) => {
      lostByTeam[tA.id].forEach((playerId) => {
        if (consumed.has(playerId)) return;
        teamData.teams.forEach((tB) => {
          if (tB.id === tA.id) return;
          if (gainedByTeam[tB.id].includes(playerId)) {
            // gefunden: Trade-Leg A -> B. Sammle alle Spieler, die zwischen genau
            // diesen zwei Teams wechselten, zu einem einzigen Trade-Eintrag.
            const aToB = lostByTeam[tA.id].filter((id) => gainedByTeam[tB.id].includes(id));
            const bToA = lostByTeam[tB.id].filter((id) => gainedByTeam[tA.id].includes(id));
            if (aToB.length && !aToB.some((id) => consumed.has(id))) {
              aToB.forEach((id) => consumed.add(id));
              bToA.forEach((id) => consumed.add(id));
              const aGets = bToA.map((id) => playerInfo(id).name).join(', ') || '(nichts)';
              const bGets = aToB.map((id) => playerInfo(id).name).join(', ') || '(nichts)';
              newTx.push({
                id: 'trade-' + tA.id + '-' + tB.id + '-' + Date.now(),
                week: currentWeek, date: todayStr, type: 'TRADE',
                title: `Trade: ${teamNames[tA.id]} ↔ ${teamNames[tB.id]}`,
                detail: `${teamNames[tA.id]} erhält ${aGets}. ${teamNames[tB.id]} erhält ${bGets}.`,
                note: ''
              });
            }
          }
        });
      });
    });
    // Übrige Adds/Drops (nicht Teil eines Trades) = Waiver/Free Agent
    teamData.teams.forEach((t) => {
      const gained = gainedByTeam[t.id].filter((id) => !consumed.has(id));
      const lost = lostByTeam[t.id].filter((id) => !consumed.has(id));
      gained.forEach((id) => {
        const dropped = lost.length ? playerInfo(lost.shift()).name : null;
        newTx.push({
          id: 'add-' + t.id + '-' + id + '-' + Date.now(),
          week: currentWeek, date: todayStr, type: 'FREEAGENT',
          title: `${teamNames[t.id]} holt ${playerInfo(id).name}`,
          detail: dropped ? `${teamNames[t.id]} holt ${playerInfo(id).name} (${playerInfo(id).pos}, ${playerInfo(id).proTeam}) und wirft dafür ${dropped} ab.` : `${teamNames[t.id]} holt ${playerInfo(id).name} (${playerInfo(id).pos}, ${playerInfo(id).proTeam}) dazu.`,
          note: ''
        });
      });
      lost.forEach((id) => {
        newTx.push({
          id: 'drop-' + t.id + '-' + id + '-' + Date.now(),
          week: currentWeek, date: todayStr, type: 'FREEAGENT',
          teamId: t.id, playerId: id,
          title: `${teamNames[t.id]} wirft ${playerInfo(id).name} ab`,
          detail: `${teamNames[t.id]} lässt ${playerInfo(id).name} (${playerInfo(id).pos}, ${playerInfo(id).proTeam}) frei.`,
          note: ''
        });
      });
    });
  } else {
    console.log('Erster Lauf: kein Roster-Snapshot vorhanden, Transaktions-Diff wird übersprungen (nicht als Adds/Drops gewertet).');
  }

  if (newTx.length) {
    console.log(`${newTx.length} neue Transaktion(en) erkannt.`);
  }
  await writeJson('transactions.json', { lastUpdated: nowIso(), data: [...existingTx, ...newTx] });

  // ---- Snapshot für den nächsten Lauf speichern ----
  const newSnapshot = {};
  Object.keys(currentRosterIds).forEach((tid) => { newSnapshot[tid] = currentRosterIds[tid]; });
  await writeJson('roster-snapshot.json', newSnapshot);

  console.log('Sync abgeschlossen.');
}

main().catch((err) => {
  console.error('Sync fehlgeschlagen:', err);
  process.exit(1);
});
