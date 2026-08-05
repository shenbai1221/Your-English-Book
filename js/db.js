/* IndexedDB 封装：掌握进度与自定义词本存储 */
(function () {
  'use strict';
  const DB_NAME = 'paper-vocab';
  const DB_VERSION = 2;
  const MASTERY = 'mastery';
  const CUSTOM_BOOKS = 'customBooks';
  let dbPromise = null;

  function open() {
    if (!dbPromise) {
      dbPromise = new Promise((resolve, reject) => {
        let req;
        try {
          req = indexedDB.open(DB_NAME, DB_VERSION);
        } catch (err) {
          reject(err);
          return;
        }
        req.onupgradeneeded = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains(MASTERY)) {
            db.createObjectStore(MASTERY, { keyPath: 'id' });
          }
          if (!db.objectStoreNames.contains(CUSTOM_BOOKS)) {
            db.createObjectStore(CUSTOM_BOOKS, { keyPath: 'id' });
          }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error || new Error('IndexedDB 打开失败'));
        req.onblocked = () => reject(new Error('IndexedDB 被阻塞'));
      });
    }
    return dbPromise;
  }

  function tx(store, mode, work) {
    return open().then((db) => new Promise((resolve, reject) => {
      try {
        const t = db.transaction(store, mode);
        const s = t.objectStore(store);
        const result = work(s);
        t.oncomplete = () => {
          resolve(result && result.result !== undefined ? result.result : result);
        };
        t.onerror = () => reject(t.error);
        t.onabort = () => reject(t.error);
      } catch (err) {
        reject(err);
      }
    }));
  }

  window.VocabDB = {
    get: (id) => tx(MASTERY, 'readonly', (s) => s.get(id)),
    put: (rec) => tx(MASTERY, 'readwrite', (s) => { s.put(rec); }),
    all: () => tx(MASTERY, 'readonly', (s) => s.getAll()),
    clear: () => tx(MASTERY, 'readwrite', (s) => { s.clear(); }),
    getBook: (id) => tx(CUSTOM_BOOKS, 'readonly', (s) => s.get(id)),
    putBook: (rec) => tx(CUSTOM_BOOKS, 'readwrite', (s) => { s.put(rec); }),
    allBooks: () => tx(CUSTOM_BOOKS, 'readonly', (s) => s.getAll()),
    deleteBook: (id) => tx(CUSTOM_BOOKS, 'readwrite', (s) => { s.delete(id); })
  };
})();
