// Holt Draft/Roster/Standings/Scoreboard/Transaktionen aus der privaten ESPN-Liga und
// schreibt die Ergebnisse nach ../data/*.json. Läuft per GitHub Actions (siehe
// .github/workflows/espn-sync.yml) oder lokal mit ESPN_S2/ESPN_SWID als Env-Vars.
//
// Schreibt NIE team-content.json (die handgeschriebenen Analysen/Ausblicke) – das bleibt
// ausschliesslich manuell gepflegt.
import { POS_MAP, TEAM_ABBR, projectedPoints, findSeasonProjection, buildOptimalLineup } from './scoring.mjs';
import { generateRecapsForGames, generateWeekRecap, generateWeekPreview } from './generate-recaps.mjs';
import { SEASON, fetchLeague, readJsonSafe, writeJson, nowIso } from './espn-client.mjs';

// Conference-Zuordnung – deckungsgleich mit TEAM_CONF in power-rankings.html/schedule.html.
// ESPNs API liefert für diese Liga keine nutzbare Conference/Division-Info, daher von Hand gepflegt.
const TEAM_CONF = {
  'Tackleberry Finn': 'NFC', 'Apukalypse Now': 'NFC', 'Hopp Schwiiz': 'NFC', 'Buhaaner': 'NFC',
  'Run CMC': 'AFC', 'Queen of Chaos': 'AFC', 'Sherlock Mahomes': 'AFC', 'TM06': 'AFC',
  'Saints of Anarchy': 'NFC', 'Zurich City Ravens': 'AFC'
};

const DEFAULTS_URL = `https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/${SEASON}/segments/0/leaguedefaults/3?view=kona_player_info`;

// ESPN-Lineup-Slot-IDs je Position, für die Free-Agent-Filterung - identisch zu shared.SLOT_IDS in
// shared.js (dort für dieselbe Abfrage clientseitig auf my-team.html verwendet). DEFAULTS_URL ist
// ein öffentlicher Endpoint ohne Liga-Cookie (siehe fetchProjections direkt darunter), funktioniert
// also serverseitig genauso wie clientseitig.
const SLOT_IDS = { QB: 0, RB: 2, WR: 4, TE: 6, K: 17, DST: 16 };

// Bester verfügbarer (nicht rostered) Free Agent an einer Position, sortiert nach ADP - server-
// seitiger Nachbau von fetchFreeAgents() in my-team.html, nur für Track-Record-Zwecke (siehe
// recordAndGradeSuggestions() weiter unten): welcher Spieler wäre als Erstes vorgeschlagen worden.
async function fetchTopFreeAgent(pos, rosteredIdSet) {
  const filter = JSON.stringify({
    players: {
      filterSlotIds: { value: [SLOT_IDS[pos]] },
      filterStatsForSourceIds: { value: [1] },
      filterStatsForSplitTypeIds: { value: [0] },
      sortDraftRanks: { sortPriority: 1, sortAsc: true, value: 'PPR' },
      limit: 30,
      offset: 0
    }
  });
  const res = await fetch(DEFAULTS_URL, { headers: { 'x-fantasy-filter': filter } });
  if (!res.ok) throw new Error(`Free-Agent-Fetch fehlgeschlagen (${res.status})`);
  const data = await res.json();
  const candidates = (data.players || []).map((pe) => pe.player).filter((p) => !rosteredIdSet.has(p.id));
  if (!candidates.length) return null;
  const p = candidates[0];
  return {
    id: p.id,
    name: p.fullName,
    pos,
    proTeam: TEAM_ABBR[p.proTeamId] || '',
    adp: (p.ownership && p.ownership.averageDraftPosition) || 999
  };
}

export async function fetchProjections(ids) {
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
      proj: projectedPoints(pos, stats),
      injuryStatus: p.injuryStatus || null
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

// Bildet die echten 4 Playoff-Teams dieser Liga nach: die Top 2 JEDER Conference (je 2 aus NFC und
// AFC, nicht Conference-Sieger + liga-weite Wildcards) qualifizieren sich, geseedet 1-4 nach
// Gesamt-Bilanz über beide Conferences hinweg. Bewusst KEIN Tiebreaker über Punkte simuliert (nur
// Siege, dann Punkte als Tiebreak wie überall sonst in diesem Script) – bei echten Gleichständen
// kann ESPNs exakte Einordnung leicht abweichen, das ist hier nur die Grundlage fürs
// Playoff-Rennen-Narrativ, nicht die offizielle Quelle für den tatsächlichen Bracket.
function computePlayoffPicture(standings, confStandings) {
  const playoffPool = standings.filter((s) => (confStandings[s.id]?.rank ?? 99) <= 2);
  const outsidePool = standings.filter((s) => (confStandings[s.id]?.rank ?? 99) > 2);
  const playoffTeams = playoffPool
    .slice()
    .sort((a, b) => b.wins - a.wins || b.pointsFor - a.pointsFor)
    .map((t, i) => ({ ...t, seed: i + 1 }));
  const outside = outsidePool.slice().sort((a, b) => b.wins - a.wins || b.pointsFor - a.pointsFor);
  const cutoffWins = playoffTeams.length ? playoffTeams[playoffTeams.length - 1].wins : 0;
  return { playoffTeams, outside, cutoffWins };
}

// Playoff- und Consolation-Bracket (Wochen 16+17) für schedule.html. Seeds 1-4 kommen aus
// computePlayoffPicture() (Top 2 je Conference, geseedet nach Gesamt-Bilanz), Seeds 5-10 sind die
// übrigen Teams (Platz 3-5 je Conference) in derselben Sortierung (Siege, dann Punkte als
// Tiebreak). Solange die echten Playoff-Wochen noch nicht gespielt sind, ist das
// eine reine Projektion nach aktuellem Tabellenstand (wird über die Saison präziser); sobald ESPNs
// Scoreboard für Woche 16/17 ein echtes Spiel mit passendem Team-Paar liefert, werden Score/Sieger
// von dort übernommen statt geraten. Runde-2-Gegner (Finale, Platz-3, Platzierungsspiele) sind erst
// bekannt, sobald Runde 1 ein echtes Ergebnis hat - bis dahin bleibt teamA/teamB null und
// placeholderA/B beschreiben die Quelle ("Sieger Halbfinale A"), analog zum statischen Beispiel.
function buildPlayoffBracket(standings, confStandings, scoreboard) {
  const { playoffTeams, outside } = computePlayoffPicture(standings, confStandings);
  const consTeams = outside.map((t, i) => ({ ...t, seed: i + 5 }));
  const bySeed = {};
  [...playoffTeams, ...consTeams].forEach((t) => { bySeed[t.seed] = t; });

  const weekGames = (wk) => (scoreboard.find((w) => w.week === wk) || {}).games || [];
  const findGame = (wk, idA, idB) => weekGames(wk).find((g) =>
    (g.homeId === idA && g.awayId === idB) || (g.homeId === idB && g.awayId === idA));
  const teamRef = (t) => (t ? { id: t.id, name: t.name, seed: t.seed } : null);
  const decideWinner = (g, hiId) => {
    if (!g || (g.winner !== 'HOME' && g.winner !== 'AWAY')) return null;
    return (g.winner === 'HOME') === (g.homeId === hiId) ? 'A' : 'B';
  };
  const scoreFor = (g, id) => (g.homeId === id ? g.homeScore : g.awayScore);

  function seedMatch(week, label, seedHi, seedLo) {
    const hi = bySeed[seedHi], lo = bySeed[seedLo];
    const teamA = teamRef(hi), teamB = teamRef(lo);
    const g = (hi && lo) ? findGame(week, hi.id, lo.id) : null;
    const winner = g ? decideWinner(g, hi.id) : null;
    return {
      week, label, teamA, teamB,
      scoreA: winner ? scoreFor(g, hi.id) : null,
      scoreB: winner ? scoreFor(g, lo.id) : null,
      winner
    };
  }

  function derivedMatch(week, label, placeholderA, srcA, pickA, placeholderB, srcB, pickB) {
    const pick = (src, which) => {
      if (!src || !src.winner) return null;
      if (which === 'winner') return src.winner === 'A' ? src.teamA : src.teamB;
      return src.winner === 'A' ? src.teamB : src.teamA;
    };
    const hi = pick(srcA, pickA);
    const lo = pick(srcB, pickB);
    if (!hi || !lo) return { week, label, teamA: hi, teamB: lo, scoreA: null, scoreB: null, winner: null, placeholderA, placeholderB };
    const g = findGame(week, hi.id, lo.id);
    const winner = g ? decideWinner(g, hi.id) : null;
    return {
      week, label, teamA: hi, teamB: lo,
      scoreA: winner ? scoreFor(g, hi.id) : null,
      scoreB: winner ? scoreFor(g, lo.id) : null,
      winner, placeholderA, placeholderB
    };
  }

  const semiA = seedMatch(16, 'Halbfinale A', 1, 4);
  const semiB = seedMatch(16, 'Halbfinale B', 2, 3);
  const final = derivedMatch(17, 'Finale · Platz 1/2', 'Sieger Halbfinale A', semiA, 'winner', 'Sieger Halbfinale B', semiB, 'winner');
  const thirdPlace = derivedMatch(17, 'Spiel um Platz 3', 'Verlierer Halbfinale A', semiA, 'loser', 'Verlierer Halbfinale B', semiB, 'loser');

  const game1 = seedMatch(16, 'Spiel 1', 5, 10);
  const game2 = seedMatch(16, 'Spiel 2', 6, 9);
  const game3 = seedMatch(16, 'Spiel 3', 7, 8);
  const place56 = derivedMatch(17, 'Platz 5/6', 'Sieger Spiel 1', game1, 'winner', 'Sieger Spiel 2', game2, 'winner');
  const place78 = derivedMatch(17, 'Platz 7/8', 'Sieger Spiel 3', game3, 'winner', 'Verlierer Spiel 3', game3, 'loser');
  const place910 = derivedMatch(17, 'Platz 9/10', 'Verlierer Spiel 2', game2, 'loser', 'Verlierer Spiel 1', game1, 'loser');

  const qualTag = (team) => {
    const cs = confStandings[team.id];
    if (!cs) return null;
    if (cs.rank === 1) return cs.conf + '-Sieger';
    if (cs.rank === 2) return cs.conf + ' #2';
    return null;
  };
  const seeds = [...playoffTeams, ...consTeams].sort((a, b) => a.seed - b.seed).map((t) => ({
    id: t.id, name: t.name, seed: t.seed, wins: t.wins, losses: t.losses, ties: t.ties,
    pointsFor: t.pointsFor, qualTag: qualTag(t)
  }));

  return {
    seeds,
    champBracket: { semiA, semiB, final, thirdPlace },
    consBracket: { game1, game2, game3, place56, place78, place910 }
  };
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
  // Da sich zwei Teams laut Liga-Format maximal zweimal pro Saison begegnen, gibt es innerhalb einer
  // Saison keine "3. Sieg in Serie"-Serienzählung – als Ersatz dafür markieren wir, ob dies (weil kein
  // weiteres Duell mehr im Restspielplan steht) das letzte Aufeinandertreffen der Saison war.
  const hasFutureMeeting = scoreboard.some((wk) => wk.week > game.week && wk.games.some((g) => pairKey(g.homeId, g.awayId) === thisKey));
  return {
    week: earlier.week,
    winner: earlierWinner,
    scoreLine: `${earlier.homeName} ${earlier.homeScore.toFixed(1)} : ${earlier.awayScore.toFixed(1)} ${earlier.awayName}`,
    isRevenge: !!(earlierWinner && thisWinner && earlierWinner !== thisWinner),
    isFinalMeeting: !hasFutureMeeting
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
// Ignoriert Snapshots, bei denen dieses Spiel noch bei 0:0 stand – das heisst nicht "Team lag bei 0
// Punkten zurück", sondern schlicht "das Spiel hatte zu dem Zeitpunkt noch nicht angefangen zu
// punkten" (z.B. weil der allererste Snapshot der Woche vor dem eigentlichen Spielbeginn lag). Ohne
// diesen Filter hätte praktisch jedes Team fälschlich eine "startete bei 0 Punkten"-Geschichte.
function extractDiffTimeline(game, liveSnapshots) {
  const diffs = [];
  (liveSnapshots || []).forEach((s) => {
    const g = s.games.find((gg) => gg.homeId === game.homeId && gg.awayId === game.awayId);
    if (g && (g.homeScore !== 0 || g.awayScore !== 0)) diffs.push(g.homeScore - g.awayScore);
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

// Nervenkrieg: wie oft wechselte die Führung laut unseren Zwischenständen den Besitzer. Trägt
// zusätzlich das am Ende UNTERLEGENE Team mit - ab 3 Wechseln nutzt generate-recaps.mjs das für die
// schärfere "Achterbahn-Niederlage"-Variante (hin und her gerissen und am Ende trotzdem leer
// ausgegangen), statt eines separaten, mit denselben Daten fast identisch klingenden Fakts.
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
  const loserTeam = game.winner === 'HOME' ? game.awayName : game.homeName;
  return { changes, loserTeam };
}

// Schnellstarter/Spätzünder: Anteil des Endstands, den ein Team schon beim ersten ECHTEN Zwischen-
// stand der Woche draufhatte (erster Snapshot, bei dem dieses Team schon einen Punktestand > 0 hat –
// ein 0:0-Snapshot bedeutet nur "Spiel noch nicht losgegangen", kein echter Frühstand) – relativ statt
// absolut gemessen, damit es unabhängig vom genauen Scoring-Niveau dieser Liga funktioniert.
function findPaceFact(game, liveSnapshots) {
  if (!liveSnapshots?.length) return null;
  const check = (teamId, teamName, finalScore) => {
    if (finalScore < 20) return null;
    const first = liveSnapshots.find((s) => {
      const g = s.games.find((gg) => gg.homeId === teamId || gg.awayId === teamId);
      if (!g) return false;
      const score = g.homeId === teamId ? g.homeScore : g.awayScore;
      return score > 0;
    });
    if (!first) return null;
    const g = first.games.find((gg) => gg.homeId === teamId || gg.awayId === teamId);
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

// Wire-to-Wire: das SIEGER-Team führte laut unseren Zwischenständen die ganze Woche durch - lag zu
// keinem erfassten Zeitpunkt auch nur kurz zurück (1 Punkt Toleranz für Rundungs-Gleichstände).
// Gegenstück zu findComebackFact() (dort verliert das früh führende Team am Ende noch; hier
// kontrolliert der Sieger das Spiel einfach durch). Braucht mindestens 2 echte Zwischenstände plus
// Endstand, sonst ist "nie zurückgelegen" nur Zufall dünner Daten. Blowouts (≥50 Punkte Vorsprung,
// selbes Kriterium wie der "blowout"-Badge) werden bewusst ausgeschlossen - die sind schon durch den
// Blowout-Hinweis abgedeckt, "wire-to-wire" soll ein noch spannend aussehendes Spiel markieren, das
// nie wirklich kippte, nicht jeden Kantersieg zusätzlich labeln.
function findWireToWireFact(game, liveSnapshots) {
  if (game.winner !== 'HOME' && game.winner !== 'AWAY') return null;
  const diffs = extractDiffTimeline(game, liveSnapshots);
  if (diffs.length < 3) return null;
  const winnerIsHome = game.winner === 'HOME';
  const neverTrailed = winnerIsHome ? diffs.every((d) => d >= -1) : diffs.every((d) => d <= 1);
  if (!neverTrailed) return null;
  const finalMargin = Math.abs(game.homeScore - game.awayScore);
  if (finalMargin >= 50) return null;
  return { team: winnerIsHome ? game.homeName : game.awayName, finalMargin };
}

// Grösster Einzelsprung: das Zeitfenster zwischen zwei aufeinanderfolgenden ECHTEN Zwischenständen
// (nicht der synthetische Endstand-Punkt am Schluss von extractDiffTimeline), in dem sich der
// Punkteabstand am stärksten verschoben hat - erst mit den seit Herbst 2026 alle 30 Minuten
// laufenden Snapshots (siehe espn-live-snapshot.yml) überhaupt aussagekräftig messbar, vorher lagen
// zwischen zwei Messungen oft schon Stunden. Nur "echte" Sprünge (≤90 Minuten Abstand zwischen den
// beiden Messungen) zählen, damit eine grosse Lücke durch einen verpassten Snapshot-Lauf nicht als
// falscher "plötzlicher" Sprung durchgeht.
function findBiggestSwingFact(game, liveSnapshots) {
  if (!liveSnapshots?.length || liveSnapshots.length < 2) return null;
  const points = [];
  liveSnapshots.forEach((s) => {
    const g = s.games.find((gg) => gg.homeId === game.homeId && gg.awayId === game.awayId);
    if (g && (g.homeScore !== 0 || g.awayScore !== 0)) points.push({ at: s.at, diff: g.homeScore - g.awayScore });
  });
  if (points.length < 2) return null;
  let maxSwing = 0, maxMinutes = null;
  for (let i = 1; i < points.length; i++) {
    const swing = Math.abs(points[i].diff - points[i - 1].diff);
    if (swing > maxSwing) {
      maxSwing = swing;
      maxMinutes = Math.round((new Date(points[i].at) - new Date(points[i - 1].at)) / 60000);
    }
  }
  if (maxSwing < 15 || maxMinutes === null || maxMinutes > 90 || maxMinutes < 1) return null;
  return { swing: maxSwing, minutes: maxMinutes };
}

// Buzzer-Beater-Führungswechsel: die Führung kippte erst beim allerletzten erfassten Übergang (vom
// vorletzten Zwischenstand zum Endstand) - das Spiel drehte sich quasi in letzter Sekunde. Ergänzt
// findLeadChangesFact() (zählt nur WIE OFT gewechselt wurde, nicht WANN der entscheidende Wechsel
// kam) und kann bei Montagabend-Spielen mit findMondayNightRescueFact() zusammen auftreten - beide
// beleuchten dasselbe dramatische Finish aus verschiedenen Blickwinkeln (Uhrzeit vs. Plötzlichkeit).
function findBuzzerBeaterFact(game, liveSnapshots) {
  if (game.winner !== 'HOME' && game.winner !== 'AWAY') return null;
  const diffs = extractDiffTimeline(game, liveSnapshots);
  if (diffs.length < 3) return null;
  const finalDiff = diffs[diffs.length - 1];
  const prevDiff = diffs[diffs.length - 2];
  const finalSign = finalDiff > 0 ? 1 : finalDiff < 0 ? -1 : 0;
  const prevSign = prevDiff > 0 ? 1 : prevDiff < 0 ? -1 : 0;
  if (finalSign === 0 || prevSign === 0 || finalSign === prevSign) return null;
  const winnerTeam = game.winner === 'HOME' ? game.homeName : game.awayName;
  return { winnerTeam, marginBefore: Math.abs(prevDiff) };
}

// Wochen-weite Stat (nicht pro Spiel, speist einen Satz im Wochenüberblick): wie viele der Matchups
// dieser Woche waren noch beim Anpfiff des Monday Night Football (grosszügig: vor 18:00 UTC Montag,
// dieselbe Schwelle wie findMondayNightRescueFact()) mit höchstens 15 Punkten Vorsprung offen -
// selbst wenn der Vorsprung am Ende hielt, war zu dem Zeitpunkt noch nicht sicher, wer gewinnt.
function countGamesOpenBeforeMonday(weekGames, liveSnapshots) {
  if (!liveSnapshots?.length) return null;
  const decided = weekGames.filter((g) => g.winner === 'HOME' || g.winner === 'AWAY');
  if (!decided.length) return null;
  const preMonday = liveSnapshots.filter((s) => {
    const d = new Date(s.at);
    return d.getUTCDay() !== 1 || d.getUTCHours() < 18;
  }).slice(-1)[0];
  if (!preMonday) return null;
  let open = 0;
  decided.forEach((g) => {
    const match = preMonday.games.find((gg) => gg.homeId === g.homeId && gg.awayId === g.awayId);
    if (!match) return;
    if (Math.abs(match.homeScore - match.awayScore) <= 15) open++;
  });
  return { open, total: decided.length };
}

// Persönlicher Bestwert: ist DIESER Comeback die grösste Aufholjagd der eigenen Saison bisher?
// Vergleich gegen den vor diesem Spiel in season-personality.json gespeicherten Bestwert
// (maxComebackDeficit, siehe archiveLiveSnapshotWeek()). Erst ab dem 2. Comeback der Saison
// aussagekräftig - beim allerersten wäre "Bestwert" trivial, weil es der einzige bisherige Fall ist.
function personalBestComebackDeficit(comeback, seasonPersonality, winnerId) {
  const t = seasonPersonality?.teams?.[winnerId];
  if (!t || (t.comebackWins || 0) < 1) return null;
  const priorBest = t.maxComebackDeficit || 0;
  if (comeback.peakLead <= priorBest) return null;
  return priorBest;
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
    const t = archive.teams[teamId] || { games: 0, comebackWins: 0, collapseLosses: 0, sustainedNailbiters: 0, ledWireToWire: 0, maxComebackDeficit: 0 };
    t.games++;
    Object.keys(patch).forEach((k) => {
      // maxComebackDeficit ist ein Rekordwert (grösster je aufgeholter Rückstand), kein Zähler -
      // wird nur bei einem neuen persönlichen Bestwert überschrieben, nicht bei jedem Spiel erhöht.
      if (k === 'maxComebackDeficit') { if (patch[k] > (t.maxComebackDeficit || 0)) t.maxComebackDeficit = patch[k]; }
      else if (patch[k]) t[k]++;
    });
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
      ledWireToWire: g.winner === 'HOME' && homeNeverTrailed,
      maxComebackDeficit: (g.winner === 'HOME' && maxAwayLead >= 15) ? maxAwayLead : 0
    });
    bump(g.awayId, {
      comebackWins: g.winner === 'AWAY' && maxHomeLead >= 15,
      collapseLosses: g.winner === 'HOME' && maxAwayLead >= 15,
      sustainedNailbiters: sustainedNailbiter,
      ledWireToWire: g.winner === 'AWAY' && awayNeverTrailed,
      maxComebackDeficit: (g.winner === 'AWAY' && maxHomeLead >= 15) ? maxHomeLead : 0
    });
  });

  archive.weeksArchived.push(week);
  await writeJson('season-personality.json', archive);
}

// Erwartungswert-Bilanz (vereinfachte Pythagorean-Expectation, Exponent 2 statt des "echten"
// Football-Exponenten ~2,37 – für eine Fantasy-Liga mit eigenem Scoring reicht die einfache Variante
// völlig): aus pointsFor/pointsAgainst lässt sich eine "eigentlich verdiente" Siegquote berechnen.
// Weicht die tatsächliche Bilanz um ≥1,5 Siege davon ab, ist das ein netter "die Bilanz lügt"-Fakt.
function findExpectationFact(game, standingsById) {
  const classify = (teamId, teamName) => {
    const s = standingsById[teamId];
    if (!s) return null;
    const gamesPlayed = s.wins + s.losses + (s.ties || 0);
    if (gamesPlayed < 3) return null;
    const pf2 = s.pointsFor ** 2;
    const pa2 = s.pointsAgainst ** 2;
    if (pf2 + pa2 === 0) return null;
    const expectedWins = (pf2 / (pf2 + pa2)) * gamesPlayed;
    const diff = s.wins - expectedWins;
    if (Math.abs(diff) < 1.5) return null;
    return { team: teamName, actualWins: s.wins, expectedWins, diff, lucky: diff > 0 };
  };
  const home = classify(game.homeId, game.homeName);
  const away = classify(game.awayId, game.awayName);
  return [home, away].filter(Boolean).sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff))[0] || null;
}

// Schnäppchen der Woche / Draft-Reue: nutzt playerId, das schon auf standout/loserBenchRegret hängt
// (siehe fetchWeeklyKeyMomentsByTeam), gegen die Draft-Runde des Spielers. Ein Standout, der erst
// spät gezogen wurde (Runde ≥10), ist ein Schnäppchen; ein Bankspieler, der einen früh gezogenen
// Starter (Runde ≤3) blamiert, ist Draft-Reue in Reinform.
function findDraftValueFact(game, result, draftRoundByPlayerId) {
  if (!draftRoundByPlayerId) return null;
  if (result.standout) {
    const round = draftRoundByPlayerId[result.standout.playerId];
    if (round != null && round >= 10) {
      const team = result.standout.side === 'home' ? game.homeName : game.awayName;
      return { type: 'bargain', team, name: result.standout.name, round, points: result.standout.points };
    }
  }
  if (result.loserBenchRegret) {
    const round = draftRoundByPlayerId[result.loserBenchRegret.starter.playerId];
    if (round != null && round <= 3) {
      return { type: 'draftRegret', team: result.loserBenchRegret.team, name: result.loserBenchRegret.starter.name, round, points: result.loserBenchRegret.starter.points };
    }
  }
  return null;
}

// "Imperium"-Storylines: griffige, bewusst grosse Erzähl-Etiketten für Team-Meilensteine (Rekord-
// basiert, nicht Wochen-Ergebnis-basiert) – auf Wunsch fürs bissig-witzige "das Imperium ist
// zementiert" & Co. Priorität bei mehreren zutreffenden Fällen: die dramatischste Geschichte zuerst.
function findEmpireStorylineFact(game, standingsById) {
  if (game.winner === 'TIE') return null;
  const classify = (teamId, teamName, isWinner) => {
    const s = standingsById[teamId];
    if (!s) return null;
    if (isWinner && s.wins === 1 && s.losses >= 3) return { team: teamName, type: 'firstWinBroken', wins: s.wins, losses: s.losses };
    if (s.wins === 0 && s.losses >= 4) return { team: teamName, type: 'winless', losses: s.losses };
    if (s.losses === 0 && (s.ties || 0) === 0 && s.wins >= 4) return { team: teamName, type: 'perfectRecord', wins: s.wins };
    if (isWinner && s.wins >= 5 && s.losses <= 2) return { team: teamName, type: 'empire', wins: s.wins, losses: s.losses };
    if (!isWinner && s.wins >= 5) return { team: teamName, type: 'empireCrumbling', wins: s.wins, losses: s.losses };
    if (s.streakType === 'WIN' && s.streakLength >= 3 && s.wins < s.losses) return { team: teamName, type: 'turnaround', streak: s.streakLength, wins: s.wins, losses: s.losses };
    return null;
  };
  const home = classify(game.homeId, game.homeName, game.winner === 'HOME');
  const away = classify(game.awayId, game.awayName, game.winner === 'AWAY');
  const priority = { firstWinBroken: 0, empireCrumbling: 1, winless: 2, empire: 3, turnaround: 4, perfectRecord: 5 };
  return [home, away].filter(Boolean).sort((a, b) => priority[a.type] - priority[b.type])[0] || null;
}

// ==== Zusätzliche Fakten-Kategorien (2026-09-15) - drei Gruppen: ====
// A) Brauchen nur diese Woche (auch in Woche 1 verfügbar)
// B) Brauchen Saison-Historie (ab Woche 2-3 sinnvoll, in Woche 1 meist null)
// C) Eigene Ideen abseits der beiden obigen Gruppen

// A1: Power-Ranking-Bewegung seit letzter Woche (bzw. seit "post-draft" in Woche 1) - die Daten
// liegen schon in power-rankings-history.json, hier nur noch verglichen.
function findPowerRankingMovementFact(game, powerRankingsHistory, week) {
  if (!powerRankingsHistory?.snapshots?.length) return null;
  const currKey = 'week-' + week;
  const prevKey = week > 1 ? 'week-' + (week - 1) : 'post-draft';
  const curr = powerRankingsHistory.snapshots.find((s) => s.key === currKey);
  const prev = powerRankingsHistory.snapshots.find((s) => s.key === prevKey);
  if (!curr || !prev) return null;
  const rankById = (snap) => Object.fromEntries(snap.teams.map((t) => [t.id, t.rank]));
  const currRank = rankById(curr);
  const prevRank = rankById(prev);
  const check = (teamId, teamName) => {
    const c = currRank[teamId], p = prevRank[teamId];
    if (c == null || p == null || c === p) return null;
    return { team: teamName, from: p, to: c, direction: c < p ? 'up' : 'down' };
  };
  const candidates = [check(game.homeId, game.homeName), check(game.awayId, game.awayName)].filter(Boolean);
  if (!candidates.length) return null;
  return candidates.sort((a, b) => Math.abs(b.from - b.to) - Math.abs(a.from - a.to))[0];
}

// A2: einer der beiden Starter in diesem Spiel war der bestpunktende Spieler seiner Position in der
// GESAMTEN Liga diese Woche (nicht nur in diesem einen Spiel wie beim bestehenden "standout").
function findLeagueWidePositionBestFact(game, keyMomentsByTeam) {
  if (!keyMomentsByTeam) return null;
  const bestByPos = {};
  Object.values(keyMomentsByTeam).forEach((perf) => {
    (perf?.starters || []).forEach((p) => {
      if (!bestByPos[p.pos] || p.points > bestByPos[p.pos].points) bestByPos[p.pos] = p;
    });
  });
  const participants = [
    ...(keyMomentsByTeam[game.homeId]?.starters || []).map((p) => ({ ...p, team: game.homeName })),
    ...(keyMomentsByTeam[game.awayId]?.starters || []).map((p) => ({ ...p, team: game.awayName }))
  ];
  const hit = participants.find((p) => bestByPos[p.pos]?.playerId === p.playerId && p.points > 0);
  if (!hit) return null;
  return { team: hit.team, name: hit.name, pos: hit.pos, points: hit.points };
}

// A3: knappstes bzw. deutlichstes Spiel der ganzen Woche (Marge statt Score - Gegenstück zu
// findSeasonExtremeFact, aber nur diese Woche, nicht saisonweit, und auf Basis der Differenz).
function findMarginExtremeFact(game, weekGames) {
  const decided = weekGames.filter((g) => g.winner === 'HOME' || g.winner === 'AWAY');
  if (decided.length < 2) return null;
  const entries = decided.map((g) => ({ g, margin: Math.abs(g.homeScore - g.awayScore) }));
  const closest = entries.reduce((a, b) => (b.margin < a.margin ? b : a));
  const widest = entries.reduce((a, b) => (b.margin > a.margin ? b : a));
  if (closest.margin === widest.margin) return null;
  const isThisGame = (entry) => entry.g.homeId === game.homeId && entry.g.awayId === game.awayId;
  if (isThisGame(closest)) return { type: 'closest', margin: closest.margin };
  if (isThisGame(widest)) return { type: 'widest', margin: widest.margin };
  return null;
}

// A4: Gegenstück zu findPositionalDominance - eine ganze Positionsgruppe (mit üblicherweise
// mehreren Startplätzen) hat fast nichts beigetragen.
function findPositionalFlopFact(game, homePerf, awayPerf) {
  const MULTI_SLOT_POS = ['RB', 'WR'];
  const groupTotals = (perf) => {
    const totals = {};
    (perf?.starters || []).forEach((p) => { totals[p.pos] = (totals[p.pos] || 0) + p.points; });
    return totals;
  };
  const candidates = [];
  Object.entries(groupTotals(homePerf)).forEach(([pos, total]) => {
    if (MULTI_SLOT_POS.includes(pos) && total <= 4) candidates.push({ team: game.homeName, pos, groupTotal: total });
  });
  Object.entries(groupTotals(awayPerf)).forEach(([pos, total]) => {
    if (MULTI_SLOT_POS.includes(pos) && total <= 4) candidates.push({ team: game.awayName, pos, groupTotal: total });
  });
  if (!candidates.length) return null;
  return candidates.sort((a, b) => a.groupTotal - b.groupTotal)[0];
}

// A5: ein Spieler, der DIESE Woche per Waiver/Free Agent geholt wurde, liefert sofort als Starter -
// einfacher als findWaiverKarmaFact (das einen alten Besitzer + Gegner-Duell braucht).
function findWaiverInstantSuccessFact(game, homePerf, awayPerf, transactions) {
  if (!transactions?.length) return null;
  const addsByTeam = {};
  transactions.forEach((t) => {
    if (t.type === 'FREEAGENT' && t.week === game.week && t.playerId != null && t.teamId != null && t.id?.startsWith('add-')) {
      (addsByTeam[t.teamId] = addsByTeam[t.teamId] || new Set()).add(t.playerId);
    }
  });
  const check = (teamId, teamName, perf) => {
    const added = addsByTeam[teamId];
    if (!added || !perf) return null;
    const hero = perf.starters.find((p) => added.has(p.playerId) && p.points >= 12);
    if (!hero) return null;
    return { team: teamName, name: hero.name, pos: hero.pos, points: hero.points };
  };
  return check(game.homeId, game.homeName, homePerf) || check(game.awayId, game.awayName, awayPerf) || null;
}

// A6: Favorit gewinnt fast exakt mit der vorhergesagten Marge - "genau wie prognostiziert".
function findChalkFact(game) {
  if (game.winner !== 'HOME' && game.winner !== 'AWAY') return null;
  const favorite = game.homeProj >= game.awayProj ? game.homeName : game.awayName;
  const winner = game.winner === 'HOME' ? game.homeName : game.awayName;
  if (favorite !== winner) return null;
  const projMargin = Math.abs(game.homeProj - game.awayProj);
  const actualMargin = Math.abs(game.homeScore - game.awayScore);
  if (projMargin < 5 || Math.abs(projMargin - actualMargin) > 5) return null;
  return { team: winner, projMargin: Math.round(projMargin), actualMargin: Math.round(actualMargin * 10) / 10 };
}

// B1: Team-Form über die letzten 3 Wochen durchgehend steigend oder fallend.
function findFormTrendFact(game, scoreboard, week) {
  if (week < 3) return null;
  const scoresFor = (teamId) => {
    const out = [];
    scoreboard.forEach((wk) => {
      if (wk.week > week) return;
      const g = wk.games.find((gg) => gg.homeId === teamId || gg.awayId === teamId);
      if (!g || (g.winner !== 'HOME' && g.winner !== 'AWAY' && g.winner !== 'TIE')) return;
      out.push({ week: wk.week, score: g.homeId === teamId ? g.homeScore : g.awayScore });
    });
    return out.sort((a, b) => a.week - b.week);
  };
  const check = (teamId, teamName) => {
    const scores = scoresFor(teamId);
    if (scores.length < 3) return null;
    const last3 = scores.slice(-3).map((s) => s.score);
    const rising = last3[0] < last3[1] && last3[1] < last3[2];
    const falling = last3[0] > last3[1] && last3[1] > last3[2];
    if (!rising && !falling) return null;
    return { team: teamName, direction: rising ? 'up' : 'down', scores: last3 };
  };
  return check(game.homeId, game.homeName) || check(game.awayId, game.awayName) || null;
}

// B2: eine Positionsgruppe liegt diese Woche UND im Saison-Schnitt des Teams deutlich unter dem
// Liga-Durchschnitt für diese Position - braucht data/season-stats.json (siehe archiveSeasonStats).
function findPositionalSlumpFact(game, homePerf, awayPerf, seasonStats) {
  if (!seasonStats?.teams) return null;
  const leagueAvgByPos = {};
  Object.values(seasonStats.teams).forEach((t) => {
    Object.entries(t.positions || {}).forEach(([pos, s]) => {
      if (!s.games) return;
      (leagueAvgByPos[pos] = leagueAvgByPos[pos] || []).push(s.total / s.games);
    });
  });
  const leagueAvg = (pos) => {
    const arr = leagueAvgByPos[pos];
    if (!arr?.length) return null;
    return arr.reduce((a, b) => a + b, 0) / arr.length;
  };
  const check = (teamId, teamName, perf) => {
    const t = seasonStats.teams[teamId];
    if (!t?.positions || !perf) return null;
    const thisWeekTotals = {};
    perf.starters.forEach((p) => { thisWeekTotals[p.pos] = (thisWeekTotals[p.pos] || 0) + p.points; });
    for (const [pos, total] of Object.entries(thisWeekTotals)) {
      const s = t.positions[pos];
      if (!s || s.games < 2) continue;
      const avg = leagueAvg(pos);
      if (avg == null || avg <= 0) continue;
      const teamAvg = s.total / s.games;
      if (teamAvg < avg * 0.7 && total < avg * 0.7) {
        return { team: teamName, pos, teamAvg: Math.round(teamAvg * 10) / 10, leagueAvg: Math.round(avg * 10) / 10, games: s.games };
      }
    }
    return null;
  };
  return check(game.homeId, game.homeName, homePerf) || check(game.awayId, game.awayName, awayPerf) || null;
}

// B3: über die Saison kumulierte, auf der Bank liegengelassene Punkte (Fortsetzung von
// findOptimalLineupGap, aber aufsummiert statt nur diese Woche) - braucht data/season-stats.json.
function findSeasonBenchTotalFact(game, seasonStats) {
  if (!seasonStats?.teams) return null;
  const THRESHOLD = 80;
  const check = (teamId, teamName) => {
    const t = seasonStats.teams[teamId];
    if (!t || t.games < 2 || (t.benchGapTotal || 0) < THRESHOLD) return null;
    return { team: teamName, total: Math.round(t.benchGapTotal * 10) / 10, games: t.games };
  };
  return check(game.homeId, game.homeName) || check(game.awayId, game.awayName) || null;
}

// B4: ein per Trade geholter Spieler liefert jetzt für sein neues Team - braucht die strukturierten
// "legs" an TRADE-Transaktionen (siehe main()).
function findTradeImpactFact(game, homePerf, awayPerf, transactions) {
  if (!transactions?.length) return null;
  const trades = transactions.filter((t) => t.type === 'TRADE' && Array.isArray(t.legs));
  if (!trades.length) return null;
  const check = (teamId, teamName, perf) => {
    if (!perf) return null;
    const allPlayers = [...perf.starters, ...perf.bench];
    for (const trade of trades) {
      const leg = trade.legs.find((l) => l.teamId === teamId);
      if (!leg) continue;
      const gained = allPlayers.find((p) => leg.gainedIds.includes(p.playerId) && p.points >= 15);
      if (gained) return { team: teamName, name: gained.name, pos: gained.pos, points: gained.points };
    }
    return null;
  };
  return check(game.homeId, game.homeName, homePerf) || check(game.awayId, game.awayName, awayPerf) || null;
}

// B5: Team mit der geringsten Wochen-zu-Wochen-Punkteschwankung der ganzen Liga bisher.
function findConsistencyFact(game, scoreboard, week) {
  if (week < 3) return null;
  const scoresFor = (teamId) => {
    const out = [];
    scoreboard.forEach((wk) => {
      if (wk.week > week) return;
      const g = wk.games.find((gg) => gg.homeId === teamId || gg.awayId === teamId);
      if (g) out.push(g.homeId === teamId ? g.homeScore : g.awayScore);
    });
    return out;
  };
  const stddev = (arr) => {
    const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
    return Math.sqrt(arr.reduce((a, b) => a + (b - mean) ** 2, 0) / arr.length);
  };
  const allTeamIds = [...new Set(scoreboard.flatMap((wk) => wk.games.flatMap((g) => [g.homeId, g.awayId])))];
  const stddevById = {};
  allTeamIds.forEach((id) => {
    const scores = scoresFor(id);
    if (scores.length >= 3) stddevById[id] = stddev(scores);
  });
  const ids = Object.keys(stddevById);
  if (ids.length < 3) return null;
  const minId = ids.reduce((a, b) => (stddevById[b] < stddevById[a] ? b : a));
  const check = (teamId, teamName) => {
    if (String(teamId) !== minId) return null;
    return { team: teamName, stddev: Math.round(stddevById[teamId] * 10) / 10, games: scoresFor(teamId).length };
  };
  return check(game.homeId, game.homeName) || check(game.awayId, game.awayName) || null;
}

// C1: Anzahl Aussenseiter-Siege dieses Teams über die Saison - braucht data/season-stats.json.
function findUpsetTallyFact(game, seasonStats) {
  if (!seasonStats?.teams) return null;
  const check = (teamId, teamName) => {
    const t = seasonStats.teams[teamId];
    if (!t || (t.upsetWins || 0) < 2) return null;
    return { team: teamName, count: t.upsetWins, games: t.games };
  };
  return check(game.homeId, game.homeName) || check(game.awayId, game.awayName) || null;
}

// C2: ein Starter war ganz nah an seiner eigenen bisherigen Saison-Bestleistung dran - braucht
// data/season-stats.json (players-Teil).
function findPerfectWeekProximityFact(game, homePerf, awayPerf, seasonStats) {
  if (!seasonStats?.players) return null;
  const check = (teamName, perf) => {
    if (!perf) return null;
    for (const p of perf.starters) {
      const best = seasonStats.players[p.playerId];
      if (!best || best.bestPoints <= 0) continue;
      const gap = best.bestPoints - p.points;
      if (gap >= 0 && gap <= 3 && p.points > 0) {
        return { team: teamName, name: p.name, pos: p.pos, points: p.points, seasonBest: best.bestPoints };
      }
    }
    return null;
  };
  return check(game.homeName, homePerf) || check(game.awayName, awayPerf) || null;
}

// Aktualisiert data/season-stats.json um die gerade abgeschlossene Woche - Grundlage für B2/B3/C1/C2
// oben. Analog zu archiveLiveSnapshotWeek (weeksArchived-Guard, läuft NACH der Recap-Generierung),
// aber unabhängig von Live-Snapshots - läuft auf Basis von Endständen/Rostern, die in jeder Woche
// verfügbar sind.
async function archiveSeasonStats(week, enrichedGames, keyMomentsByTeam) {
  const stats = await readJsonSafe('season-stats.json', { weeksArchived: [], teams: {}, players: {}, records: { topWeeklyPerformances: [] } });
  if (stats.weeksArchived.includes(week)) return;
  if (!stats.records) stats.records = { topWeeklyPerformances: [] };

  // Backfillt fehlende Felder auch auf BEREITS existierenden Team-Einträgen (z.B. aus einem Sync-Lauf
  // vor Einführung dieser Felder) – ohne das würde z.B. "t.closeWins++" auf undefined zu NaN werden
  // und ab dann für immer NaN bleiben, statt einfach bei 0 anzufangen. "positions" bewusst NICHT aus
  // einer geteilten Konstante gespreadet, sondern hier frisch pro Aufruf erzeugt – sonst würden alle
  // brandneuen Teams in diesem Lauf dieselbe positions-Objektreferenz teilen.
  const teamStat = (teamId) => {
    stats.teams[teamId] = {
      games: 0, benchGapTotal: 0, upsetWins: 0, positions: {},
      curStreakType: null, curStreakLen: 0, longestWinStreak: 0, longestLossStreak: 0,
      closeWins: 0, closeLosses: 0, blowoutWins: 0, blowoutLosses: 0,
      weeksAsHighScorer: 0, weeksAsLowScorer: 0,
      ...(stats.teams[teamId] || {})
    };
    return stats.teams[teamId];
  };

  const teamNameById = {};
  enrichedGames.forEach((g) => { teamNameById[g.homeId] = g.homeName; teamNameById[g.awayId] = g.awayName; });

  // Wochen-Highscorer/-Lowscorer: reiner Score-Vergleich innerhalb der 5 Spiele dieser Woche.
  const weekScores = [];
  enrichedGames.forEach((g) => {
    weekScores.push({ id: g.homeId, score: g.homeScore });
    weekScores.push({ id: g.awayId, score: g.awayScore });
  });
  const maxWeekScore = weekScores.length ? Math.max(...weekScores.map((s) => s.score)) : null;
  const minWeekScore = weekScores.length ? Math.min(...weekScores.map((s) => s.score)) : null;

  enrichedGames.forEach((g) => {
    if (g.winner === 'HOME' || g.winner === 'AWAY') {
      const favoriteId = g.homeProj >= g.awayProj ? g.homeId : g.awayId;
      const winnerId = g.winner === 'HOME' ? g.homeId : g.awayId;
      const wasUpset = favoriteId !== winnerId;
      [g.homeId, g.awayId].forEach((teamId) => {
        const t = teamStat(teamId);
        t.games++;
        if (teamId === winnerId && wasUpset) t.upsetWins++;
      });
    }

    // Serien-Rekord (unabhängig von ESPNs eigener, sich bei jedem Ende zurücksetzender
    // streakLength) + Margen-Bilanz (knapp <5 / deutlich >30 Punkte), je Team dieses Spiels.
    const margin = Math.abs(g.homeScore - g.awayScore);
    [
      { teamId: g.homeId, result: g.winner === 'TIE' ? 'TIE' : g.winner === 'HOME' ? 'WIN' : 'LOSS' },
      { teamId: g.awayId, result: g.winner === 'TIE' ? 'TIE' : g.winner === 'AWAY' ? 'WIN' : 'LOSS' }
    ].forEach(({ teamId, result }) => {
      const t = teamStat(teamId);
      if (result === 'WIN') {
        t.curStreakLen = (t.curStreakType === 'WIN' ? t.curStreakLen : 0) + 1;
        t.curStreakType = 'WIN';
        t.longestWinStreak = Math.max(t.longestWinStreak || 0, t.curStreakLen);
        if (margin < 5) t.closeWins++;
        if (margin > 30) t.blowoutWins++;
      } else if (result === 'LOSS') {
        t.curStreakLen = (t.curStreakType === 'LOSS' ? t.curStreakLen : 0) + 1;
        t.curStreakType = 'LOSS';
        t.longestLossStreak = Math.max(t.longestLossStreak || 0, t.curStreakLen);
        if (margin < 5) t.closeLosses++;
        if (margin > 30) t.blowoutLosses++;
      } else {
        t.curStreakType = null;
        t.curStreakLen = 0;
      }
      const score = teamId === g.homeId ? g.homeScore : g.awayScore;
      if (maxWeekScore != null && score === maxWeekScore) t.weeksAsHighScorer = (t.weeksAsHighScorer || 0) + 1;
      if (minWeekScore != null && score === minWeekScore) t.weeksAsLowScorer = (t.weeksAsLowScorer || 0) + 1;
    });

    const homeGap = findOptimalLineupGap(keyMomentsByTeam[g.homeId], g.homeName);
    const awayGap = findOptimalLineupGap(keyMomentsByTeam[g.awayId], g.awayName);
    if (homeGap) teamStat(g.homeId).benchGapTotal += homeGap.gap;
    if (awayGap) teamStat(g.awayId).benchGapTotal += awayGap.gap;

    [g.homeId, g.awayId].forEach((teamId) => {
      const perf = keyMomentsByTeam[teamId];
      if (!perf) return;
      const t = teamStat(teamId);
      const totals = {};
      perf.starters.forEach((p) => { totals[p.pos] = (totals[p.pos] || 0) + p.points; });
      Object.entries(totals).forEach(([pos, total]) => {
        if (!t.positions[pos]) t.positions[pos] = { total: 0, games: 0 };
        t.positions[pos].total += total;
        t.positions[pos].games++;
      });
    });
  });

  // totalPoints/gamesPlayed zählen JEDEN Auftritt (Start ODER Bank) - das ist der tatsächliche
  // Punkteschnitt eines Spielers unabhängig von Aufstellungs-Entscheidungen, Basis für die
  // "sobald echte Punkte da sind, real statt Projektion"-Bewertung in my-team.html. starterWeeks
  // bleibt separat nur für echte Starts (u.a. für findIronManFact gebraucht).
  Object.values(keyMomentsByTeam).forEach((perf) => {
    if (!perf) return;
    [...perf.starters, ...perf.bench].forEach((p) => {
      const existing = { bestPoints: 0, bestWeek: null, totalPoints: 0, gamesPlayed: 0, starterWeeks: 0, ...(stats.players[p.playerId] || {}) };
      if (p.points > existing.bestPoints) { existing.bestPoints = Math.round(p.points * 10) / 10; existing.bestWeek = week; }
      existing.totalPoints = Math.round((existing.totalPoints + p.points) * 10) / 10;
      existing.gamesPlayed = existing.gamesPlayed + 1;
      stats.players[p.playerId] = existing;
    });
    perf.starters.forEach((p) => {
      stats.players[p.playerId].starterWeeks = (stats.players[p.playerId].starterWeeks || 0) + 1;
    });
  });

  // "Mount Rushmore": Top-4-Einzelwochenleistungen der gesamten Ligageschichte (nur Starter, nicht
  // Bank – eine starke Bank-Woche zählt nicht als "Leistung", weil sie nie zum Sieg beitrug).
  Object.entries(keyMomentsByTeam).forEach(([teamId, perf]) => {
    if (!perf) return;
    perf.starters.forEach((p) => {
      stats.records.topWeeklyPerformances.push({
        playerId: p.playerId, name: p.name, pos: p.pos, team: teamNameById[teamId] || '?',
        points: Math.round(p.points * 10) / 10, week
      });
    });
  });
  stats.records.topWeeklyPerformances.sort((a, b) => b.points - a.points);
  stats.records.topWeeklyPerformances = stats.records.topWeeklyPerformances.slice(0, 4);

  stats.weeksArchived.push(week);
  await writeJson('season-stats.json', { lastUpdated: nowIso(), teams: stats.teams, players: stats.players, records: stats.records, weeksArchived: stats.weeksArchived });
}

// Baut für ein Spiel der KOMMENDEN (noch nicht gespielten) Woche einen leichten Vorschau-Fakten-Satz
// - anders als findKeyMoments() unten bewusst OHNE alles, was tatsächliche Spielleistung braucht
// (kein Standout, keine Bank-Reue - die Performance-Daten gibt's vor dem Anpfiff ja noch nicht).
// Nutzt dafür Fakten-Funktionen wieder, die ohnehin nur game.week/homeId/awayId/homeName/awayName
// plus Bilanz/Historie brauchen, keine Scores DIESES Spiels: findStreakFact, findConferenceStandingFact
// (der game.winner-Fallback am Ende greift bei "UNDECIDED" einfach auf das Heimteam zurück, harmlos),
// findPlayoffRaceFact, findExpectationFact, findRematchFact.
function buildPreviewMoments(game, ctx) {
  const result = {};
  if (ctx?.standingsById) {
    const streak = findStreakFact(game, ctx.standingsById);
    if (streak) result.streak = streak;
    const expectation = findExpectationFact(game, ctx.standingsById);
    if (expectation) result.expectation = expectation;
  }
  if (ctx?.confStandings) {
    const confStanding = findConferenceStandingFact(game, ctx.confStandings, ctx.prevConfRankById || {});
    if (confStanding) result.confStanding = confStanding;
  }
  if (ctx?.standings && ctx?.confStandings) {
    const playoffRace = findPlayoffRaceFact(game, ctx.standings, ctx.confStandings);
    if (playoffRace) result.playoffRace = playoffRace;
  }
  if (ctx?.scoreboard) {
    const rematch = findRematchFact(game, ctx.scoreboard);
    if (rematch) result.rematch = rematch;
  }
  if (ctx?.leagueHistory) {
    const defendingChampion = findDefendingChampionFact(game, ctx.standingsById || {}, ctx.leagueHistory);
    if (defendingChampion) result.defendingChampion = defendingChampion;
    const playoffHistory = findPlayoffHistoryFact(game, ctx.leagueHistory);
    if (playoffHistory) result.playoffHistory = playoffHistory;
  }
  return result;
}

// ==== Weitere Statistik-Kategorien (2026-09-15, zweite Runde) ====
// Auf Nutzerwunsch: mehr "für alles gibt's eine Statistik"-Fakten, aufbauend auf den erweiterten
// data/season-stats.json-Feldern (siehe archiveSeasonStats oben – Serien-Rekord, Margen-Bilanz,
// Wochen-Highscorer-Zähler, Spieler-Gesamtpunkte/Starter-Wochen, Liga-Mount-Rushmore).

// D1: Saison-Serie schlägt (oder egalisiert) den bisherigen Serien-Rekord dieses Teams – anders als
// der bestehende findStreakFact (der nur die aktuelle Serie nennt, ohne Bezug zum eigenen Rekord).
function findLongestStreakFact(game, standingsById, seasonStats) {
  if (!seasonStats?.teams) return null;
  const check = (teamId, teamName) => {
    const s = standingsById[teamId];
    const t = seasonStats.teams[teamId];
    if (!s || !t) return null;
    if (s.streakType === 'WIN' && s.streakLength >= 3 && s.streakLength >= (t.longestWinStreak || 0)) {
      return { team: teamName, length: s.streakLength, type: 'WIN' };
    }
    if (s.streakType === 'LOSS' && s.streakLength >= 3 && s.streakLength >= (t.longestLossStreak || 0)) {
      return { team: teamName, length: s.streakLength, type: 'LOSS' };
    }
    return null;
  };
  return check(game.homeId, game.homeName) || check(game.awayId, game.awayName) || null;
}

// D2: Team mit auffälliger Häufung von knappen (<5 Punkte) oder deutlichen (>30 Punkte) Spielen über
// die Saison – braucht closeWins/closeLosses/blowoutWins/blowoutLosses aus season-stats.json.
function findMarginTallyFact(game, seasonStats) {
  if (!seasonStats?.teams) return null;
  const check = (teamId, teamName) => {
    const t = seasonStats.teams[teamId];
    if (!t || t.games < 3) return null;
    const closeTotal = (t.closeWins || 0) + (t.closeLosses || 0);
    const blowoutTotal = (t.blowoutWins || 0) + (t.blowoutLosses || 0);
    if (closeTotal >= 3 && closeTotal >= blowoutTotal) return { team: teamName, type: 'close', count: closeTotal, games: t.games };
    if (blowoutTotal >= 3 && blowoutTotal > closeTotal) return { team: teamName, type: 'blowout', count: blowoutTotal, games: t.games };
    return null;
  };
  return check(game.homeId, game.homeName) || check(game.awayId, game.awayName) || null;
}

// D3: Team war diese Saison schon mehrfach Wochen-Highscorer bzw. -Lowscorer der gesamten Liga.
function findScoringLeaderTallyFact(game, seasonStats) {
  if (!seasonStats?.teams) return null;
  const check = (teamId, teamName) => {
    const t = seasonStats.teams[teamId];
    if (!t) return null;
    if ((t.weeksAsHighScorer || 0) >= 2) return { team: teamName, type: 'high', count: t.weeksAsHighScorer };
    if ((t.weeksAsLowScorer || 0) >= 2) return { team: teamName, type: 'low', count: t.weeksAsLowScorer };
    return null;
  };
  return check(game.homeId, game.homeName) || check(game.awayId, game.awayName) || null;
}

// D4: "Iron Man" – ein Starter stand diese Saison schon in JEDER Woche seines Teams in der
// Startaufstellung (mind. 3 Wochen Stichprobe).
function findIronManFact(game, homePerf, awayPerf, seasonStats, standingsById) {
  if (!seasonStats?.players) return null;
  const check = (teamId, teamName, perf) => {
    const s = standingsById[teamId];
    if (!s || !perf) return null;
    const gamesPlayed = s.wins + s.losses + (s.ties || 0);
    if (gamesPlayed < 4) return null;
    const priorGames = gamesPlayed - 1;
    if (priorGames < 3) return null;
    const hero = perf.starters.find((p) => seasonStats.players[p.playerId]?.starterWeeks === priorGames);
    if (!hero) return null;
    return { team: teamName, name: hero.name, pos: hero.pos, weeks: priorGames + 1 };
  };
  return check(game.homeId, game.homeName, homePerf) || check(game.awayId, game.awayName, awayPerf) || null;
}

// D5: "Mount Rushmore" – die Standout-Leistung dieses Spiels knackt die Top-4-Einzelwochenleistungen
// der gesamten Liga-Geschichte (siehe stats.records.topWeeklyPerformances, vor dieser Woche).
function findTopWeeklyPerformanceFact(result, game, seasonStats) {
  if (!result.standout || !seasonStats?.records?.topWeeklyPerformances?.length) return null;
  const top = seasonStats.records.topWeeklyPerformances;
  const rank = top.filter((t) => t.points > result.standout.points).length + 1;
  if (rank > 4) return null;
  const team = result.standout.side === 'home' ? game.homeName : game.awayName;
  return { team, name: result.standout.name, pos: result.standout.pos, points: result.standout.points, rank };
}

// D6: Team knackt diese Woche eine runde Saison-Gesamtpunkte-Marke (250er-Schritte).
function findSeasonMilestoneFact(game, standingsById) {
  const THRESHOLDS = [250, 500, 750, 1000, 1250, 1500, 1750, 2000, 2250, 2500];
  const check = (teamId, teamName, thisWeekScore) => {
    const s = standingsById[teamId];
    if (!s) return null;
    const prevPF = s.pointsFor - thisWeekScore;
    const crossed = THRESHOLDS.find((t) => prevPF < t && s.pointsFor >= t);
    if (crossed == null) return null;
    return { team: teamName, milestone: crossed, total: s.pointsFor };
  };
  return check(game.homeId, game.homeName, game.homeScore) || check(game.awayId, game.awayName, game.awayScore) || null;
}

// D7: Saisonlange (statt nur diese-Woche) Draft-Value-Bilanz – braucht players[id].totalPoints/
// starterWeeks aus season-stats.json plus draftRoundByPlayerId. Erst ab Woche 4 aussagekräftig.
function findSeasonDraftValueFact(game, homePerf, awayPerf, seasonStats, draftRoundByPlayerId, week) {
  if (!seasonStats?.players || !draftRoundByPlayerId || week < 4) return null;
  const check = (teamId, teamName, perf) => {
    if (!perf) return null;
    for (const p of perf.starters) {
      const round = draftRoundByPlayerId[p.playerId];
      const rec = seasonStats.players[p.playerId];
      if (round == null || !rec?.gamesPlayed) continue;
      if (round >= 10 && rec.totalPoints >= 60) {
        return { type: 'bargain', team: teamName, name: p.name, round, totalPoints: rec.totalPoints };
      }
      if (round <= 3 && rec.gamesPlayed >= 3 && (rec.totalPoints / rec.gamesPlayed) < 8) {
        return { type: 'bust', team: teamName, name: p.name, round, totalPoints: rec.totalPoints, avg: rec.totalPoints / rec.gamesPlayed };
      }
    }
    return null;
  };
  return check(game.homeId, game.homeName, homePerf) || check(game.awayId, game.awayName, awayPerf) || null;
}

// D8: Team mit der meisten Waiver-/Trade-Aktivität der Liga bisher (Kaderumbau-Storyline).
function findLeagueActivityFact(game, transactions) {
  if (!transactions?.length) return null;
  const countByTeam = {};
  transactions.forEach((t) => {
    if (t.type === 'FREEAGENT' && t.teamId != null) countByTeam[t.teamId] = (countByTeam[t.teamId] || 0) + 1;
    if (t.type === 'TRADE' && Array.isArray(t.legs)) t.legs.forEach((l) => { countByTeam[l.teamId] = (countByTeam[l.teamId] || 0) + 1; });
  });
  const maxCount = Math.max(0, ...Object.values(countByTeam));
  if (maxCount < 4) return null;
  const check = (teamId, teamName) => {
    if ((countByTeam[teamId] || 0) !== maxCount) return null;
    return { team: teamName, count: maxCount };
  };
  return check(game.homeId, game.homeName) || check(game.awayId, game.awayName) || null;
}

// ==== Punkt D: Liga-Historie (2026-09-15) ====
// Nutzt data/league-history.json (manuell gepflegt aus ESPN-App-Screenshots, siehe Datei-Kommentar
// dort - Vorsaisons-Meister/Standings/Playoff-Brackets/Hall-of-Fame-Rekorde). Alle drei Funktionen
// sind bewusst so gebaut, dass sie auch mit nur 2 erfassten Saisons schon sinnvolle Ergebnisse liefern
// und automatisch reichhaltiger werden, sobald weitere Saisons dazukommen.

// D-Historie 1: Titelverteidiger-Storyline - der Meister der jüngsten erfassten Saison, früh in der
// neuen Saison (danach verliert "Titelverteidiger" an Reiz, jedes Team hat dann längst sein eigenes
// Momentum).
function findDefendingChampionFact(game, standingsById, leagueHistory) {
  if (!leagueHistory?.seasons) return null;
  const years = Object.keys(leagueHistory.seasons).map(Number).sort((a, b) => b - a);
  if (!years.length) return null;
  const latestYear = years[0];
  const latestChampion = leagueHistory.seasons[latestYear].champion;
  if (!latestChampion) return null;
  const check = (teamId, teamName) => {
    if (teamName !== latestChampion) return null;
    const s = standingsById[teamId];
    if (!s) return null;
    const gamesPlayed = s.wins + s.losses + (s.ties || 0);
    if (gamesPlayed > 6) return null;
    return { team: teamName, year: latestYear, wins: s.wins, losses: s.losses };
  };
  return check(game.homeId, game.homeName) || check(game.awayId, game.awayName) || null;
}

// D-Historie 2: Diese Woche wird ein ALL-TIME-Liga-Rekord (über alle erfassten Saisons hinweg, nicht
// nur diese Saison) aus der Hall of Fame geknackt - Spieler-Wochenpunkte oder Team-Wochenpunkte.
// Braucht echte Performance-Daten dieses Spiels, deshalb NICHT vorschau-tauglich (im Unterschied zu
// findDefendingChampionFact/findPlayoffHistoryFact).
function findAllTimeRecordFact(game, result, leagueHistory) {
  const hof = leagueHistory?.hallOfFame;
  if (!hof) return null;

  if (result.standout && hof.mostPlayerPointsWeek?.length) {
    const recordHolder = hof.mostPlayerPointsWeek.reduce((a, b) => (b.points > a.points ? b : a));
    if (result.standout.points > recordHolder.points) {
      const team = result.standout.side === 'home' ? game.homeName : game.awayName;
      return { type: 'playerWeek', team, name: result.standout.name, points: result.standout.points, prevRecord: recordHolder.points, prevHolder: recordHolder.player, prevYear: recordHolder.year };
    }
  }

  if (hof.mostTeamPointsWeek?.length) {
    const recordHolder = hof.mostTeamPointsWeek.reduce((a, b) => (b.points > a.points ? b : a));
    const checkTeamWeek = (teamName, score) => (score > recordHolder.points
      ? { type: 'teamWeek', team: teamName, points: score, prevRecord: recordHolder.points, prevHolder: recordHolder.team, prevYear: recordHolder.year }
      : null);
    const hit = checkTeamWeek(game.homeName, game.homeScore) || checkTeamWeek(game.awayName, game.awayScore);
    if (hit) return hit;
  }

  return null;
}

// D-Historie 3: Diese beiden Teams standen sich schon einmal in einem früheren PLAYOFF-Spiel
// gegenüber - grössere Geschichte als die reguläre Saison-Revanche (findRematchFact, die nur
// innerhalb derselben Saison sucht).
function findPlayoffHistoryFact(game, leagueHistory) {
  if (!leagueHistory?.seasons) return null;
  const pair = new Set([game.homeName, game.awayName]);
  const years = Object.keys(leagueHistory.seasons).map(Number).sort((a, b) => b - a);
  for (const year of years) {
    const po = leagueHistory.seasons[year]?.playoffs;
    if (!po) continue;
    const allGames = [
      ...(po.winnersBracket?.semifinal || []),
      po.winnersBracket?.championship,
      po.winnersBracket?.thirdPlaceGame,
      po.consolationBracket?.fifthPlaceGame
    ].filter(Boolean);
    const hit = allGames.find((g) => pair.has(g.team1) && pair.has(g.team2));
    if (hit) return { year, team1: hit.team1, score1: hit.score1, team2: hit.team2, score2: hit.score2, winner: hit.winner };
  }
  return null;
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
    if (comeback) {
      if (ctx?.seasonPersonality) {
        const winnerId = game.winner === 'HOME' ? game.homeId : game.awayId;
        const priorBest = personalBestComebackDeficit(comeback, ctx.seasonPersonality, winnerId);
        if (priorBest !== null) comeback.priorBest = priorBest;
      }
      result.comeback = comeback;
    }
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
    const wireToWire = findWireToWireFact(game, ctx.liveSnapshots);
    if (wireToWire) result.wireToWire = wireToWire;
    const biggestSwing = findBiggestSwingFact(game, ctx.liveSnapshots);
    if (biggestSwing) result.biggestSwing = biggestSwing;
    const buzzerBeater = findBuzzerBeaterFact(game, ctx.liveSnapshots);
    if (buzzerBeater) result.buzzerBeater = buzzerBeater;
  }

  if (ctx?.seasonPersonality) {
    const personality = findSeasonPersonalityFact(game, ctx.seasonPersonality);
    if (personality) result.seasonPersonality = personality;
  }

  if (ctx?.standingsById) {
    const expectation = findExpectationFact(game, ctx.standingsById);
    if (expectation) result.expectation = expectation;
    const empireStoryline = findEmpireStorylineFact(game, ctx.standingsById);
    if (empireStoryline) result.empireStoryline = empireStoryline;
  }

  if (ctx?.draftRoundByPlayerId) {
    const draftValue = findDraftValueFact(game, result, ctx.draftRoundByPlayerId);
    if (draftValue) result.draftValue = draftValue;
  }

  // ---- Zusätzliche Kategorien (siehe Definitionen oben) ----
  if (ctx?.powerRankingsHistory) {
    const powerRankMovement = findPowerRankingMovementFact(game, ctx.powerRankingsHistory, game.week);
    if (powerRankMovement) result.powerRankMovement = powerRankMovement;
  }
  if (ctx?.keyMomentsByTeam) {
    const leagueBestPosition = findLeagueWidePositionBestFact(game, ctx.keyMomentsByTeam);
    if (leagueBestPosition) result.leagueBestPosition = leagueBestPosition;
  }
  if (ctx?.weekGames) {
    const marginExtreme = findMarginExtremeFact(game, ctx.weekGames);
    if (marginExtreme) result.marginExtreme = marginExtreme;
  }
  const positionalFlop = findPositionalFlopFact(game, homePerf, awayPerf);
  if (positionalFlop) result.positionalFlop = positionalFlop;
  if (ctx?.transactions) {
    const waiverInstantSuccess = findWaiverInstantSuccessFact(game, homePerf, awayPerf, ctx.transactions);
    if (waiverInstantSuccess) result.waiverInstantSuccess = waiverInstantSuccess;
    const tradeImpact = findTradeImpactFact(game, homePerf, awayPerf, ctx.transactions);
    if (tradeImpact) result.tradeImpact = tradeImpact;
  }
  const chalk = findChalkFact(game);
  if (chalk) result.chalk = chalk;
  if (ctx?.scoreboard) {
    const formTrend = findFormTrendFact(game, ctx.scoreboard, game.week);
    if (formTrend) result.formTrend = formTrend;
    const consistency = findConsistencyFact(game, ctx.scoreboard, game.week);
    if (consistency) result.consistency = consistency;
  }
  if (ctx?.seasonStats) {
    const positionalSlump = findPositionalSlumpFact(game, homePerf, awayPerf, ctx.seasonStats);
    if (positionalSlump) result.positionalSlump = positionalSlump;
    const seasonBenchTotal = findSeasonBenchTotalFact(game, ctx.seasonStats);
    if (seasonBenchTotal) result.seasonBenchTotal = seasonBenchTotal;
    const upsetTally = findUpsetTallyFact(game, ctx.seasonStats);
    if (upsetTally) result.upsetTally = upsetTally;
    const perfectWeekProximity = findPerfectWeekProximityFact(game, homePerf, awayPerf, ctx.seasonStats);
    if (perfectWeekProximity) result.perfectWeekProximity = perfectWeekProximity;
  }

  // ---- Weitere Statistik-Kategorien (siehe Definitionen oben) ----
  if (ctx?.standingsById && ctx?.seasonStats) {
    const longestStreak = findLongestStreakFact(game, ctx.standingsById, ctx.seasonStats);
    if (longestStreak) result.longestStreak = longestStreak;
    const ironMan = findIronManFact(game, homePerf, awayPerf, ctx.seasonStats, ctx.standingsById);
    if (ironMan) result.ironMan = ironMan;
    const seasonMilestone = findSeasonMilestoneFact(game, ctx.standingsById);
    if (seasonMilestone) result.seasonMilestone = seasonMilestone;
  }
  if (ctx?.seasonStats) {
    const marginTally = findMarginTallyFact(game, ctx.seasonStats);
    if (marginTally) result.marginTally = marginTally;
    const scoringLeaderTally = findScoringLeaderTallyFact(game, ctx.seasonStats);
    if (scoringLeaderTally) result.scoringLeaderTally = scoringLeaderTally;
    const topWeeklyPerformance = findTopWeeklyPerformanceFact(result, game, ctx.seasonStats);
    if (topWeeklyPerformance) result.topWeeklyPerformance = topWeeklyPerformance;
  }
  if (ctx?.draftRoundByPlayerId) {
    const seasonDraftValue = findSeasonDraftValueFact(game, homePerf, awayPerf, ctx.seasonStats, ctx.draftRoundByPlayerId, game.week);
    if (seasonDraftValue) result.seasonDraftValue = seasonDraftValue;
  }
  if (ctx?.transactions) {
    const leagueActivity = findLeagueActivityFact(game, ctx.transactions);
    if (leagueActivity) result.leagueActivity = leagueActivity;
  }

  // ---- Punkt D: Liga-Historie (siehe Definitionen oben) ----
  if (ctx?.leagueHistory) {
    const defendingChampion = findDefendingChampionFact(game, ctx.standingsById || {}, ctx.leagueHistory);
    if (defendingChampion) result.defendingChampion = defendingChampion;
    const allTimeRecord = findAllTimeRecordFact(game, result, ctx.leagueHistory);
    if (allTimeRecord) result.allTimeRecord = allTimeRecord;
    const playoffHistory = findPlayoffHistoryFact(game, ctx.leagueHistory);
    if (playoffHistory) result.playoffHistory = playoffHistory;
  }

  return result;
}

// ---- Sanity-Check ----
// Verhindert, dass eine ESPN-API-Störung (z.B. eine teilweise/leere Antwort, die aber ohne
// Exception durchläuft) stillschweigend kaputte oder leere Daten committet. Läuft ganz am Schluss
// von main(), NACHDEM alle data/*.json-Dateien geschrieben wurden - prüft nur grobe Plausibilität
// (erwartete Team-Zahl, jedes Team hat einen Kader), keine tiefe inhaltliche Validierung. Wirft bei
// einer Verletzung, wodurch main().catch() weiter unten den Prozess mit Exit-Code 1 beendet - das
// markiert den GitHub-Actions-Job als fehlgeschlagen (rot), was wiederum espn-sync-watchdog.yml
// (workflow_run-Trigger) sofort einen Retry anstossen lässt, statt bis zum nächsten 2h-Slot oder dem
// Tages-Watchdog um 14:23 UTC zu warten. Bei einem echten Fehlschlag committet der nachfolgende
// GitHub-Actions-Schritt gar nichts (er läuft nach einem fehlgeschlagenen Schritt nicht mehr) - die
// in diesem Lauf bereits geschriebenen Dateien bleiben einfach unbenutzt im Runner-Workspace liegen.
const EXPECTED_TEAM_COUNT = 10;

async function runSanityChecks() {
  const problems = [];

  const standings = await readJsonSafe('standings.json', null);
  if (!standings || (standings.data || []).length !== EXPECTED_TEAM_COUNT) {
    problems.push(`standings.json hat ${standings?.data?.length ?? 0} statt ${EXPECTED_TEAM_COUNT} Teams`);
  }

  const power = await readJsonSafe('power-rankings.json', null);
  if (!power || (power.data || []).length !== EXPECTED_TEAM_COUNT) {
    problems.push(`power-rankings.json hat ${power?.data?.length ?? 0} statt ${EXPECTED_TEAM_COUNT} Teams`);
  }

  const roster = await readJsonSafe('roster.json', null);
  const rosterTeams = roster?.data || [];
  if (rosterTeams.length !== EXPECTED_TEAM_COUNT) {
    problems.push(`roster.json hat ${rosterTeams.length} statt ${EXPECTED_TEAM_COUNT} Teams`);
  }
  rosterTeams.forEach((t) => {
    if (!t.starters?.length) problems.push(`${t.name || t.id}: keine Starter im Kader`);
  });

  const scoreboard = await readJsonSafe('scoreboard.json', null);
  if (!scoreboard || !(scoreboard.data || []).length) {
    problems.push('scoreboard.json hat keine Wochen');
  }

  const bracket = await readJsonSafe('playoff-bracket.json', null);
  if (!bracket || (bracket.seeds || []).length !== EXPECTED_TEAM_COUNT) {
    problems.push(`playoff-bracket.json hat ${bracket?.seeds?.length ?? 0} statt ${EXPECTED_TEAM_COUNT} Seeds`);
  }

  if (problems.length) {
    throw new Error('Sanity-Check fehlgeschlagen:\n- ' + problems.join('\n- '));
  }
  console.log('Sanity-Check OK: alle Kern-Dateien plausibel.');
}

// Holt ESPNs komplettes Transaktions-Log über alle Wochen 1..throughWeek. scoringPeriodId filtert
// exakt auf diese eine Periode (keine kumulative Historie über den Parameter hinweg) - siehe
// Kommentar am Aufrufer in main() für den Hintergrund, warum das dem früheren Roster-Diffing
// vorgezogen wurde. Enthält viel Rauschen (type ROSTER = reine Lineup-Änderungen, type DRAFT = die
// Draft-Picks selbst), das buildTransactionsFromLog() unten herausfiltert.
export async function fetchAllTransactions(throughWeek) {
  const all = [];
  for (let wk = 1; wk <= throughWeek; wk++) {
    const data = await fetchLeague(['mTransactions2'], wk);
    all.push(...(data.transactions || []));
  }
  return all;
}

// Eine Woche gilt als abgeschlossen, sobald in ihr mindestens ein Matchup steht und ALLE Matchups
// einen Sieger haben (kein 'UNDECIDED' mehr) - identisch zur Logik, mit der main() weiter unten
// lastCompletedWeek aus dem bereits gebauten scoreboard.json-Array ableitet. Als eigene exportierte
// Funktion, damit sync-transactions.mjs (leichter täglicher Transaktions-Sync) dieselbe Regel nutzen
// kann, ohne sie ein zweites Mal von Hand nachzubauen (siehe Kommentar in espn-client.mjs zu
// auseinanderlaufender Logik zwischen Skripten).
export function computeLastCompletedWeek(scoreboard) {
  let lastCompletedWeek = 0;
  for (const wk of scoreboard) {
    if (wk.games.length && wk.games.every((g) => g.winner !== 'UNDECIDED')) lastCompletedWeek = wk.week;
    else break;
  }
  return lastCompletedWeek;
}

// Manuell bestätigte Korrekturen für Trades, deren TRADE_PROPOSAL bei ESPN nicht abrufbar ist (siehe
// Kommentar im TRADE_UPHOLD-Zweig unten). Key = relatedTransactionId. Vom Nutzer direkt bestätigte
// Fakten (Liga-Insider-Wissen), nicht aus der API ableitbar - daher hier hart hinterlegt statt geraten.
const TRADE_OVERRIDES = {
  '19263173-a7ad-4737-94bc-5cf1021c25c4': {
    title: 'Trade: Zurich City Ravens ↔ TM06',
    detail: 'Zurich City Ravens erhält Chig Okonkwo, Jacory Croskey-Merritt und Tee Higgins. TM06 erhält Colston Loveland und D\'Andre Swift.'
  },
  '1bab103b-9025-438e-b857-b2bf8955b31a': {
    title: 'Trade: Run CMC ↔ TM06',
    detail: 'Run CMC erhält Jadrian Price, Parker Washington und Terrance Ferguson. TM06 erhält Evan Engram und Chase Brown.'
  },
  'ec134c0f-92ca-463e-9826-3c7b31fbb873': {
    title: 'Trade: Hopp Schwiiz ↔ TM06',
    detail: 'Hopp Schwiiz erhält Caleb Williams. TM06 erhält Jayden Daniels.'
  }
};

// Baut die Anzeige-Transaktionen (Format wie von power-rankings.html erwartet: id/week/date/type/
// title/detail/note, TRADE zusätzlich mit legs) aus ESPNs rohem Transaktions-Log.
//
// ESPNs Trade-Ablauf verteilt sich über mehrere verknüpfte Einträge: TRADE_PROPOSAL (trägt die
// eigentlichen Spieler-Items), optional TRADE_ACCEPT, und am Ende entweder TRADE_UPHOLD (Trade wurde
// nach Ablauf der Review-Frist rechtskräftig - kommt einmal PRO beteiligtem Team, hier über
// relatedTransactionId dedupliziert) oder TRADE_DECLINE. relatedTransactionId auf diesen Folge-
// Einträgen zeigt auf die id des ursprünglichen TRADE_PROPOSAL, aus dem die Spieler-Items geholt
// werden (kann in einer früheren Woche liegen als der Abschluss - deshalb wird die Zuordnungstabelle
// aus ALLEN Wochen gebaut, nicht nur der aktuellen).
//
// Behält bewusst die alte id-Präfix-Konvention ('add-'/'drop-' für FREEAGENT) bei, weil
// findWaiverKarmaFact()/findWaiverInstantSuccessFact() weiter oben im Skript genau danach filtern.
export function buildTransactionsFromLog(rawTx, teamNames, playerInfo) {
  const proposalById = {};
  rawTx.forEach((t) => { if (t.type === 'TRADE_PROPOSAL') proposalById[t.id] = t; });

  const fmtDate = (t) => new Date(t.processDate || t.proposedDate).toLocaleDateString('de-CH');
  const out = [];
  const seenTradeGroup = new Set();

  rawTx.forEach((t) => {
    if (t.type === 'FREEAGENT' && t.status === 'EXECUTED') {
      const adds = (t.items || []).filter((i) => i.type === 'ADD');
      const drops = (t.items || []).filter((i) => i.type === 'DROP');
      if (adds.length) {
        adds.forEach((a) => {
          const info = playerInfo(a.playerId);
          const dropInfo = drops.length ? playerInfo(drops[0].playerId) : null;
          out.push({
            id: 'add-' + t.teamId + '-' + a.playerId + '-' + t.id,
            week: t.scoringPeriodId, date: fmtDate(t), type: 'FREEAGENT',
            teamId: t.teamId, playerId: a.playerId,
            title: `${teamNames[t.teamId]} holt ${info.name}`,
            detail: dropInfo
              ? `${teamNames[t.teamId]} holt ${info.name} (${info.pos}, ${info.proTeam}) und wirft dafür ${dropInfo.name} ab.`
              : `${teamNames[t.teamId]} holt ${info.name} (${info.pos}, ${info.proTeam}) dazu.`,
            note: ''
          });
        });
      } else {
        drops.forEach((d) => {
          const info = playerInfo(d.playerId);
          out.push({
            id: 'drop-' + t.teamId + '-' + d.playerId + '-' + t.id,
            week: t.scoringPeriodId, date: fmtDate(t), type: 'FREEAGENT',
            teamId: t.teamId, playerId: d.playerId,
            title: `${teamNames[t.teamId]} wirft ${info.name} ab`,
            detail: `${teamNames[t.teamId]} lässt ${info.name} (${info.pos}, ${info.proTeam}) frei.`,
            note: ''
          });
        });
      }
      return;
    }

    if (t.type === 'WAIVER' && t.executionType === 'PROCESS') {
      const adds = (t.items || []).filter((i) => i.type === 'ADD');
      const drops = (t.items || []).filter((i) => i.type === 'DROP');
      if (t.status === 'EXECUTED') {
        adds.forEach((a) => {
          const info = playerInfo(a.playerId);
          const dropInfo = drops.length ? playerInfo(drops[0].playerId) : null;
          out.push({
            id: 'waiver-' + t.teamId + '-' + a.playerId + '-' + t.id,
            week: t.scoringPeriodId, date: fmtDate(t), type: 'WAIVER',
            teamId: t.teamId, playerId: a.playerId,
            title: `Waiver Claim: ${teamNames[t.teamId]} sichert sich ${info.name}`,
            detail: dropInfo
              ? `${teamNames[t.teamId]} holt ${info.name} (${info.pos}, ${info.proTeam}) über den Waiver Wire und wirft dafür ${dropInfo.name} ab.`
              : `${teamNames[t.teamId]} holt ${info.name} (${info.pos}, ${info.proTeam}) über den Waiver Wire dazu.`,
            note: ''
          });
        });
      } else if (typeof t.status === 'string' && t.status.startsWith('FAILED')) {
        adds.forEach((a) => {
          const info = playerInfo(a.playerId);
          out.push({
            id: 'waiverfail-' + t.teamId + '-' + a.playerId + '-' + t.id,
            week: t.scoringPeriodId, date: fmtDate(t), type: 'WAIVER_FAILED',
            teamId: t.teamId, playerId: a.playerId,
            title: `Waiver Claim gescheitert: ${teamNames[t.teamId]}`,
            detail: `${teamNames[t.teamId]}s Waiver-Claim auf ${info.name} (${info.pos}, ${info.proTeam}) ist nicht durchgekommen.`,
            note: ''
          });
        });
      }
      // PENDING (noch nicht verarbeitet) / CANCELED (vom Manager selbst zurückgezogen) - kein
      // Endergebnis, wird bewusst nicht angezeigt.
      return;
    }

    if (t.type === 'TRADE_DECLINE') {
      const proposal = proposalById[t.relatedTransactionId];
      const teamIds = proposal ? [...new Set(proposal.items.map((i) => i.toTeamId))] : [];
      out.push({
        id: 'declined-' + t.id,
        week: t.scoringPeriodId, date: fmtDate(t), type: 'DECLINED',
        title: 'Trade-Angebot abgelehnt',
        detail: teamIds.length
          ? `Trade-Angebot zwischen ${teamIds.map((tid) => teamNames[tid]).join(' und ')} wurde abgelehnt.`
          : 'Ein Trade-Angebot wurde abgelehnt.',
        note: ''
      });
      return;
    }

    if (t.type === 'TRADE_UPHOLD') {
      if (seenTradeGroup.has(t.relatedTransactionId)) return;
      seenTradeGroup.add(t.relatedTransactionId);
      const proposal = proposalById[t.relatedTransactionId];
      if (proposal && proposal.items?.length) {
        const teamIds = [...new Set(proposal.items.map((i) => i.toTeamId))];
        const legs = teamIds.map((tid) => ({
          teamId: tid,
          gainedIds: proposal.items.filter((i) => i.toTeamId === tid).map((i) => i.playerId),
          lostIds: proposal.items.filter((i) => i.fromTeamId === tid).map((i) => i.playerId)
        }));
        const detail = teamIds.map((tid) => {
          const gets = proposal.items.filter((i) => i.toTeamId === tid).map((i) => playerInfo(i.playerId).name).join(', ') || '(nichts)';
          return `${teamNames[tid]} erhält ${gets}.`;
        }).join(' ');
        out.push({
          id: 'trade-' + t.relatedTransactionId,
          week: t.scoringPeriodId, date: fmtDate(t), type: 'TRADE',
          title: `Trade: ${teamIds.map((tid) => teamNames[tid]).join(' ↔ ')}`,
          detail, legs, note: ''
        });
        return;
      }
      // Fallback: ESPN liefert die ursprüngliche TRADE_PROPOSAL manchmal nicht zurück (bestätigte
      // Datenlücke - über keine Wochen-Abfrage 1..17 noch den Recent-Activity-Feed auffindbar).
      // TRADE_UPHOLD.teamId ist in diesem Zustand NICHT vertrauenswürdig für die Gegenseite - in der
      // Praxis hat es bei 3 von 3 betroffenen Trades den falschen Gegner geliefert (unterschiedlich
      // falsch jedes Mal, kein fester Platzhalter). Nur TRADE_ACCEPT.teamId war in allen bekannten
      // Fällen korrekt. Für die 3 bereits identifizierten Trades liegt eine vom Nutzer bestätigte
      // manuelle Korrektur vor (TRADE_OVERRIDES); für jeden künftigen, bisher unbekannten Fall dieser
      // Art wird nur die sicher bekannte Seite gezeigt statt eine falsche Gegenseite zu raten.
      const override = TRADE_OVERRIDES[t.relatedTransactionId];
      if (override) {
        out.push({
          id: 'trade-' + t.relatedTransactionId,
          week: t.scoringPeriodId, date: fmtDate(t), type: 'TRADE',
          title: override.title, detail: override.detail, note: ''
        });
        return;
      }
      const accept = rawTx.find((a) => a.type === 'TRADE_ACCEPT' && a.relatedTransactionId === t.relatedTransactionId);
      if (!accept) return;
      const knownTeam = teamNames[accept.teamId];
      out.push({
        id: 'trade-' + t.relatedTransactionId,
        week: t.scoringPeriodId, date: fmtDate(t), type: 'TRADE',
        title: `Trade bestätigt: ${knownTeam}`,
        detail: `${knownTeam} hat einen Trade abgeschlossen – der Gegner und die gehandelten Spieler sind in ESPNs Daten für uns nicht abrufbar.`,
        note: ''
      });
    }
    // ROSTER (Lineup-Änderungen), DRAFT (Draft-Picks), TRADE_PROPOSAL/TRADE_ACCEPT (Zwischenschritte,
    // noch kein Endergebnis) - bewusst ignoriert.
  });

  return out;
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
        adp: (p.ownership && p.ownership.averageDraftPosition) || 999,
        injuryStatus: p.injuryStatus || null
      };
      currentRosterIds[t.id].push(p.id);
    });
  });

  // Vorheriger Rostered-Ids-Snapshot (VOR dem Überschreiben weiter unten gelesen) - Basis für die
  // "Trending Free Agents"-Diffs (siehe waiver-trends.json weiter unten). Erster Lauf ohne Vorgänger-
  // Datei liefert einfach eine leere Liste zurück (readJsonSafe-Fallback), dann bleiben added/dropped
  // leer statt fälschlich den kompletten aktuellen Kader als "neu geholt" zu melden.
  const prevRosteredSnapshot = await readJsonSafe('rostered-ids.json', { ids: [] });
  const prevRosteredIds = prevRosteredSnapshot.ids || [];

  // ---- Draft-Picks für die "board"-Historie ----
  const picks = draftData.draftDetail?.picks || [];
  const draftRoundByPlayerId = Object.fromEntries(picks.map((p) => [p.playerId, p.roundId]));
  const draftedIds = [...new Set(picks.map((p) => p.playerId))];
  const missingIds = draftedIds.filter((id) => !playerPool[id]);
  // prevRosteredIds mit rein, damit auch ein seit letztem Snapshot gedroppter (und seither nicht neu
  // gerosterter) Spieler über playerInfo() auflösbar bleibt, statt als "Unbekannter Spieler" zu enden.
  const allNeededIds = [...new Set([...draftedIds, ...Object.values(currentRosterIds).flat(), ...prevRosteredIds])];
  const idsNeedingProjection = allNeededIds; // projections come from the same bulk fetch, always fresh
  const projections = await fetchProjections(idsNeedingProjection);

  function playerInfo(id) {
    const proj = projections[id];
    if (proj) return proj;
    const pooled = playerPool[id];
    if (pooled) return { ...pooled, proj: null };
    return { name: 'Unbekannter Spieler #' + id, pos: '?', proTeam: '', adp: 999, proj: null, injuryStatus: null };
  }

  // ---- Power Rankings: aktuelle Kader -> optimale Aufstellung -> Rangliste ----
  const oldPower = await readJsonSafe('power-rankings.json', { data: [] });
  const oldRankById = {};
  (oldPower.data || []).forEach((t) => { oldRankById[t.id] = t.rank; });

  const rosterByTeam = {};
  const teamsComputed = teamData.teams.map((t) => {
    const roster = currentRosterIds[t.id].map((id) => {
      const info = playerInfo(id);
      return { playerId: id, name: info.name, pos: info.pos, proTeam: info.proTeam, proj: info.proj, adp: info.adp, injuryStatus: info.injuryStatus || null };
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
        return { id: p.playerId, r: p.roundId, rp: p.roundPickNumber, ov: p.overallPickNumber, pos: info.pos, name: info.name, team: info.proTeam, proj: info.proj, adp: info.adp };
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

  // ---- Trending Free Agents: Diff ggü. dem VORHERIGEN Snapshot (siehe prevRosteredIds oben, vor
  // dem Überschreiben gelesen) - "hinzugefügt" = seither von irgendeinem Team geholt, "gedroppt" =
  // war rostered, ist es jetzt bei niemandem mehr. Da espn-sync.yml nur dienstags läuft (5x im
  // 2h-Abstand), deckt der Diff zwischen dem letzten Lauf eines Dienstags und dem ersten des
  // nächsten praktisch eine volle Woche ab - die Kopie zeigt bewusst den echten Zeitstempel statt
  // pauschal "diese Woche" zu behaupten, für den Fall eines dichteren Laufplans in Zukunft. Ohne
  // vorherigen Snapshot (erster Lauf überhaupt) bleiben beide Listen leer statt den ganzen aktuellen
  // Kader fälschlich als "neu geholt" zu melden.
  const prevRosteredSet = new Set(prevRosteredIds);
  const currentRosteredSet = new Set(rosteredIds);
  const addedIds = prevRosteredSnapshot.lastUpdated ? rosteredIds.filter((id) => !prevRosteredSet.has(id)) : [];
  const droppedIds = prevRosteredSnapshot.lastUpdated ? prevRosteredIds.filter((id) => !currentRosteredSet.has(id)) : [];
  const toTrendEntry = (id) => {
    const info = playerInfo(id);
    return { id, name: info.name, pos: info.pos, proTeam: info.proTeam, adp: info.adp };
  };
  await writeJson('waiver-trends.json', {
    lastUpdated: nowIso(),
    since: prevRosteredSnapshot.lastUpdated || null,
    added: addedIds.map(toTrendEntry).sort((a, b) => a.adp - b.adp),
    dropped: droppedIds.map(toTrendEntry).sort((a, b) => a.adp - b.adp)
  });

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
  const lastCompletedWeek = computeLastCompletedWeek(scoreboard);

  // ---- Playoff-Szenario je Team (für my-team.html "Playoff-Chancen") ----
  // Nutzt dieselbe Bracket-Logik wie findPlayoffRaceFact() (Top 2 je Conference qualifizieren sich,
  // geseedet 1-4 nach Gesamt-Bilanz, siehe computePlayoffPicture() weiter oben), aber
  // für ALLE Teams auf einmal statt nur die 2 Teams eines einzelnen Spiels. Restspiele = 15
  // (reguläre Saisonlänge dieser Liga, siehe TOTAL_SEASON_WEEKS in my-team.html) minus zuletzt
  // komplett gewertete Woche. "eliminated" = selbst mit ausschliesslich Siegen aus allen
  // verbleibenden Spielen käme das Team nicht mehr an den aktuellen 4. Seed heran - eine bewusst
  // simple Näherung ohne echte Restspielplan-Simulation (kein Playoff-Tiebreaker über Punkte
  // simuliert), aber als "rechnerisch chancenlos"-Aussage korrekt.
  const REGULAR_SEASON_WEEKS = 15;
  const remainingGames = Math.max(0, REGULAR_SEASON_WEEKS - lastCompletedWeek);
  const { playoffTeams, outside, cutoffWins } = computePlayoffPicture(standings, confStandings);
  const playoffPictureTeams = standings.map((s) => {
    const seeded = playoffTeams.find((t) => t.id === s.id);
    if (seeded) {
      const firstOut = outside[0];
      const cushion = firstOut ? seeded.wins - firstOut.wins : null;
      return { id: s.id, name: s.name, wins: s.wins, losses: s.losses, ties: s.ties, status: 'in', seed: seeded.seed, cushion, winsBehind: null };
    }
    const maxPossibleWins = s.wins + remainingGames;
    if (maxPossibleWins < cutoffWins) {
      return { id: s.id, name: s.name, wins: s.wins, losses: s.losses, ties: s.ties, status: 'eliminated', seed: null, cushion: null, winsBehind: null };
    }
    return { id: s.id, name: s.name, wins: s.wins, losses: s.losses, ties: s.ties, status: 'chasing', seed: null, cushion: null, winsBehind: cutoffWins - s.wins };
  });
  await writeJson('playoff-picture.json', {
    lastUpdated: nowIso(),
    throughWeek: lastCompletedWeek,
    cutoffWins,
    teams: playoffPictureTeams
  });

  // ---- Playoff- und Consolation-Bracket (für schedule.html) ----
  const playoffBracket = buildPlayoffBracket(standings, confStandings, scoreboard);
  await writeJson('playoff-bracket.json', {
    lastUpdated: nowIso(),
    throughWeek: lastCompletedWeek,
    ...playoffBracket
  });

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
    const powerRankingsHistory = await readJsonSafe('power-rankings-history.json', { snapshots: [] });
    const seasonStats = await readJsonSafe('season-stats.json', { weeksArchived: [], teams: {}, players: {} });
    const leagueHistory = await readJsonSafe('league-history.json', { seasons: {} });
    const ctx = { standingsById, standings, confStandings, prevConfRankById, scoreboard, weekGames, transactions: existingTransactions, liveSnapshots, seasonPersonality, draftRoundByPlayerId, powerRankingsHistory, keyMomentsByTeam, seasonStats, leagueHistory };
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

    const oldWeekRecaps = await readJsonSafe('week-recaps.json', { data: {} });
    const existingWeekRecaps = oldWeekRecaps.data || {};
    const openBeforeMonday = countGamesOpenBeforeMonday(weekGames, liveSnapshots);
    const newWeekRecap = await generateWeekRecap(enrichedGames, existingWeekRecaps, openBeforeMonday);
    if (newWeekRecap) {
      await writeJson('week-recaps.json', { lastUpdated: nowIso(), data: { ...existingWeekRecaps, [newWeekRecap.week]: newWeekRecap } });
    }

    if (liveSnapshots) {
      await archiveLiveSnapshotWeek(lastCompletedWeek, weekGames, liveSnapshots);
    }
    await archiveSeasonStats(lastCompletedWeek, enrichedGames, keyMomentsByTeam);

    // ---- Track-Record vergangener Free-Agent-Tipps ("hätte sich gelohnt?") ----
    // Zwei Schritte pro Lauf: (1) für jedes Team die aktuell schwächste Position + den dazu besten
    // verfügbaren Free Agent server-seitig ermitteln (derselbe proj-/ADP-basierte Ansatz wie
    // my-team.html Standard-Modus) und mit einem BASELINE-Snapshot aus dem GERADE aktualisierten
    // season-stats.json speichern - noch nicht bewertet. (2) alte, noch unbewertete Einträge, die
    // mindestens 2 Wochen zurückliegen, jetzt bewerten: Punkteschnitt des vorgeschlagenen Spielers
    // SEIT der Empfehlung (Differenz zum Baseline-Snapshot) vs. Punkteschnitt, den das Team an dieser
    // Position im selben Zeitraum tatsächlich gemacht hat (ebenfalls per Differenz - dieselbe
    // Snapshot-Diff-Technik wie bei waiver-trends.json oben, weil season-stats.json nur kumulierte
    // Saison-Summen führt, keine Wochen-Auflösung). Bewusst nur die schwächste Position (nicht
    // top-3 wie auf my-team.html), damit ein Team pro Woche höchstens einen Tipp im Track-Record hat.
    const freshSeasonStats = await readJsonSafe('season-stats.json', { weeksArchived: [], teams: {}, players: {} });
    const suggestionHistory = await readJsonSafe('suggestion-history.json', { entries: [] });
    const POS_LIST = ['QB', 'RB', 'WR', 'TE', 'K', 'DST'];
    const leagueAvgPosTotals = {};
    POS_LIST.forEach((pos) => {
      const sum = teamsComputed.reduce((acc, t) => acc + (t.posTotals[pos] || 0), 0);
      leagueAvgPosTotals[pos] = sum / teamsComputed.length;
    });
    const rosteredIdSet = new Set(rosteredIds);
    const existingKeys = new Set(suggestionHistory.entries.map((e) => e.teamId + '-' + e.week));
    for (const t of teamsComputed) {
      const key = t.id + '-' + lastCompletedWeek;
      if (existingKeys.has(key)) continue; // schon für diese Team+Woche-Kombination erfasst
      let weakestPos = null;
      let weakestPctDiff = 0;
      POS_LIST.forEach((pos) => {
        const avg = leagueAvgPosTotals[pos];
        if (!avg) return;
        const diff = (t.posTotals[pos] || 0) - avg;
        const pctDiff = diff / avg;
        if (diff < 0 && pctDiff < weakestPctDiff) { weakestPctDiff = pctDiff; weakestPos = pos; }
      });
      if (!weakestPos) continue; // keine Position unter Liga-Schnitt - kein sinnvoller Tipp
      let suggested;
      try {
        suggested = await fetchTopFreeAgent(weakestPos, rosteredIdSet);
      } catch (e) {
        console.error(`Track-Record: Free-Agent-Fetch für ${t.name}/${weakestPos} fehlgeschlagen, übersprungen:`, e.message);
        continue;
      }
      if (!suggested) continue;
      const playerRec = freshSeasonStats.players?.[suggested.id];
      const teamPosRec = freshSeasonStats.teams?.[t.id]?.positions?.[weakestPos];
      suggestionHistory.entries.push({
        week: lastCompletedWeek,
        date: new Date().toLocaleDateString('de-CH'),
        teamId: t.id,
        teamName: t.name,
        pos: weakestPos,
        player: suggested,
        baseline: {
          playerTotalPoints: playerRec?.totalPoints || 0,
          playerGamesPlayed: playerRec?.gamesPlayed || 0,
          teamPosTotal: teamPosRec?.total || 0,
          teamPosGames: teamPosRec?.games || 0
        },
        graded: false,
        gradedAt: null,
        result: null
      });
    }

    const GRADE_AFTER_WEEKS = 2;
    suggestionHistory.entries.forEach((entry) => {
      if (entry.graded || (lastCompletedWeek - entry.week) < GRADE_AFTER_WEEKS) return;
      const playerRec = freshSeasonStats.players?.[entry.player.id];
      const teamPosRec = freshSeasonStats.teams?.[entry.teamId]?.positions?.[entry.pos];
      const playerGamesSince = (playerRec?.gamesPlayed || 0) - entry.baseline.playerGamesPlayed;
      const teamPosGamesSince = (teamPosRec?.games || 0) - entry.baseline.teamPosGames;
      if (playerGamesSince < 1 || teamPosGamesSince < 1) return; // noch keine neuen Auftritte seither, nächstes Mal erneut versuchen
      const playerPointsSince = (playerRec?.totalPoints || 0) - entry.baseline.playerTotalPoints;
      const teamPosPointsSince = (teamPosRec?.total || 0) - entry.baseline.teamPosTotal;
      const playerPpgSince = Math.round((playerPointsSince / playerGamesSince) * 10) / 10;
      const teamPosPpgSince = Math.round((teamPosPointsSince / teamPosGamesSince) * 10) / 10;
      const diffPct = teamPosPpgSince > 0 ? (playerPpgSince - teamPosPpgSince) / teamPosPpgSince : 0;
      const verdict = diffPct > 0.1 ? 'besser' : (diffPct < -0.1 ? 'schlechter' : 'etwa gleich');
      entry.graded = true;
      entry.gradedAt = nowIso();
      entry.result = { playerPpgSince, teamPosPpgSince, verdict };
    });

    await writeJson('suggestion-history.json', { lastUpdated: nowIso(), entries: suggestionHistory.entries });
  }

  // ---- Wochen-Vorschau (Claude schreibt einen Ausblick auf die KOMMENDE Woche, im selben
  // Boulevard-Stil wie der Wochen-Recap) - läuft UNABHÄNGIG vom obigen Block, weil sie schon vor
  // Woche 1 sinnvoll ist (lastCompletedWeek=0 -> upcomingWeek=1). Der Sync läuft laut Cron nur
  // dienstags (siehe oben in dieser Datei bzw. .github/workflows/espn-sync.yml) - für die kommende
  // Woche (erstes Spiel meist Donnerstag) ist das rechtzeitig vor dem Anpfiff.
  {
    const upcomingWeek = lastCompletedWeek + 1;
    const upcomingGames = scoreboard.find((w) => w.week === upcomingWeek)?.games || [];
    const notYetPlayed = upcomingGames.length > 0 && upcomingGames.every((g) => g.winner === 'UNDECIDED');
    if (notYetPlayed) {
      const starterTotalById = Object.fromEntries(teamsComputed.map((t) => [t.id, t.starterTotal]));
      const standingsById = Object.fromEntries(standings.map((s) => [s.id, s]));
      const leagueHistory = await readJsonSafe('league-history.json', { seasons: {} });
      const previewCtx = { standingsById, standings, confStandings, prevConfRankById, scoreboard, leagueHistory };
      const previewGames = upcomingGames.map((g) => {
        const base = {
          ...g,
          week: upcomingWeek,
          homeProj: starterTotalById[g.homeId] || 0,
          awayProj: starterTotalById[g.awayId] || 0,
          homeRecord: standingsById[g.homeId] ? { wins: standingsById[g.homeId].wins, losses: standingsById[g.homeId].losses, ties: standingsById[g.homeId].ties } : null,
          awayRecord: standingsById[g.awayId] ? { wins: standingsById[g.awayId].wins, losses: standingsById[g.awayId].losses, ties: standingsById[g.awayId].ties } : null
        };
        return { ...base, ...buildPreviewMoments(base, previewCtx) };
      });

      const oldPreviews = await readJsonSafe('week-previews.json', { data: {} });
      const existingPreviews = oldPreviews.data || {};
      const newPreview = await generateWeekPreview(previewGames, existingPreviews);
      if (newPreview) {
        await writeJson('week-previews.json', { lastUpdated: nowIso(), data: { ...existingPreviews, [newPreview.week]: newPreview } });
      }
    }
  }

  // ---- Transaktionen: ESPNs echtes Transaktions-Log (mTransactions2) ----
  // Ersetzt das frühere Roster-Diffing gegen roster-snapshot.json. Der alte Ansatz stempelte jede
  // neu entdeckte Änderung mit der AKTUELLEN Matchup-Periode zum Zeitpunkt des jeweiligen Sync-Laufs
  // - bei nur wöchentlichem Cron konnte das eine ganze Kalenderwoche falsch beschriften (live
  // beobachtet: Woche 2 fehlte komplett, alles landete unter Woche 3, weil zwischen dem letzten Lauf
  // während Woche 2 und dem nächsten Lauf die Periode schon auf 3 gesprungen war). ESPNs echtes Log
  // liefert Datum/Woche direkt vom Server. WICHTIG: scoringPeriodId filtert exakt auf genau diese
  // eine Periode (keine kumulative Historie) - jede Woche 1..currentWeek muss einzeln abgefragt
  // werden (siehe fetchAllTransactions()).
  //
  // currentWeek = lastCompletedWeek + 1 (dieselbe "upcomingWeek"-Logik wie beim Wochen-Vorschau-Block
  // oben), NICHT teamData.status.currentMatchupPeriod: Free Agency/Waivers für die kommende Woche
  // öffnen bereits, sobald die letzte Woche fertig gewertet ist - currentMatchupPeriod hinkt dem einen
  // Schritt hinterher (zeigt noch die zuletzt VOLLSTÄNDIG gewertete Woche, nicht die aktuell laufende
  // Transaktions-Periode) und hätte hier live beobachtet die gerade aktive Woche 3 komplett verpasst.
  const currentWeek = lastCompletedWeek + 1;
  const rawTx = await fetchAllTransactions(currentWeek);

  // Manche Spieler tauchen nur in Transaktionen auf (kurzzeitig geholt und wieder gedroppt, nie
  // tatsächlich zum Zeitpunkt eines Roster-Snapshots gerostert - typischer Fall: ein D/ST, das binnen
  // weniger Tage wieder abgeworfen wurde) und fehlen deshalb in allNeededIds/projections/playerPool
  // weiter oben, obwohl ESPNs leaguedefaults-Endpunkt sie durchaus auflösen kann, wenn man gezielt
  // danach fragt (per Debug-Workflow bestätigt: dieselbe fetchProjections()-Abfrage liefert für so
  // eine ID ganz normal Namen/Position zurück). Sammelt alle in rawTx referenzierten playerIds ein
  // und holt für die noch unbekannten gezielt nach, bevor buildTransactionsFromLog() (über die
  // playerInfo()-Closure) darauf zugreift - verhindert "Unbekannter Spieler #<id>" bei kurzlebigen
  // Adds/Drops.
  const txPlayerIds = new Set();
  rawTx.forEach((t) => { (t.items || []).forEach((i) => { if (i.playerId != null) txPlayerIds.add(i.playerId); }); });
  const unresolvedTxIds = [...txPlayerIds].filter((id) => !projections[id] && !playerPool[id]);
  if (unresolvedTxIds.length) {
    console.log(`${unresolvedTxIds.length} Spieler nur aus Transaktionen bekannt, hole Namen/Position gezielt nach…`);
    const extraProjections = await fetchProjections(unresolvedTxIds);
    Object.assign(projections, extraProjections);
  }

  const txData = buildTransactionsFromLog(rawTx, teamNames, playerInfo);
  console.log(`${txData.length} Transaktionen aus ESPNs Log gebaut (Wochen 1-${currentWeek}).`);
  await writeJson('transactions.json', { lastUpdated: nowIso(), data: txData });

  await runSanityChecks();
  console.log('Sync abgeschlossen.');
}

// Nur automatisch starten, wenn diese Datei direkt ausgeführt wird (node scripts/sync-espn.mjs) -
// nicht, wenn sync-transactions.mjs (leichter täglicher Transaktions-Sync) einzelne Funktionen von
// hier importiert. Sonst würde jeder Import versehentlich den kompletten schweren Sync (inkl. Claude-
// Recap-Calls) mit auslösen.
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error('Sync fehlgeschlagen:', err);
    process.exit(1);
  });
}
