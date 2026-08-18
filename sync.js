/* Draft Room – optionaler Cloud-Sync über Supabase (Team-Design, "Mein Team", Draft-Board).
   SUPABASE_ANON_KEY ist bewusst kein Geheimnis – abgesichert wird über die RLS-Policies in
   supabase/schema.sql, nicht über Geheimhaltung dieses Keys. */
(function(global){
  var SUPABASE_URL = 'https://tcmmduefxdafjquqvgts.supabase.co';
  var SUPABASE_ANON_KEY = 'sb_publishable_T3VDp-jyWU629N9_E7CmWQ_eXKSQtG4';

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
