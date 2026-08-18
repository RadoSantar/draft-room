/* Fantasy Playbook – gemeinsame Konstanten/Helfer für alle Seiten (index.html, draft-board.html, schedule.html). */
(function(global){
  var ADP_URL = 'https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/2026/segments/0/leaguedefaults/3?view=kona_player_info';
  var SLOT_IDS = { QB: 0, RB: 2, WR: 4, TE: 6, K: 17, DST: 16 };
  var TEAM_ABBR = {
    1:'ATL', 2:'BUF', 3:'CHI', 4:'CIN', 5:'CLE', 6:'DAL', 7:'DEN', 8:'DET', 9:'GB', 10:'TEN',
    11:'IND', 12:'KC', 13:'LV', 14:'LAR', 15:'MIA', 16:'MIN', 17:'NE', 18:'NO', 19:'NYG', 20:'NYJ',
    21:'PHI', 22:'ARI', 23:'PIT', 24:'LAC', 25:'SF', 26:'SEA', 27:'TB', 28:'WSH', 29:'CAR', 30:'JAX',
    33:'BAL', 34:'HOU'
  };

  /* ---- Team-Theme (Farbschema-Picker) – gemeinsam für alle Seiten ---- */
  var THEME_KEY = 'draftroom-team-theme';
  var TEAM_THEMES = [
    { value: 'ari', label: 'Arizona Cardinals' }, { value: 'atl', label: 'Atlanta Falcons' },
    { value: 'bal', label: 'Baltimore Ravens' }, { value: 'buf', label: 'Buffalo Bills' },
    { value: 'car', label: 'Carolina Panthers' }, { value: 'chi', label: 'Chicago Bears' },
    { value: 'cin', label: 'Cincinnati Bengals' }, { value: 'cle', label: 'Cleveland Browns' },
    { value: 'dal', label: 'Dallas Cowboys' }, { value: 'den', label: 'Denver Broncos' },
    { value: 'det', label: 'Detroit Lions' }, { value: 'gb', label: 'Green Bay Packers' },
    { value: 'hou', label: 'Houston Texans' }, { value: 'ind', label: 'Indianapolis Colts' },
    { value: 'jax', label: 'Jacksonville Jaguars' }, { value: 'kc', label: 'Kansas City Chiefs' },
    { value: 'lv', label: 'Las Vegas Raiders' }, { value: 'lac', label: 'Los Angeles Chargers' },
    { value: 'lar', label: 'Los Angeles Rams' }, { value: 'mia', label: 'Miami Dolphins' },
    { value: 'min', label: 'Minnesota Vikings' }, { value: 'ne', label: 'New England Patriots' },
    { value: 'no', label: 'New Orleans Saints' }, { value: 'nyg', label: 'New York Giants' },
    { value: 'nyj', label: 'New York Jets' }, { value: 'phi', label: 'Philadelphia Eagles' },
    { value: 'pit', label: 'Pittsburgh Steelers' }, { value: 'sf', label: 'San Francisco 49ers' },
    { value: 'sea', label: 'Seattle Seahawks' }, { value: 'tb', label: 'Tampa Bay Buccaneers' },
    { value: 'ten', label: 'Tennessee Titans' }, { value: 'wsh', label: 'Washington Commanders' }
  ];

  function logoUrl(theme){ return 'https://a.espncdn.com/i/teamlogos/nfl/500/' + theme + '.png'; }

  // Sofort ausführen (bevor irgendetwas gerendert wird) – verhindert ein Aufblitzen des Standard-Designs.
  try {
    var savedTheme = localStorage.getItem(THEME_KEY);
    if(savedTheme) document.documentElement.setAttribute('data-team-theme', savedTheme);
  } catch(e){}

  function syncHeaderLogo(headerLogo, theme){
    if(!headerLogo) return;
    var url = theme ? logoUrl(theme) : null;
    if(url){
      headerLogo.src = url;
      headerLogo.classList.remove('is-hidden');
    } else {
      headerLogo.classList.add('is-hidden');
      headerLogo.src = '';
    }
  }

  /* Baut den Options-Picker auf (falls leer) und verdrahtet Wechsel + Vorschau + Header-Logo + Persistenz.
     config: { select, headerLogo, previewBall, previewLogo } – nur select ist Pflicht. */
  function initThemePicker(config){
    var root = document.documentElement;
    var select = config.select;
    var headerLogo = config.headerLogo;
    var previewBall = config.previewBall;
    var previewLogo = config.previewLogo;
    if(!select) return;

    if(!select.dataset.populated){
      select.innerHTML = '<option value="">Standard</option>' + TEAM_THEMES.map(function(t){
        return '<option value="' + t.value + '">' + t.label + '</option>';
      }).join('');
      select.dataset.populated = '1';
    }

    function sync(theme){
      select.value = theme;
      var url = theme ? logoUrl(theme) : null;
      if(previewLogo && previewBall){
        if(url){
          previewLogo.src = url;
          previewLogo.classList.remove('is-hidden');
          previewBall.classList.add('is-hidden');
        } else {
          previewLogo.classList.add('is-hidden');
          previewBall.classList.remove('is-hidden');
        }
      }
      syncHeaderLogo(headerLogo, theme);
    }

    function applyTheme(theme){
      if(theme) root.setAttribute('data-team-theme', theme);
      else root.removeAttribute('data-team-theme');
      sync(theme);
      try { localStorage.setItem(THEME_KEY, theme); } catch(e){}
    }

    sync(root.getAttribute('data-team-theme') || '');
    select.addEventListener('change', function(){ applyTheme(select.value); });

    return { applyTheme: applyTheme };
  }

  /* Verdrahtet ein Namensfeld mit DraftRoomSync (sync.js): lädt beim Eintragen/Auswählen des Namens
     den gespeicherten Stand, liefert eine push()-Funktion für spätere Änderungen zurück.
     config: { nameInput, statusEl, dropdownEl, onPull } – nameInput ist Pflicht, onPull(row) wird
     nach jedem erfolgreichen Laden mit den Server-Daten aufgerufen. dropdownEl (optional) zeigt beim
     Fokussieren alle bereits bekannten Namen zum Anklicken/Löschen – schützt vor Tippfehlern, die
     sonst eine neue, separate (leere) Zeile statt der eigenen erzeugen würden. Gibt null zurück,
     wenn Sync nicht konfiguriert ist (sync.js ohne Zugangsdaten) oder kein nameInput übergeben wurde. */
  function initSyncBar(config){
    var sync = global.DraftRoomSync;
    var nameInput = config.nameInput;
    var statusEl = config.statusEl;
    var dropdownEl = config.dropdownEl;
    if(!nameInput) return null;

    function setStatus(text){ if(statusEl) statusEl.textContent = text || ''; }

    if(!sync || !sync.isConfigured()){
      nameInput.disabled = true;
      nameInput.placeholder = 'Sync nicht verfügbar';
      return null;
    }

    nameInput.value = sync.getName();

    function doPull(){
      if(!sync.getName()){ setStatus(''); return; }
      setStatus('Lade…');
      sync.pull().then(function(row){
        setStatus(row ? 'Synchronisiert' : 'Neu – noch keine Daten gespeichert');
        if(row && config.onPull) config.onPull(row);
      }).catch(function(){ setStatus('Sync-Fehler'); });
    }

    function selectName(name){
      nameInput.value = name;
      sync.setName(name);
      doPull();
    }

    nameInput.addEventListener('change', function(){
      selectName(nameInput.value.trim());
      loadNames();
    });

    var knownNames = [];

    function renderDropdown(){
      if(!dropdownEl) return;
      dropdownEl.innerHTML = knownNames.length ? knownNames.map(function(n){
        var esc = n.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
        return '<div class="sync-dropdown-row" data-name="' + esc + '">' +
          '<span class="sync-dropdown-name">' + esc + '</span>' +
          '<button type="button" class="sync-dropdown-del" data-name="' + esc + '" aria-label="' + esc + ' löschen">×</button>' +
        '</div>';
      }).join('') : '<div class="sync-dropdown-empty">Noch keine gespeicherten Namen</div>';
    }

    function loadNames(){
      if(!dropdownEl) return;
      sync.listNames().then(function(names){
        knownNames = names;
        renderDropdown();
      }).catch(function(){});
    }

    if(dropdownEl){
      nameInput.addEventListener('focus', function(){
        dropdownEl.hidden = false;
        loadNames();
      });
      document.addEventListener('click', function(e){
        if(e.target !== nameInput && !dropdownEl.contains(e.target)) dropdownEl.hidden = true;
      });
      dropdownEl.addEventListener('click', function(e){
        var delBtn = e.target.closest('.sync-dropdown-del');
        if(delBtn){
          e.stopPropagation();
          var delName = delBtn.dataset.name;
          if(!global.confirm('Gespeicherte Daten für "' + delName + '" wirklich löschen?')) return;
          sync.deleteName(delName).then(function(){
            knownNames = knownNames.filter(function(n){ return n !== delName; });
            renderDropdown();
            if(sync.getName() === delName){
              sync.setName('');
              nameInput.value = '';
              setStatus('');
            }
          }).catch(function(){ global.alert('Löschen fehlgeschlagen.'); });
          return;
        }
        var row = e.target.closest('.sync-dropdown-row');
        if(row){
          selectName(row.dataset.name);
          dropdownEl.hidden = true;
        }
      });
    }

    doPull();
    loadNames();

    return {
      push: function(fields){
        if(!sync.getName()) return;
        setStatus('Speichere…');
        sync.push(fields).then(function(){ setStatus('Synchronisiert'); loadNames(); }).catch(function(){ setStatus('Sync-Fehler'); });
      }
    };
  }

  /* ESPN-Stat-IDs für die kona_player_info-Projektion (statSourceId=1, statSplitTypeId=0, Saison 2026 = id "102026").
     Nur die Kern-Kategorien, die aus Saison-Totalen ableitbar sind – siehe Hinweis in projectedPoints(). */
  var STAT = {
    passAtt: 0, passCmp: 1, passYds: 3, passTD: 4, passInt: 20,
    rushAtt: 23, rushYds: 24, rushTD: 25,
    rec: 41, recYds: 42, recTD: 43,
    fumLost: 72,
    /* Kicker: je Distanz-Bucket (made, attempted, missed) – ESPN kennt nur 3 Buckets
       (50+, 40-49, 0-39), unsere Liga trennt 50-59/60+ zusätzlich (siehe Hinweis unten). */
    fgMade50Plus: 74, fgMade40to49: 77, fgMade0to39: 80,
    fgMissedTotal: 85, patMade: 86, patMissed: 88,
    /* Team Defense: Saison-Totale, keine Wochenwerte */
    ptsAllowed: 120, yardsAllowed: 127, sacks: 99, gamesPlayed: 210
  };

  function ptsAllowedBonus(pa){
    if(pa === 0) return 10;
    if(pa <= 6) return 7;
    if(pa <= 13) return 4;
    if(pa <= 17) return 1;
    if(pa <= 27) return 0;
    if(pa <= 34) return -4;
    if(pa <= 45) return -7;
    return -10;
  }

  function yardsAllowedBonus(ya){
    if(ya < 100) return 5;
    if(ya <= 199) return 3;
    if(ya <= 349) return 0;
    if(ya <= 399) return -0.5;
    if(ya <= 449) return -1;
    if(ya <= 499) return -3;
    if(ya <= 549) return -5;
    return -8;
  }

  /* Näherung des individuellen Liga-Scorings auf Basis von Saison-Projektionswerten.
     Bewusst NICHT enthalten (weil aus Saison-Totalen nicht ableitbar, siehe Scoring-Kapitel):
     - QB/RB/WR/TE: 50+/40+-Yard-TD-Boni, Game-Yardage-Boni (300+/400+ Pass, 100+/200+ Rush/Rec),
       Sacked (-1), 2pt-Conversions, Rushing-First-Down-Bonus (QB) – das sind Wochenwerte/
       Play-by-Play-Boni, die eine Saison-Projektion nicht einzeln ausweist.
     - K: 50-59 und 60+ werden beide als "50+" mit +5 genähert (ESPN liefert keinen 60+-Split).
     - DST: nur Punkte-/Yards-erlaubt-Tiers (auf Basis des Saison-Schnitts, nicht wochenweise
       – glättet Ausreisserwochen weg) plus Sacks. INTs, Fumble-Recoveries, Defensive-/Return-TDs
       fehlen, da sich die genauen Stat-IDs dafür nicht zuverlässig verifizieren liessen.
     Ergebnis ist daher überall eine Annäherung, keine exakte Reproduktion des Punkterechners. */
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
    } else if(pos === 'K'){
      pts += s(STAT.fgMade0to39) * 3;
      pts += s(STAT.fgMade40to49) * 4;
      pts += s(STAT.fgMade50Plus) * 5;
      pts += s(STAT.fgMissedTotal) * -0.5;
      pts += s(STAT.patMade) * 1;
      pts += s(STAT.patMissed) * -1;
    } else if(pos === 'DST'){
      var games = s(STAT.gamesPlayed) || 17;
      var avgPA = s(STAT.ptsAllowed) / games;
      var avgYA = s(STAT.yardsAllowed) / games;
      pts += (ptsAllowedBonus(avgPA) + yardsAllowedBonus(avgYA)) * games;
      pts += s(STAT.sacks) * 1;
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
    findSeasonProjection: findSeasonProjection,
    logoUrl: logoUrl,
    syncHeaderLogo: syncHeaderLogo,
    initThemePicker: initThemePicker,
    initSyncBar: initSyncBar
  };
})(window);
