/*
 * Discret: content script.
 * Marks personal data on the page, blurs it while masking is on, and adds one-click copy.
 * It only adds data-* attributes and its own overlay elements: it never rewrites the page's
 * DOM structure, so React-based apps such as Dynamics 365 keep working.
 */
(() => {
  'use strict';
  if (window.__discretLoaded) return;
  window.__discretLoaded = true;

  const D = globalThis.DiscretDetect;
  const t = (key) => chrome.i18n.getMessage(key) || key;
  const HOST = location.hostname;

  const DEFAULTS = {
    patterns: { email: true, phone: true, iban: true, card: true, nir: true },
    blur: 6,
    altClickCopy: true,
    maskSelectors: {}, // { hostname: [css selectors] } added by the user
  };

  // Best-effort selectors for sensitive fields in model-driven apps (forms and grids),
  // by logical name. Text patterns catch whatever these miss.
  const DYNAMICS_FIELDS = ['emailaddress', 'telephone', 'mobilephone', 'fax', 'address1_', 'address2_', 'address3_',
    'birthdate', 'governmentid', 'familystatuscode', 'spousesname', 'annualincome'];
  const DYNAMICS_SELECTORS = DYNAMICS_FIELDS.flatMap((f) => [`[data-id^="${f}"]`, `[col-id^="${f}"]`]);
  const isDynamics = /(^|\.)dynamics\.com$/.test(HOST) || document.documentElement.hasAttribute('data-discret-demo');

  const ATTR_HIT = 'data-discret-mask';
  const ATTR_SEL = 'data-discret-sel';
  const ATTR_UI = 'data-discret-ui';
  const SKIP = 'script,style,noscript,template,svg,[data-discret-ui]';

  let settings = structuredClone(DEFAULTS);
  let masking = false;

  // ---------- marking ----------

  function hasHit(text) {
    return D.findAll(text, settings.patterns).length > 0;
  }

  // An element is marked when its own text (not its descendants') holds personal data, so a
  // value never blurs a whole section. Page-level containers are never marked.
  const CONTAINERS = new Set(['BODY', 'HTML', 'MAIN', 'FORM', 'TABLE', 'TBODY', 'THEAD', 'TR', 'UL', 'OL']);

  function ownTextHit(el) {
    let text = '';
    for (const c of el.childNodes) if (c.nodeType === Node.TEXT_NODE) text += c.data;
    return text.trim().length >= 6 && hasHit(text);
  }

  function markText(textNode) {
    const el = textNode.parentElement;
    if (!el || CONTAINERS.has(el.tagName) || el.closest(SKIP)) return;
    if (ownTextHit(el)) el.setAttribute(ATTR_HIT, '');
    else el.removeAttribute(ATTR_HIT);
    if (masking) hideTitles(el);
  }

  function markField(el) {
    if (el.type === 'password' || el.closest(SKIP)) return;
    if (hasHit(el.value)) el.setAttribute(ATTR_HIT, '');
    else el.removeAttribute(ATTR_HIT);
  }

  function scan(root) {
    if (root.nodeType === Node.TEXT_NODE) return markText(root);
    if (root.nodeType !== Node.ELEMENT_NODE || root.closest(SKIP)) return;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: (n) => (n.data.trim().length >= 6 ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT),
    });
    for (let n = walker.nextNode(); n; n = walker.nextNode()) markText(n);
    if (root.matches('input,textarea')) markField(root);
    root.querySelectorAll('input,textarea').forEach(markField);
    applySelectors(root);
  }

  function selectorsForHost() {
    const own = settings.maskSelectors[HOST] || [];
    return isDynamics ? DYNAMICS_SELECTORS.concat(own) : own;
  }

  function applySelectors(root) {
    for (const sel of selectorsForHost()) {
      try {
        if (root.matches && root.matches(sel)) root.setAttribute(ATTR_SEL, '');
        root.querySelectorAll(sel).forEach((el) => el.setAttribute(ATTR_SEL, ''));
      } catch { /* invalid selector saved by the user: ignore it */ }
    }
  }

  function rescanAll() {
    document.querySelectorAll(`[${ATTR_HIT}],[${ATTR_SEL}]`).forEach((el) => {
      el.removeAttribute(ATTR_HIT);
      el.removeAttribute(ATTR_SEL);
    });
    if (document.body) scan(document.body);
    if (masking) hideTitles(document.body);
  }

  // Native tooltips (title="...") would show the real value on hover during a screen share.
  function hideTitles(root) {
    if (!root) return;
    const marked = root.matches?.(`[${ATTR_HIT}],[${ATTR_SEL}]`) ? [root] : [];
    marked.push(...root.querySelectorAll(`[${ATTR_HIT}],[${ATTR_SEL}]`));
    for (const el of marked) {
      for (const n of [el, ...el.querySelectorAll('[title]')]) {
        if (n.hasAttribute('title')) {
          n.setAttribute('data-discret-title', n.getAttribute('title'));
          n.removeAttribute('title');
        }
      }
    }
  }

  function restoreTitles() {
    document.querySelectorAll('[data-discret-title]').forEach((n) => {
      n.setAttribute('title', n.getAttribute('data-discret-title'));
      n.removeAttribute('data-discret-title');
    });
  }

  // Batch DOM changes: single-page apps mutate constantly.
  const queue = new Set();
  let timer = 0;
  function enqueue(node) {
    queue.add(node);
    if (!timer) timer = setTimeout(flush, 150);
  }
  function flush() {
    timer = 0;
    if (queue.size > 300) { queue.clear(); return rescanAll(); }
    for (const n of queue) if (n.isConnected) scan(n);
    queue.clear();
  }

  const observer = new MutationObserver((records) => {
    for (const r of records) {
      if (r.type === 'characterData') enqueue(r.target);
      else r.addedNodes.forEach((n) => { if (!(n.nodeType === 1 && n.hasAttribute(ATTR_UI))) enqueue(n); });
    }
  });

  document.addEventListener('input', (e) => { if (e.target.matches?.('input,textarea')) markField(e.target); }, true);
  document.addEventListener('change', (e) => { if (e.target.matches?.('input,textarea')) markField(e.target); }, true);

  // ---------- masking state ----------

  const pill = ui('button', 'discret-pill');
  pill.type = 'button';
  pill.addEventListener('click', () => setMasking(false));

  function render() {
    const html = document.documentElement;
    html.style.setProperty('--discret-blur', `${settings.blur}px`);
    if (masking) {
      html.setAttribute('data-discret-on', '');
      hideTitles(document.body);
      pill.textContent = `● ${t('pillOn')}`;
      pill.title = t('pillOff');
      document.documentElement.appendChild(pill);
    } else {
      html.removeAttribute('data-discret-on');
      restoreTitles();
      pill.remove();
    }
  }

  function setMasking(on) {
    chrome.storage.local.set({ masking: on });
  }

  // ---------- one-click copy ----------

  const chip = ui('button', 'discret-chip');
  chip.type = 'button';
  chip.textContent = '⧉';
  chip.setAttribute('aria-label', t('copy'));
  const toast = ui('div', 'discret-toast');
  let chipTarget = null, hideTimer = 0;

  function ui(tag, cls) {
    const el = document.createElement(tag);
    el.className = cls;
    el.setAttribute(ATTR_UI, '');
    return el;
  }

  const COPYABLE = `input:not([type=password]):not([type=checkbox]):not([type=radio]):not([type=hidden]),textarea,[${ATTR_HIT}],[${ATTR_SEL}]`;

  function valueOf(el) {
    if (el.matches('input,textarea')) return { value: el.value.trim(), kind: kindOf(el.value) };
    const field = el.querySelector('input:not([type=password]),textarea');
    if (field && field.value.trim()) return { value: field.value.trim(), kind: kindOf(field.value) };
    const text = (el.innerText || el.textContent || '').trim();
    const hits = D.findAll(text, settings.patterns);
    if (hits.length === 1) return { value: hits[0].value, kind: hits[0].type };
    if (text.length > 300) return { value: '', kind: '' };
    return { value: text, kind: hits.length ? hits[0].type : '' };
  }

  function kindOf(text) {
    const hits = D.findAll(text, settings.patterns);
    return hits.length ? hits[0].type : '';
  }

  async function copy(value, kind, anchor) {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = value;
      ta.setAttribute(ATTR_UI, '');
      ta.style.cssText = 'position:fixed;opacity:0;top:0;left:0';
      document.documentElement.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
    }
    chrome.runtime.sendMessage({ type: 'discret:copied', value, kind, host: HOST }).catch(() => {});
    const label = kind ? t(`type_${kind}`) : t('value');
    toast.textContent = masking ? `${t('copied')} · ${label}` : `${t('copied')} · ${value.length > 40 ? value.slice(0, 40) + '…' : value}`;
    const r = anchor.getBoundingClientRect();
    toast.style.left = `${Math.max(8, Math.min(r.left, innerWidth - 240))}px`;
    toast.style.top = `${r.bottom + 6 > innerHeight - 40 ? r.top - 34 : r.bottom + 6}px`;
    document.documentElement.appendChild(toast);
    clearTimeout(toast._t);
    toast._t = setTimeout(() => toast.remove(), 1600);
  }

  function showChip(el) {
    const { value } = valueOf(el);
    if (!value) return;
    const r = el.getBoundingClientRect();
    if (r.width < 20 || r.height < 10 || r.bottom < 0 || r.top > innerHeight) return;
    chipTarget = el;
    chip.style.left = `${Math.min(r.right + 4, innerWidth - 30)}px`;
    chip.style.top = `${r.top + Math.max(0, (r.height - 24) / 2)}px`;
    document.documentElement.appendChild(chip);
  }

  function scheduleHide() {
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => { chip.remove(); chipTarget = null; }, 350);
  }

  document.addEventListener('mouseover', (e) => {
    if (e.target === chip) return clearTimeout(hideTimer);
    const el = e.target.closest?.(COPYABLE);
    if (!el || el.closest(`[${ATTR_UI}]`)) return scheduleHide();
    clearTimeout(hideTimer);
    if (el !== chipTarget) showChip(el);
  }, true);
  addEventListener('scroll', () => { chip.remove(); chipTarget = null; }, true);

  chip.addEventListener('mousedown', (e) => e.preventDefault()); // keep focus in the form
  chip.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!chipTarget) return;
    const { value, kind } = valueOf(chipTarget);
    if (value) copy(value, kind, chip);
  });

  // Alt + click copies the value of any element.
  document.addEventListener('click', (e) => {
    if (!settings.altClickCopy || !e.altKey || e.shiftKey || e.ctrlKey || e.metaKey) return;
    if (e.target.closest?.(`[${ATTR_UI}]`)) return;
    const el = e.target.closest?.(COPYABLE) || e.target;
    const { value, kind } = valueOf(el);
    if (!value) return;
    e.preventDefault();
    e.stopPropagation();
    copy(value, kind, el);
  }, true);

  // ---------- "mask this element" (context menu) ----------

  let lastContextTarget = null;
  document.addEventListener('contextmenu', (e) => { lastContextTarget = e.target; }, true);

  const UNSTABLE = /\d{4,}|[0-9a-f]{8}-[0-9a-f]{4}/i;
  function selectorFor(el) {
    for (let cur = el, depth = 0; cur && cur !== document.body && depth < 5; cur = cur.parentElement, depth++) {
      const tag = cur.tagName.toLowerCase();
      for (const attr of ['data-id', 'col-id', 'name', 'aria-label', 'id']) {
        const v = cur.getAttribute(attr);
        if (!v || v.length > 80 || UNSTABLE.test(v) || hasHit(v)) continue;
        return attr === 'id' ? `#${CSS.escape(v)}` : `${tag}[${attr}="${CSS.escape(v)}"]`;
      }
    }
    return null;
  }

  async function maskTarget() {
    const sel = lastContextTarget && selectorFor(lastContextTarget);
    if (!sel) {
      toast.textContent = t('noSelector');
      document.documentElement.appendChild(toast);
      setTimeout(() => toast.remove(), 2200);
      return;
    }
    const { maskSelectors = {} } = await chrome.storage.sync.get('maskSelectors');
    const list = new Set(maskSelectors[HOST] || []);
    list.add(sel);
    maskSelectors[HOST] = [...list];
    await chrome.storage.sync.set({ maskSelectors });
  }

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg?.type === 'discret:mask-target') maskTarget();
  });

  // ---------- start ----------

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.masking) {
      masking = !!changes.masking.newValue;
      render();
    }
    if (area === 'sync') {
      for (const k of Object.keys(DEFAULTS)) if (changes[k]) settings[k] = changes[k].newValue ?? DEFAULTS[k];
      rescanAll();
      render();
    }
  });

  Promise.all([chrome.storage.sync.get(DEFAULTS), chrome.storage.local.get({ masking: false })]).then(([s, l]) => {
    settings = { ...DEFAULTS, ...s, patterns: { ...DEFAULTS.patterns, ...s.patterns } };
    masking = l.masking;
    const start = () => {
      rescanAll();
      render();
      observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    };
    if (document.body) start();
    else addEventListener('DOMContentLoaded', start, { once: true });
  });
})();
