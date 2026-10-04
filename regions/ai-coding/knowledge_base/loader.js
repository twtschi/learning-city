/* Knowledge-base loader, shared by the city home page and the AI Coding region.
 *
 * Load order on a page:   loader.js  ->  web/catalog.js  ->  (page script)
 * The catalog is small (titles, weeks, ids). Note bodies live in web/notes/<id>.js and are
 * fetched on demand by injecting a <script> tag, which works on file:// where fetch() does not.
 * Everything here is data-driven: nothing in the UI names a specific note. */
(function () {
  const LC = (window.LC = window.LC || {});
  const here = document.currentScript && document.currentScript.src;
  LC.catalog = null;
  LC.notes = {};
  LC.webBase = here ? new URL('web/', here).href : 'web/';

  LC.registerCatalog = (catalog) => { LC.catalog = catalog; };
  LC.defineNote = (note) => { LC.notes[note.id] = note; };
  LC.figureUrl = (rel) => LC.webBase + rel;

  const pending = {};
  LC.loadNote = (id) => {
    if (LC.notes[id]) return Promise.resolve(LC.notes[id]);
    if (pending[id]) return pending[id];
    const entry = LC.catalog && LC.catalog.notes.find((n) => n.id === id);
    if (!entry) return Promise.reject(new Error(`unknown note: ${id}`));
    pending[id] = new Promise((resolve, reject) => {
      const tag = document.createElement('script');
      tag.src = LC.webBase + entry.file;
      tag.onload = () => (LC.notes[id] ? resolve(LC.notes[id]) : reject(new Error(`note file did not define ${id}`)));
      tag.onerror = () => { delete pending[id]; reject(new Error(`failed to load ${entry.file}`)); };
      document.head.appendChild(tag);
    });
    return pending[id];
  };

  /* Notes that belong to a week, or hang under a lesson, straight from the catalog. */
  LC.notesWhere = (predicate) => ((LC.catalog && LC.catalog.notes) || []).filter(predicate);
})();
