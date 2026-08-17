/* Draft Room – optionaler Cloud-Sync über Supabase (Team-Design, "Mein Team", Draft-Board).
   Noch NICHT in eine Seite eingebunden – aktiviert wird das erst, sobald SUPABASE_URL und
   SUPABASE_ANON_KEY unten eingetragen sind (aus dem Supabase-Dashboard: Project Settings -> API)
   und dieses Script per <script> geladen wird. Zugehöriges Tabellen-Setup: supabase/schema.sql
   (einmal im Supabase SQL Editor ausführen). Ohne Konfiguration bleibt alles wie bisher rein lokal. */
(function(global){
  var SUPABASE_URL = '';
  var SUPABASE_ANON_KEY = '';

  var NAME_KEY = 'draftroom-my-name';
  var client = null;

  function getClient(){
    if(!SUPABASE_URL || !SUPABASE_ANON_KEY) return null;
    if(!client && global.supabase){
      client = global.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    }
    return client;
  }

  function getName(){
    try { return localStorage.getItem(NAME_KEY) || ''; } catch(e){ return ''; }
  }
  function setName(name){
    try {
      if(name) localStorage.setItem(NAME_KEY, name);
      else localStorage.removeItem(NAME_KEY);
    } catch(e){}
  }

  async function pull(){
    var name = getName();
    var c = getClient();
    if(!name || !c) return null;
    var res = await c.from('draftroom_settings').select('*').eq('name', name).maybeSingle();
    if(res.error) throw res.error;
    return res.data || null;
  }

  async function push(fields){
    var name = getName();
    var c = getClient();
    if(!name || !c) return;
    var row = Object.assign({ name: name, updated_at: new Date().toISOString() }, fields);
    var res = await c.from('draftroom_settings').upsert(row);
    if(res.error) throw res.error;
  }

  global.DraftRoomSync = {
    getName: getName,
    setName: setName,
    pull: pull,
    push: push,
    isConfigured: function(){ return !!getClient(); }
  };
})(window);
