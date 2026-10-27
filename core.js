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
      if (!store.items[id]) addItem(store, t, { id, list: 'recurring', intervalDays: 30 }, '1970-01-01T00:00:00.000Z');
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

  const BACKLOG_DEFAULTS = [
    "Annet - Skaffe tattovering",
    "Lean - Cleanout gamle PC-er",
    "Lean - Fikse båten",
    "Lean - Gamle stasjonær-Pcen hvordan dispose",
    "Lean - Matassets, gameassets m/360 og gameplan",
    "Lean - Musikkprosjekt i gammel TODO",
    "Lean - Rydde ut av rommet i Asker",
    "Lean - Selge pogs",
    "Lean - Steam market rydd",
    "Lean - Tømme ut av gamle PC-er + dispose",
    "Lean - Videre på Bucketlist - Globalcastaway",
    "Liste - Playlist xbox og pc | howlongtobeat.com",
    "Org - OneNote med størrelser så det går lett å handle",
    "Self - Begynne Diary",
    "Self - Garmin setup",
    "Self - Hailou AI + andre teste",
    "Self - Karrieretenking",
    "Self - Webinar fra Eline - https://adhdveilederen.no/webinar-utenfor-boksen/",
    "Thought - Focusplan og kandidatliste",
    "Thought - Hudanalyse",
    "Thought - Modell for kvantifisering av lykke",
    "Thought - Research hairloss (hairloss show på youtube)",
    "Thought - Søndags180",
    "Øko - Vurdere ekstra pensjonssparing",
    "TrueTrim fylle ut videre",
    "Fikse plastelina",
    "Fiskeruta",
    "Finne ut hva jeg skal gjøre med pensjon meg og A. Flytte DNB. Andre leverandører? (Nordnet?). Egen sparing etter hvert?",
    "Dressrensing",
    "Undermapper gmail gjennomgang + reorganize numbers",
    "Shop - Shoe cleaning kit /Bag",
    "Måle opp 3.etasje",
    "Bytte BankID-passord",
    "Urtehage",
    "Kjøpe vannslange/slangevogn ute",
    "Kjøpe TV etter å finne ut hvor",
    "Microsoft TODO",
    "Beredskapsstockup",
    "Gmail til kidsa - https://support.google.com/families/answer/7103338?hl=no",
    "Oliver Blodprøve Ullevål?",
    "Fotbehandling fra A sin instavideo",
    "Google Keep/andre",
    "Kjøpe peistilbehør",
    "Slipshenger",
    "Garasje Snekker / ChatGPT / pappa om garasjeloft",
    "Asker \"mottak\"",
    "Self - Ame-pure roller",
    "Ikea vitrineskapet til oppe",
    "Hedgehog adapter",
    "Anti-se-inn greie til vinduene nede",
    "1080-fix",
    "Wifi garasjeport",
    "Bytte til skytelpass",
    "Lage personlig / familiens årshjul - APP?",
    "Spotify ryddeprosjekt videre plan",
    "Finne bodløsning oppe/under trapp",
    "Lenovo vantage test",
    "Koble strøm ordentlig på kontoret",
    "Notes to make: Ferieregnskap over tid, barnevekt/høyde, notater og reminders hvordan er de",
    "Ta av tilhengerfeste på CX-5",
  ];
  // Fixed IDs and an old timestamp: all devices make the same items, and real edits win in a merge.
  // createdAt grows by one second per line, so the file order stays.
  function seedBacklog(store) {
    BACKLOG_DEFAULTS.forEach((t, i) => {
      const id = 'backlog-' + (i + 1);
      if (!store.items[id]) {
        addItem(store, t, { id, list: 'backlog' }, '1970-01-01T00:00:00.000Z');
        store.items[id].createdAt = new Date(Date.UTC(2000, 0, 1) + i * 1000).toISOString();
      }
    });
  }

  const TOGLESING_DEFAULTS = [
    "https://www.youtube.com/watch?v=N-B-kD28P2I",
    "https://learn.microsoft.com/en-us/microsoft-365/admin/manage/agent-registry?view=o365-worldwide",
    "https://www.google.com/search?q=microsoft+agent+framework+relation+to+entra&sca_esv=c952a6c0e2fbf0c6&sxsrf=ANbL-n45Qu9ASRAbLFgqF5D6cvYgaR7XpA%3A1771324032154&ei=gEKUaYSNCeipwPAPntya-AE&biw=1422&bih=739&ved=0ahUKEwiEzd-dqOCSAxXoFBAIHR6uBh8Q4dUDCBI&uact=5&oq=microsoft+agent+framework+relation+to+entra&gs_lp=Egxnd3Mtd2l6LXNlcnAiK21pY3Jvc29mdCBhZ2VudCBmcmFtZXdvcmsgcmVsYXRpb24gdG8gZW50cmEyBRAhGKABMgUQIRigATIEECEYFTIFECEYnwUyBRAhGJ8FMgUQIRifBTIFECEYnwUyBRAhGJ8FMgUQIRifBTIFECEYnwVI4BlQkwFYlRhwAXgBkAEAmAGBAqAB0RWqAQYyLjEyLjS4AQPIAQD4AQGYAhOgApEWwgIKEAAYsAMY1gQYR8ICDRAAGIAEGLADGEMYigXCAggQABiABBjLAcICBRAAGIAEwgIGEAAYFhgewgIIEAAYgAQYogTCAgUQABjvBcICBxAhGKABGAqYAwCIBgGQBgqSBwYyLjEzLjSgB8hpsgcGMS4xMy40uAeNFsIHBjMuMTQuMsgHJYAIAA&sclient=gws-wiz-serp",
    "https://openid.net/wg/sharedsignals/",
    "https://www.cyberark.com/resources/solution-briefs/cyberark-threat-detection-and-response-solution-brief",
    "https://www.trevonix.com/blogs/continuous-adaptive-trust-is-the-new-mfa",
    "https://docs.sailpoint.com/pdf/en/e-book/Modern%20Identity%20Security%20For%20Dummies,%20SailPoint%20Special%20Edition.pdf",
    "https://learn.microsoft.com/en-us/microsoft-365/admin/manage/agent-registry?view=o365-worldwide&tabs=Microsoft-Entra-admin-center",
    "https://www.google.com/search?q=caep+in+sailpoint+iiq&sca_esv=ffa6fe38ad5a2295&sxsrf=ANbL-n5_aHdmq9X-TyG6hknc2khtTEp7aQ%3A1770893843705&ei=E7KNaYrqKsOpwPAPwKyG-AU&biw=1422&bih=739&ved=0ahUKEwjKv_TT5dOSAxXDFBAIHUCWAV8Q4dUDCBI&uact=5&oq=caep+in+sailpoint+iiq&gs_lp=Egxnd3Mtd2l6LXNlcnAiFWNhZXAgaW4gc2FpbHBvaW50IGlpcTIFECEYoAEyBRAhGKABMgUQIRigAUisB1DxA1jQBnABeAGQAQCYAXagAbwCqgEDMS4yuAEDyAEA-AEBmAIEoALJAsICChAAGLADGNYEGEfCAgUQABjvBcICCBAAGIAEGKIEmAMAiAYBkAYEkgcDMS4zoAe9CLIHAzAuM7gHxgLCBwMwLjTIBweACAA&sclient=gws-wiz-serp",
    "https://www.sailpoint.com/products/agent-identity-security",
    "https://www.google.com/search?q=ephemeral+credentials+only+on+workload&oq=ephemeral+credentials+only+on+workload&gs_lcrp=EgZjaHJvbWUyBggAEEUYOTIJCAEQIRgKGKABMgkIAhAhGAoYoAEyBwgDECEYjwLSAQg3MTY0ajBqN6gCALACAA&sourceid=chrome&ie=UTF-8",
    "https://www.kuppingercole.com/reprints/a850b361aa3fe375f02388c125ec8816",
    "https://dev.to/willvelida/understanding-microsoft-entra-agent-id-4972?utm_source=substack&utm_medium=email",
    "https://www.google.com/search?q=ai+agents+identity+management+provide+value&sca_esv=df3bf9aa0d357044&sxsrf=ANbL-n7WGlScKojaYo0yEehLwYMGJUNrgA%3A1773779258592&ei=Orm5aavvI72D1fIP1dbU0Q8&biw=1422&bih=739&ved=0ahUKEwir9PjU4qeTAxW9QVUIHVUrNfoQ4dUDCBA&uact=5&oq=ai+agents+identity+management+provide+value&gs_lp=Egxnd3Mtd2l6LXNlcnAiK2FpIGFnZW50cyBpZGVudGl0eSBtYW5hZ2VtZW50IHByb3ZpZGUgdmFsdWUyCBAAGIAEGKIEMggQABiABBiiBEjLIFDcCFj1GXABeAGQAQCYAZkBoAGrB6oBAzUuNLgBA8gBAPgBAZgCCKAChwbCAgoQABiwAxjWBBhHwgIHECMYsAIYJ8ICChAhGKABGMMEGAqYAwCIBgGQBgiSBwM0LjSgB4gqsgcDMy40uAeCBsIHBTMuNC4xyAcLgAgA&sclient=gws-wiz-serp",
    "https://www.google.com/search?q=cnapp+microsoft+real+time+behavioural+monitoring&oq=cnapp+microsoft+real+time+behavioural+monitoring&gs_lcrp=EgZjaHJvbWUyBggAEEUYOTIJCAEQIRgKGKABMgkIAhAhGAoYoAHSAQkxMDUxNGowajeoAgCwAgA&sourceid=chrome&ie=UTF-8",
    "https://www.google.com/search?q=CIEM+vs+cnapp+microsoft+defender+azure&sca_esv=231828c7d9589dfc&biw=1422&bih=739&sxsrf=ANbL-n6A4KJ-X0T5yALchHk_ydTO_RCGSA%3A1773738980318&ei=5Bu5aauOE5iTwPAPlu-HwQk&ved=0ahUKEwirkOLOzKaTAxWYCRAIHZb3IZgQ4dUDCBA&uact=5&oq=CIEM+vs+cnapp+microsoft+defender+azure&gs_lp=Egxnd3Mtd2l6LXNlcnAiJkNJRU0gdnMgY25hcHAgbWljcm9zb2Z0IGRlZmVuZGVyIGF6dXJlMgcQIRigARgKMgcQIRigARgKSJEmULIDWKYlcAF4AZABAJgBd6AB2RGqAQQyMS40uAEDyAEA-AEBmAIaoAKnEsICChAAGLADGNYEGEfCAgYQABgNGB7CAgYQABgWGB7CAgUQABjvBcICCBAAGIAEGKIEwgIEECEYFZgDAIgGAZAGBJIHBDIyLjSgB6FgsgcEMjEuNLgHpRLCBwUxMS4xNcgHHoAIAA&sclient=gws-wiz-serp",
    "https://www.zscaler.com/blogs/product-insights/session-recording-ushered-access-zscaler-privileged-remote-access-pra",
    "https://www.google.com/search?q=teleport+machine+accounts&oq=teleport+machine+accounts&gs_lcrp=EgZjaHJvbWUyBggAEEUYOTIHCAEQABjvBTIKCAIQABiABBiiBDIHCAMQABjvBTIKCAQQABiABBiiBDIKCAUQABiABBiiBNIBCTE1MzE4ajBqN6gCALACAA&sourceid=chrome&ie=UTF-8",
    "https://www.google.com/search?q=privileged+access+transitioning+to+more+than+just+pasm&oq=privileged+access+transitioning+to+more+than+just+pasm&gs_lcrp=EgZjaHJvbWUyBggAEEUYOTIHCAEQIRigATIHCAIQIRigATIHCAMQIRigATIHCAQQIRigATIHCAUQIRigATIHCAYQIRiPAtIBCTE1NzE5ajBqN6gCALACAA&sourceid=chrome&ie=UTF-8",
    "https://www.google.com/search?q=dynamisk+pam&oq=dynamisk+pam&gs_lcrp=EgZjaHJvbWUyBggAEEUYOTIHCAEQABiABDIHCAIQABiABDIHCAMQABiABDIHCAQQABiABDIHCAUQABiABDIHCAYQABiABDIHCAcQABiABDIHCAgQABiABDIHCAkQABiABNIBCDE2MTNqMGo3qAIAsAIA&sourceid=chrome&ie=UTF-8",
    "https://www.gartner.com/myhomepage?ref=header-nav",
    "https://goteleport.com/use-cases/just-in-time-access-requests/",
    "https://learn.microsoft.com/en-us/security/privileged-access-workstations/privileged-access-security-levels",
    "https://www.gartner.com/document-reader/document/7500453?ref=askgartner-smart",
    "https://www.youtube.com/watch?v=rBRwT0E0jQA",
    "https://aws.amazon.com/bedrock/agents/",
    "https://www.google.com/search?q=SPIFFI+ai+identity&oq=SPIFFI+ai+identity&gs_lcrp=EgZjaHJvbWUyBggAEEUYOTIJCAEQIRgKGKABMgkIAhAhGAoYoAHSAQkxMDUwOWowajeoAgCwAgA&sourceid=chrome&ie=UTF-8",
    "https://www.google.com/search?q=identity+orchestraion+platform&oq=identity+orchestraion+platform&gs_lcrp=EgZjaHJvbWUyBggAEEUYOdIBCDQ1MTJqMGo3qAIAsAIA&sourceid=chrome&ie=UTF-8",
    "https://www.blueprism.com/resources/blog/agentic-ai-vs-rpa-vs-ai-agents-comparing/",
    "https://www.ibm.com/think/topics/single-pane-of-glass",
    "https://www.google.com/search?q=sailpoint+iiq+mcp+server&oq=sailpoint+iiq+mcp+server&gs_lcrp=EgZjaHJvbWUqCQgAEAAYExiABDIJCAAQABgTGIAEMgoIARAAGIAEGKIEMgcIAhAAGO8FMgcIAxAAGO8FMgoIBBAAGIAEGKIEMgcIBRAAGO8F0gEINDU1MGowajeoAgCwAgA&sourceid=chrome&ie=UTF-8",
    "https://mcpmarket.com/tools/skills/sailpoint-iiq-entitlement-review",
    "https://www.sailpoint.com/identity-library/accelerate-identity-led-threat-response",
    "https://curity.io/",
    "https://www.google.com/search?q=opa+authorization&oq=opa+auth&gs_lcrp=EgZjaHJvbWUqBwgBEAAYgAQyBggAEEUYOTIHCAEQABiABDIICAIQABgWGB4yCAgDEAAYFhgeMggIBBAAGBYYHjIICAUQABgWGB4yCAgGEAAYFhgeMggIBxAAGBYYHjIICAgQABgWGB4yCAgJEAAYFhge0gEINjEwMGowajeoAgCwAgA&sourceid=chrome&ie=UTF-8",
    "https://www.google.com/search?q=orchestration+platform+for+nhi+iga+pam+pbac+am+ciem&oq=orchestration+platform+for+nhi+iga+pam+pbac+am+ciem&gs_lcrp=EgZjaHJvbWUyBggAEEUYOTIHCAEQIRigATIHCAIQIRigATIHCAMQIRiPAjIHCAQQIRiPAtIBCTExMDQyajBqN6gCALACAA&sourceid=chrome&ie=UTF-8",
    "Google I/O '26 Keynote",
  ];
  // Reading links for WorkTODO. Same fixed-ID rule as the backlog: no copies, real edits win.
  function seedToglesing(store) {
    TOGLESING_DEFAULTS.forEach((t, i) => {
      const id = 'toglesing-' + (i + 1);
      if (!store.items[id]) {
        addItem(store, t, { id, list: 'work' }, '1970-01-01T00:00:00.000Z');
        store.items[id].createdAt = new Date(Date.UTC(2000, 0, 1) + i * 1000).toISOString();
      }
    });
  }

  function parse(text) {
    const s = JSON.parse(text);
    if (!s || typeof s.items !== 'object') throw new Error('Not a valid todo file');
    return { version: s.version || VERSION, items: s.items };
  }

  const api = { VERSION, newId, emptyStore, addItem, updateItem, deleteItem, activeItems, merge, parse, seedRecurring, seedInterval, seedWatch, seedBacklog, seedToglesing, TOGLESING_DEFAULTS, BACKLOG_DEFAULTS, SOURCES, WHO, WATCH_DEFAULTS, INTERVAL_DEFAULTS, RECURRING_DEFAULTS, CATEGORIES, PRIORITIES };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TodoCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
