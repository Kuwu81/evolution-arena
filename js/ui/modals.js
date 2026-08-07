/* ============================================================
   Evolution Arena — Modale Dialoge, Regelwerk, Merkmals-Lexikon
   ============================================================ */
(function (global) {
  'use strict';
  const EA = global.EA;
  const U = EA.util;
  const { $, el } = U;
  const T = EA.traits;

  const root = () => $('#overlay-root');
  const stack = [];

  function open(opts) {
    const o = opts || {};
    const backdrop = el('div', { class: 'backdrop' });
    const modal = el('div', { class: 'modal' + (o.className ? ' ' + o.className : '') });

    const head = el('div', { class: 'modal__head' }, [
      el('div', {}, [
        el('h3', {}, o.title || ''),
        o.sub ? el('p', { class: 'sub' }, o.sub) : null
      ]),
      o.closable === false ? null : el('button', {
        class: 'btn btn--icon modal__close', title: 'Schließen', onclick: () => api.close()
      }, '✕')
    ]);

    const body = el('div', { class: 'modal__body' });
    if (o.body) {
      const list = Array.isArray(o.body) ? o.body : [o.body];
      for (const n of list) if (n) body.appendChild(typeof n === 'string' ? el('div', { html: n }) : n);
    }

    modal.appendChild(head);
    modal.appendChild(body);
    if (o.foot && o.foot.length) modal.appendChild(el('div', { class: 'modal__foot' }, o.foot));

    backdrop.appendChild(modal);
    root().appendChild(backdrop);
    EA.audio.duckMusic(true);

    const onKey = e => {
      if (e.key === 'Escape' && o.closable !== false) { e.preventDefault(); api.close(); }
      if (o.onKey) o.onKey(e);
    };
    document.addEventListener('keydown', onKey);

    if (o.closable !== false) {
      backdrop.addEventListener('mousedown', e => { if (e.target === backdrop) api.close(); });
    }

    const api = {
      backdrop, modal, body,
      setBody(nodes) {
        body.innerHTML = '';
        const list = Array.isArray(nodes) ? nodes : [nodes];
        for (const n of list) if (n) body.appendChild(n);
      },
      setFoot(nodes) {
        const old = modal.querySelector('.modal__foot');
        if (old) old.remove();
        if (nodes && nodes.length) modal.appendChild(el('div', { class: 'modal__foot' }, nodes));
      },
      close() {
        document.removeEventListener('keydown', onKey);
        const i = stack.indexOf(api);
        if (i >= 0) stack.splice(i, 1);
        backdrop.classList.add('is-out');
        setTimeout(() => backdrop.remove(), 240);
        if (!stack.length) EA.audio.duckMusic(false);
        if (o.onClose) o.onClose();
      }
    };
    stack.push(api);
    return api;
  }

  function closeAll() { while (stack.length) stack[stack.length - 1].close(); }

  /* ============================================================
     Regelwerk
     ============================================================ */
  function rules() {
    const doc = el('div', { class: 'doc' });
    doc.innerHTML = `
      <div>
        <h4>Ziel</h4>
        <p>Kein Punktesammeln. <b>Wer am Ende die größte Population hat, gewinnt.</b>
        Die Population lässt sich nicht direkt bauen – sie ist das <b>emergente Ergebnis</b> aus
        Anpassung und Fortpflanzungserfolg, also aus Fitness im biologischen Sinn
        (differentielle Reproduktion).</p>
      </div>

      <div>
        <h4>Aufbau</h4>
        <p>Jedes Team ist eine <b>Tierart</b> und besteht aus einzelnen <b>Individuen</b>.
        Jedes Individuum trägt eine Teilmenge der Merkmale – die Verteilung dieser Merkmale
        ist der sichtbare <b>Genpool</b>. Alle Teams teilen sich <b>ein zu kleines Wasserloch</b>.</p>
      </div>

      <div>
        <h4>Die Runde</h4>
        <table>
          <tr><th>Phase</th><th>Was passiert</th><th>Konzept</th></tr>
          <tr><td>🎴 Ereigniskarte</td><td>Verändert einen Umweltparameter für alle gleichzeitig.</td><td>Selektionsdruck wechselt</td></tr>
          <tr><td>🎲 Draft</td><td>3 Zufallskarten → wähle 1 → als <b>Mutation</b> (trifft 1 zufälliges Individuum) oder als <b>Nahrung</b> (füttert Träger durch).</td><td>Mutation ist ungerichtet</td></tr>
          <tr><td>💧 Wasserloch</td><td>Alle fressen gleichzeitig am knappen Vorrat. Merkmale entscheiden über Reihenfolge und Erfolg. Fleischfresser greifen andere Teams an, Verteidigung kontert.</td><td>Selektion, Konkurrenz, Koevolution</td></tr>
          <tr><td>☠️ Selektion</td><td>Satte überleben, Hungrige sterben. Population 0 = Aussterben → neue Art.</td><td>Selektion, Fortpflanzungserfolg</td></tr>
          <tr><td>🥚 Vermehrung</td><td>Satte Eltern erzeugen Nachkommen, die Merkmale erben und mischen. Es entstehen mehr, als ernährbar sind.</td><td>Rekombination, Überproduktion</td></tr>
        </table>
      </div>

      <div>
        <h4>Ereigniskarten</h4>
        <ul>
          <li><b>❄️ Kälte / 🔥 Hitze</b> verschieben das Wohlfühlfenster. Fell und Größe helfen gegen Kälte, Wärmeableitung und Nachtaktivität gegen Hitze.</li>
          <li><b>🍂 Dürre / 🌱 Überfluss</b> verändern das Nahrungsangebot. Bei Knappheit zählt Effizienz, im Überfluss zählt Wachstum.</li>
          <li><b>🌋 Katastrophen</b> töten Individuen <b>zufällig</b> – völlig unabhängig von jedem Merkmal. Das ist <b>Gendrift</b>, nicht Selektion. Diese Trennung ist der didaktische Kern.</li>
        </ul>
      </div>

      <div>
        <h4>Warum ihr nicht „anpassen“ könnt</h4>
        <ul>
          <li>Eine Mutation trifft <b>ein zufälliges Individuum</b> – nicht das, das sie bräuchte.</li>
          <li>Ein neues Merkmal startet bei <b>1 von n</b> und muss sich erst durch Selektion durchsetzen.</li>
          <li><b>Rekombination läuft automatisch</b>: Welche Merkmale zusammenkommen, entscheidet die Fortpflanzung, nicht ihr.</li>
          <li>Dasselbe Merkmal ist je nach Umwelt Vorteil <i>oder</i> Nachteil. <b>Angepasstheit ist relativ.</b></li>
        </ul>
      </div>

      <div>
        <h4>Seltenheit</h4>
        <ul>
          <li>⚪ <b>Common</b> – kleiner, verlässlicher Effekt.</li>
          <li>🔵 <b>Uncommon</b> – stärker, meist mit Trade-off.</li>
          <li>🟣 <b>Rare</b> – doppelschneidig: großer Vorteil und deutlicher Nachteil.</li>
        </ul>
      </div>

      <div>
        <h4>Steuerung</h4>
        <ul>
          <li><b>1 / 2 / 3</b> – Draft-Karte wählen · <b>M</b> Mutation · <b>N</b> Nahrung</li>
          <li><b>Leertaste</b> oder <b>Enter</b> – nächste Phase · <b>Esc</b> – Pause</li>
          <li><b>A</b> – Auto-Modus · <b>S</b> – Ton an/aus</li>
        </ul>
      </div>
    `;
    return open({ title: 'Regeln & Biologie', sub: 'Evolution Arena · Kernlehrplan Biologie NRW', body: doc, className: 'modal--wide' });
  }

  /* ============================================================
     Merkmals-Lexikon
     ============================================================ */
  function glossary(pack) {
    const wrap = el('div', { class: 'glossary' });
    const groups = ['common', 'uncommon', 'rare'];
    const deck = T.deckFor(pack || 'advanced');

    for (const r of groups) {
      const items = deck.filter(t => t.rarity === r);
      if (!items.length) continue;
      const rar = T.RARITY[r];
      wrap.appendChild(el('div', { class: 'glossary__group' }, [
        el('div', { class: 'glossary__legend', style: { '--rar': rar.color, color: rar.color } },
          rar.icon + ' ' + rar.label),
        ...items.map(t => el('div', { class: 'gloss-item' }, [
          el('span', { class: 'gloss-item__i' }, t.icon),
          el('div', {}, [
            el('div', { class: 'gloss-item__n' }, t.name),
            el('div', { class: 'gloss-item__d' }, t.desc),
            el('div', { class: 'card__stats' }, t.pills.map(p =>
              el('span', { class: 'stat-pill' + (p[1] === '+' ? ' stat-pill--plus' : (p[1] === '−' ? ' stat-pill--minus' : '')) }, p[0])
            ))
          ])
        ]))
      ]));
    }

    wrap.appendChild(el('div', { class: 'glossary__group' }, [
      el('div', { class: 'glossary__legend', style: { color: 'var(--violet)' } }, '✨ Kombi-Effekte (nur über Vererbung)'),
      ...T.COMBOS.map(c => el('div', { class: 'gloss-item' }, [
        el('span', { class: 'gloss-item__i' }, c.need.map(id => T.BY_ID[id].icon).join('')),
        el('div', {}, [
          el('div', { class: 'gloss-item__n' }, c.name),
          el('div', { class: 'gloss-item__d' }, c.desc + ' — entsteht, wenn ein Individuum ' +
            c.need.map(id => T.BY_ID[id].name).join(' und ') + ' gleichzeitig erbt.')
        ])
      ]))
    ]));

    return open({
      title: 'Merkmals-Lexikon',
      sub: 'Kein Merkmal ist per se gut – erst die Umwelt entscheidet.',
      body: wrap,
      className: 'modal--wide'
    });
  }

  EA.modal = { open, closeAll, rules, glossary, get stackSize() { return stack.length; } };
})(window);
