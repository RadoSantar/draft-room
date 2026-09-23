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
- Vorsichtig formulieren (Näherung, keine erfundene Präzision): alles auf Basis unserer Zwischenstände (Kollaps/Comeback, Frühstarter/Spätzünder, Zittersieg, Monday-Night-Rettung, Dauerhafter Nervenkrieg) – Dramatik ja, aber keine erfundenen exakten Zeitpunkte oder Spielzüge. Vermeide dabei technische Begriffe wie "Snapshot" oder "Datenpunkt" – das ist ein Football-Recap, kein Analytics-Report, sprich stattdessen von "Zwischenstand", "im Wochenverlauf" oder Ähnlichem.
- Zum Schluss, falls gegeben: ein Ausblick auf die kommende Woche, JE EIN kurzer Teaser-Satz pro Team, locker als Abschluss hingeworfen statt als separater Absatz.

Nutze nur die im Kontext gegebenen Fakten, erfinde keine Spieler-Stats oder Ereignisse, die nicht gegeben sind. Schreib NUR den Fliesstext des Recaps selbst, keine Einleitung wie "Hier ist der Recap", keine Anführungszeichen drumherum, keine Überschrift.`;

async function callClaude(userPrompt, systemPrompt = SYSTEM_PROMPT, maxTokens = 600) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: maxTokens,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }]
    })
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Claude-API-Fehler (${res.status}): ${text}`);
  }
  const data = await res.json();
  // Bei aktiviertem Extended Thinking steht vor dem eigentlichen Text oft ein
  // "thinking"-Block an content[0] – nur content[0].text zu nehmen liefert dann fälschlich
  // leeren Text, obwohl die Antwort da ist. Alle "text"-Blöcke zusammenfügen ist robust
  // dagegen, unabhängig davon, ob/wie viele Nicht-Text-Blöcke davor stehen.
  const text = (data.content || [])
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('')
    .trim();
  if (!text) {
    throw new Error(`Claude-Antwort war leer (stop_reason: ${data.stop_reason || '?'})`);
  }
  if (data.stop_reason === 'max_tokens') {
    // Nicht leer, aber mittendrin abgeschnitten (z.B. "...als wäre das nic") – das darf nicht
    // als fertiger Recap gecacht werden, sonst bleibt der Bruchstück-Text für immer stehen.
    throw new Error(`Claude-Antwort wurde bei max_tokens abgeschnitten (${maxTokens} Tokens reichten nicht)`);
  }
  return text;
}

const WEEK_SYSTEM_PROMPT = `Du schreibst den WOCHENÜBERBLICK für "Fantasy Playbook", eine private Fantasy-Football-Liga – im Stil einer reisserischen Sport-Boulevard-Zeitung (wie die Titelseite einer Boulevard-Sportredaktion): grosse Schlagzeilen-Sprache, zugespitzt, aber unterhaltsam statt gemein. Du bekommst alle Spiele der Woche mit ihren wichtigsten Fakten – daraus bastelst du EINEN zusammenhängenden Überblick über den gesamten Spieltag, keine Aneinanderreihung von Einzelrecaps.

FORM (exakt einhalten):
Zeile 1: Eine einzige, knackige Schlagzeile (maximal 8 Wörter, reisserisch, OHNE Anführungszeichen, OHNE Punkt am Ende) – wie eine Boulevard-Titelseite, fasst die auffälligste Geschichte der Woche zusammen.
Dann eine Leerzeile.
Danach 5-7 Sätze Fliesstext, der die Woche als Ganzes erzählt: wähle 4-5 der interessantesten Geschichten aus den gelieferten Spielen aus (grösster Aussenseiter-Sieg/Upset, beeindruckendste Einzelleistung, dramatischster Kollaps oder knappste Partie, grösste Bank-Fehlentscheidung, auffälligste Team-Storyline) und verwebe sie zu EINEM Erzählbogen mit echten Übergängen, nicht Spiel-für-Spiel abgehakt. Bei wenigen Spielen pro Woche deckt das oft schon alle ab – nur bei wirklich unspektakulären Partien darfst du eine weglassen, statt sie krampfhaft einzubauen.

Stil: frech, schadenfroh, mit Sport-Boulevard-Schlagzeilen-Vokabular ("Drama", "Sensation", "Blamage", "Show"), Spott zielt immer auf Fantasy-Entscheidungen, nie persönlich auf die realen Menschen dahinter. Nutze nur die gelieferten Fakten, erfinde nichts. Vermeide technische Begriffe wie "Snapshot" oder "Datenpunkt" – sprich stattdessen von "Zwischenstand" oder "im Wochenverlauf". Schreib NUR Schlagzeile + Leerzeile + Fliesstext, keine weitere Einleitung, keine zusätzliche Überschrift wie "Wochenüberblick:".`;

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

// Sammelt alle verfügbaren Storyline-Fakten für ein Spiel, je Fakt mit einer Kategorie getaggt
// (siehe pickFactsForGame weiter unten: die Kategorie wird über die Woche hinweg gezählt, damit
// z.B. nicht in 4 von 5 Spielen dieselbe "Bank-Reue"-Geschichte auftaucht). Nicht jedes Spiel hat
// jeden Fakt (z.B. positionale Dominanz oder eine Serie gibt es nicht immer) – das allein sorgt
// schon für Abwechslung, die Kategorie-Deckelung sorgt zusätzlich dafür, dass verfügbare, aber
// schon oft genutzte Fakten anderen Spielen mit weniger Auswahl Platz machen.
function collectFacts(game) {
  const facts = [];

  if (game.standout) {
    const s = game.standout;
    const standoutTeam = s.side === 'home' ? game.homeName : game.awayName;
    facts.push({ category: 'standout', text: `Standout-Leistung des Spiels: ${s.name} (${s.pos}) mit ${s.points.toFixed(1)} Punkten für ${standoutTeam}.` });
  }

  if (game.loserBenchRegret) {
    const r = game.loserBenchRegret;
    let t = `Bank-Reue: ${r.team} liess ${r.benchPlayer.name} (${r.benchPlayer.pos}, ${r.benchPlayer.points.toFixed(1)} Punkte) auf der Bank sitzen, während Starter ${r.starter.name} (${r.starter.points.toFixed(1)} Punkte) spielte.`;
    t += r.wouldHaveWon ? ' Mit dem Tausch hätte es sogar zum Sieg gereicht!' : ' Auch mit dem Tausch hätte es nicht ganz zum Sieg gereicht, aber es wäre knapper geworden.';
    facts.push({ category: 'loserBenchRegret', text: t });
  }

  if (game.winnerBenchRegret) {
    const r = game.winnerBenchRegret;
    facts.push({ category: 'winnerBenchRegret', text: `Trotz Sieg liess ${r.team} auf der Bank Punkte liegen: ${r.benchPlayer.name} (${r.benchPlayer.pos}, ${r.benchPlayer.points.toFixed(1)} Punkte) sass draussen, während Starter ${r.starter.name} nur ${r.starter.points.toFixed(1)} Punkte brachte – am Ende reichte es trotzdem.` });
  }

  if (game.positionalDominance) {
    const d = game.positionalDominance;
    facts.push({ category: 'positionalDominance', text: `Positionale Dominanz: Allein die ${d.pos}s von ${d.team} holten ${d.groupTotal.toFixed(1)} Punkte – mehr als das komplette Team von ${d.opponent} (${d.opponentTotal.toFixed(1)}) zusammen.` });
  }

  if (game.streak) {
    const s = game.streak;
    facts.push({ category: 'streak', text: s.streakType === 'WIN'
      ? `${s.team} gewinnt damit das ${s.streakLength}. Spiel in Folge.`
      : `${s.team} kassiert damit die ${s.streakLength}. Niederlage in Folge.` });
  }

  if (game.optimalLineupGap) {
    const g = game.optimalLineupGap;
    facts.push({ category: 'optimalLineupGap', text: `Aufstellungs-Patzer: ${g.team} spielte ${g.actualTotal.toFixed(1)} Punkte, mit der bestmöglichen Aufstellung aus dem kompletten Kader wären ${g.optimalTotal.toFixed(1)} Punkte drin gewesen – ${g.gap.toFixed(1)} Punkte leichtfertig liegen gelassen.` });
  }

  if (game.confStanding) {
    const c = game.confStanding;
    const record = `${c.wins}-${c.losses}${c.ties ? '-' + c.ties : ''}`;
    facts.push({ category: 'confStanding', text: c.prevRank != null && c.prevRank !== c.rank
      ? (c.rank < c.prevRank
        ? `${c.team} klettert in der ${c.conf}-Tabelle von Platz ${c.prevRank} auf Platz ${c.rank} (Bilanz ${record}).`
        : `${c.team} fällt in der ${c.conf}-Tabelle von Platz ${c.prevRank} auf Platz ${c.rank} zurück (Bilanz ${record}).`)
      : `${c.team} steht in der ${c.conf}-Tabelle auf Platz ${c.rank} (Bilanz ${record}).` });
  }

  if (game.seasonExtreme) {
    const e = game.seasonExtreme;
    facts.push({ category: 'seasonExtreme', text: e.type === 'high'
      ? `${e.team} erzielt mit ${e.score.toFixed(1)} Punkten die bisher höchste Wochenpunktzahl der gesamten Saison.`
      : `${e.team} erzielt mit ${e.score.toFixed(1)} Punkten die bisher niedrigste Wochenpunktzahl der gesamten Saison.` });
  }

  if (game.playoffRace) {
    const r = game.playoffRace;
    let t = null;
    if (r.status === 'eliminated') {
      t = `Playoff-Rennen: ${r.team} kann selbst mit einer perfekten Restsaison rechnerisch nicht mehr an den letzten Playoff-Platz herankommen – schon draussen.`;
    } else if (r.status === 'chasing') {
      t = `Playoff-Rennen: ${r.team} liegt ${r.winsBehind} Sieg(e) hinter dem letzten Playoff-Platz zurück, ist aber noch nicht rechnerisch raus.`;
    } else if (r.status === 'in') {
      t = `Playoff-Rennen: ${r.team} steht aktuell auf einem Playoff-Platz (Seed ${r.seed})${r.cushion != null ? `, mit ${r.cushion} Sieg(en) Polster auf das erste Team ausserhalb` : ''}.`;
    }
    if (t) facts.push({ category: 'playoffRace', text: t });
  }

  if (game.unluckyLoser) {
    const u = game.unluckyLoser;
    facts.push({ category: 'unluckyLoser', text: `Pechvogel der Woche: ${u.team} verliert trotz ${u.score.toFixed(1)} Punkten – ein Score, mit dem ${u.beatenCount === 1 ? 'ein anderes Spiel' : u.beatenCount + ' andere Spiele'} diese Woche gewonnen worden wäre(n).` });
  }

  if (game.uglyWin) {
    const w = game.uglyWin;
    facts.push({ category: 'uglyWin', text: `Hässlicher Sieg: ${w.team} gewinnt mit nur ${w.score.toFixed(1)} Punkten – der niedrigsten Siegerpunktzahl der gesamten Woche.` });
  }

  if (game.rematch) {
    const r = game.rematch;
    let t = r.isRevenge
      ? `Revanche: In Woche ${r.week} gab es zwischen diesen beiden Teams schon ein Duell (${r.scoreLine}), damals gewann ${r.winner} – diesmal hat sich das Blatt gewendet.`
      : `Wiederholung: In Woche ${r.week} gab es zwischen diesen beiden Teams schon ein Duell (${r.scoreLine}) – ${r.winner ? r.winner + ' gewinnt erneut' : 'auch das endete ähnlich'}.`;
    if (r.isFinalMeeting) t += ' Damit ist die Saison-Serie zwischen den beiden Teams entschieden, es steht kein weiteres Duell mehr auf dem Programm.';
    facts.push({ category: 'rematch', text: t });
  }

  if (game.kickerDecisive) {
    const k = game.kickerDecisive;
    facts.push({ category: 'kickerDecisive', text: `Unwahrscheinlicher Held: ${k.name} (${k.pos}) von ${k.team} steuerte ${k.points.toFixed(1)} Punkte bei – mehr als der Sieg-Vorsprung von ${k.margin.toFixed(1)} Punkten, ohne diese Position hätte es nicht gereicht.` });
  }

  if (game.waiverKarma) {
    const wk = game.waiverKarma;
    facts.push({ category: 'waiverKarma', text: `Waiver-Wire-Karma: ${wk.droppingTeam} warf ${wk.player.name} diese Saison schon mal ab – jetzt spielt er für ${wk.karmaTeam} und liefert ausgerechnet gegen die alten Besitzer ${wk.player.points.toFixed(1)} Punkte ab.` });
  }

  if (game.comeback) {
    const c = game.comeback;
    facts.push({ category: 'comeback', text: `Kollaps/Comeback laut unseren Zwischenständen im Wochenverlauf: ${c.collapsedTeam} lag zeitweise mit rund ${c.peakLead.toFixed(1)} Punkten voran, am Ende gewann aber trotzdem ${c.winnerTeam}.` });
  }

  if (game.leadChanges) {
    facts.push({ category: 'leadChanges', text: `Nervenkrieg laut unseren Zwischenständen: Die Führung wechselte im Wochenverlauf mindestens ${game.leadChanges.changes} Mal den Besitzer.` });
  }

  if (game.pace) {
    const p = game.pace;
    facts.push({ category: 'pace', text: p.type === 'fast'
      ? `Frühstarter laut unseren Zwischenständen: ${p.team} hatte schon früh in der Woche ${p.earlyScore.toFixed(1)} von am Ende ${p.finalScore.toFixed(1)} Punkten drauf.`
      : `Spätzünder laut unseren Zwischenständen: ${p.team} stand früh in der Woche noch bei quasi ${p.earlyScore.toFixed(1)} Punkten, kam am Ende aber auf ${p.finalScore.toFixed(1)}.` });
  }

  if (game.survivedScare) {
    const s = game.survivedScare;
    facts.push({ category: 'survivedScare', text: `Zittersieg laut unseren Zwischenständen: ${s.team} lag zeitweise mit rund ${s.peakLead.toFixed(1)} Punkten vorne, der Vorsprung schmolz aber auf nur noch ${s.finalMargin.toFixed(1)} zusammen, bevor es am Ende doch noch reichte.` });
  }

  if (game.mondayRescue) {
    const r = game.mondayRescue;
    facts.push({ category: 'mondayRescue', text: `Monday-Night-Rettung laut unseren Zwischenständen: ${r.team} lag vor dem Montagabend noch mit rund ${r.deficitBeforeMonday.toFixed(1)} Punkten zurück, gewann das Spiel aber am Ende doch noch – nur dank der Montagabend-Spieler möglich.` });
  }

  if (game.sustainedNailbiter) {
    facts.push({ category: 'sustainedNailbiter', text: `Dauerhafter Nervenkrieg laut unseren Zwischenständen: Über weite Strecken der Woche lagen die Teams innerhalb von 5 Punkten auseinander – nicht nur am Ende knapp, sondern die ganze Woche über zum Zerreissen gespannt.` });
  }

  if (game.seasonPersonality) {
    const sp = game.seasonPersonality;
    facts.push({ category: 'seasonPersonality', text: `Saison-Persönlichkeit: ${sp.team} hat sich diese Saison einen Ruf erarbeitet als ${sp.label} (${sp.count} von ${sp.games} Spielen mit Live-Daten passen zu diesem Muster).` });
  }

  if (game.expectation) {
    const e = game.expectation;
    facts.push({ category: 'expectation', text: e.lucky
      ? `Erwartungswert-Bilanz: ${e.team} steht bei ${e.actualWins} Siegen, aus dem Verhältnis von erzielten zu kassierten Punkten wären aber eigentlich nur ${e.expectedWins.toFixed(1)} "verdient" – die Bilanz schmeichelt.`
      : `Erwartungswert-Bilanz: ${e.team} steht bei nur ${e.actualWins} Siegen, aus dem Verhältnis von erzielten zu kassierten Punkten wären aber eigentlich ${e.expectedWins.toFixed(1)} "verdient" – die Bilanz lügt hier eindeutig zu Ungunsten des Teams.` });
  }

  if (game.draftValue) {
    const d = game.draftValue;
    facts.push({ category: 'draftValue', text: d.type === 'bargain'
      ? `Schnäppchen der Woche: ${d.name} von ${d.team} wurde erst in Runde ${d.round} gedraftet und liefert jetzt ${d.points.toFixed(1)} Punkte als Standout des Spiels ab.`
      : `Draft-Reue: ${d.name} von ${d.team} wurde bereits in Runde ${d.round} gedraftet, brachte aber nur ${d.points.toFixed(1)} Punkte – während ein Bankspieler ihn deutlich blamierte.` });
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
    facts.push({ category: 'empireStoryline', text: `Team-Storyline: ${templates[emp.type]}` });
  }

  // ---- Zusätzliche Kategorien (siehe sync-espn.mjs für die Berechnung) ----

  if (game.powerRankMovement) {
    const m = game.powerRankMovement;
    facts.push({ category: 'powerRankMovement', text: m.direction === 'up'
      ? `Power-Rankings: ${m.team} klettert von Platz ${m.from} auf Platz ${m.to}.`
      : `Power-Rankings: ${m.team} fällt von Platz ${m.from} auf Platz ${m.to} zurück.` });
  }

  if (game.leagueBestPosition) {
    const l = game.leagueBestPosition;
    facts.push({ category: 'leagueBestPosition', text: `Liga-Bestwert: ${l.name} (${l.pos}) von ${l.team} war mit ${l.points.toFixed(1)} Punkten der beste ${l.pos} der gesamten Liga diese Woche.` });
  }

  if (game.marginExtreme) {
    const m = game.marginExtreme;
    facts.push({ category: 'marginExtreme', text: m.type === 'closest'
      ? `Mit nur ${m.margin.toFixed(1)} Punkten Unterschied war das hier das knappste Spiel der gesamten Woche.`
      : `Mit ${m.margin.toFixed(1)} Punkten Unterschied war das hier das deutlichste Spiel der gesamten Woche.` });
  }

  if (game.positionalFlop) {
    const f = game.positionalFlop;
    facts.push({ category: 'positionalFlop', text: `Positions-Flop: Die ${f.pos}s von ${f.team} brachten zusammen nur ${f.groupTotal.toFixed(1)} Punkte.` });
  }

  if (game.waiverInstantSuccess) {
    const w = game.waiverInstantSuccess;
    facts.push({ category: 'waiverInstantSuccess', text: `Sofort-Erfolg vom Waiver: ${w.name} (${w.pos}) wurde diese Woche erst von ${w.team} geholt und lieferte direkt ${w.points.toFixed(1)} Punkte als Starter ab.` });
  }

  if (game.chalk) {
    const c = game.chalk;
    facts.push({ category: 'chalk', text: `Chalk: ${c.team} gewinnt fast exakt mit der vorab erwarteten Marge – Punkt für Punkt nach Plan.` });
  }

  if (game.formTrend) {
    const f = game.formTrend;
    facts.push({ category: 'formTrend', text: f.direction === 'up'
      ? `Formkurve: ${f.team} steigert die Punktzahl seit 3 Wochen in Folge (${f.scores.map((s) => s.toFixed(0)).join(' → ')}).`
      : `Formkurve: ${f.team} fällt seit 3 Wochen in Folge in der Punktzahl ab (${f.scores.map((s) => s.toFixed(0)).join(' → ')}).` });
  }

  if (game.positionalSlump) {
    const s = game.positionalSlump;
    facts.push({ category: 'positionalSlump', text: `Dauerschwäche: Die ${s.pos}s von ${s.team} liegen im Saison-Schnitt bei nur ${s.teamAvg.toFixed(1)} Punkten pro Woche, der Liga-Schnitt liegt bei ${s.leagueAvg.toFixed(1)}.` });
  }

  if (game.seasonBenchTotal) {
    const b = game.seasonBenchTotal;
    facts.push({ category: 'seasonBenchTotal', text: `Saison-Bank-Bilanz: ${b.team} hat über die bisherige Saison schon insgesamt ${b.total.toFixed(1)} Punkte auf der Bank liegen gelassen.` });
  }

  if (game.tradeImpact) {
    const t = game.tradeImpact;
    facts.push({ category: 'tradeImpact', text: `Trade-Wirkung: ${t.name} (${t.pos}), per Trade zu ${t.team} gewechselt, liefert mit ${t.points.toFixed(1)} Punkten direkt ab.` });
  }

  if (game.consistency) {
    const c = game.consistency;
    facts.push({ category: 'consistency', text: `Konstanz-Award: ${c.team} hat über die bisherige Saison die geringste Wochen-zu-Wochen-Schwankung der ganzen Liga (±${c.stddev.toFixed(1)} Punkte).` });
  }

  if (game.upsetTally) {
    const u = game.upsetTally;
    facts.push({ category: 'upsetTally', text: `Aussenseiter-Bilanz: ${u.team} hat diese Saison schon ${u.count} von ${u.games} Spielen als Aussenseiter gewonnen.` });
  }

  if (game.perfectWeekProximity) {
    const p = game.perfectWeekProximity;
    facts.push({ category: 'perfectWeekProximity', text: `Fast perfekt: ${p.name} (${p.pos}) von ${p.team} war mit ${p.points.toFixed(1)} Punkten ganz nah an der eigenen Saison-Bestleistung von ${p.seasonBest.toFixed(1)} dran.` });
  }

  // ---- Weitere Statistik-Kategorien (siehe sync-espn.mjs, zweite Runde 2026-09-15) ----

  if (game.longestStreak) {
    const l = game.longestStreak;
    facts.push({ category: 'longestStreak', text: l.type === 'WIN'
      ? `Saison-Rekord: ${l.team} steht bei ${l.length} Siegen in Folge – die längste Siegesserie des Teams in dieser Saison.`
      : `Negativ-Rekord: ${l.team} steckt in ${l.length} Niederlagen in Folge – die längste Pleitenserie des Teams in dieser Saison.` });
  }

  if (game.marginTally) {
    const m = game.marginTally;
    facts.push({ category: 'marginTally', text: m.type === 'close'
      ? `Nervenkrieg-Bilanz: ${m.team} hat schon ${m.count} von ${m.games} Saisonspielen mit weniger als 5 Punkten Unterschied entschieden.`
      : `Alles-oder-nichts-Bilanz: ${m.team} hat schon ${m.count} von ${m.games} Saisonspielen mit mehr als 30 Punkten Unterschied entschieden.` });
  }

  if (game.scoringLeaderTally) {
    const s = game.scoringLeaderTally;
    facts.push({ category: 'scoringLeaderTally', text: s.type === 'high'
      ? `Serientäter oben: ${s.team} war diese Saison schon ${s.count}x Wochen-Highscorer der gesamten Liga.`
      : `Serientäter unten: ${s.team} war diese Saison schon ${s.count}x Wochen-Lowscorer der gesamten Liga.` });
  }

  if (game.ironMan) {
    const i = game.ironMan;
    facts.push({ category: 'ironMan', text: `Eisenmann der Liga: ${i.name} (${i.pos}) von ${i.team} stand diese Saison bereits alle ${i.weeks} Wochen in der Startaufstellung.` });
  }

  if (game.topWeeklyPerformance) {
    const t = game.topWeeklyPerformance;
    facts.push({ category: 'topWeeklyPerformance', text: `Mount Rushmore: ${t.name} (${t.pos}) von ${t.team} knackt mit ${t.points.toFixed(1)} Punkten die Top-4-Einzelwochenleistungen der gesamten Liga-Geschichte (Platz ${t.rank}).` });
  }

  if (game.seasonMilestone) {
    const s = game.seasonMilestone;
    facts.push({ category: 'seasonMilestone', text: `Meilenstein: ${s.team} knackt diese Woche die ${s.milestone}-Punkte-Marke für die Saison (aktuell ${s.total.toFixed(1)}).` });
  }

  if (game.seasonDraftValue) {
    const d = game.seasonDraftValue;
    facts.push({ category: 'seasonDraftValue', text: d.type === 'bargain'
      ? `Saison-Schnäppchen: ${d.name} (Runde ${d.round} gedraftet) hat schon ${d.totalPoints.toFixed(1)} Saisonpunkte für ${d.team} abgeliefert.`
      : `Saison-Draft-Reue: ${d.name} (Runde ${d.round} gedraftet) kommt für ${d.team} nur auf ${d.avg.toFixed(1)} Punkte im Wochenschnitt.` });
  }

  if (game.leagueActivity) {
    const a = game.leagueActivity;
    facts.push({ category: 'leagueActivity', text: `Kader-Dauerbaustelle: ${a.team} hat diese Saison schon ${a.count} Kaderbewegungen (Waiver/Trades) hinter sich – so viele wie kein anderes Team der Liga.` });
  }

  // ---- Punkt D: Liga-Historie (siehe sync-espn.mjs) ----

  if (game.defendingChampion) {
    const d = game.defendingChampion;
    facts.push({ category: 'defendingChampion', text: `Titelverteidiger: ${d.team} gewann die Meisterschaft ${d.year} und steht diese Saison bei ${d.wins}-${d.losses}.` });
  }

  if (game.allTimeRecord) {
    const r = game.allTimeRecord;
    facts.push({ category: 'allTimeRecord', text: r.type === 'playerWeek'
      ? `Liga-Rekord geknackt: ${r.name} von ${r.team} stellt mit ${r.points.toFixed(1)} Punkten einen neuen All-Time-Liga-Rekord auf – der alte Rekord stand bei ${r.prevRecord.toFixed(1)} Punkten (${r.prevHolder}, Saison ${r.prevYear}).`
      : `Liga-Rekord geknackt: ${r.team} stellt mit ${r.points.toFixed(1)} Team-Punkten in einer Woche einen neuen All-Time-Liga-Rekord auf – der alte Rekord stand bei ${r.prevRecord.toFixed(1)} (${r.prevHolder}, Saison ${r.prevYear}).` });
  }

  if (game.playoffHistory) {
    const p = game.playoffHistory;
    facts.push({ category: 'playoffHistory', text: `Playoff-Geschichte: ${p.team1} und ${p.team2} standen sich schon in den ${p.year}er-Playoffs gegenüber (${p.score1.toFixed(1)}:${p.score2.toFixed(1)}), damals gewann ${p.winner}.` });
  }

  return facts;
}

// Wählt bis zu maxFacts Fakten für ein Spiel aus, bevorzugt Kategorien, die diese Woche noch nicht
// (oder erst 1x) benutzt wurden. categoryUsage wird über alle Spiele der Woche hinweg mitgeführt und
// hier hochgezählt – so kann z.B. "Bank-Reue" in höchstens capPerCategory Spielen der Woche als Fakt
// landen, auch wenn theoretisch mehr Spiele davon betroffen wären. Reicht die Auswahl an unverbrauchten
// Kategorien für ein Spiel nicht aus (wenige verfügbare Fakten, alles schon ausgereizt), wird mit den
// meistgenutzten Kategorien aufgefüllt, damit kein Recap komplett ohne Fakten dasteht.
//
// Manche Kategorien lesen sich für die Leserschaft wie dieselbe Geschichte, obwohl sie technisch
// unterschiedliche Felder sind (Bank-Reue beim Verlierer vs. beim Sieger trotz Sieg) - die teilen
// sich hier deshalb ein gemeinsames Budget, statt beide unabhängig bis zu capPerCategory auszureizen
// (sonst könnten z.B. 4 von 5 Spielen irgendeine Bank-Geschichte erzählen statt max. 2).
const CATEGORY_GROUP = {
  loserBenchRegret: 'benchRegret',
  winnerBenchRegret: 'benchRegret',
  // optimalLineupGap ("Die Bank wusste es besser"/lineupDisaster-Badges) und seasonBenchTotal
  // (Saison-Summe) sind technisch andere Fakten, lesen sich für die Leserschaft aber wie dieselbe
  // "Bank-Missmanagement"-Geschichte wie loser-/winnerBenchRegret - deshalb dasselbe Budget.
  optimalLineupGap: 'benchRegret',
  seasonBenchTotal: 'benchRegret',
  // longestStreak ist die Saison-Rekord-Variante derselben "Serie"-Geschichte wie streak - teilt sich
  // deshalb das Budget, statt in derselben Woche beide Varianten unabhängig auszureizen.
  longestStreak: 'streak',
  // seasonDraftValue ist die saisonlange Variante von draftValue (Schnäppchen/Draft-Reue) - gleiches Thema.
  seasonDraftValue: 'draftValue'
};
function groupOf(category) { return CATEGORY_GROUP[category] || category; }

function pickFactsForGame(game, categoryUsage, seedSuffix, maxFacts, capPerCategory, factCollector = collectFacts) {
  const key = game.week + '-' + [game.homeId, game.awayId].sort().join('-') + seedSuffix;
  const shuffled = seededShuffle(factCollector(game), key);
  const fresh = [];
  const overused = [];
  shuffled.forEach((fact) => {
    ((categoryUsage[groupOf(fact.category)] || 0) < capPerCategory ? fresh : overused).push(fact);
  });
  // Reicht "fresh" nicht: mit den am wenigsten überstrapazierten Kategorien auffüllen (stabile
  // Sortierung erhält dabei die Shuffle-Reihenfolge innerhalb gleich oft genutzter Kategorien),
  // damit sich der Überlauf über mehrere Kategorien verteilt statt eine einzelne immer weiter zu nutzen.
  overused.sort((a, b) => (categoryUsage[groupOf(a.category)] || 0) - (categoryUsage[groupOf(b.category)] || 0));
  const picked = fresh.concat(overused).slice(0, maxFacts);
  picked.forEach((fact) => {
    const g = groupOf(fact.category);
    categoryUsage[g] = (categoryUsage[g] || 0) + 1;
  });
  return picked;
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
  ],
  powerRankUp: [
    'Der Aufsteiger der Woche', 'Auf dem Weg nach oben', 'Klettert die Rangliste hoch'
  ],
  powerRankDown: [
    'Der Absteiger der Woche', 'Der Rutsch nach unten', 'Verliert an Boden'
  ],
  leagueBestPosition: [
    'Der Liga-Beste seiner Position', 'Positions-König der Woche', 'Keiner war besser auf dieser Position'
  ],
  closestGame: [
    'Das Fotofinish der Woche', 'Zum Anfassen knapp', 'Der Krimi mit dem knappsten Ausgang'
  ],
  widestGame: [
    'Die deutlichste Klatsche der Woche', 'Ohne jeden Zweifel', 'Der klarste Fall der Woche'
  ],
  positionalFlop: [
    'Die Position, die nicht geliefert hat', 'Kollektives Versagen', 'Der Positions-Blackout'
  ],
  waiverInstantSuccess: [
    'Der Sofort-Treffer vom Waiver', 'Frisch geholt, direkt geliefert', 'Der Waiver-Coup der Woche'
  ],
  chalk: [
    'Genau nach Plan', 'Die Prognose hatte recht', 'Chalk pur'
  ],
  formTrendUp: [
    'Die Formkurve zeigt steil nach oben', 'Im Aufwind', 'Wird von Woche zu Woche stärker'
  ],
  formTrendDown: [
    'Die Formkurve zeigt steil nach unten', 'Im Sinkflug', 'Wird von Woche zu Woche schwächer'
  ],
  positionalSlump: [
    'Die Dauerbaustelle', 'Seit Wochen die gleiche Schwachstelle', 'Der chronische Schwachpunkt'
  ],
  seasonBenchTotal: [
    'Der Bank-Millionär', 'Saisonlanges Verschenken', 'Der Dauer-Fehlgriff auf der Bank'
  ],
  tradeImpact: [
    'Der Trade zahlt sich aus', 'Handelsgewinn', 'Der Deal, der eingeschlagen hat'
  ],
  consistency: [
    'Der Zuverlässigste der Liga', 'Immer verlässlich', 'Der Fels in der Brandung'
  ],
  upsetTally: [
    'Der Aussenseiter-Spezialist', 'Liebt es, zu überraschen', 'Der notorische Überraschungssieger'
  ],
  perfectWeekProximity: [
    'Fast die perfekte Woche', 'Ganz nah dran am eigenen Rekord', 'Knapp am Saisonbestwert vorbei'
  ],
  seasonStreakRecord: [
    'Der neue Saison-Rekord', 'Die längste Serie der Saison', 'Historisch für dieses Team'
  ],
  closeSpecialist: [
    'Der Krimi-Spezialist', 'Kennt nur den knappen Weg', 'Nervenkrieg als Standardprogramm'
  ],
  blowoutSpecialist: [
    'Der Extremist', 'Kennt nur schwarz oder weiss', 'Alles oder nichts, immer wieder'
  ],
  scoringLeaderHigh: [
    'Der Wochen-Champion-Sammler', 'Kennt die Spitze der Woche genau', 'Serientäter an der Tabellenspitze'
  ],
  scoringLeaderLow: [
    'Der Wochen-Schlusslicht-Sammler', 'Serientäter ganz unten', 'Dauergast im Tabellenkeller der Woche'
  ],
  ironMan: [
    'Der Eisenmann der Liga', 'Nie auf der Bank', 'Zuverlässig wie ein Uhrwerk'
  ],
  mountRushmore: [
    'Mount-Rushmore-reif', 'Unter den besten Vier aller Zeiten', 'Geschichte geschrieben'
  ],
  milestone: [
    'Meilenstein geknackt', 'Die runde Zahl ist da', 'Punkte-Marke durchbrochen'
  ],
  activeManager: [
    'Der Waiver-Wire-Junkie', 'Nie zufrieden mit dem Kader', 'Dauerhaft am Umbauen'
  ],
  defendingChampion: [
    'Der Titelverteidiger', 'Trägt die Krone', 'Regierender Meister im Härtetest'
  ],
  allTimeRecord: [
    'Neuer Liga-Rekord', 'Geschichte geschrieben', 'Die Bestenliste hat einen neuen Namen'
  ],
  playoffHistory: [
    'Die alte Playoff-Rechnung', 'Revanche für die Bracket-Geschichte', 'Wiedersehen aus den Playoffs'
  ]
};

// Ordnet Badge-Kategorien der zugrundeliegenden Fakten-Kategorie zu (siehe collectFacts/
// CATEGORY_GROUP weiter oben). Ohne das könnte z.B. der Spitzname "Die Bank wusste es besser"
// (fatalBenchRegret) in einem Spiel auftauchen, obwohl die Bank-Reue als FAKT diese Woche schon
// deckelbedingt nicht mehr ausgewählt wurde - der Spitzname würde das Thema trotzdem wieder
// hochspülen. Kategorien ohne Eintrag hier (blowout, nailbiter, tie, upset, championshipHunt,
// toiletBowl) hängen nicht an einem Fakt, sondern an Score/Kontext und sind von der Deckelung
// nicht betroffen.
const BADGE_CATEGORY_TO_FACT_CATEGORY = {
  fatalBenchRegret: 'loserBenchRegret',
  standout: 'standout',
  winStreak: 'streak',
  lossStreak: 'streak',
  dominance: 'positionalDominance',
  lineupDisaster: 'optimalLineupGap',
  seasonHigh: 'seasonExtreme',
  seasonLow: 'seasonExtreme',
  raceEliminated: 'playoffRace',
  raceMustWin: 'playoffRace',
  unluckyLoser: 'unluckyLoser',
  uglyWin: 'uglyWin',
  revenge: 'rematch',
  repeatResult: 'rematch',
  kickerHero: 'kickerDecisive',
  waiverKarma: 'waiverKarma',
  comeback: 'comeback',
  seesaw: 'leadChanges',
  fastStart: 'pace',
  slowStart: 'pace',
  survivedScare: 'survivedScare',
  mondayRescue: 'mondayRescue',
  sustainedNailbiter: 'sustainedNailbiter',
  seasonPersonalityComeback: 'seasonPersonality',
  seasonPersonalityCollapse: 'seasonPersonality',
  seasonPersonalityNailbiter: 'seasonPersonality',
  seasonPersonalityWireToWire: 'seasonPersonality',
  pythagoreanLucky: 'expectation',
  pythagoreanUnlucky: 'expectation',
  bargain: 'draftValue',
  draftRegret: 'draftValue',
  empireFirstWinBroken: 'empireStoryline',
  empireWinless: 'empireStoryline',
  empirePerfect: 'empireStoryline',
  empireDynasty: 'empireStoryline',
  empireCrumbling: 'empireStoryline',
  empireTurnaround: 'empireStoryline',
  powerRankUp: 'powerRankMovement',
  powerRankDown: 'powerRankMovement',
  leagueBestPosition: 'leagueBestPosition',
  closestGame: 'marginExtreme',
  widestGame: 'marginExtreme',
  positionalFlop: 'positionalFlop',
  waiverInstantSuccess: 'waiverInstantSuccess',
  chalk: 'chalk',
  formTrendUp: 'formTrend',
  formTrendDown: 'formTrend',
  positionalSlump: 'positionalSlump',
  seasonBenchTotal: 'seasonBenchTotal',
  tradeImpact: 'tradeImpact',
  consistency: 'consistency',
  upsetTally: 'upsetTally',
  perfectWeekProximity: 'perfectWeekProximity',
  seasonStreakRecord: 'longestStreak',
  closeSpecialist: 'marginTally',
  blowoutSpecialist: 'marginTally',
  scoringLeaderHigh: 'scoringLeaderTally',
  scoringLeaderLow: 'scoringLeaderTally',
  ironMan: 'ironMan',
  mountRushmore: 'topWeeklyPerformance',
  milestone: 'seasonMilestone',
  activeManager: 'leagueActivity',
  defendingChampion: 'defendingChampion',
  allTimeRecord: 'allTimeRecord',
  playoffHistory: 'playoffHistory'
};

function pickBadge(game, wasUpset, margin, categoryUsage, capPerCategory) {
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
  if (game.powerRankMovement?.direction === 'up') categories.push('powerRankUp');
  if (game.powerRankMovement?.direction === 'down') categories.push('powerRankDown');
  if (game.leagueBestPosition) categories.push('leagueBestPosition');
  if (game.marginExtreme?.type === 'closest') categories.push('closestGame');
  if (game.marginExtreme?.type === 'widest') categories.push('widestGame');
  if (game.positionalFlop) categories.push('positionalFlop');
  if (game.waiverInstantSuccess) categories.push('waiverInstantSuccess');
  if (game.chalk) categories.push('chalk');
  if (game.formTrend?.direction === 'up') categories.push('formTrendUp');
  if (game.formTrend?.direction === 'down') categories.push('formTrendDown');
  if (game.positionalSlump) categories.push('positionalSlump');
  if (game.seasonBenchTotal) categories.push('seasonBenchTotal');
  if (game.tradeImpact) categories.push('tradeImpact');
  if (game.consistency) categories.push('consistency');
  if (game.upsetTally) categories.push('upsetTally');
  if (game.perfectWeekProximity) categories.push('perfectWeekProximity');
  if (game.longestStreak) categories.push('seasonStreakRecord');
  if (game.marginTally?.type === 'close') categories.push('closeSpecialist');
  if (game.marginTally?.type === 'blowout') categories.push('blowoutSpecialist');
  if (game.scoringLeaderTally?.type === 'high') categories.push('scoringLeaderHigh');
  if (game.scoringLeaderTally?.type === 'low') categories.push('scoringLeaderLow');
  if (game.ironMan) categories.push('ironMan');
  if (game.topWeeklyPerformance) categories.push('mountRushmore');
  if (game.seasonMilestone) categories.push('milestone');
  if (game.seasonDraftValue?.type === 'bargain') categories.push('bargain');
  if (game.seasonDraftValue?.type === 'bust') categories.push('draftRegret');
  if (game.leagueActivity) categories.push('activeManager');
  if (game.defendingChampion) categories.push('defendingChampion');
  if (game.allTimeRecord) categories.push('allTimeRecord');
  if (game.playoffHistory) categories.push('playoffHistory');

  // Fakten-gebundene Kategorien rausfiltern, deren Thema diese Woche schon am Limit ist. Anders als
  // bei den Fakten selbst gibt es hier KEIN Zurückfallen auf die überstrapazierte Kategorie: ein
  // Spiel ganz ohne Spitzname ist unauffällig, ein Spitzname wie "Die Bank wusste es besser" in
  // einem 3. Spiel würde das Thema aber genau wieder hochspülen, das die Fakten-Deckelung vermeiden soll.
  const eligible = categories.filter((c) => {
    const factCategory = BADGE_CATEGORY_TO_FACT_CATEGORY[c];
    if (!factCategory) return true;
    return (categoryUsage[groupOf(factCategory)] || 0) < capPerCategory;
  });
  const candidates = eligible.flatMap((c) => BADGE_POOL[c].map((label) => ({ label, category: c })));
  if (!candidates.length) return null;
  const key = game.week + '-' + [game.homeId, game.awayId].sort().join('-') + '-badge';
  const chosen = seededShuffle(candidates, key)[0];
  const factCategory = BADGE_CATEGORY_TO_FACT_CATEGORY[chosen.category];
  if (factCategory) {
    const g = groupOf(factCategory);
    categoryUsage[g] = (categoryUsage[g] || 0) + 1;
  }
  return chosen.label;
}

function buildPrompt(game, facts, categoryUsage) {
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

  facts.forEach((fact) => { context += fact.text + ' '; });

  const badge = pickBadge(game, wasUpset, margin, categoryUsage, 2);
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
  // Über alle Spiele DIESES Laufs hinweg mitgeführt (siehe pickFactsForGame), damit z.B. nicht in
  // 4 von 5 Spielen dieselbe "Bank-Reue"-Geschichte als Fakt landet und sich die Recaps redundant
  // lesen - max. 2 Spiele pro Fakten-Kategorie.
  const categoryUsage = {};
  for (const game of games) {
    const key = game.week + '-' + [game.homeId, game.awayId].sort().join('-');
    if (existingByKey[key]) continue;
    try {
      // maxFacts=2 statt 3: der SYSTEM_PROMPT weist Claude ohnehin an, aus den mitgelieferten
      // Fakten nur die 1-2 stärksten zu einer Pointe zu verweben - 3 pro Spiel anzubieten kostete
      // in Wochen mit wenig Fakten-Vielfalt (z.B. Woche 1, ohne Saison-Historie für Serie/
      // Erwartungswert/Revanche/Waiver-Karma) unnötig Budget für Kategorien wie "Standout" oder
      // "Bank-Reue", die dadurch schneller an ihre Obergrenze stiessen als nötig.
      const facts = pickFactsForGame(game, categoryUsage, '', 2, 2);
      const prompt = buildPrompt(game, facts, categoryUsage);
      // 900 statt 600: mit den 13 neuen Fakten-Kategorien sind Prompts im Schnitt länger, was die
      // Antwort öfter an die alte Grenze stossen liess (siehe callClaude()'s max_tokens-Truncation-
      // Check) - 2 von 5 Recaps sind deshalb im ersten Live-Lauf mit den neuen Kategorien fehlgeschlagen.
      const recap = await callClaude(prompt, undefined, 900);
      out[key] = { week: game.week, homeName: game.homeName, awayName: game.awayName, recap };
      console.log('Recap generiert:', game.homeName, 'vs', game.awayName);
    } catch (err) {
      console.error('Recap fehlgeschlagen für', game.homeName, 'vs', game.awayName, ':', err.message);
    }
  }
  return out;
}

// Baut aus allen Spielen einer Woche einen kompakten Fakten-Digest für den Wochenüberblick:
// pro Spiel Endstand + Sieger/Aussenseiter-Info + die 2 stärksten, noch nicht überstrapazierten
// Fakten (aus collectFacts, derselben Quelle wie die Einzel-Recaps, mit eigener Kategorie-Deckelung
// getrennt von den Einzel-Recaps), damit Claude daraus die spannendsten Geschichten der Woche
// herauspicken kann statt jedes Spiel einzeln abzuhaken.
function buildWeekPrompt(games) {
  const week = games[0].week;
  const categoryUsage = {};
  let context = `Woche ${week}: Hier sind alle ${games.length} Spiele dieser Woche mit ihren wichtigsten Fakten. Schreibe daraus EINEN Wochenüberblick (nicht pro Spiel einzeln):\n\n`;
  games.forEach((game, i) => {
    const margin = Math.abs(game.homeScore - game.awayScore);
    const winner = game.winner === 'HOME' ? game.homeName : game.winner === 'AWAY' ? game.awayName : null;
    const loser = game.winner === 'HOME' ? game.awayName : game.winner === 'AWAY' ? game.homeName : null;
    const favorite = game.homeProj >= game.awayProj ? game.homeName : game.awayName;
    const wasUpset = winner && loser && winner !== favorite;

    let line = `Spiel ${i + 1}: ${game.homeName} ${game.homeScore.toFixed(1)} : ${game.awayScore.toFixed(1)} ${game.awayName}.`;
    if (game.winner === 'TIE') {
      line += ' Unentschieden.';
    } else {
      line += ` ${winner} gewinnt mit ${margin.toFixed(1)} Punkten gegen ${loser}.`;
      line += wasUpset ? ` Aussenseiter-Sieg, ${favorite} galt vor der Saison als stärker.` : '';
    }

    const facts = pickFactsForGame(game, categoryUsage, '-week', 2, 2);
    facts.forEach((fact) => { line += ' ' + fact.text; });
    context += line + '\n';
  });
  context += '\nSchreibe jetzt den Wochenüberblick.';
  return context;
}

/**
 * @param {Array} games - alle angereicherten Spiele einer abgeschlossenen Woche.
 * @param {Object} existingWeeks - bereits vorhandene Wochen-Recaps (week -> Eintrag), um Doppel-Calls zu vermeiden.
 * @returns {Promise<Object|null>} { week, headline, recap, generatedAt } oder null, wenn nichts Neues generiert wurde.
 */
export async function generateWeekRecap(games, existingWeeks) {
  if (!ANTHROPIC_API_KEY) return null;
  if (!games.length) return null;
  const week = games[0].week;
  if (existingWeeks[week]) return null;
  try {
    const prompt = buildWeekPrompt(games);
    const raw = await callClaude(prompt, WEEK_SYSTEM_PROMPT, 2500);
    const parts = raw.split(/\n\s*\n/);
    const headline = (parts.shift() || '').trim();
    const recap = parts.join('\n\n').trim();
    if (!headline || !recap) {
      throw new Error('Wochen-Recap-Antwort hatte nicht das erwartete Schlagzeile+Text-Format');
    }
    console.log('Wochen-Recap generiert für Woche', week);
    return { week, headline, recap, generatedAt: new Date().toISOString() };
  } catch (err) {
    console.error('Wochen-Recap fehlgeschlagen für Woche', week, ':', err.message);
    return null;
  }
}

// ==== Wochen-Vorschau (2026-09-15) ====
// Analog zum Wochen-Recap, aber VOR dem ersten Spiel des Spieltags und nach vorne gerichtet: was
// steht diese Woche auf dem Spiel, statt was ist passiert. Nutzt bewusst NUR Fakten, die schon vor
// dem Anpfiff feststehen (Bilanz, Serie, Tabellenplatz, Playoff-Kontext, Erwartungswert, frühere
// Duelle) - siehe buildPreviewMoments() in sync-espn.mjs, das dieselben Fakten-Funktionen wie
// findKeyMoments() wiederverwendet, aber ohne alles, was tatsächliche Spielleistung braucht.

const WEEK_PREVIEW_SYSTEM_PROMPT = `Du schreibst die WOCHEN-VORSCHAU für "Fantasy Playbook", eine private Fantasy-Football-Liga - im selben reisserischen Sport-Boulevard-Stil wie der Wochenüberblick, aber nach vorne gerichtet: was steht diese Woche auf dem Spiel, statt was ist passiert. Du bekommst alle Spiele der KOMMENDEN Woche mit Bilanz, Tabellenstand, Serie, Playoff-Kontext und ggf. früheren Duellen dieser Saison - daraus baust du EINEN Ausblick, keine Aneinanderreihung von Einzelvorschauen.

FORM (exakt einhalten):
Zeile 1: Eine einzige, knackige Schlagzeile (maximal 8 Wörter, reisserisch, OHNE Anführungszeichen, OHNE Punkt am Ende) - die auffälligste Storyline der kommenden Woche.
Dann eine Leerzeile.
Danach 4-6 Sätze Fliesstext: wähle 3-4 der interessantesten Storylines aus (grösstes Prestige-Duell laut Papierform, gefährlichste Serie auf dem Spiel, spannendste Playoff-Implikation, pikanteste Revanche) und verwebe sie zu EINEM Erzählbogen mit echten Übergängen. Nenne nicht jedes Spiel der Woche - nur die Highlights.

WICHTIG: Das hier ist eine VORSCHAU, kein Rückblick - schreib im Konjunktiv/Futur ("könnte", "droht", "steht auf dem Spiel", "muss beweisen"), erfinde KEINE Ergebnisse oder Spielverläufe, die noch nicht stattgefunden haben (die Spiele sind noch nicht gespielt!). Nutze nur die gelieferten Fakten (Bilanzen, Serien, Tabellenstände, frühere Duelle, Papierform-Projektion). Behaupte NIE eine Alleinstellung ("einziges Team mit...", "als Einzige(r)...") ausser sie steht explizit als Fakt da - die Bilanzen ALLER Spiele der Woche stehen im Prompt, prüfe sie gegeneinander, bevor du eine Exklusivität formulierst.

Stil: frech, Vorfreude/Spannung statt Schadenfreude (die kommt erst nach den Spielen), Sport-Boulevard-Vokabular ("Showdown", "Prüfstein", "Härtetest", "steht auf dem Spiel"). Vermeide technische Begriffe wie "Snapshot" oder "Projektion" im engeren Sinne - sprich von "Papierform" oder "Vorschau-Stärke". Schreib NUR Schlagzeile + Leerzeile + Fliesstext, keine weitere Einleitung, keine Überschrift wie "Vorschau:".`;

// Sammelt Vorschau-taugliche Fakten für ein noch nicht gespieltes Spiel - Gegenstück zu
// collectFacts(), aber bewusst ohne alles, was tatsächliche Spielleistung voraussetzt (kein
// Standout, keine Bank-Reue etc., die gibt's vor dem Anpfiff ja noch nicht).
function collectPreviewFacts(game) {
  const facts = [];

  if (game.streak) {
    const s = game.streak;
    facts.push({ category: 'streak', text: s.streakType === 'WIN'
      ? `${s.team} geht mit einer Serie von ${s.streakLength} Siegen in Folge in diese Woche.`
      : `${s.team} steckt in einer Serie von ${s.streakLength} Niederlagen in Folge und braucht dringend eine Trendwende.` });
  }

  if (game.confStanding) {
    const c = game.confStanding;
    const record = `${c.wins}-${c.losses}${c.ties ? '-' + c.ties : ''}`;
    facts.push({ category: 'confStanding', text: `${c.team} geht als Tabellen-${c.rank}. der ${c.conf} (Bilanz ${record}) in diese Woche.` });
  }

  if (game.playoffRace) {
    const r = game.playoffRace;
    let t = null;
    if (r.status === 'eliminated') t = `Playoff-Kontext: Für ${r.team} geht es diese Woche rechnerisch um nichts mehr im Playoff-Rennen - schon eliminiert.`;
    else if (r.status === 'chasing') t = `Playoff-Kontext: ${r.team} liegt ${r.winsBehind} Sieg(e) hinter dem letzten Playoff-Platz zurück - Druck pur.`;
    else if (r.status === 'in') t = `Playoff-Kontext: ${r.team} steht aktuell auf einem Playoff-Platz (Seed ${r.seed}) und will den diese Woche verteidigen.`;
    if (t) facts.push({ category: 'playoffRace', text: t });
  }

  if (game.expectation) {
    const e = game.expectation;
    facts.push({ category: 'expectation', text: e.lucky
      ? `Erwartungswert-Check: ${e.team} steht bei ${e.actualWins} Siegen, verdient hätte laut Punkteverhältnis aber nur ${e.expectedWins.toFixed(1)} - die Bilanz könnte sich diese Woche rächen.`
      : `Erwartungswert-Check: ${e.team} steht bei nur ${e.actualWins} Siegen, verdient hätte laut Punkteverhältnis aber ${e.expectedWins.toFixed(1)} - eigentlich überfällig für einen Befreiungsschlag.` });
  }

  if (game.rematch) {
    const r = game.rematch;
    let t = `Bereits in Woche ${r.week} standen sich diese beiden Teams gegenüber (${r.scoreLine}), damals gewann ${r.winner}.`;
    t += r.isFinalMeeting ? ' Letzte Chance in dieser Saison auf Wiedergutmachung.' : ' Die zweite Runde folgt.';
    facts.push({ category: 'rematch', text: t });
  }

  if (game.defendingChampion) {
    const d = game.defendingChampion;
    facts.push({ category: 'defendingChampion', text: `Titelverteidiger: ${d.team} gewann die Meisterschaft ${d.year} und geht mit ${d.wins}-${d.losses} in diese Woche.` });
  }

  if (game.playoffHistory) {
    const p = game.playoffHistory;
    facts.push({ category: 'playoffHistory', text: `Playoff-Geschichte: ${p.team1} und ${p.team2} standen sich schon in den ${p.year}er-Playoffs gegenüber (${p.score1.toFixed(1)}:${p.score2.toFixed(1)}), damals gewann ${p.winner} – heute geht's um die Revanche in der regulären Saison.` });
  }

  return facts;
}

// Baut aus allen Spielen der KOMMENDEN Woche einen Fakten-Digest für die Vorschau - analog zu
// buildWeekPrompt(), aber mit Bilanz statt Endstand (die Spiele sind ja noch nicht gespielt) und
// collectPreviewFacts() statt collectFacts() als Quelle.
function buildWeekPreviewPrompt(games) {
  const week = games[0].week;
  const categoryUsage = {};

  // Ungeschlagen-Bilanz VORAB über alle Spiele der Woche berechnen und explizit mitgeben, statt
  // Claude die 5 einzelnen Bilanz-Angaben selbst gegeneinander abgleichen zu lassen - Live-Fehler
  // beobachtet (22.9.2026, Woche-3-Vorschau): Text behauptete "Zurich City Ravens als einziges Team
  // ungeschlagen", dabei waren TM06 und Apukalypse Now ebenfalls noch ohne Niederlage - beide sogar
  // an anderer Stelle im selben Text korrekt erwähnt. Ein bereits fertig berechneter Fakt verhindert
  // diesen Cross-Team-Zählfehler zuverlässiger als nur eine Prompt-Anweisung.
  const allTeamRecords = [];
  games.forEach((g) => {
    if (g.homeRecord) allTeamRecords.push({ name: g.homeName, ...g.homeRecord });
    if (g.awayRecord) allTeamRecords.push({ name: g.awayName, ...g.awayRecord });
  });
  const unbeaten = allTeamRecords.filter((t) => t.losses === 0 && (t.ties || 0) === 0 && t.wins > 0);

  let context = `Woche ${week}: Hier sind alle ${games.length} Spiele der KOMMENDEN Woche (noch nicht gespielt) mit Bilanz und Kontext.\n`;
  if (unbeaten.length === 1) {
    context += `Fakt: ${unbeaten[0].name} ist aktuell das EINZIGE noch ungeschlagene Team der Liga - das darfst du so hervorheben.\n`;
  } else if (unbeaten.length > 1) {
    context += `Fakt: Aktuell sind ${unbeaten.length} Teams noch ungeschlagen: ${unbeaten.map((t) => t.name).join(', ')}. KEINES davon ist "das einzige ungeschlagene Team" - behaupte das nicht, auch nicht implizit.\n`;
  }
  context += `Schreibe daraus EINE Wochen-Vorschau:\n\n`;
  games.forEach((game, i) => {
    const favorite = game.homeProj >= game.awayProj ? game.homeName : game.awayName;
    const homeRecord = game.homeRecord ? `${game.homeRecord.wins}-${game.homeRecord.losses}${game.homeRecord.ties ? '-' + game.homeRecord.ties : ''}` : '0-0';
    const awayRecord = game.awayRecord ? `${game.awayRecord.wins}-${game.awayRecord.losses}${game.awayRecord.ties ? '-' + game.awayRecord.ties : ''}` : '0-0';

    let line = `Spiel ${i + 1}: ${game.homeName} (Bilanz ${homeRecord}) gegen ${game.awayName} (Bilanz ${awayRecord}). Papierform-Favorit laut Vorschau-Stärke: ${favorite}.`;

    const facts = pickFactsForGame(game, categoryUsage, '-preview', 2, 2, collectPreviewFacts);
    facts.forEach((fact) => { line += ' ' + fact.text; });
    context += line + '\n';
  });
  context += '\nSchreibe jetzt die Wochen-Vorschau.';
  return context;
}

/**
 * @param {Array} games - alle Spiele der KOMMENDEN (noch nicht gespielten) Woche, angereichert mit
 *   week/homeProj/awayProj/homeRecord/awayRecord + Vorschau-Fakten (siehe buildPreviewMoments in sync-espn.mjs).
 * @param {Object} existingPreviews - bereits vorhandene Wochen-Vorschauen (week -> Eintrag), um Doppel-Calls zu vermeiden.
 * @returns {Promise<Object|null>} { week, headline, preview, generatedAt } oder null, wenn nichts Neues generiert wurde.
 */
export async function generateWeekPreview(games, existingPreviews) {
  if (!ANTHROPIC_API_KEY) return null;
  if (!games.length) return null;
  const week = games[0].week;
  if (existingPreviews[week]) return null;
  try {
    const prompt = buildWeekPreviewPrompt(games);
    const raw = await callClaude(prompt, WEEK_PREVIEW_SYSTEM_PROMPT, 1500);
    const parts = raw.split(/\n\s*\n/);
    const headline = (parts.shift() || '').trim();
    const preview = parts.join('\n\n').trim();
    if (!headline || !preview) {
      throw new Error('Wochen-Vorschau-Antwort hatte nicht das erwartete Schlagzeile+Text-Format');
    }
    console.log('Wochen-Vorschau generiert für Woche', week);
    return { week, headline, preview, generatedAt: new Date().toISOString() };
  } catch (err) {
    console.error('Wochen-Vorschau fehlgeschlagen für Woche', week, ':', err.message);
    return null;
  }
}
