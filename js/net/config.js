/* ============================================================
   Evolution Arena — Netzwerk-Konfiguration
   Zugangsdaten des Realtime-Dienstes (Supabase).

   Der Publishable Key ist ein öffentlicher Client-Schlüssel – er darf im
   Browser stehen. Wer ihn trotzdem nicht ins Repository legen will,
   lässt die Felder leer: das Spiel fragt sie dann einmalig ab und
   merkt sie sich im localStorage des jeweiligen Geräts.

   Supabase hat die alten anon-Keys (JWT, „eyJhbGciOi…“) durch Keys der
   Form „sb_publishable_…“ abgelöst. Beide funktionieren an dieser
   Stelle unverändert; neue Projekte bekommen nur noch die neue Form.

   Reihenfolge der Auswertung (erste Fundstelle gewinnt):
     1. URL-Parameter  ?sb=<projekt-url>&key=<publishable-key>
     2. localStorage   (über den Dialog „Verbindung einrichten“)
     3. die Werte hier
   ============================================================ */
(function (global) {
  'use strict';
  const EA = global.EA = global.EA || {};
  const store = EA.util.store;

  const BUILTIN = {
    url: 'https://yxmsqdmckxvivivwseyw.supabase.co',            // z. B. 'https://abcdefghijklm.supabase.co'
    key: 'sb_publishable_YyGhMclMGbrsUCc1b6wTDw_3eIZRJpe'       // z. B. 'sb_publishable_…'
  };

  /** Nimmt beide Feldnamen an – ältere Konfigurationen hießen anonKey. */
  const normalize = c => c && (c.key || c.anonKey)
    ? { url: String(c.url || '').trim(), key: String(c.key || c.anonKey).trim() }
    : null;

  function fromQuery() {
    try {
      const q = new URLSearchParams(global.location.search);
      const url = q.get('sb'), key = q.get('key');
      return url && key ? { url: url.trim(), key: key.trim() } : null;
    } catch (e) { return null; }
  }

  function read() {
    const q = fromQuery();
    if (q) return q;
    const saved = normalize(store.get('net.config', null));
    if (saved && saved.url && saved.key) return saved;
    return normalize(BUILTIN) || { url: '', key: '' };
  }

  EA.netConfig = {
    get() { return read(); },
    save(cfg) { store.set('net.config', normalize(cfg)); },
    clear() { store.set('net.config', null); },
    /** Liegen überhaupt Zugangsdaten vor? */
    isReady() {
      const c = read();
      return !!(c.url && c.key);
    },
    /** Ist das SDK geladen? Ohne Internet fehlt es. */
    hasSdk() { return !!(global.supabase && global.supabase.createClient); }
  };
})(window);
