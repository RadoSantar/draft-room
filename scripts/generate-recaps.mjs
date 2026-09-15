// Lässt Claude für jedes abgeschlossene Spiel einen kurzen, reisserischen Recap
// im Stil des Saison-Ausblicks schreiben. Läuft nur, wenn ANTHROPIC_API_KEY gesetzt
// ist – ohne Key wird dieser Schritt übersprungen, der restliche Sync läuft normal weiter.
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const MODEL = 'claude-sonnet-5';

const SYSTEM_PROMPT = `Du schreibst kurze, extrem reisserische und dramatische Spiel-Recaps (3-6 Sätze, auf Deutsch) für "Fantasy Playbook", eine private Fantasy-Football-Liga. Stil: wie ein Sport-Kommentator, der jedes Spiel als DAS Ereignis der Woche inszeniert – Superlative, Spannungsbogen, ruhig übertreiben. Sei dabei frech, scharfzüngig und schadenfroh: scheu dich nicht vor Spott und Sarkasmus, mit einem Lacher oder einer bissigen Pointe zum Schluss. Der Spott zielt IMMER auf Fantasy-Entscheidungen und -Leistungen (schlechte Bank-Aufstellung, enttäuschender Star, sich selbst besiegendes Team) – niemals auf die realen Personen dahinter persönlich.

WICHTIGSTE REGEL FÜR DIE FORM: Der Text muss sich wie EIN einziger, zusammenhängender Gedanke lesen – nicht wie eine Liste abgehakter Fakten. Du bekommst oft mehr Fakten mitgeliefert, als reinpassen: wähle die 1-2 stärksten aus, die zusammen EINE Pointe ergeben, und lass den Rest weg. Verbinde sie mit echten Übergängen und Kausalität ("deshalb", "obwohl", "ausgerechnet", "und dann") statt mit Satz-für-Satz-Aneinanderreihung ("Fakt A. Fakt B. Fakt C."). Wenn zwei Fakten nicht organisch zueinander passen, nimm nur den stärkeren.

So gehst du mit den mitgelieferten Fakten um, gruppiert nach Wirkung:
- Grosse Dramatik/Übertreibung: Standout-Leistung, Kollaps/Comeback, Team-Storyline (Imperium/Dynastie/Erster Sieg/makellose Bilanz), Playoff-Kontext im Gewinner-Bracket. Hier darfst du richtig theatralisch werden, bildhafte Vergleiche einbauen ("legte los wie X").
- Schadenfreude/Sarkasmus: Bank-Reue, Waiver-Wire-Karma, Pechvogel der Woche, Hässlicher Sieg, Erwartungswert-Bilanz, Draft-Reue/Schnäppchen, Playoff-Rennen (eliminierte Teams mit süffisantem Mitleid, Teams unter Druck ernst), Toilet-Bowl-Kontext (Humor dreht sich um: es geht nur darum, NICHT Letzter zu werden).
- Wiederkehrender Insider-Gag: Spitzname fürs Spiel (natürlich einflechten, kein angeklebtes Label), Saison-Persönlichkeit ("mal wieder", "wie erwartet").
- Vorsichtig formulieren (Näherung, keine erfundene Präzision): alles auf Basis unserer Zwischenstände (Kollaps/Comeback, Frühstarter/Spätzünder, Zittersieg, Monday-Night-Rettung, Dauerhafter Nervenkrieg) – Dramatik ja, aber keine erfundenen exakten Zeitpunkte oder Spielzüge.
- Zum Schluss, falls gegeben: ein Ausblick auf die kommende Woche, JE EIN kurzer Teaser-Satz pro Team, locker als Abschluss hingeworfen statt als separater Absatz.

Nutze nur die im Kontext gegebenen Fakten, erfinde keine Spieler-Stats oder Ereignisse, die nicht gegeben sind. Schreib NUR den Fliesstext des Recaps selbst, keine Einleitung wie "Hier ist der Recap", keine Anführungszeichen drumherum, keine Überschrift.`;

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
      max_tokens: 600,
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
    let t = r.isRevenge
      ? `Revanche: In Woche ${r.week} gab es zwischen diesen beiden Teams schon ein Duell (${r.scoreLine}), damals gewann ${r.winner} – diesmal hat sich das Blatt gewendet.`
      : `Wiederholung: In Woche ${r.week} gab es zwischen diesen beiden Teams schon ein Duell (${r.scoreLine}) – ${r.winner ? r.winner + ' gewinnt erneut' : 'auch das endete ähnlich'}.`;
    if (r.isFinalMeeting) t += ' Damit ist die Saison-Serie zwischen den beiden Teams entschieden, es steht kein weiteres Duell mehr auf dem Programm.';
    facts.push(t);
  }

  if (game.kickerDecisive) {
    const k = game.kickerDecisive;
    facts.push(`Unwahrscheinlicher Held: ${k.name} (${k.pos}) von ${k.team} steuerte ${k.points.toFixed(1)} Punkte bei – mehr als der Sieg-Vorsprung von ${k.margin.toFixed(1)} Punkten, ohne diese Position hätte es nicht gereicht.`);
  }

  if (game.waiverKarma) {
    const wk = game.waiverKarma;
    facts.push(`Waiver-Wire-Karma: ${wk.droppingTeam} warf ${wk.player.name} diese Saison schon mal ab – jetzt spielt er für ${wk.karmaTeam} und liefert ausgerechnet gegen die alten Besitzer ${wk.player.points.toFixed(1)} Punkte ab.`);
  }

  if (game.comeback) {
    const c = game.comeback;
    facts.push(`Kollaps/Comeback laut unseren Zwischenständen im Wochenverlauf: ${c.collapsedTeam} lag zeitweise mit rund ${c.peakLead.toFixed(1)} Punkten voran, am Ende gewann aber trotzdem ${c.winnerTeam}.`);
  }

  if (game.leadChanges) {
    facts.push(`Nervenkrieg laut unseren Zwischenständen: Die Führung wechselte im Wochenverlauf mindestens ${game.leadChanges.changes} Mal den Besitzer.`);
  }

  if (game.pace) {
    const p = game.pace;
    facts.push(p.type === 'fast'
      ? `Frühstarter laut unseren Zwischenständen: ${p.team} hatte schon beim allerersten Wochen-Snapshot ${p.earlyScore.toFixed(1)} von am Ende ${p.finalScore.toFixed(1)} Punkten drauf.`
      : `Spätzünder laut unseren Zwischenständen: ${p.team} stand beim allerersten Wochen-Snapshot noch bei quasi ${p.earlyScore.toFixed(1)} Punkten, kam am Ende aber auf ${p.finalScore.toFixed(1)}.`);
  }

  if (game.survivedScare) {
    const s = game.survivedScare;
    facts.push(`Zittersieg laut unseren Zwischenständen: ${s.team} lag zeitweise mit rund ${s.peakLead.toFixed(1)} Punkten vorne, der Vorsprung schmolz aber auf nur noch ${s.finalMargin.toFixed(1)} zusammen, bevor es am Ende doch noch reichte.`);
  }

  if (game.mondayRescue) {
    const r = game.mondayRescue;
    facts.push(`Monday-Night-Rettung laut unseren Zwischenständen: ${r.team} lag vor dem Montagabend noch mit rund ${r.deficitBeforeMonday.toFixed(1)} Punkten zurück, gewann das Spiel aber am Ende doch noch – nur dank der Montagabend-Spieler möglich.`);
  }

  if (game.sustainedNailbiter) {
    facts.push(`Dauerhafter Nervenkrieg laut unseren Zwischenständen: Bei ${game.sustainedNailbiter.streak} Wochen-Snapshots in Folge lagen die Teams innerhalb von 5 Punkten auseinander – nicht nur am Ende knapp, sondern über weite Strecken der Woche.`);
  }

  if (game.seasonPersonality) {
    const sp = game.seasonPersonality;
    facts.push(`Saison-Persönlichkeit: ${sp.team} hat sich diese Saison einen Ruf erarbeitet als ${sp.label} (${sp.count} von ${sp.games} Spielen mit Live-Daten passen zu diesem Muster).`);
  }

  if (game.expectation) {
    const e = game.expectation;
    facts.push(e.lucky
      ? `Erwartungswert-Bilanz: ${e.team} steht bei ${e.actualWins} Siegen, aus dem Verhältnis von erzielten zu kassierten Punkten wären aber eigentlich nur ${e.expectedWins.toFixed(1)} "verdient" – die Bilanz schmeichelt.`
      : `Erwartungswert-Bilanz: ${e.team} steht bei nur ${e.actualWins} Siegen, aus dem Verhältnis von erzielten zu kassierten Punkten wären aber eigentlich ${e.expectedWins.toFixed(1)} "verdient" – die Bilanz lügt hier eindeutig zu Ungunsten des Teams.`);
  }

  if (game.draftValue) {
    const d = game.draftValue;
    facts.push(d.type === 'bargain'
      ? `Schnäppchen der Woche: ${d.name} von ${d.team} wurde erst in Runde ${d.round} gedraftet und liefert jetzt ${d.points.toFixed(1)} Punkte als Standout des Spiels ab.`
      : `Draft-Reue: ${d.name} von ${d.team} wurde bereits in Runde ${d.round} gedraftet, brachte aber nur ${d.points.toFixed(1)} Punkte – während ein Bankspieler ihn deutlich blamierte.`);
  }

  if (game.empireStoryline) {
    const emp = game.empireStoryline;
    const templates = {
      firstWinBroken: `${emp.team} feiert nach ${emp.losses} Niederlagen in Serie endlich den ersten Saisonsieg.`,
      winless: `${emp.team} bleibt nach ${emp.losses} Spielen weiter sieglos.`,
      perfectRecord: `${emp.team} bleibt mit einer makellosen ${emp.wins}-0-Bilanz weiter ungeschlagen.`,
      empire: `${emp.team} baut die dominante ${emp.wins}-${emp.losses}-Bilanz mit diesem Sieg weiter aus.`,
      empireCrumbling: `${emp.team} (${emp.wins}-${emp.losses}) musste sich trotz starker Saisonbilanz geschlagen geben.`,
      turnaround: `${emp.team} gewinnt trotz insgesamt noch unterdurchschnittlicher ${emp.wins}-${emp.losses}-Bilanz bereits das ${emp.streak}. Spiel in Folge.`
    };
    facts.push(`Team-Storyline: ${templates[emp.type]}`);
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
  ],
  comeback: [
    'Der Kollaps der Woche', 'Vom Sicher-Geglaubten zum Nichts', 'Zurück in die Gosse, wo sie herkamen',
    'Die Feuerwehr, die ausging', 'Der grosse Einbruch', 'Zu früh gefeiert'
  ],
  seesaw: [
    'Nervenkrieg mit Ansage', 'Das Hin und Her der Woche', 'Wer zuletzt lacht...', 'Die Wundertüte der Woche'
  ],
  fastStart: [
    'Der Frühstarter', 'Sofort auf Betriebstemperatur', 'Volle Kraft voraus ab Donnerstag'
  ],
  slowStart: [
    'Der Spätzünder', 'Erst spät in Fahrt gekommen', 'Vom Nichts zum Etwas'
  ],
  survivedScare: [
    'Der Zittersieg', 'Fast verspielt, aber gehalten', 'Die knappste Kurve der Woche', 'Zittern bis zum Schluss'
  ],
  mondayRescue: [
    'Die Monday-Night-Rettung', 'Gerettet in letzter Sekunde', 'Der Montagabend-Held', 'In letzter Minute gedreht'
  ],
  sustainedNailbiter: [
    'Dauerhafter Nervenkrieg', 'Von Anfang bis Ende zum Zerreissen gespannt', 'Die ganze Woche ein Krimi'
  ],
  seasonPersonalityComeback: [
    'Der ewige Last-Minute-Held', 'Bekannt für die grosse Aufholjagd', 'Comeback-König der Liga'
  ],
  seasonPersonalityCollapse: [
    'Der Wiederholungstäter', 'Notorischer Vorsprungs-Verspieler', 'Schon wieder: der Klassiker'
  ],
  seasonPersonalityNailbiter: [
    'Dauergast in Nervenkriegen', 'Macht es sich nie einfach', 'Der Drama-Magnet der Liga'
  ],
  seasonPersonalityWireToWire: [
    'Der Kontrollfreak', 'Führt vom ersten bis zum letzten Punkt', 'Lässt nichts anbrennen'
  ],
  pythagoreanLucky: [
    'Die Bilanz schmeichelt', 'Mehr Glück als Verstand', 'Auf Sand gebaut', 'Das Punktekonto lügt'
  ],
  pythagoreanUnlucky: [
    'Verdient mehr als die Bilanz zeigt', 'Pech mit System', 'Die Zahlen sprechen eine andere Sprache'
  ],
  bargain: [
    'Schnäppchen der Woche', 'Der Steal des Drafts', 'Value-Pick liefert', 'Wer braucht Runde 1?'
  ],
  draftRegret: [
    'Draft-Reue', 'Der teuerste Flop', 'Erstrunden-Enttäuschung', 'Fehlinvestition des Drafts'
  ],
  empireFirstWinBroken: [
    'Der Bann ist gebrochen', 'Endlich!', 'Der erste Schritt aus der Krise', 'Monatelang gewartet, jetzt ist es da'
  ],
  empireWinless: [
    'Der Abstiegskandidat', 'Die Geduldsprobe', 'Warten auf den ersten Lichtblick'
  ],
  empirePerfect: [
    'Makellos', 'Die perfekte Bilanz hält', 'Ungeschlagen und ungebremst', 'Die weisse Weste'
  ],
  empireDynasty: [
    'Das Imperium ist zementiert', 'Gekommen, um zu bleiben', 'Die Dynastie nimmt Form an', 'Der Thron gehört ihnen'
  ],
  empireCrumbling: [
    'Der Fall des Imperiums', 'Erste Risse im Thron', 'Die Krone wackelt', 'Auch Dynastien bröckeln mal'
  ],
  empireTurnaround: [
    'Der Aufstieg beginnt', 'Die Wende ist da', 'From Zero to Hero', 'Die Auferstehung'
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
  if (game.comeback) categories.push('comeback');
  if (game.leadChanges) categories.push('seesaw');
  if (game.pace?.type === 'fast') categories.push('fastStart');
  if (game.pace?.type === 'slow') categories.push('slowStart');
  if (game.survivedScare) categories.push('survivedScare');
  if (game.mondayRescue) categories.push('mondayRescue');
  if (game.sustainedNailbiter) categories.push('sustainedNailbiter');
  if (game.seasonPersonality?.key === 'comebackWins') categories.push('seasonPersonalityComeback');
  if (game.seasonPersonality?.key === 'collapseLosses') categories.push('seasonPersonalityCollapse');
  if (game.seasonPersonality?.key === 'sustainedNailbiters') categories.push('seasonPersonalityNailbiter');
  if (game.seasonPersonality?.key === 'ledWireToWire') categories.push('seasonPersonalityWireToWire');
  if (game.expectation?.lucky === true) categories.push('pythagoreanLucky');
  if (game.expectation?.lucky === false) categories.push('pythagoreanUnlucky');
  if (game.draftValue?.type === 'bargain') categories.push('bargain');
  if (game.draftValue?.type === 'draftRegret') categories.push('draftRegret');
  if (game.empireStoryline?.type === 'firstWinBroken') categories.push('empireFirstWinBroken');
  if (game.empireStoryline?.type === 'winless') categories.push('empireWinless');
  if (game.empireStoryline?.type === 'perfectRecord') categories.push('empirePerfect');
  if (game.empireStoryline?.type === 'empire') categories.push('empireDynasty');
  if (game.empireStoryline?.type === 'empireCrumbling') categories.push('empireCrumbling');
  if (game.empireStoryline?.type === 'turnaround') categories.push('empireTurnaround');

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
