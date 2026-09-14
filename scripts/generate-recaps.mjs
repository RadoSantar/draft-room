// Lässt Claude für jedes abgeschlossene Spiel einen kurzen, reisserischen Recap
// im Stil des Saison-Ausblicks schreiben. Läuft nur, wenn ANTHROPIC_API_KEY gesetzt
// ist – ohne Key wird dieser Schritt übersprungen, der restliche Sync läuft normal weiter.
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const MODEL = 'claude-sonnet-5';

const SYSTEM_PROMPT = `Du schreibst kurze, extrem reisserische und dramatische Spiel-Recaps (3-5 Sätze, auf Deutsch) für "Fantasy Playbook", eine private Fantasy-Football-Liga. Stil: wie ein Sport-Kommentator, der jedes Spiel als DAS Ereignis der Woche inszeniert – Superlative, Spannungsbogen, ruhig übertreiben. Sei dabei frech und pointiert: scheu dich nicht vor Spott, Sarkasmus und einer scharfen Zunge, gerne mit einem Lacher oder einer bissigen Pointe zum Schluss. Der Spott zielt IMMER auf Fantasy-Entscheidungen und -Leistungen (z.B. eine schlechte Bank-Aufstellung, ein enttäuschender Star-Spieler, ein sich selbst besiegendes Team) – niemals auf die realen Personen dahinter persönlich.

Wenn im Kontext eine "Standout-Leistung" gegeben ist, baue sie als eigene Pointe ein (z.B. wie dieser eine Spieler das gegnerische Team alt aussehen liess). Wenn eine "Bank-Reue" gegeben ist, mach daraus genüsslich eine Schlüsselszene – vor allem wenn der Tausch laut Kontext sogar zum Sieg gereicht hätte, darf das richtig auf die Spitze getrieben werden. Wenn im Kontext ein "Spitzname für dieses Spiel" gegeben ist, flechte ihn wie einen eingängigen Rubrik-Titel natürlich in den Text ein (z.B. als zugespitzte Formulierung mittendrin, nicht zwingend als separate Überschrift) – er soll sich anfühlen wie ein wiederkehrendes Liga-Ritual ("Klatsche der Woche" & Co.), nicht wie eine angeklebte Floskel. Wenn im Kontext eine "Vorschau auf die kommende Woche" gegeben ist, schliesse den Recap mit JE EINEM kurzen Teaser-Satz PRO TEAM ab – wie ein Trailer auf die jeweils nächste Partie, ruhig mit einer frechen kleinen Prognose-Anspielung, aber locker hingeworfen statt als separater Absatz. Wenn im Kontext ein "Playoff-Kontext" gegeben ist, passe den Ton entsprechend an: beim Gewinner-Bracket darf die übliche grosse Championship-Dramatik noch eine Schippe drauflegen; beim Toilet Bowl dreht sich der Humor um, wird selbstironisch-komisch – es geht darum, NICHT Letzter zu werden, das ist die Pointe, nicht sportlicher Ruhm. Wenn im Kontext ein "Playoff-Rennen"-Fakt gegeben ist, darfst du hier besonders bissig-ironisch werden: ein rechnerisch bereits eliminiertes Team wird mit süffisantem Mitleid bedacht (es spielt ja "nur noch um die Ehre"), ein Team mit knappem Rückstand oder wenig Polster steht dagegen unter echtem Druck – das darf sich im Ton wie ein Muss-Sieg anfühlen. Wenn "Waiver-Wire-Karma" gegeben ist, zelebriere das genüsslich als Schicksalsironie – das Team hat den eigenen Untergang quasi selbst herbeigeholt. "Pechvogel der Woche" und "Hässlicher Sieg" dürfen ebenfalls mit spürbarem Sarkasmus serviert werden (einmal Mitleid mit Häme gemischt, einmal ein süffisantes "Sieg ist Sieg, aber..."). Nutze nur die im Kontext gegebenen Fakten, erfinde keine Spieler-Stats oder Ereignisse, die nicht gegeben sind. Schreib NUR den Fliesstext des Recaps selbst, keine Einleitung wie "Hier ist der Recap", keine Anführungszeichen drumherum, keine Überschrift.`;

async function callClaude(userPrompt) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 300,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userPrompt }]
    })
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Claude-API-Fehler (${res.status}): ${text}`);
  }
  const data = await res.json();
  return (data.content?.[0]?.text || '').trim();
}

// Deterministischer Pseudo-Zufall aus einem String-Seed (kein echter Zufall nötig – soll bei
// wiederholten Läufen mit denselben Daten dieselbe Auswahl treffen). Liefert eine gemischte Kopie
// von items, aus der der Aufrufer die ersten `count` nimmt.
function seededShuffle(items, seedStr) {
  let seed = 0;
  for (let i = 0; i < seedStr.length; i++) seed = (seed * 31 + seedStr.charCodeAt(i)) >>> 0;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const arr = items.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// Sammelt alle verfügbaren Storyline-Fakten für ein Spiel als fertige Kontext-Sätze. Nicht jedes
// Spiel hat jeden Fakt (z.B. positionale Dominanz oder eine Serie gibt es nicht immer) – das allein
// sorgt schon für Abwechslung, zusätzlich wird unten nur eine Zufallsauswahl davon in den Prompt
// aufgenommen, damit sich nicht jede Woche nach demselben Schema liest.
function collectFacts(game) {
  const facts = [];

  if (game.standout) {
    const s = game.standout;
    const standoutTeam = s.side === 'home' ? game.homeName : game.awayName;
    facts.push(`Standout-Leistung des Spiels: ${s.name} (${s.pos}) mit ${s.points.toFixed(1)} Punkten für ${standoutTeam}.`);
  }

  if (game.loserBenchRegret) {
    const r = game.loserBenchRegret;
    let t = `Bank-Reue: ${r.team} liess ${r.benchPlayer.name} (${r.benchPlayer.pos}, ${r.benchPlayer.points.toFixed(1)} Punkte) auf der Bank sitzen, während Starter ${r.starter.name} (${r.starter.points.toFixed(1)} Punkte) spielte.`;
    t += r.wouldHaveWon ? ' Mit dem Tausch hätte es sogar zum Sieg gereicht!' : ' Auch mit dem Tausch hätte es nicht ganz zum Sieg gereicht, aber es wäre knapper geworden.';
    facts.push(t);
  }

  if (game.winnerBenchRegret) {
    const r = game.winnerBenchRegret;
    facts.push(`Trotz Sieg liess ${r.team} auf der Bank Punkte liegen: ${r.benchPlayer.name} (${r.benchPlayer.pos}, ${r.benchPlayer.points.toFixed(1)} Punkte) sass draussen, während Starter ${r.starter.name} nur ${r.starter.points.toFixed(1)} Punkte brachte – am Ende reichte es trotzdem.`);
  }

  if (game.positionalDominance) {
    const d = game.positionalDominance;
    facts.push(`Positionale Dominanz: Allein die ${d.pos}s von ${d.team} holten ${d.groupTotal.toFixed(1)} Punkte – mehr als das komplette Team von ${d.opponent} (${d.opponentTotal.toFixed(1)}) zusammen.`);
  }

  if (game.streak) {
    const s = game.streak;
    facts.push(s.streakType === 'WIN'
      ? `${s.team} gewinnt damit das ${s.streakLength}. Spiel in Folge.`
      : `${s.team} kassiert damit die ${s.streakLength}. Niederlage in Folge.`);
  }

  if (game.optimalLineupGap) {
    const g = game.optimalLineupGap;
    facts.push(`Aufstellungs-Patzer: ${g.team} spielte ${g.actualTotal.toFixed(1)} Punkte, mit der bestmöglichen Aufstellung aus dem kompletten Kader wären ${g.optimalTotal.toFixed(1)} Punkte drin gewesen – ${g.gap.toFixed(1)} Punkte leichtfertig liegen gelassen.`);
  }

  if (game.confStanding) {
    const c = game.confStanding;
    const record = `${c.wins}-${c.losses}${c.ties ? '-' + c.ties : ''}`;
    if (c.prevRank != null && c.prevRank !== c.rank) {
      facts.push(c.rank < c.prevRank
        ? `${c.team} klettert in der ${c.conf}-Tabelle von Platz ${c.prevRank} auf Platz ${c.rank} (Bilanz ${record}).`
        : `${c.team} fällt in der ${c.conf}-Tabelle von Platz ${c.prevRank} auf Platz ${c.rank} zurück (Bilanz ${record}).`);
    } else {
      facts.push(`${c.team} steht in der ${c.conf}-Tabelle auf Platz ${c.rank} (Bilanz ${record}).`);
    }
  }

  if (game.seasonExtreme) {
    const e = game.seasonExtreme;
    facts.push(e.type === 'high'
      ? `${e.team} erzielt mit ${e.score.toFixed(1)} Punkten die bisher höchste Wochenpunktzahl der gesamten Saison.`
      : `${e.team} erzielt mit ${e.score.toFixed(1)} Punkten die bisher niedrigste Wochenpunktzahl der gesamten Saison.`);
  }

  if (game.playoffRace) {
    const r = game.playoffRace;
    if (r.status === 'eliminated') {
      facts.push(`Playoff-Rennen: ${r.team} kann selbst mit einer perfekten Restsaison rechnerisch nicht mehr an den letzten Playoff-Platz herankommen – schon draussen.`);
    } else if (r.status === 'chasing') {
      facts.push(`Playoff-Rennen: ${r.team} liegt ${r.winsBehind} Sieg(e) hinter dem letzten Playoff-Platz zurück, ist aber noch nicht rechnerisch raus.`);
    } else if (r.status === 'in') {
      facts.push(`Playoff-Rennen: ${r.team} steht aktuell auf einem Playoff-Platz (Seed ${r.seed})${r.cushion != null ? `, mit ${r.cushion} Sieg(en) Polster auf das erste Team ausserhalb` : ''}.`);
    }
  }

  if (game.unluckyLoser) {
    const u = game.unluckyLoser;
    facts.push(`Pechvogel der Woche: ${u.team} verliert trotz ${u.score.toFixed(1)} Punkten – ein Score, mit dem ${u.beatenCount === 1 ? 'ein anderes Spiel' : u.beatenCount + ' andere Spiele'} diese Woche gewonnen worden wäre(n).`);
  }

  if (game.uglyWin) {
    const w = game.uglyWin;
    facts.push(`Hässlicher Sieg: ${w.team} gewinnt mit nur ${w.score.toFixed(1)} Punkten – der niedrigsten Siegerpunktzahl der gesamten Woche.`);
  }

  if (game.rematch) {
    const r = game.rematch;
    facts.push(r.isRevenge
      ? `Revanche: In Woche ${r.week} gab es zwischen diesen beiden Teams schon ein Duell (${r.scoreLine}), damals gewann ${r.winner} – diesmal hat sich das Blatt gewendet.`
      : `Wiederholung: In Woche ${r.week} gab es zwischen diesen beiden Teams schon ein Duell (${r.scoreLine}) – ${r.winner ? r.winner + ' gewinnt erneut' : 'auch das endete ähnlich'}.`);
  }

  if (game.kickerDecisive) {
    const k = game.kickerDecisive;
    facts.push(`Unwahrscheinlicher Held: ${k.name} (${k.pos}) von ${k.team} steuerte ${k.points.toFixed(1)} Punkte bei – mehr als der Sieg-Vorsprung von ${k.margin.toFixed(1)} Punkten, ohne diese Position hätte es nicht gereicht.`);
  }

  if (game.waiverKarma) {
    const wk = game.waiverKarma;
    facts.push(`Waiver-Wire-Karma: ${wk.droppingTeam} warf ${wk.player.name} diese Saison schon mal ab – jetzt spielt er für ${wk.karmaTeam} und liefert ausgerechnet gegen die alten Besitzer ${wk.player.points.toFixed(1)} Punkte ab.`);
  }

  return facts;
}

// Kuratierte "Spitznamen" pro Spiel-Situation – mehrere pro Kategorie für Abwechslung, gedacht als
// wiederkehrendes, augenzwinkerndes Liga-Ritual (ähnlich "Tor des Monats"). Trifft eine Situation auf
// mehrere Kategorien zu (z.B. Blowout + Bank-Reue), landen alle passenden Spitznamen in einem
// gemeinsamen Topf, aus dem – wieder seedbasiert-deterministisch – nur einer gezogen wird.
const BADGE_POOL = {
  blowout: [
    'Die Klatsche der Woche', 'Frühstück serviert', 'Schulhof-Abreibung', 'Der Elfmeter der Woche',
    'Liga-Massaker', 'Exekution ohne Gnade', 'Der Offenbarungseid', 'Keine Partie, eine Demontage'
  ],
  nailbiter: [
    'Herzschlagfinale der Woche', 'Zitterpartie der Woche', 'Photo Finish', 'Nervenkrieg pur',
    'Bis zur letzten Sekunde', 'Der Krimi der Woche', 'Kopf-an-Kopf-Rennen', 'Das Fotofinish der Liga'
  ],
  upset: [
    'David gegen Goliath', 'Der Aussenseiter-Coup', 'Vorschau? Welche Vorschau?', 'Papierform war gestern',
    'Der Prophet lag falsch', 'Aussenseiter schreiben Geschichte', 'Wer hätte das gedacht?',
    'Die Rechnung ohne den Wirt gemacht', 'Die Umfragewerte für die Tonne'
  ],
  fatalBenchRegret: [
    'Eigentor der Woche', 'Selbstzerstörung par excellence', 'Bank-Bankrott', 'Hausgemachte Pleite',
    'Der Bank-GAU', 'Eigenverschuldetes Debakel', 'Der Griff ins Klo', 'Selbstsabotage vom Feinsten'
  ],
  standout: [
    'Ein-Mann-Armee', 'MVP der Woche', 'Der Unaufhaltsame', 'Solo-Gala',
    'Der Alleinunterhalter', 'Der Königsmacher', 'Einzelkämpfer der Extraklasse', 'Die Ein-Personen-Gala'
  ],
  winStreak: [
    'Die Dampfwalze rollt', 'Unaufhaltsam', 'Auf Erfolgskurs', 'Der Lauf geht weiter',
    'Der Siegeszug', 'Nicht zu stoppen', 'Die Erfolgsserie wächst'
  ],
  lossStreak: [
    'Free Fall', 'Krisenmodus', 'Der Absturz geht weiter', 'Kein Land in Sicht',
    'Der Negativrekord ruft', 'Die Pechsträhne hält', 'Tiefer geht immer'
  ],
  dominance: [
    'One-Man-Show', 'Die Übermacht', 'Allein gegen alle – und gewonnen',
    'Der Alleingang', 'Eine Positionsgruppe, ein Sieg', 'Im Alleingang zum Sieg getragen'
  ],
  tie: [
    'Unentschieden-Drama', 'Keiner wollte gewinnen', 'Geteiltes Leid',
    'Der Punktegleichstand', 'Niemand verliert, niemand gewinnt so richtig'
  ],
  lineupDisaster: [
    'Der Bank-Fluch', 'Verschenktes Potential', 'Hätte, hätte, Fahrradkette',
    'Der Aufstellungs-Patzer der Woche', 'Selbst im Weg gestanden', 'Die Bank wusste es besser'
  ],
  seasonHigh: [
    'Saisonrekord geknackt', 'Die Bestmarke der Saison', 'Die Woche des Jahres',
    'Neuer Punkte-Höchststand', 'So gut war noch niemand', 'Der Saisonhöhepunkt'
  ],
  seasonLow: [
    'Der Tiefpunkt der Saison', 'Saison-Fiasko', 'Die schwächste Vorstellung des Jahres',
    'Neuer Negativrekord', 'So schlecht war noch niemand', 'Der Saison-Tiefschlag'
  ],
  championshipHunt: [
    'Alles steht auf dem Spiel', 'Der Weg zur Krone', 'Playoff-Fieber', 'Do or Die',
    'Die Championship ruft', 'Showdown um den Titel'
  ],
  toiletBowl: [
    'Der Kampf um die rote Laterne', 'Niemand will das hier gewinnen', 'Willkommen im Toilet Bowl',
    'Der Wettbewerb, den keiner will', 'Ruhm? Fehlanzeige', 'Der Trostpreis-Krieg'
  ],
  raceEliminated: [
    'Playoffs? Schon vorbei', 'Die Saison ist gelaufen', 'Ab in den Toilet-Bowl-Modus',
    'Mathematisch schon Geschichte', 'Der Traum ist ausgeträumt', 'Rechnerisch schon im Winterschlaf'
  ],
  raceMustWin: [
    'Muss-Gewinn-Spiel', 'Der letzte Strohhalm', 'Jetzt oder nie',
    'Alles oder nichts', 'Die letzte Chance klopft an', 'Der Point of no Return'
  ],
  unluckyLoser: [
    'Pechvogel der Woche', 'Die bitterste Niederlage der Woche', 'Verloren trotz Top-Score',
    'Der Gerechtigkeit zum Trotz', 'Falsche Woche für diesen Score', 'Zur falschen Zeit am falschen Ort'
  ],
  uglyWin: [
    'Der hässliche Sieg', 'Sieg mit Stil-Abzug', 'Der schwächste Sieger der Woche',
    'Gewonnen, aber bitte nicht klatschen', 'Der Sieg, der niemanden beeindruckt'
  ],
  revenge: [
    'Die Revanche ist geglückt', 'Zurückgeschlagen', 'Wiedergutmachung serviert', 'Die Quittung folgt auf dem Fusse'
  ],
  repeatResult: [
    'Der Fluch hält an', 'Schon wieder das gleiche Ergebnis', 'Déjà-vu der unschönen Art', 'Zweimal die gleiche Lektion'
  ],
  kickerHero: [
    'Der Kicker hat\'s gerichtet', 'Unwahrscheinlicher Held', 'Die unterschätzte Position liefert', 'Der Kicker-Krimi'
  ],
  waiverKarma: [
    'Karma ist eine Diva', 'Der Fluch des Drops', 'Selbst schuld', 'Zurückgekehrt, um sich zu rächen', 'Die eigene Entscheidung rächt sich'
  ]
};

function pickBadge(game, wasUpset, margin) {
  const categories = [];
  if (game.winner === 'TIE') categories.push('tie');
  if (margin >= 50) categories.push('blowout');
  if (margin > 0 && margin <= 5) categories.push('nailbiter');
  if (wasUpset) categories.push('upset');
  if (game.loserBenchRegret?.wouldHaveWon) categories.push('fatalBenchRegret');
  if (game.standout && game.standout.points >= 30) categories.push('standout');
  if (game.streak?.streakType === 'WIN' && game.streak.streakLength >= 3) categories.push('winStreak');
  if (game.streak?.streakType === 'LOSS' && game.streak.streakLength >= 3) categories.push('lossStreak');
  if (game.positionalDominance) categories.push('dominance');
  if (game.optimalLineupGap && game.optimalLineupGap.gap >= 15) categories.push('lineupDisaster');
  if (game.seasonExtreme?.type === 'high') categories.push('seasonHigh');
  if (game.seasonExtreme?.type === 'low') categories.push('seasonLow');
  if (game.playoffTier === 'WINNERS_BRACKET') categories.push('championshipHunt');
  if (game.playoffTier === 'LOSERS_BRACKET') categories.push('toiletBowl');
  if (game.playoffRace?.status === 'eliminated') categories.push('raceEliminated');
  if (game.playoffRace?.status === 'chasing' && game.playoffRace.winsBehind <= 1) categories.push('raceMustWin');
  if (game.unluckyLoser) categories.push('unluckyLoser');
  if (game.uglyWin) categories.push('uglyWin');
  if (game.rematch?.isRevenge) categories.push('revenge');
  if (game.rematch && !game.rematch.isRevenge) categories.push('repeatResult');
  if (game.kickerDecisive) categories.push('kickerHero');
  if (game.waiverKarma) categories.push('waiverKarma');

  const candidates = categories.flatMap((c) => BADGE_POOL[c]);
  if (!candidates.length) return null;
  const key = game.week + '-' + [game.homeId, game.awayId].sort().join('-') + '-badge';
  return seededShuffle(candidates, key)[0];
}

function buildPrompt(game) {
  const margin = Math.abs(game.homeScore - game.awayScore);
  const winner = game.winner === 'HOME' ? game.homeName : game.winner === 'AWAY' ? game.awayName : null;
  const loser = game.winner === 'HOME' ? game.awayName : game.winner === 'AWAY' ? game.homeName : null;
  const favorite = game.homeProj >= game.awayProj ? game.homeName : game.awayName;
  const wasUpset = winner && loser && winner !== favorite;

  let context = `Woche ${game.week}: ${game.homeName} (Vorschau-Stärke: ${game.homeProj.toFixed(0)} Punkte-Projektion für die Saison) gegen ${game.awayName} (${game.awayProj.toFixed(0)}). `;
  if (game.playoffTier === 'WINNERS_BRACKET') {
    context += 'Playoff-Kontext: Dieses Spiel gehört zum Gewinner-Bracket der Playoffs – hier geht es um die Championship. ';
  } else if (game.playoffTier === 'LOSERS_BRACKET') {
    context += 'Playoff-Kontext: Dieses Spiel gehört zum Verlierer-Bracket der Playoffs, dem berüchtigten Toilet Bowl – hier will keiner der beiden Teams am Ende Letzter sein. ';
  }
  context += `Endstand: ${game.homeName} ${game.homeScore.toFixed(1)} : ${game.awayScore.toFixed(1)} ${game.awayName}. `;
  if (game.winner === 'TIE') {
    context += 'Das Spiel endete unentschieden. ';
  } else {
    context += `${winner} gewinnt mit ${margin.toFixed(1)} Punkten Vorsprung gegen ${loser}. `;
    context += wasUpset
      ? `${favorite} galt vor der Saison als das stärker aufgestellte Team – ${winner} hat hier also den Außenseiter-Sieg gelandet. `
      : `${winner} war schon vor der Saison das stärker aufgestellte Team und bestätigt das hier. `;
  }

  const key = game.week + '-' + [game.homeId, game.awayId].sort().join('-');
  const picked = seededShuffle(collectFacts(game), key).slice(0, 3);
  picked.forEach((sentence) => { context += sentence + ' '; });

  const badge = pickBadge(game, wasUpset, margin);
  if (badge) context += `Spitzname für dieses Spiel: "${badge}". `;

  const teaser = (teamName, opp) => {
    if (!opp) return null;
    let t = `${teamName} trifft nächste Woche auf ${opp.name}`;
    if (opp.wins != null) {
      t += ` (Bilanz ${opp.wins}-${opp.losses}${opp.ties ? '-' + opp.ties : ''}`;
      t += opp.confRank != null ? `, Platz ${opp.confRank} der ${opp.conf})` : ')';
    }
    return t + '.';
  };
  const homeTeaser = teaser(game.homeName, game.homeNextOpp);
  const awayTeaser = teaser(game.awayName, game.awayNextOpp);
  if (homeTeaser || awayTeaser) {
    context += `Vorschau auf die kommende Woche (für beide Teams je einen eigenen Teaser-Satz schreiben): ${[homeTeaser, awayTeaser].filter(Boolean).join(' ')} `;
  }

  context += 'Schreibe jetzt den Recap.';
  return context;
}

/**
 * @param {Array} games - Spiele einer Woche, angereichert mit week/homeProj/awayProj.
 * @param {Object} existingByKey - bereits vorhandene Recaps (key -> recap), um Doppel-Calls zu vermeiden.
 * @returns {Promise<Object>} key -> recap text (nur neu generierte)
 */
export async function generateRecapsForGames(games, existingByKey) {
  if (!ANTHROPIC_API_KEY) {
    console.log('ANTHROPIC_API_KEY nicht gesetzt – überspringe Recap-Generierung.');
    return {};
  }
  const out = {};
  for (const game of games) {
    const key = game.week + '-' + [game.homeId, game.awayId].sort().join('-');
    if (existingByKey[key]) continue;
    try {
      const prompt = buildPrompt(game);
      const recap = await callClaude(prompt);
      out[key] = { week: game.week, homeName: game.homeName, awayName: game.awayName, recap };
      console.log('Recap generiert:', game.homeName, 'vs', game.awayName);
    } catch (err) {
      console.error('Recap fehlgeschlagen für', game.homeName, 'vs', game.awayName, ':', err.message);
    }
  }
  return out;
}
