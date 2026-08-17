/* Draft Room – gemeinsame Konstanten/Helfer für draft-board.html (und ggf. weitere Zusatz-Seiten).
   index.html selbst bleibt bewusst eigenständig (historisch gewachsen, mehrfach getestet). */
(function(global){
  var ADP_URL = 'https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/2026/segments/0/leaguedefaults/3?view=kona_player_info';
  var SLOT_IDS = { QB: 0, RB: 2, WR: 4, TE: 6, K: 17, DST: 16 };
  var TEAM_ABBR = {
    1:'ATL', 2:'BUF', 3:'CHI', 4:'CIN', 5:'CLE', 6:'DAL', 7:'DEN', 8:'DET', 9:'GB', 10:'TEN',
    11:'IND', 12:'KC', 13:'LV', 14:'LAR', 15:'MIA', 16:'MIN', 17:'NE', 18:'NO', 19:'NYG', 20:'NYJ',
    21:'PHI', 22:'ARI', 23:'PIT', 24:'LAC', 25:'SF', 26:'SEA', 27:'TB', 28:'WSH', 29:'CAR', 30:'JAX',
    33:'BAL', 34:'HOU'
  };

  /* ESPN-Stat-IDs für die kona_player_info-Projektion (statSourceId=1, statSplitTypeId=0, Saison 2026 = id "102026").
     Nur die Kern-Kategorien, die aus Saison-Totalen ableitbar sind – siehe Hinweis in projectedPoints(). */
  var STAT = {
    passAtt: 0, passCmp: 1, passYds: 3, passTD: 4, passInt: 20,
    rushAtt: 23, rushYds: 24, rushTD: 25,
    rec: 41, recYds: 42, recTD: 43,
    fumLost: 72
  };

  /* Näherung des individuellen Liga-Scorings auf Basis von Saison-Projektionswerten.
     Bewusst NICHT enthalten (weil aus Saison-Totalen nicht ableitbar, siehe Scoring-Kapitel):
     50+/40+-Yard-TD-Boni, Game-Yardage-Boni (300+/400+ Pass, 100+/200+ Rush/Rec), Sacked (-1),
     2pt-Conversions, Rushing-First-Down-Bonus (QB). Das sind Wochenwerte/Play-by-Play-Boni,
     die eine Saison-Projektion nicht einzeln ausweist. Ergebnis ist daher eine Annäherung,
     keine exakte Reproduktion des Punkterechners. */
  function projectedPoints(pos, stats){
    if(!stats) return null;
    var s = function(id){ return stats[String(id)] || 0; };
    var pts = 0;
    if(pos === 'QB'){
      pts += s(STAT.passYds) / 25;
      pts += s(STAT.passCmp) * 0.5;
      pts += s(STAT.passTD) * 6;
      pts += s(STAT.passInt) * -2;
      pts += s(STAT.rushYds) / 10;
      pts += s(STAT.rushTD) * 6;
      pts += s(STAT.fumLost) * -2;
    } else if(pos === 'RB' || pos === 'WR' || pos === 'TE'){
      pts += s(STAT.rushYds) / 10;
      pts += s(STAT.rushTD) * 6;
      pts += s(STAT.recYds) / 10;
      pts += s(STAT.rec) * 1;
      pts += s(STAT.recTD) * 6;
      pts += s(STAT.fumLost) * -2;
    } else {
      return null;
    }
    return pts;
  }

  function findSeasonProjection(playerStats){
    if(!playerStats) return null;
    var entry = playerStats.filter(function(s){
      return s.statSourceId === 1 && s.statSplitTypeId === 0;
    }).sort(function(a, b){ return (b.seasonId || 0) - (a.seasonId || 0); })[0];
    return entry ? entry.stats : null;
  }

  global.DraftRoomShared = {
    ADP_URL: ADP_URL,
    SLOT_IDS: SLOT_IDS,
    TEAM_ABBR: TEAM_ABBR,
    STAT: STAT,
    projectedPoints: projectedPoints,
    findSeasonProjection: findSeasonProjection
  };
})(window);
