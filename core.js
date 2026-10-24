// Core model and merge logic. Works in browser and Node.
(function (root) {
  const VERSION = 1;

  function newId() {
    return (root.crypto && root.crypto.randomUUID)
      ? root.crypto.randomUUID()
      : 'id-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
  }

  function emptyStore() { return { version: VERSION, items: {} }; }

  // Add an item. "list" says which page it belongs to: "work" or "recurring".
  // fields can hold: list, lastPerformed ("YYYY-MM-DD"), done, id.
  function addItem(store, title, fields = {}, now = new Date().toISOString()) {
    const id = fields.id || newId();
    store.items[id] = {
      list: 'work', lastPerformed: null, done: false,
      category: null, priority: null, dueDate: null, sprint: false, estimateMinutes: null, context: null, priRaw: null,
      ...fields,
      id, title,
      // Future fields: scope, project, type, plannedAt, recurrence, status, priority
      createdAt: now, updatedAt: now, deleted: false,
    };
    return id;
  }

  function updateItem(store, id, patch, now = new Date().toISOString()) {
    const it = store.items[id];
    if (!it) throw new Error('No item ' + id);
    Object.assign(it, patch, { id, updatedAt: now });
  }

  // Soft delete: the marker syncs to other devices.
  function deleteItem(store, id, now = new Date().toISOString()) {
    updateItem(store, id, { deleted: true }, now);
  }

  function activeItems(store) {
    return Object.values(store.items).filter(i => !i.deleted);
  }

  // Merge two stores. Per item, the newest updatedAt wins.
  // Ties go to the deleted marker, then to the larger JSON string, so the result is the same on every device.
  function merge(a, b) {
    const out = emptyStore();
    const ids = new Set([...Object.keys(a.items), ...Object.keys(b.items)]);
    for (const id of ids) {
      const x = a.items[id], y = b.items[id];
      if (!x || !y) { out.items[id] = { ...(x || y) }; continue; }
      let w;
      if (x.updatedAt !== y.updatedAt) w = x.updatedAt > y.updatedAt ? x : y;
      else if (x.deleted !== y.deleted) w = x.deleted ? x : y;
      else w = JSON.stringify(x) >= JSON.stringify(y) ? x : y;
      out.items[id] = { ...w };
    }
    return out;
  }

  // Categories for PrivTODO. Edit this list to add or rename. Items keep the text they were saved with.
  const CATEGORIES = ['Arianne', 'Digital', 'Hus', 'Kids', 'Org', 'Plan', 'Self', 'Shop', 'Øko'];
  const PRIORITIES = { 1: 'Høy', 2: 'Middels', 3: 'Lav' };

  const RECURRING_DEFAULTS = [
    'Laptop desktop', 'Notepad rydding', 'Leseliste på epost', 'Se gjennom bilder på tlf',
    'Appcleanup', 'Chrome tabs', 'Edge tabs', 'Onenote rydding', 'Mailcleanup',
    'Gmail', 'Copilot chats', 'Gemini chats',
  ];
  const slug = t => t.toLowerCase().replace(/[^a-z0-9æøå]+/g, '-');

  // Add the default recurring items if missing. IDs are fixed, so all devices make the same items.
  // The old timestamp means any real edit wins in a merge.
  function seedRecurring(store) {
    for (const t of RECURRING_DEFAULTS) {
      const id = 'rec-' + slug(t);
      if (!store.items[id]) addItem(store, t, { id, list: 'recurring' }, '1970-01-01T00:00:00.000Z');
    }
  }

  // Items for the "Recurring" page: [sheet id, days between, task, last done].
  const INTERVAL_DEFAULTS = [
    [1, 30, 'Fanelukking alle PC-er + mobil Chrome og Safari', '2022-11-05'],
    [2, 30, 'Få notepad/papirtodos inn her', '2026-01-07'],
    [3, 30, 'Vurdere abonnement + Altibox innhold', '2025-11-17'],
    [4, 45, 'Regnskap update + budsjettpart', '2025-11-28'],
    [5, 30, 'Gjennomgå pri på alle TODOs', '2026-01-08'],
    [6, 30, 'Rydde gmail', '2026-03-10'],
    [7, 60, 'Rydde mobil', '2025-11-04'],
    [10, 90, 'Gjennomgå Done TODOs og 5s', '2025-11-18'],
    [12, 75, 'Klippe håret', '2026-06-20'],
    [14, 120, 'Rydde jobb-pc og mail', '2025-10-18'],
    [18, 45, 'RS-tracker update', '2026-03-10'],
    [21, 180, 'Gjennomgå bookmarks', '2025-07-02'],
    [22, 365, 'Download barnehagebilder fra appen', '2025-05-30'],
    [23, 180, 'Behandling/beskyttelse av sofa', '2025-08-30'],
    [24, 180, 'Smøre garasjeport', '2026-08-25'],
    [25, 350, 'Bestille Flexit Nordic S4 100331', '2026-09-03'],
  ];
  function seedInterval(store) {
    for (const [n, days, t, last] of INTERVAL_DEFAULTS) {
      const id = 'int-' + n;
      if (!store.items[id]) addItem(store, t, { id, list: 'interval', intervalDays: days, lastPerformed: last }, '1970-01-01T00:00:00.000Z');
    }
  }

  // Watchlist. Source is the main service. alsoOn holds other services. who: kids | me | both.
  const SOURCES = ['Netflix', 'Viaplay', 'Disney', 'NRK', 'TV2'];
  const WHO = { kids: 'Barn', me: 'Meg', both: 'Sammen' };
  const WATCH_DEFAULTS = [
    ['Sauen Shaun: Filmen', ['Netflix']],
    ['Kikis budservice', ['Netflix']],
    ['Knerten', ['Viaplay', 'TV2']],
    ['Kutoppen', ['TV2', 'Viaplay']],
    ['Folk og røvere i Kardemomme by', ['TV2']],
    ['Dyrene i Hakkebakkeskogen', ['NRK', 'Viaplay', 'TV2']],
    ['Gubben og Katten', ['Viaplay', 'TV2']],
    ['Hokus Pokus Albert Åberg', ['Viaplay', 'TV2']],
    ['Bamse og tyvenes by', ['Viaplay']],
    ['Bamse og heksens datter', ['Viaplay']],
    ['Biler (Cars)', ['Disney']],
    ['Solan og Ludvig: Jul i Flåklypa', ['Viaplay', 'TV2']],
    ['Solan og Ludvig: Herfra til Flåklypa', ['Viaplay', 'TV2']],
    ["Småkryp (A Bug's Life)", ['Disney']],
    ['Paddington', ['Viaplay']],
    ['Monsters, Inc.', ['Disney']],
    ['Syng (Sing)', ['Viaplay', 'Netflix']],
  ];
  // Fixed IDs and an old timestamp: all devices make the same items, and real edits win in a merge.
  function seedWatch(store) {
    WATCH_DEFAULTS.forEach(([t, s], i) => {
      const id = 'watch-' + (i + 1);
      if (!store.items[id]) addItem(store, t, { id, list: 'watch', source: s[0], alsoOn: s.slice(1), who: 'kids', order: i + 1 }, '1970-01-01T00:00:00.000Z');
    });
  }

  function parse(text) {
    const s = JSON.parse(text);
    if (!s || typeof s.items !== 'object') throw new Error('Not a valid todo file');
    return { version: s.version || VERSION, items: s.items };
  }

  const api = { VERSION, newId, emptyStore, addItem, updateItem, deleteItem, activeItems, merge, parse, seedRecurring, seedInterval, seedWatch, SOURCES, WHO, WATCH_DEFAULTS, INTERVAL_DEFAULTS, RECURRING_DEFAULTS, CATEGORIES, PRIORITIES };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TodoCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
