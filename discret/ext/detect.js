/*
 * Discret: detection of personal data in plain text.
 * Pure functions, no DOM access, so the same file runs in the extension, on the demo page and in Node tests.
 */
(function (root) {
  'use strict';

  // Order matters: when two matches overlap, the earlier type wins.
  const TYPES = ['email', 'iban', 'card', 'nir', 'phone'];

  const RE = {
    email: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g,
    iban: /\b[A-Z]{2}\d{2}(?: ?[A-Z0-9]){11,30}/g,
    card: /(?<![\d-])\d(?:[ -]?\d){12,18}(?![\d-])/g,
    nir: /(?<![\dA-Z])[12] ?\d{2} ?\d{2} ?(?:\d{2}|2A|2B) ?\d{3} ?\d{3} ?\d{2}(?![\dA-Z])/g,
    phone: /(?<![\w+])(?:(?:(?:\+|00)33[\s.-]?(?:\(0\)[\s.-]?)?|0)[1-9](?:[\s.-]?\d{2}){4}|\+\d{1,3}(?:[\s.-]?\d){7,13})(?![\d])/g,
  };

  function luhn(num) {
    let sum = 0, dbl = false;
    for (let i = num.length - 1; i >= 0; i--) {
      let d = num.charCodeAt(i) - 48;
      if (dbl) { d *= 2; if (d > 9) d -= 9; }
      sum += d;
      dbl = !dbl;
    }
    return sum % 10 === 0;
  }

  function ibanValid(raw) {
    const s = raw.replace(/ /g, '').toUpperCase();
    if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(s)) return false;
    const r = s.slice(4) + s.slice(0, 4);
    let rem = 0;
    for (const ch of r) {
      const v = ch >= 'A' ? String(ch.charCodeAt(0) - 55) : ch;
      for (const d of v) rem = (rem * 10 + (d.charCodeAt(0) - 48)) % 97;
    }
    return rem === 1;
  }

  // French social security number (NIR): 13 digits + 2-digit key. Corsica uses 2A / 2B.
  function nirValid(raw) {
    const s = raw.replace(/ /g, '').toUpperCase();
    if (!/^[12]\d{2}(0[1-9]|1[0-2]|[2-9]\d)(\d{2}|2A|2B)\d{6}\d{2}$/.test(s)) return false;
    const body = s.slice(0, 13).replace('2A', '19').replace('2B', '18');
    const key = Number(s.slice(13));
    return 97 - (Number(body) % 97) === key;
  }

  const VALIDATE = {
    email: () => true,
    iban: ibanValid,
    card: (v) => { const d = v.replace(/\D/g, ''); return d.length >= 13 && d.length <= 19 && luhn(d); },
    nir: nirValid,
    phone: (v) => v.replace(/\D/g, '').length >= 9,
  };

  // The IBAN pattern may run into the next word ("... 189 PARIS"), so shorten until the checksum holds.
  function trimIban(value) {
    for (let v = value; v.replace(/ /g, '').length >= 15; v = v.slice(0, -1).trimEnd()) {
      if (ibanValid(v)) return v;
    }
    return null;
  }

  /**
   * Finds personal data in a string.
   * @param {string} text
   * @param {Object<string, boolean>} [enabled] map of type -> on/off; all types on by default
   * @returns {{type: string, start: number, end: number, value: string}[]} sorted, non-overlapping
   */
  function findAll(text, enabled) {
    if (!text || text.length < 6) return [];
    const found = [];
    for (const type of TYPES) {
      if (enabled && enabled[type] === false) continue;
      const re = RE[type];
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(text))) {
        let value = m[0];
        if (type === 'iban') value = trimIban(value);
        else if (!VALIDATE[type](value)) value = null;
        if (!value) continue;
        const start = m.index, end = start + value.length;
        if (found.some((f) => start < f.end && end > f.start)) continue;
        found.push({ type, start, end, value });
      }
    }
    return found.sort((a, b) => a.start - b.start);
  }

  const api = { TYPES, findAll, luhn, ibanValid, nirValid };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.DiscretDetect = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
