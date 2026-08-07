# 🧬 Evolution Arena

Browserbasiertes Roguelike-Lernspiel zur Evolutionsbiologie nach dem Konzept in
[`Evolution_Arena_Spieluebersicht_kompakt.md`](Evolution_Arena_Spieluebersicht_kompakt.md).
2–6 Teams, 8–12 Runden, Hotseat oder gegen KI-Arten.

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
  render/arena.js       Canvas: Wasserloch, Tokens, Partikel
  ui/*.js               HUD, Draft, Modals, Diagramme, Abschluss
  app.js                Bildschirme, Rundenablauf, Eingaben
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

## Reproduzierbare Partien

Im Setup lässt sich ein **Seed** eintragen. Gleicher Seed plus gleiche
Einstellungen ergeben denselben Spielverlauf — praktisch, um im Unterricht
mit mehreren Gruppen dieselbe Ausgangslage zu spielen.

## Sound

Standardmäßig werden alle Klänge über die WebAudio-API synthetisiert; es sind
keine Asset-Dateien nötig. Sollen echte Samples verwendet werden, die Dateien
nach `assets/audio/` legen und in `assets/audio/manifest.json` eintragen:

```json
{ "sounds": { "mutation": "mutation.wav", "catastrophe": "rumble.mp3" } }
```

Angemeldete Samples ersetzen den jeweiligen synthetisierten Klang; alle übrigen
bleiben synthetisch. Gültige Klangnamen stehen im Manifest.
