/* ============================================================
   Server di sviluppo.

     node devserver.mjs [porta]

   Fa due cose che `python -m http.server` non fa:
   - manda "Cache-Control: no-store", così il browser non ti serve mai
     una versione vecchia dei file mentre stai lavorando;
   - stampa l'indirizzo di rete da aprire sul telefono.
   ============================================================ */
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname, normalize } from 'node:path';
import { networkInterfaces } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const ROOT = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.argv[2] || process.env.PORT || 8123);

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon'
};

const server = createServer(async (req, res) => {
  try {
    let path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (path === '/') path = '/index.html';
    /* Impedisce di uscire dalla cartella del progetto */
    const full = join(ROOT, normalize(path).replace(/^(\.\.[/\\])+/, ''));
    if (!full.startsWith(ROOT)) { res.writeHead(403).end('Vietato'); return; }

    const info = await stat(full).catch(() => null);
    if (!info || !info.isFile()) { res.writeHead(404).end('Non trovato'); return; }

    const body = await readFile(full);
    res.writeHead(200, {
      'Content-Type': TYPES[extname(full).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-store, no-cache, must-revalidate',
      'Pragma': 'no-cache'
    });
    res.end(body);
  } catch (e) {
    res.writeHead(500).end('Errore: ' + e.message);
  }
});

server.listen(PORT, '0.0.0.0', () => {
  const addrs = [];
  for (const list of Object.values(networkInterfaces())) {
    for (const n of list || []) {
      if (n.family === 'IPv4' && !n.internal) addrs.push(n.address);
    }
  }
  console.log('Cinder Vale — server di sviluppo');
  console.log('  sul computer:  http://localhost:' + PORT);
  for (const a of addrs) console.log('  dal telefono:  http://' + a + ':' + PORT + '   (stessa rete Wi-Fi)');
  console.log('  cache disattivata: ricarica e vedi subito le modifiche');
});
