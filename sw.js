/* Service worker: rende il gioco giocabile offline dopo la prima apertura. */
const CACHE = 'cindervale-v3-combat-hd';
const ASSETS = [
  './',
  './index.html',
  './styles.css',
  './manifest.webmanifest',
  './src/core/rng.js',
  './src/data/gamedata.js',
  './src/data/story.js',
  './src/core/player.js',
  './src/core/systems.js',
  './src/engine/art.js',
  './src/engine/audio.js',
  './src/engine/input.js',
  './src/engine/render.js',
  './src/game/world.js',
  './src/game/entities.js',
  './src/ui/hud.js',
  './src/ui/ui.js',
  './src/game/main.js',
  './assets/hd/runtime/ashford-house.png',
  './assets/hd/runtime/traveler-atlas.png',
  './assets/hd/runtime/traveler-attack-atlas.png',
  './assets/hd/runtime/traveler-defense-atlas.png',
  './assets/hd/runtime/traveler-mobility-magic-atlas.png',
  './assets/hd/runtime/traveler-defeat-atlas.png',
  './assets/hd/runtime/hearth-shrine.png',
  './assets/hd/runtime/handcart.png',
  './assets/hd/runtime/woodpile.png',
  './assets/hd/runtime/stone-wall.png',
  './assets/hd/runtime/barrel.png',
  './assets/hd/runtime/crate.png',
  './assets/hd/runtime/ashford-terrain-atlas.jpg'
];

self.addEventListener('install', (e) => {
  /* `cache: 'reload'` evita che il browser riempia la cache con copie
     già vecchie prese dalla propria cache HTTP. */
  e.waitUntil(
    caches.open(CACHE)
      .then(c => Promise.all(ASSETS.map(u => c.add(new Request(u, { cache: 'reload' })).catch(() => {}))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

/* Rete per prima, cache come rete di sicurezza.
   Così online si riceve sempre l'ultima versione del gioco, e offline
   si continua comunque a giocare con l'ultima copia scaricata. */
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  if (new URL(e.request.url).origin !== self.location.origin) return;
  e.respondWith(
    fetch(e.request)
      .then(res => {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, copy)).catch(() => {});
        return res;
      })
      .catch(() => caches.match(e.request).then(hit => hit || caches.match('./index.html')))
  );
});
