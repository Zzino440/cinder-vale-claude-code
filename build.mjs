/* ============================================================
   Build: unisce tutti i sorgenti in un unico file HTML.
   Nessuna dipendenza, nessun bundler: i moduli sono script
   classici che si registrano su window.CV, quindi basta
   concatenarli nell'ordine giusto.

     node build.mjs

   Produce:
     dist/cinder-vale.html  file singolo apribile ovunque
     dist/artifact.html     stesso gioco senza <html>/<head>/<body>
   ============================================================ */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(fileURLToPath(import.meta.url));

/* Stesso ordine di index.html: le dipendenze sono lineari. */
const SOURCES = [
  'src/core/rng.js',
  'src/data/gamedata.js',
  'src/data/story.js',
  'src/core/player.js',
  'src/core/systems.js',
  'src/engine/art.js',
  'src/engine/audio.js',
  'src/engine/input.js',
  'src/engine/render.js',
  'src/game/world.js',
  'src/game/entities.js',
  'src/ui/hud.js',
  'src/ui/ui.js',
  'src/game/main.js'
];

const read = (p) => readFileSync(join(ROOT, p), 'utf8');

const css = read('styles.css');
const js = SOURCES.map(f => `/* ===== ${f} ===== */\n${read(f)}`).join('\n\n');

const BODY = `<div id="app">
  <canvas id="game"></canvas>
  <div id="overlay"></div>
  <div id="toasts"></div>
</div>
<style>
${css}
</style>
<script>
${js}
</script>`;

const STANDALONE = `<!DOCTYPE html>
<html lang="it">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover">
<meta name="theme-color" content="#0d0b10">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<title>Cinder Vale</title>
</head>
<body>
${BODY}
</body>
</html>
`;

const ARTIFACT = `<title>Cinder Vale</title>
${BODY}
`;

mkdirSync(join(ROOT, 'dist'), { recursive: true });
writeFileSync(join(ROOT, 'dist/cinder-vale.html'), STANDALONE, 'utf8');
writeFileSync(join(ROOT, 'dist/artifact.html'), ARTIFACT, 'utf8');

const kb = (s) => (Buffer.byteLength(s, 'utf8') / 1024).toFixed(1) + ' kB';
console.log('dist/cinder-vale.html  ' + kb(STANDALONE));
console.log('dist/artifact.html     ' + kb(ARTIFACT));
console.log('Sorgenti uniti: ' + SOURCES.length + ' file');
