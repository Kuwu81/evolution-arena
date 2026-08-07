# 🧬 Evolution Arena

Browserbasiertes Roguelike-Lernspiel zur Evolutionsbiologie nach dem Konzept in
[`Evolution_Arena_Spieluebersicht_kompakt.md`](Evolution_Arena_Spieluebersicht_kompakt.md).
2–6 Teams, 8–12 Runden, Hotseat, gegen KI-Arten oder **online per Einladecode**.

**Kein Punktesammeln — wer am Ende die größte Population hat, gewinnt.**
Die Population ist ein emergentes Ergebnis aus Variabilität, Selektion und
Fortpflanzungserfolg. Niemand kann sie direkt bauen.

## Starten

Einfach `index.html` im Browser öffnen — es gibt keinen Build-Schritt und keine
externen Abhängigkeiten. Für die optionalen Sound-Samples (siehe unten) ist ein
lokaler Server nötig, weil `fetch` unter `file://` blockiert ist:

```bash
python3 .claude/devserver.py
```

## Steuerung

| Eingabe | Wirkung |
|---|---|
| **1 / 2 / 3** | Draft-Karte wählen |
| **M** / **N** | Karte als Mutation bzw. als Nahrung einsetzen |
| **Leertaste / Enter** | Nächste Phase |
| **Esc** | Pause |
| **A** | Auto-Modus (läuft ohne Klicks durch) |
| **S** | Ton an/aus |

Online gibt der Gastgeber die Phasen frei; bei Gästen ist der Auto-Knopf
ausgeblendet, weil er dort wirkungslos wäre.

Auf Mobilgeräten wechseln die drei Tabs unter der Arena zwischen
Arten-/Genpool-Panel, Arena und Chronik.

## Aufbau

```
index.html              Struktur aller vier Bildschirme
css/
  base.css              Design-Tokens, Reset, Typografie
  layout.css            Bildschirme und Raster
  components.css        Buttons, Panels, Karten, Diagramme
  animations.css        Keyframes und Effekte
  responsive.css        Media Queries (bewusst zuletzt geladen)
  online.css            Lobby, Einladecode, Wartefenster
js/
  core/util.js          Seeded RNG, pausierbare Uhr, DOM-Helfer
  core/audio.js         WebAudio-Synthese + optionale Samples
  data/traits.js        19 Merkmale, 10 Kombi-Effekte
  data/events.js        16 Ereigniskarten, Ziehstapel, Umweltmodell
  data/names.js         Artnamen, Teamfarben
  game/genetics.js      Werteableitung, Rekombination, Genpool
  game/state.js         Spielzustand, Log, Rundenschnappschüsse
  game/phases.js        Die fünf Rundenphasen + Balancing-Konstanten
  game/ai.js            KI-Bewertung der Draft-Karten
  game/analysis.js      Reflexions-Engine „Warum X → Y?“
  net/config.js         Zugangsdaten des Realtime-Dienstes
  net/protocol.js       Nachrichtentypen, Einladecodes, Zustandsprüfsumme
  net/room.js           Raum, Präsenz, Entscheidungs- und Phasensynchronisation
  render/arena.js       Canvas: Wasserloch, Tokens, Partikel
  ui/*.js               HUD, Draft, Lobby, Modals, Diagramme, Abschluss
  app.js                Bildschirme, Rundenablauf, Eingaben
tests/
  lockstep.html         Prüft, ob alle Geräte identisch rechnen (siehe unten)
```

Alle Module registrieren sich im globalen Namensraum `EA` und werden als
klassische Skripte in Abhängigkeitsreihenfolge geladen — dadurch läuft das
Spiel auch direkt per Doppelklick aus dem Dateisystem.

## Didaktische Zuordnung

| Lehrplan-Konzept | Umsetzung |
|---|---|
| Variabilität | Jedes Individuum trägt eine eigene Merkmalsteilmenge; der Genpool ist als Prozentbalken sichtbar |
| Mutation (ungerichtet) | Draft: 3 Karten, 1 Wahl → trifft **ein zufälliges** Individuum, nicht wählbar |
| Rekombination | Nachkommen erben jedes Elternmerkmal einzeln (94 % bei beiden Eltern, 50 % bei einem) |
| Überproduktion | Es werden mehr geboren, als das Wasserloch tragen kann |
| Selektion | Fressreihenfolge und -erfolg hängen an Merkmalen; nur Satte überleben |
| Angepasstheit ist relativ | Dasselbe Merkmal hilft je nach Umwelttemperatur oder Nahrungslage — oder schadet |
| Fortpflanzungserfolg | Nur satte Eltern pflanzen sich fort; Siegbedingung ist die Population |
| Gendrift | Katastrophenkarten töten mit gleicher Wahrscheinlichkeit, unabhängig von Merkmalen |
| Koevolution | Fleischfresser gegen Panzer/Herde/Warnruf, mit Räuber-Beute-Rückkopplung |
| Isolation, Artbildung, Divergenz, Konvergenz | Advanced-Pack: Isolationsmerkmal spaltet Linien ab, Genfluss endet, Divergenz und Konvergenz werden erkannt und protokolliert |

Der Abschlussbildschirm erzeugt die Reflexionsfragen **aus den aufgezeichneten
Rundendaten** — inklusive des tatsächlich gemessenen Fütterungsvorsprungs je
Merkmal. Der komplette Replay-Log lässt sich als Textdatei exportieren.

## Online spielen

Im Hauptmenü **Online spielen** → *Raum erstellen* liefert einen sechsstelligen
Einladecode (z. B. `H7KQ29`). Wer beitritt, gibt ihn auf derselben Seite ein –
oder öffnet den Einladelink `…/index.html?join=H7KQ29`. Der Gastgeber legt
Runden, Karten-Pack, Startpopulation und zusätzliche KI-Arten fest und startet.
Es gibt keine Anmeldung und keine Konten: **Der Code ist das Geheimnis.**

Gespielt wird mit bis zu sechs Arten. Gedraftet wird **gleichzeitig** – ein
Wartefenster zeigt, wer schon gewählt hat. Den Takt der übrigen Phasen gibt der
Gastgeber vor, damit alle dieselbe Runde sehen.

### Wie die Synchronisation funktioniert

Die Simulation ist vollständig deterministisch: Ereigniskarten, Draft-Angebote,
Mutationsziele, Jagd, Selektion, Vermehrung und sogar die KI-Züge stammen aus
einem einzigen gesetzten Zufallsstrom (`game.rng`). Der **einzige** nicht
ableitbare Eingabewert ist die Draft-Entscheidung eines Menschen.

Deshalb wird kein Spielzustand übertragen, sondern nur `{ traitId, mode }` je
Mensch und Runde – ein paar hundert Byte pro Runde. Jedes Gerät rechnet die
Partie aus demselben Seed selbst („Lockstep“). Nach jeder Runde tauschen die
Clients eine Prüfsumme ihres Zustands aus; weichen sie ab, meldet das Spiel das
sofort, statt still auseinanderzulaufen.

Zwei Dinge folgen daraus:

- **Wer die Seite neu lädt, steigt wieder ein.** Der Gastgeber schickt den
  aufgezeichneten Entscheidungsverlauf; das Gerät holt die Runden im Zeitraffer
  nach und ist wieder live.
- **Getrennte Mitspielende blockieren die Runde nicht.** Nach kurzer Wartezeit
  setzt der Gastgeber eine feste Ersatzentscheidung (erste Karte, als Mutation) –
  bewusst ohne Zufall, damit jedes Gerät dasselbe Ergebnis errechnet. Er kann
  Wartende auch manuell überspringen.

Verlässt der Gastgeber die Partie, pausiert sie – ein Wechsel des Gastgebers
mitten im Spiel ist nicht vorgesehen.

### Einrichtung des Realtime-Dienstes

Der Onlinemodus nutzt **Supabase Realtime** (Broadcast-Kanäle, kostenloses
Kontingent). Eine Datenbank wird nicht angelegt: Der Kanalname *ist* der
Einladecode.

1. Auf [supabase.com](https://supabase.com) ein kostenloses Projekt anlegen.
2. Unter *Project Settings ▸ API Keys* die **Project URL** und den
   **Publishable Key** (`sb_publishable_…`) kopieren.
3. Beides in [`js/net/config.js`](js/net/config.js) eintragen — oder leer lassen:
   Dann fragt das Spiel die Werte beim ersten Aufruf ab und legt sie im
   `localStorage` des Geräts ab.

Supabase hat die früheren **anon-Keys** (JWT, `eyJhbGciOi…`) durch Keys der Form
`sb_publishable_…` abgelöst. Beide werden hier akzeptiert; neue Projekte
bekommen nur noch die neue Form.

Der Publishable Key ist ein öffentlicher Client-Schlüssel und darf im Browser
stehen. Wer ihn nicht ins Repository legen will, lässt `config.js` leer oder
übergibt die Werte per URL: `?sb=<projekt-url>&key=<publishable-key>`.

### Hosting

Die Seite besteht weiterhin nur aus statischen Dateien – GitHub Pages, Netlify,
Cloudflare Pages oder jeder andere Static-Host genügen; ein Build-Schritt
entfällt. Wichtig ist nur **HTTPS**, weil die Realtime-Verbindung über `wss://`
läuft und moderne Browser sie von einer `http://`-Seite blockieren. Alle
genannten Anbieter liefern HTTPS von sich aus.

Ohne Internet (oder per Doppelklick aus dem Dateisystem) bleibt alles außer dem
Onlinemodus nutzbar; das Spiel weist dann verständlich darauf hin.

## Reproduzierbare Partien

Im Setup lässt sich ein **Seed** eintragen. Gleicher Seed plus gleiche
Einstellungen ergeben denselben Spielverlauf — praktisch, um im Unterricht
mit mehreren Gruppen dieselbe Ausgangslage zu spielen.

> **Hinweis zur Umstellung auf den Onlinemodus:** Die drei Draft-Karten werden
> jetzt für alle Teams zu Beginn der Phase gezogen statt nacheinander — nur so
> können mehrere Menschen gleichzeitig draften. Inhaltlich ändert das nichts
> (`makeOffer` hing nie vom Team ab), es verschiebt aber die Position im
> Zufallsstrom. Seeds aus früheren Versionen ergeben deshalb einen anderen
> Verlauf als vorher; ab dieser Version sind sie wieder stabil.

## Lockstep-Prüfung

Weil der Onlinemodus darauf baut, dass alle Geräte identisch rechnen, prüft
[`tests/lockstep.html`](tests/lockstep.html) genau das: Zwölf Partien werden je
dreimal parallel durchgespielt (mit denselben Draft-Entscheidungen) und die
Rundenprüfsummen verglichen. Eine Gegenprobe mit einer einzeln geänderten
Entscheidung stellt sicher, dass der Test nicht trivial durchläuft.

Die Seite über den Entwicklungsserver aufrufen:

```bash
python3 .claude/devserver.py
```

Danach `http://localhost:8123/tests/lockstep.html` öffnen. Schlägt die Prüfung
fehl, ist irgendwo Zufall in die Spiellogik gelangt, der nicht aus `game.rng`
stammt — dann ist der Onlinemodus nicht mehr verlässlich.

## Sound

Standardmäßig werden alle Klänge über die WebAudio-API synthetisiert; es sind
keine Asset-Dateien nötig. Sollen echte Samples verwendet werden, die Dateien
nach `assets/audio/` legen und in `assets/audio/manifest.json` eintragen:

```json
{ "sounds": { "mutation": "mutation.wav", "catastrophe": "rumble.mp3" } }
```

Angemeldete Samples ersetzen den jeweiligen synthetisierten Klang; alle übrigen
bleiben synthetisch. Gültige Klangnamen stehen im Manifest.
