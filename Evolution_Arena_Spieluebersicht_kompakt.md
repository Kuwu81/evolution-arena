# 🧬 Evolution Arena — Kompakte Spielübersicht

**Roguelike-Multiplayer · Biologie (Evolution) · 2–6 Teams · 45 Min · browserbasiert**

---

## Lehrplananforderungen & Umsetzung im Spiel

Grundlage: NRW-Kernlehrplan Biologie G9 — Sek I (UV 8.4 „Mechanismen der
Evolution", Jg. 7/8) und Sek II (IF 6 „Evolution").

| Lehrplan-Konzept | Umsetzung im Spiel |
|---|---|
| **Variabilität** | Population = einzelne Individuen mit ungleich verteilten Merkmalen (sichtbarer Genpool) |
| **Mutation** (ungerichtet) | Draft: 3 Zufallskarten, wähle 1 → trifft 1 Individuum; man kann nicht designen (Anti-Lamarck) |
| **Rekombination** | automatisch bei Vermehrung: Nachkommen erben & mischen Elternmerkmale → Kombi-Effekte |
| **Überproduktion** | ergibt sich aus Wasserloch: es werden mehr geboren, als die knappe Nahrung ernährt |
| **Selektion** (biot./abiot.) | knappes Wasserloch + Umweltparameter sieben; passende Merkmale fressen zuerst |
| **Angepasstheit = Ergebnis** | dasselbe Merkmal ist je Umwelt Vorteil oder Nachteil; nicht steuerbar (Anti-Lamarck) |
| **Fortpflanzungserfolg / Fitness** | nur satte Tiere vermehren sich; Siegbedingung = größte Population |
| **Gendrift** (Sek II) | Ereigniskarte „Katastrophe" tötet unabhängig von Merkmalen |
| **Koevolution** (Sek II) | Fleischfresser ↔ Verteidigung als Wettrüsten zwischen Teams |
| **Isolation/Artbildung, Divergenz/Konvergenz** (Sek II) | Nischen, Aufspaltung, unabhängige Gleichentwicklung (Advanced-Pack) |

Hauptziel bleibt **Reflexion**: der Replay-Log macht „Warum X → Y?"
rekonstruierbar (siehe unten).

---

## Ziel / Siegbedingung
Kein Punktesammeln. **Wer am Ende die größte Population hat, gewinnt.**
Die Population ist ein *emergentes* Ergebnis von Anpassung + Fortpflanzungs-
erfolg – niemand kann sie direkt bauen. = Fitness (differentielle Reproduktion).

## Setup
Jedes Team = eine **Tierart** = mehrere **Individuen** (Tokens). Jedes
Individuum trägt eine Teilmenge der Merkmale → die Verteilung ist der
sichtbare **Genpool** (Merkmals-Prozente). Alle Teams teilen sich **ein
zu kleines Wasserloch**.

---

## Die Runde (10–12 Runden)

| # | Phase | Was passiert | Konzept |
|---|-------|--------------|---------|
| 0 | 🎴 Ereigniskarte | Zu Rundenbeginn aufgedeckt → verändert einen Umweltparameter für alle | Selektionsdruck wechselt |
| 1 | 🎲 Draft | 3 Zufallskarten → wähle 1 → als **Mutation** (trifft 1 Individuum, macht resilienter) ODER als **Nahrung** (füttert Tiere durch, Wachstum jetzt) | Mutation ungerichtet |
| 2 | Wasserloch-Feeding | Alle fressen gleichzeitig am knappen Vorrat; Merkmale entscheiden Reihenfolge/Erfolg; Fleischfresser greifen andere Teams an, Verteidigung kontert | Selektion, Konkurrenz, Koevolution |
| 3 | Selektion | Satte überleben, Hungrige sterben; Population 0 = Aussterben → neue Art draften | Selektion, Fortpflanzungserfolg |
| 4 | Vermehrung & Vererbung | Satte Eltern erzeugen Nachkommen, die Merkmale erben & mischen; mehr Nachwuchs als ernährbar → Überproduktion | Rekombination, Kombi-Effekte, Genpool-Verschiebung |

---

## Ereigniskarten (steuern die Umwelt)
Zu Beginn jeder Runde wird **eine Ereigniskarte** aufgedeckt. Sie verändert
einen Umweltparameter für alle Teams gleichzeitig → Selektionsdruck wechselt,
Draft-Strategien müssen angepasst werden.

| Ereigniskarte | Verändert | Effekt |
|---|---|---|
| ❄️ Kälteeinbruch / 🔥 Hitzewelle | 🌡️ Temperatur | verschiebt Wohlfühlfenster → Fell/Größe bzw. klein/Wärmeableitung gefragt |
| 🍂 Dürre / 🌱 Überfluss | 🍃 Nahrungsangebot | Wasserloch schrumpft/wächst → Effizienz vs. Wachstum |
| 🌋 Katastrophe (Vulkan/Seuche/Einschlag) | Gendrift | tötet Individuen **zufällig**, *unabhängig* von Merkmalen |

Temperatur- und Nahrungs-Events sind **gerichtet** (Merkmale zählen →
Selektion). Das Gendrift-Event ist **ungerichtet** (reiner Zufall) – diese
klare Trennung ist didaktisch zentral.

---

## Umweltparameter (Basis-Set)

| Parameter | Wirkung |
|---|---|
| 🌡️ Temperatur | Jede Art hat ein „Wohlfühlfenster"; Abstand zur Umwelttemperatur senkt Fressleistung. Fell/Größe → Kälte, Wärmeableitung/klein → Hitze. Dasselbe Merkmal ist mal Vorteil, mal Nachteil (Angepasstheit ist relativ). |
| 🍃 Nahrungsangebot | schwankt (Überfluss ↔ Dürre); bei Knappheit zählt Effizienz |
| ☠️ Räuberdruck | *emergent* – entsteht, wenn Teams Fleischfresser-Mutationen draften |

---

## Kernmechaniken

- **Genpool sichtbar:** Merkmale ungleich verteilt; Selektion + Vererbung
  verschieben die Prozente über die Runden → Evolution wird messbar.
- **Karten doppelt nutzbar (Mutation vs. Nahrung):** Mutation = Resilienz für
  später; Nahrung = Wachstum jetzt (gezieltes Durchfüttern eigener Träger).
- **Mutation lokal:** neues Merkmal startet bei 1 Individuum und muss sich
  erst durch Selektion durchsetzen.
- **Rekombination automatisch:** Verteilung & Kombis ergeben sich aus der
  Fortpflanzung der Überlebenden (keine eigene Draft-Entscheidung).
- **Seltenheit:** ⚪ Common (kleiner Effekt) · 🔵 Uncommon (stärker/mit
  Trade-off) · 🟣 Rare (doppelschneidig: großer Vorteil + Nachteil,
  z. B. Gigantismus, grelle Färbung = sexuelle Selektion).
- **Kombi-Effekte** nur über Vererbung (🧥+🐘 kältefest, 🏃+🎨 Lauerjäger).

---

## Traits (mögliche Auswahl)
🏃 Schnelligkeit · 🐘 Körpergröße · 🍽️ Effizienz · 🦴 Aasfresser ·
🛡️ Panzer · 🐾 Herde · 📢 Warnruf · 🎨 Tarnung · 🥩 Fleischfresser ·
🌙 Nachtaktiv · 🏝️ Isolation · 🐣 r-Strategie · 🛡️🐣 Brutpflege ·
🤝 Symbiose · 🎲 Neutrale Mutation

---

## Reflexion (Hauptziel) — Replay-Log „Warum X → Y?"
- Warum stieg „Fell" von 33 % auf 80 %? → Selektion + Vererbung
- Warum trug ein Tier plötzlich zwei Merkmale? → Rekombination bei Fortpflanzung
- Warum rettete Fell in Runde 4, schadete in Runde 7? → Angepasstheit ist relativ
- Warum brach das schnell gewachsene Team bei der Katastrophe ein? → nur
  Wachstum ohne Mutation = geringe Resilienz (Gendrift/Selektion)
- Die größte Population gewinnt – konntet ihr sie bauen? → Nein, sie ist
  Ergebnis von Variation, Selektion, Fortpflanzungserfolg (Anti-Lamarck)

---

**Skalierung:** Basis-Pack (Sek I, UV 8.4) · Advanced-Pack (Sek II, IF 6:
+ Gendrift, Fitness/Allele, Artbildung, Divergenz/Konvergenz).
