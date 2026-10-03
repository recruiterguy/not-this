/*
 * Not This. — text matching shared by the content script and the popup, so
 * the popup's "Test a comment" box always agrees with what gets collapsed.
 */
(() => {
  'use strict';

  // chrome.storage.sync allows 8 KB per item.
  const MAX_PATTERN_CHARS = 4000;

  function normalizeText(t) {
    return t
      .toLowerCase()
      .replace(/[’'"“”`]/g, '')
      .replace(/[^\p{L}\p{N}\s/+%]/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  const escapeRe = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  // A plain line, compared to the normalized comment (no case or punctuation).
  // `*` stands for "anything", matched on whole words: "rock and stone*" starts
  // with it, "*my axe*" mentions it anywhere, and neither matches "taxes".
  function wildcardTest(line) {
    const parts = line.split('*').map(normalizeText);
    if (!parts.some(Boolean)) return null;
    if (parts.length === 1) return (_raw, norm) => norm === parts[0];
    const words = parts.filter(Boolean).map(escapeRe);
    const lead = parts[0] === '' ? '(?:.*\\b)?' : '';
    const trail = parts[parts.length - 1] === '' ? '(?:\\b.*)?' : '';
    const re = new RegExp(`^${lead}${words.join('\\b.*\\b')}${trail}$`);
    return (_raw, norm) => re.test(norm);
  }

  /**
   * Compile the user's pattern list, one per line. Plain lines use
   * wildcardTest(); "/.../flags" is a regex for power users, tested against
   * the text as shown and always case-insensitive. Lines starting with # are notes.
   * @returns {{tests: {line: number, text: string, test: Function}[], errors: number[]}}
   */
  function compilePatterns(text) {
    const tests = [];
    const errors = [];
    String(text || '').slice(0, MAX_PATTERN_CHARS).split(/\r?\n/).forEach((raw, i) => {
      const t = raw.trim();
      if (!t || t.startsWith('#')) return;
      const m = t.match(/^\/(.+)\/([a-z]*)$/);
      let test = null;
      if (m) {
        try {
          const flags = [...new Set(`i${m[2]}`.replace(/[gy]/g, ''))].join('');
          const re = new RegExp(m[1], flags);
          test = (rawText) => re.test(rawText);
        } catch {
          errors.push(i + 1);
          return;
        }
      } else {
        test = wildcardTest(t);
      }
      if (test) tests.push({ line: i + 1, text: t, test });
    });
    return { tests, errors };
  }

  // The first pattern that matches a comment's text, or null.
  function firstMatch(tests, text) {
    const raw = String(text || '').replace(/\s+/g, ' ').trim();
    if (!raw) return null;
    const norm = normalizeText(raw);
    return tests.find((p) => p.test(raw, norm)) || null;
  }

  globalThis.NotThisPatterns = { MAX_PATTERN_CHARS, normalizeText, compilePatterns, firstMatch };
})();
