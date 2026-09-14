// Holt Draft/Roster/Standings/Scoreboard/Transaktionen aus der privaten ESPN-Liga und
// schreibt die Ergebnisse nach ../data/*.json. Läuft per GitHub Actions (siehe
// .github/workflows/espn-sync.yml) oder lokal mit ESPN_S2/ESPN_SWID als Env-Vars.
//
// Schreibt NIE team-content.json (die handgeschriebenen Analysen/Ausblicke) – das bleibt
// ausschliesslich manuell gepflegt.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { POS_MAP, TEAM_ABBR, projectedPoints, findSeasonProjection, buildOptimalLineup } from './scoring.mjs';
import { generateRecapsForGames } from './generate-recaps.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '..', 'data');

const LEAGUE_ID = process.env.ESPN_LEAGUE_ID || '686672943';
const SEASON = process.env.ESPN_SEASON || '2026';
const ESPN_S2 = process.env.ESPN_S2;
const ESPN_SWID = process.env.ESPN_SWID;

if (!ESPN_S2 || !ESPN_SWID) {
  console.error('ESPN_S2 und/oder ESPN_SWID fehlen als Umgebungsvariable. Abbruch.');
  process.exit(1);
}

// Conference-Zuordnung – deckungsgleich mit TEAM_CONF in power-rankings.html/schedule.html.
// ESPNs API liefert für diese Liga keine nutzbare Conference/Division-Info, daher von Hand gepflegt.
const TEAM_CONF = {
  'Tackleberry Finn': 'NFC', 'Apukalypse Now': 'NFC', 'Hopp Schwiiz': 'NFC', 'Buhaaner': 'NFC',
  'Run CMC': 'AFC', 'Queen of Chaos': 'AFC', 'Sherlock Mahomes': 'AFC', 'TM06': 'AFC',
  'Saints of Anarchy': 'NFC', 'Zurich City Ravens': 'AFC'
};

const COOKIE = `SWID=${ESPN_SWID}; espn_s2=${ESPN_S2}`;
const LEAGUE_BASE = `https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/${SEASON}/segments/0/leagues/${LEAGUE_ID}`;
const DEFAULTS_URL = `https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/${SEASON}/segments/0/leaguedefaults/3?view=kona_player_info`;

async function fetchLeague(views, scoringPeriodId) {
  let url = LEAGUE_BASE + '?' + views.map((v) => 'view=' + v).join('&');
  if (scoringPeriodId) url += '&scoringPeriodId=' + scoringPeriodId;
  const res = await fetch(url, { headers: { Cookie: COOKIE } });
  if (!res.ok) throw new Error(`ESPN-Fetch fehlgeschlagen (${res.status}): ${url}`);
  return res.json();
}

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

async function readJsonSafe(file, fallback) {
  try {
    const raw = await readFile(path.join(DATA_DIR, file), 'utf8');
    return JSON.parse(raw);
  } catch (e) {
    return fallback;
  }
}

async function writeJson(file, value) {
  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(path.join(DATA_DIR, file), JSON.stringify(value), 'utf8');
  console.log('geschrieben:', file);
}

function nowIso() {
  return new Date().toISOString();
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
  const weeksMap = {};
  (scoreData.schedule || []).forEach((e) => {
    const wk = e.matchupPeriodId;
    if (wk > 25) return;
    if (!e.home?.teamId || !e.away?.teamId) return;
    (weeksMap[wk] = weeksMap[wk] || []).push({
      homeId: e.home.teamId, homeName: teamNames[e.home.teamId], homeScore: Math.round(e.home.totalPoints * 10) / 10,
      awayId: e.away.teamId, awayName: teamNames[e.away.teamId], awayScore: Math.round(e.away.totalPoints * 10) / 10,
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
    const ctx = { standingsById, confStandings, prevConfRankById, scoreboard };
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
