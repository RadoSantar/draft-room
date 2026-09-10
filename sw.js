// Fantasy Playbook – minimaler Service Worker, nur damit der Browser die Seite als App installierbar anbietet.
// Cacht bewusst nichts (Liga-Daten aktualisieren sich laufend) – jede Anfrage geht direkt ans Netzwerk.
self.addEventListener('install', function(e){ self.skipWaiting(); });
self.addEventListener('activate', function(e){ self.clients.claim(); });
self.addEventListener('fetch', function(e){ e.respondWith(fetch(e.request)); });
