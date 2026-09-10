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

const COOKIE = `SWID=${ESPN_SWID}; espn_s2=${ESPN_S2}`;
const LEAGUE_BASE = `https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/${SEASON}/segments/0/leagues/${LEAGUE_ID}`;
const DEFAULTS_URL = `https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/${SEASON}/segments/0/leaguedefaults/3?view=kona_player_info`;

async function fetchLeague(views) {
  const url = LEAGUE_BASE + '?' + views.map((v) => 'view=' + v).join('&');
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

  // ---- Scoreboard (Regular Season, Wochen 1-15) ----
  const weeksMap = {};
  (scoreData.schedule || []).forEach((e) => {
    const wk = e.matchupPeriodId;
    if (wk > 15) return;
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

  // ---- Spiel-Recaps (von Claude geschrieben, im Stil des Saison-Ausblicks) ----
  // Nur für die Woche, die gerade komplett abgeschlossen wurde – läuft ohne
  // ANTHROPIC_API_KEY einfach nicht (siehe generate-recaps.mjs).
  if (lastCompletedWeek > 0) {
    const starterTotalById = Object.fromEntries(teamsComputed.map((t) => [t.id, t.starterTotal]));
    const weekGames = scoreboard.find((w) => w.week === lastCompletedWeek)?.games || [];
    const enrichedGames = weekGames.map((g) => ({
      ...g,
      week: lastCompletedWeek,
      homeProj: starterTotalById[g.homeId] || 0,
      awayProj: starterTotalById[g.awayId] || 0
    }));

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
