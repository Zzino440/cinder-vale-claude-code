# Cinder Vale

Action RPG in pixel art con vista dall'alto, giocabile da telefono e da PC.
Sette anni fa la Rocca a nord si è accesa e non si è più spenta: da allora sulla
valle piove cenere. Tu arrivi adesso.

---

## Come si gioca

Il gioco produce sempre le stesse *intenzioni* (muovi, mira, attacca, para,
schiva, interagisci) a partire da tre schemi di comando diversi. Si cambia da
**Menu → Opzioni → Schema di controllo**; in automatico viene scelto da solo.

### Touch — joystick virtuale (predefinito su telefono)
Il pollice sinistro appoggiato ovunque nella metà sinistra crea il joystick nel
punto in cui tocchi. I pulsanti a destra sono, dal basso: **Colpo**, **Schivata**,
**Fuoco**, **Parata**, e **Usa** quando c'è qualcosa con cui interagire.

### Touch — tocca per muoverti (senza joystick)
Tocchi o trascini il dito dove vuoi andare e il personaggio ci va. I pulsanti di
combattimento restano gli stessi. La mira è assistita: quando attacchi, il colpo
punta da solo al nemico più vicino davanti a te.

### Tastiera e mouse (sviluppo su PC)

| Comando | Azione |
|---|---|
| `WASD` / frecce | movimento |
| mouse | mira |
| click sinistro / `J` | attacca |
| click destro / `K` (tenuto) | para |
| `Spazio` | schiva |
| `Q` | incantesimo |
| `E` | interagisci |
| `R` | bevi la pozione migliore |
| `I` `L` `P` `M` | zaino, diario, abilità, mappa |
| `Esc` | menu |

### Il combattimento
Ogni nemico **telegrafa** il colpo: un settore rosso si riempie davanti a lui
prima di colpire. È la finestra in cui puoi agire.

- **Parata normale** — assorbe gran parte del danno e costa vigore.
- **Parata perfetta** — se alzi la guardia entro un quarto di secondo dal colpo,
  annulli il danno e stordisci il nemico.
- **Schivata** — per un istante sei intoccabile. Contro chi carica, schiva di
  lato, non all'indietro.

---

## Cosa c'è dentro

- **Cinque zone** generate proceduralmente da un seme fisso (lo stesso seme
  produce sempre la stessa mappa): il villaggio di Ashford, la Brughiera di
  Cenere, il Bosco di Radicenera, la Miniera Profonda e la Rocca del Rogo.
- **Sei abilità che salgono usandole**, come in Skyrim: Lama, Distruzione,
  Blocco, Atletica, Fabbrilità, Alchimia. Colpisci di spada e sale Lama.
- **18 talenti** sbloccabili con i punti guadagnati salendo di livello.
- **Bottino con affissi e rarità**: le armi trovate hanno prefissi e suffissi
  generati (Affilata, Pesante, della Brace…), cinque gradi di rarità e valori
  ricalcolati di conseguenza.
- **Forgiatura e tempra**: fondi il minerale, forgi l'equipaggiamento, e temperi
  quello che già indossi fino a +5 (+6 con il talento adatto).
- **Alchimia a virtù condivise**, esattamente come in Skyrim: ogni ingrediente ha
  quattro virtù, ma mescolandone due si attivano **solo quelle in comune**. Le
  virtù si scoprono assaggiando gli ingredienti o riuscendo nelle miscele.
- **Missioni** con più fasi, diario, marcatori sopra i personaggi, e otto
  missioni tra principali e secondarie.
- **Peso trasportabile**, oltre il limite si rallenta.
- **Tre slot di salvataggio** in `localStorage`, con autosalvataggio nello slot
  attivo a ogni cambio di zona e ogni due minuti.
- **Snapshot di debug protetti**, ripristinabili senza che gli autosalvataggi
  modifichino lo stato originale.

Nessun asset esterno: sprite, tile, icone, effetti sonori e musica sono tutti
generati dal codice. Il gioco intero è un unico file HTML da ~280 kB.

---

## Provarlo

### Dal telefono, subito
Il gioco è pubblicato come Artifact: apri il link dal browser del telefono.
Su iPhone `Condividi → Aggiungi alla schermata Home`, su Android
`⋮ → Installa app`, e si comporta come un'app a schermo intero.

### In locale sul PC

```bash
node devserver.mjs
```

Stampa sia l'indirizzo locale sia quello di rete da aprire dal telefono sulla
stessa Wi-Fi, e disattiva la cache: ricarichi e vedi subito le modifiche.

### File singolo

```bash
node build.mjs
```

Unisce tutti i sorgenti in `dist/cinder-vale.html`, che funziona anche aperto
con un doppio clic, senza server.

> In sviluppo apri `index.html?dev=1`: con `dev` nell'URL il service worker
> resta spento e si disinstalla da solo, così non ti serve mai una copia
> vecchia. Senza quel parametro resta attivo e il gioco funziona offline.

---

## Struttura del progetto

La divisione non è cosmetica: separa ciò che è **portabile** da ciò che è
**legato al browser**. È la ragione per cui il passaggio a Godot costa poco.

### Portabile — logica e dati puri, nessun riferimento al browser

| File | Contenuto |
|---|---|
| `src/core/rng.js` | numeri casuali deterministici, rumore, matematica |
| `src/core/player.js` | statistiche, abilità, talenti, inventario, effetti |
| `src/core/systems.js` | bottino, forgiatura, alchimia, missioni, dialoghi, salvataggio |
| `src/data/gamedata.js` | oggetti, ingredienti, nemici, ricette, tabelle di bottino |
| `src/data/story.js` | zone, personaggi, dialoghi, missioni |
| `src/game/world.js` | generazione delle mappe e collisioni |
| `src/game/entities.js` | intelligenza dei nemici e regole di combattimento |

### Legato al browser — da riscrivere per un altro motore

| File | Contenuto |
|---|---|
| `src/engine/art.js` | sprite disegnati da matrici di caratteri, tile procedurali |
| `src/engine/render.js` | canvas, camera, illuminazione |
| `src/engine/input.js` | i tre schemi di comando |
| `src/engine/audio.js` | sintesi audio con WebAudio |
| `src/ui/hud.js` | interfaccia di gioco disegnata sul canvas |
| `src/ui/ui.js` | menu in DOM |
| `src/game/main.js` | ciclo di gioco, collante fra i due strati |

---

## Se un giorno passa a Godot

Il progetto è stato scritto pensando a questo passaggio.

1. **I dati diventano `.json`.** `gamedata.js` e `story.js` sono già oggetti
   letterali senza logica: si esportano come JSON e Godot li legge con
   `JSON.parse_string()`, oppure diventano `Resource` personalizzate.
   Le condizioni e le azioni dei dialoghi sono dichiarative (`{questDone: ...}`,
   `{startQuest: ...}`), quindi i contenuti non vanno riscritti: si riscrive
   solo l'interprete, che sta in `systems.js` ed è lungo poche decine di righe.
2. **La logica pura si traduce quasi riga per riga** in GDScript. Non usa
   `document`, `window`, `canvas` né altro: solo aritmetica e strutture dati.
3. **L'input è già nel modello di Godot.** `input.js` traduce tre schemi diversi
   nelle stesse azioni astratte: in Godot diventano Input Action, e il resto del
   codice non cambia.
4. **Da riscrivere davvero** ci sono solo rendering, audio e menu — cioè proprio
   le parti che in Godot si fanno con l'editor invece che con il codice, quindi
   sono anche quelle che ci si guadagna a rifare.
5. **Gli sprite**: `art.js` li tiene come matrici di caratteri con una palette.
   Sono facili da esportare in PNG (basta il canvas già costruito) oppure da
   ridisegnare in Aseprite, mantenendo gli stessi nomi.

---

## Note

- I salvataggi stanno in `localStorage`, separati per dominio: gli slot
  dell'Artifact e quelli locali sono indipendenti.
- Morire costa metà dell'oro che hai addosso e ti riporta ad Ashford. Nient'altro.
- I falò rigenerano le forze e fanno ricrescere i cespugli e i filoni.
