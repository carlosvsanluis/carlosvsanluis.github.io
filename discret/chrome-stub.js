/*
 * Demo only: a minimal stand-in for the browser extension APIs (storage, messages, i18n),
 * so the real Discret content script can run on a normal web page.
 */
(function () {
  'use strict';
  const data = { sync: {}, local: { masking: false }, session: { history: [] } };
  const changeListeners = [];
  const messageListeners = [];

  function pick(store, keys) {
    if (keys == null) return { ...store };
    if (typeof keys === 'string') keys = [keys];
    if (Array.isArray(keys)) return Object.fromEntries(keys.filter((k) => k in store).map((k) => [k, store[k]]));
    return Object.fromEntries(Object.entries(keys).map(([k, def]) => [k, k in store ? store[k] : def]));
  }

  function area(name) {
    const store = data[name];
    return {
      get: (keys) => Promise.resolve(structuredClone(pick(store, keys))),
      set: (obj) => {
        const changes = {};
        for (const [k, v] of Object.entries(obj)) {
          changes[k] = { oldValue: store[k], newValue: structuredClone(v) };
          store[k] = structuredClone(v);
        }
        changeListeners.forEach((fn) => fn(changes, name));
        return Promise.resolve();
      },
    };
  }

  const session = area('session');
  window.chrome = {
    storage: {
      sync: area('sync'),
      local: area('local'),
      session,
      onChanged: { addListener: (fn) => changeListeners.push(fn) },
    },
    runtime: {
      // The real background worker keeps the last 10 copies in memory; do the same here.
      sendMessage: (msg) => {
        if (msg && msg.type === 'discret:copied') {
          const history = data.session.history.filter((h) => h.value !== msg.value);
          history.unshift({ value: msg.value, kind: msg.kind || '', host: msg.host || '', at: Date.now() });
          session.set({ history: history.slice(0, 10) });
        }
        return Promise.resolve();
      },
      onMessage: { addListener: (fn) => messageListeners.push(fn) },
    },
    i18n: {
      getMessage: (key) => {
        const lang = document.documentElement.getAttribute('data-lang') === 'en' ? 'en' : 'fr';
        const table = (window.DISCRET_MESSAGES || {})[lang] || {};
        return table[key] || '';
      },
    },
  };
})();
