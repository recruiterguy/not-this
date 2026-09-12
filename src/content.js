/*
 * Not This. — content script
 *
 * Classifies every comment into one "low-effort" kind (or none) and collapses
 * or hides the ones whose rule is switched on. Works on new Reddit
 * (<shreddit-comment>) and old Reddit (.thing.comment). No network access.
 */
(() => {
  'use strict';

  // ---------------------------------------------------------------------------
  // Settings
  // ---------------------------------------------------------------------------

  const RULE_DEFAULTS = {
    gif: true,     // comment is only a GIF
    image: false,  // comment is only a static image
    emote: true,   // only emoji / Reddit emotes
    phrase: true,  // "This.", "lol", "Take my upvote", r/whoosh ...
    link: true,    // a bare link and nothing else
    bot: true,     // bot accounts, "I am a bot", RemindMe! invocations
    pasta: true,   // well-known copypasta
    quote: false,  // quotes the parent and adds nothing
    short: false,  // fewer than `shortWords` words
    score: false,  // score below `scoreBelow`
  };

  const DEFAULTS = {
    enabled: true,
    mode: 'collapse',      // 'collapse' | 'hide'
    showCounter: true,
    keepReplies: false,    // collapse the comment but leave its replies visible
    rules: RULE_DEFAULTS,
    shortWords: 3,
    scoreBelow: 0,
    mutedUsers: [],
  };

  // Human labels for the banner/popup, and the short badge shown on the comment.
  const LABELS = {
    gif: 'GIF', image: 'image', emote: 'emoji', phrase: '"this"', link: 'link-only',
    bot: 'bot', pasta: 'copypasta', quote: 'quote-only', short: 'short', score: 'downvoted',
    muted: 'muted',
  };
  const BADGES = {
    gif: 'GIF', image: 'IMG', emote: 'EMOJI', phrase: 'LOW EFFORT', link: 'LINK', bot: 'BOT',
    pasta: 'PASTA', quote: 'QUOTE', short: 'SHORT', score: 'DOWNVOTED', muted: 'MUTED',
  };

  function normalizeSettings(raw) {
    const r = raw || {};
    const s = { ...DEFAULTS, ...r };
    s.rules = { ...RULE_DEFAULTS, ...(r.rules || {}) };
    // v1.0 stored a single `includeImages` flag.
    if ('includeImages' in r && !(r.rules && 'image' in r.rules)) s.rules.image = !!r.includeImages;
    s.mode = s.mode === 'hide' ? 'hide' : 'collapse';
    s.shortWords = Math.min(20, Math.max(1, parseInt(s.shortWords, 10) || DEFAULTS.shortWords));
    s.scoreBelow = Number.isFinite(Number(s.scoreBelow)) ? Number(s.scoreBelow) : DEFAULTS.scoreBelow;
    s.mutedUsers = (Array.isArray(s.mutedUsers) ? s.mutedUsers : [])
      .map((u) => String(u).trim().replace(/^\/?u\//i, '').toLowerCase())
      .filter(Boolean);
    return s;
  }

  const ATTR = 'data-rgc';             // 'collapsed' | 'hidden' | 'skip'
  const KIND_ATTR = 'data-rgc-kind';   // detected kind, even when skipped
  const BADGE_CLASS = 'rgc-badge';
  const HIDDEN_CLASS = 'rgc-hidden';
  const OWN_CLASS = 'rgc-collapsed';        // collapsed by us, not by Reddit
  const PART_CLASS = 'rgc-part-hidden';     // applied to the individual parts we hide

  // Firefox exposes a promise-based `browser`; Chrome/Edge/Brave expose `chrome`.
  const api = globalThis.browser ?? globalThis.chrome ?? null;
  const storage = api?.storage?.sync ?? null;

  let rawSettings = {};
  let settings = normalizeSettings({});

  // ---------------------------------------------------------------------------
  // Text / media detection helpers
  // ---------------------------------------------------------------------------

  const GIF_HINT = /giphy|tenor|redgifs|gfycat|\.gifv?(?:$|[?#&])|format=gif|(?:^|[^a-z])gif(?:[^a-z]|$)/i;
  const EMOTE_HINT = /emote|emoji/i;
  const MD_IMAGE = /^!\[([^\]]*)\]\(([^)]+)\)$/;      // old Reddit shows literal markdown
  const FILLER = /^(?:via giphy|giphy|gif|image|img)$/i;

  const MEDIA_SELECTOR = 'img, video, source, faceplate-img, shreddit-gif, gif-player, shreddit-player';
  const VIDEO_TAGS = new Set(['video', 'source', 'shreddit-gif', 'gif-player', 'shreddit-player']);

  const HAS_EMOJI = /\p{Extended_Pictographic}/u;
  const EMOJI_ONLY = /^(?:\p{Extended_Pictographic}|\p{Emoji_Modifier}|\p{Emoji_Component}|‍|️|\s)+$/u;

  // Stock reaction phrases. Compared after normalizeText(), so no punctuation/case.
  const PHRASES = new Set([
    'this', 'this so much', 'so much this', 'this right here', 'this is it', 'this is the answer',
    'this is the way', 'this guy gets it', 'this person gets it', 'this one', 'exactly this',
    'came here to say this', 'came here for this', 'came here to say exactly this',
    'underrated comment', 'underrated', 'take my upvote', 'have my upvote', 'upvoted',
    'take my angry upvote', 'have an upvote', 'take my updoot', 'updoot',
    'f', 'press f', 'press f to pay respects', 'rip', 'oof', 'big oof', 'oof size large', 'yikes',
    'same', 'mood', 'big mood', 'big if true', 'this aged well', 'this didnt age well',
    'username checks out', 'whoosh', 'woosh', 'thanks i hate it', 'thanks i hate this',
    'nice', 'noice', 'based', 'cringe', 'cope', 'seethe', 'ratio', 'l', 'w', 'skill issue',
    'first', 'sir this is a wendys', 'this is a wendys', 'ok boomer', 'k', 'and my axe',
    'i understand that reference', 'wholesome', 'bruh', 'facts', 'fax', 'big facts', 'truth',
    'true', 'exactly', '+1', 'agreed', 'agree', 'correct', 'yep', 'yup', 'this 100%', '100%',
    '1000%', 'im in this picture and i dont like it', 'thats the joke', 'delete this', 'no u',
    'no you', 'noted', 'saved', 'commenting so i can find this later', 'wow', 'wtf', 'huh', 'wat',
    'cool', 'neat', 'dope', 'sick', 'lit', 'epic', 'poggers', 'pog', 'pogchamp', 'gg', 'ez',
    'nice one', 'good one', 'good bot', 'bad bot', 'lies', 'thanks for the gold kind stranger',
    'edit thanks for the gold', 'wow this blew up', 'rip my inbox', 'hello there', 'general kenobi',
    'i see youre a man of culture as well', 'a man of culture', 'the real lpt is always in the comments',
    'this needs more upvotes', 'why isnt this higher', 'this should be higher', 'this needs to be higher',
    'top comment', 'best comment', 'comment of the year', 'winner', 'we have a winner',
    'i came here to say this', 'beat me to it', 'you beat me to it', 'you win', 'you win the internet',
    'take my money', 'shut up and take my money', 'lol same', 'lmao same', 'literally me',
    'me irl', 'me af', 'relatable', 'accurate', 'nailed it', 'this guy', 'this dude', 'legend',
    'absolute legend', 'chad', 'gigachad', 'king', 'queen', 'slay', 'yas', 'yass', 'sus', 'amogus',
    'lolwut', 'wut', 'nope', 'nah', 'meh', 'ew', 'gross', 'ugh', 'omg', 'omfg', 'smh', 'idk',
    'ikr', 'fr', 'frfr', 'ong', 'deadass', 'no cap', 'cap', 'bet', 'word', 'mid', 'lame',
  ]);

  const PHRASE_RES = [
    /^(?:l+o+l+z*|lm+f?a+o+|ro+f+l+|(?:ha|he|hue|ja|ba|hi){2,}h?|k+e+k+|x+d+|lu+l+z*|lel)$/, // laughter
    /^(?:this|dis)(?: \^+)?$/,
    /^\/?r\/[a-z0-9_]+$/,                     // "r/whoosh" and any other bare subreddit name
    /^(?:so|such)? ?(?:true|accurate|real)$/,
    /^(?:big|absolute|literal) (?:facts|truth|mood|w|l)$/,
    /^\+\d+$/,
    /^(?:100|1000|69|420)%?$/,
    /^(?:f|rip|oof|yikes|bruh|lol|lmao)(?: in (?:the )?chat)?$/,
    /^(?:underrated|overrated) (?:comment|reply|take)$/,
    /^(?:this|it)s? (?:is )?(?:the|a) (?:way|one|answer|truth)$/,
  ];

  // Well-known copypasta, matched on how the (normalized) comment starts.
  const PASTA_OPENERS = [
    'what the fuck did you just fucking say about me', 'what the heck did you just say about me',
    'is this the krusty krab', 'did you ever hear the tragedy of darth plagueis',
    'according to all known laws of aviation', 'id just like to interject for a moment',
    'to be fair you have to have a very high iq', 'nothing personnel kid', 'my name is yoshikage kira',
    'the fitnessgram pacer test', 'i am once again asking', 'i sexually identify as',
    'ah i see youre a man of culture', 'hello this is bob', 'somebody once told me',
    'we live in a society', 'the real treasure was the friends we made along the way',
    'and then everyone stood up and clapped', 'and everybody clapped', 'this is where i first met',
    'in the year 2000', 'i cant believe youve done this', 'you know i had to do it to em',
  ];

  const BOT_AUTHOR = /^automoderator$|bot$|_bot\d*$|-bot\d*$|^remindmebot$|^savevideo$|^vredditdownloader$|^stabbot$|^sneakpeekbot$|^wikisummarizerbot$|^haikusbot$/i;
  const BOT_TEXT = /\bi am a bot\b|\bthis action was performed automatically\b|\bbeep boop\b|\bbleep bloop\b|^\s*!?remindme!/i;

  function normalizeText(t) {
    return t
      .toLowerCase()
      .replace(/[’'"“”`]/g, '')
      .replace(/[^\p{L}\p{N}\s/+%]/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function mediaKind(el, original) {
    const tag = el.tagName.toLowerCase();
    if (VIDEO_TAGS.has(tag)) return 'gif';
    const anchor = el.closest('a');
    const hints = [
      el.getAttribute('class'),
      el.getAttribute('src'),
      el.getAttribute('data-src'),
      el.getAttribute('srcset'),
      el.getAttribute('alt'),
      el.getAttribute('title'),
      anchor?.getAttribute('href'),
    ].filter(Boolean).join(' ');

    if (EMOTE_HINT.test(hints)) return 'emote';
    const attrW = parseInt(el.getAttribute('width') || '0', 10);
    const renderedW = original?.width || 0;
    if ((attrW > 0 && attrW <= 40) || (renderedW > 0 && renderedW <= 40)) return 'emote';
    return GIF_HINT.test(hints) ? 'gif' : 'image';
  }

  const MEDIA_RANK = { gif: 3, image: 2, emote: 1 };

  /**
   * Classify a comment body.
   * @returns {{kind: string|null, words: number}}
   *   kind: 'gif' | 'image' | 'emote' | 'link' | 'quote' | 'phrase' | 'pasta' | null
   *   words: word count of the remaining text (for the "short" rule)
   */
  function classifyBody(body) {
    const clone = body.cloneNode(true);
    clone.querySelectorAll(`.${BADGE_CLASS}, script, style`).forEach((n) => n.remove());

    const originals = body.querySelectorAll(MEDIA_SELECTOR);
    const media = clone.querySelectorAll(MEDIA_SELECTOR);
    let mediaKindFound = null;
    media.forEach((el, i) => {
      const k = mediaKind(el, originals[i]);
      if (!mediaKindFound || MEDIA_RANK[k] > MEDIA_RANK[mediaKindFound]) mediaKindFound = k;
      const anchor = el.closest('a');
      const target = anchor && anchor.textContent.trim() === '' ? anchor : el;
      target.remove();
    });

    const text = clone.textContent.replace(/\s+/g, ' ').trim();
    if (text === '') return { kind: mediaKindFound, words: 0 };

    // Old Reddit: literal `![gif](giphy|xyz)` or `![gif](https://i.redd.it/x.gif)`.
    const md = text.match(MD_IMAGE);
    if (md) return { kind: GIF_HINT.test(`${md[1]} ${md[2]}`) ? 'gif' : 'image', words: 0 };

    if (mediaKindFound && FILLER.test(text)) return { kind: mediaKindFound, words: 0 };

    // Emoji-only (possibly alongside emote images).
    if (HAS_EMOJI.test(text) && EMOJI_ONLY.test(text)) return { kind: 'emote', words: 0 };

    // Link-only: nothing left once anchors are removed.
    const links = clone.querySelectorAll('a[href]');
    if (links.length > 0) {
      const noLinks = clone.cloneNode(true);
      noLinks.querySelectorAll('a').forEach((a) => a.remove());
      if (noLinks.textContent.trim() === '') {
        const allGif = [...links].every((a) => GIF_HINT.test(a.getAttribute('href') || ''));
        if (allGif) return { kind: 'gif', words: 0 };
        // "r/whoosh" and friends get autolinked; they're still stock phrases.
        const normLink = normalizeText(text);
        if (PHRASES.has(normLink) || PHRASE_RES.some((re) => re.test(normLink))) return { kind: 'phrase', words: 0 };
        return { kind: 'link', words: 0 };
      }
    }

    // Quote-only: nothing left once blockquotes are removed.
    if (clone.querySelector('blockquote')) {
      const noQuotes = clone.cloneNode(true);
      noQuotes.querySelectorAll('blockquote').forEach((q) => q.remove());
      if (noQuotes.textContent.trim() === '') return { kind: 'quote', words: 0 };
    }

    const norm = normalizeText(text);
    if (norm === '') return { kind: 'phrase', words: 0 };  // punctuation only: "...", "?!"
    if (PHRASES.has(norm) || PHRASE_RES.some((re) => re.test(norm))) return { kind: 'phrase', words: 0 };
    if (PASTA_OPENERS.some((o) => norm.startsWith(o))) return { kind: 'pasta', words: 0 };

    return { kind: null, words: norm.split(' ').length };
  }

  // ---------------------------------------------------------------------------
  // Comment element helpers (new Reddit + old Reddit)
  // ---------------------------------------------------------------------------

  function siteOf(el) {
    return el.tagName.toLowerCase() === 'shreddit-comment' ? 'new' : 'old';
  }

  // New Reddit nests the slotted parts a few wrappers deep, and replies live
  // inside the parent element, so "first match that belongs to this comment".
  function firstOwned(el, selector) {
    for (const n of el.querySelectorAll(selector)) {
      if (n.closest('shreddit-comment') === el) return n;
    }
    return null;
  }

  function bodyOf(el) {
    return siteOf(el) === 'new'
      ? firstOwned(el, '[slot="comment"]')
      : el.querySelector(':scope > .entry .usertext-body .md');
  }

  function metaContainer(el) {
    return siteOf(el) === 'new'
      ? firstOwned(el, '[slot="commentMeta"]')
      : el.querySelector(':scope > .entry .tagline');
  }

  function authorOf(el) {
    if (siteOf(el) === 'new') return el.getAttribute('author') || '';
    return el.dataset.author || el.querySelector(':scope > .entry .tagline .author')?.textContent.trim() || '';
  }

  function scoreOf(el) {
    let raw = null;
    if (siteOf(el) === 'new') {
      raw = el.getAttribute('score') ?? firstOwned(el, 'shreddit-comment-action-row')?.getAttribute('score');
    } else {
      const s = el.querySelector(':scope > .entry .tagline .score');
      raw = s ? (s.getAttribute('title') || s.textContent) : null;
    }
    if (raw == null) return null;
    const n = parseInt(String(raw).replace(/[^-\d]/g, ''), 10);
    return Number.isFinite(n) ? n : null;
  }

  function isBot(author, body) {
    if (author && BOT_AUTHOR.test(author)) return true;
    return BOT_TEXT.test(body.textContent);
  }

  // The parts we hide when collapsing a comment ourselves.
  function ownParts(el, keepReplies) {
    const parts = siteOf(el) === 'new'
      ? [bodyOf(el), firstOwned(el, '[slot="actionRow"]'), keepReplies ? null : firstOwned(el, '#comment-children')]
      : [
        el.querySelector(':scope > .entry .usertext-body'),
        el.querySelector(':scope > .entry .flat-list.buttons'),
        keepReplies ? null : el.querySelector(':scope > .child'),
      ];
    return parts.filter(Boolean);
  }

  function isRendered(node) {
    return !!node && node.getClientRects().length > 0;
  }

  // ---------------------------------------------------------------------------
  // Collapsing
  // ---------------------------------------------------------------------------

  function isNativelyCollapsed(el) {
    return siteOf(el) === 'new'
      ? el.hasAttribute('collapsed')
      : el.classList.contains('collapsed');
  }

  function setNativeCollapsed(el, collapsed) {
    if (siteOf(el) === 'new') {
      if (collapsed) el.setAttribute('collapsed', '');
      else el.removeAttribute('collapsed');
      return;
    }
    const toggle = el.querySelector(':scope > .entry .tagline a.expand');
    if (toggle) {
      toggle.click();
    } else {
      el.classList.toggle('collapsed', collapsed);
      el.classList.toggle('noncollapsed', !collapsed);
    }
  }

  function setOwnCollapsed(el, collapsed) {
    el.classList.toggle(OWN_CLASS, collapsed);
    if (collapsed) {
      ownParts(el, settings.keepReplies).forEach((p) => p.classList.add(PART_CLASS));
    } else {
      // Remove from every part we might have touched, regardless of current keepReplies.
      ownParts(el, false).forEach((p) => p.classList.remove(PART_CLASS));
    }
    updateBadgeToggle(el);
  }

  function addBadge(el, kind) {
    const meta = metaContainer(el);
    if (!meta) return null;
    let badge = meta.querySelector(`:scope > .${BADGE_CLASS}`);
    if (badge) return badge;
    badge = document.createElement('span');
    badge.className = BADGE_CLASS;
    badge.dataset.label = BADGES[kind] || 'LOW EFFORT';
    badge.textContent = badge.dataset.label;
    badge.title = `Collapsed: ${LABELS[kind] || kind} comment`;
    meta.appendChild(badge);
    return badge;
  }

  function removeBadge(el) {
    metaContainer(el)?.querySelectorAll(`:scope > .${BADGE_CLASS}`).forEach((b) => b.remove());
  }

  // When we collapse a comment ourselves, the badge becomes the show/hide toggle.
  function updateBadgeToggle(el) {
    const badge = metaContainer(el)?.querySelector(`:scope > .${BADGE_CLASS}`);
    if (!badge) return;
    const label = badge.dataset.label;
    if (!badge.dataset.toggle) {
      badge.dataset.toggle = '1';
      badge.classList.add(`${BADGE_CLASS}--toggle`);
      badge.setAttribute('role', 'button');
      badge.tabIndex = 0;
      const toggle = (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        setOwnCollapsed(el, !el.classList.contains(OWN_CLASS));
      };
      badge.addEventListener('click', toggle);
      badge.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter' || ev.key === ' ') toggle(ev);
      });
    }
    const hidden = el.classList.contains(OWN_CLASS);
    badge.textContent = hidden ? `${label} · show` : `${label} · hide`;
    badge.title = hidden ? 'Show this comment' : 'Hide this comment again';
  }

  function apply(el, kind) {
    el.setAttribute(KIND_ATTR, kind);

    if (settings.mode === 'hide') {
      el.classList.add(HIDDEN_CLASS);
      el.setAttribute(ATTR, 'hidden');
      tally(el);
      return;
    }

    if (isNativelyCollapsed(el)) {
      // Already collapsed by Reddit or the user; leave it alone.
      el.setAttribute(ATTR, 'skip');
      return;
    }

    el.setAttribute(ATTR, 'collapsed');
    addBadge(el, kind);
    tally(el);

    if (settings.keepReplies) {
      // Reddit's own collapse always takes the replies with it, so do it ourselves.
      setOwnCollapsed(el, true);
      return;
    }

    setNativeCollapsed(el, true);
    if (siteOf(el) === 'new') {
      // Give Reddit a moment to react to the attribute; if the body is still
      // on screen it ignored us, so collapse it ourselves.
      setTimeout(() => {
        if (el.getAttribute(ATTR) !== 'collapsed' || el.classList.contains(OWN_CLASS)) return;
        if (isRendered(bodyOf(el))) {
          el.removeAttribute('collapsed');
          setOwnCollapsed(el, true);
        }
      }, 120);
    }
  }

  function restore(el) {
    const state = el.getAttribute(ATTR);
    el.classList.remove(HIDDEN_CLASS);
    if (el.classList.contains(OWN_CLASS)) {
      setOwnCollapsed(el, false);
    } else if (state === 'collapsed' && isNativelyCollapsed(el)) {
      setNativeCollapsed(el, false);
    }
    ownParts(el, false).forEach((p) => p.classList.remove(PART_CLASS));
    removeBadge(el);
    el.removeAttribute(ATTR);
    el.removeAttribute(KIND_ATTR);
  }

  function restoreAll() {
    document.querySelectorAll(`[${ATTR}]`).forEach(restore);
    updateCounter();
  }

  // ---------------------------------------------------------------------------
  // Deciding
  // ---------------------------------------------------------------------------

  function decide(el, body) {
    const rules = settings.rules;
    const author = authorOf(el);

    if (author && settings.mutedUsers.includes(author.toLowerCase())) return 'muted';
    if (rules.bot && isBot(author, body)) return 'bot';
    if (rules.score) {
      const score = scoreOf(el);
      if (score !== null && score < settings.scoreBelow) return 'score';
    }

    const { kind, words } = classifyBody(body);
    if (kind) return rules[kind] ? kind : null;
    if (rules.short && words > 0 && words < settings.shortWords) return 'short';
    return null;
  }

  function consider(el) {
    const body = bodyOf(el);
    if (!body) {
      // New Reddit renders bodies lazily; leave unmarked so we retry later.
      if (siteOf(el) === 'old') el.setAttribute(ATTR, 'skip');
      return;
    }
    if (body.childNodes.length === 0) return; // still loading; retry on next mutation

    const kind = decide(el, body);
    if (kind) {
      apply(el, kind);
    } else {
      el.setAttribute(ATTR, 'skip');
    }
  }

  // Set when the user clicks "Show them" on the banner.
  let revealed = false;
  let revealedCount = 0;

  function scan() {
    if (!settings.enabled || revealed) return;
    document.querySelectorAll(`shreddit-comment:not([${ATTR}])`).forEach(consider);
    document.querySelectorAll(`.commentarea .thing.comment:not([${ATTR}])`).forEach(consider);
    updateCounter();
  }

  function stats() {
    const acted = document.querySelectorAll(`[${ATTR}="collapsed"], [${ATTR}="hidden"]`);
    const byKind = {};
    acted.forEach((el) => {
      const k = el.getAttribute(KIND_ATTR) || 'other';
      byKind[k] = (byKind[k] || 0) + 1;
    });
    return {
      total: acted.length,
      byKind,
      enabled: settings.enabled,
      mode: settings.mode,
      revealed,
      revealedCount,
      counted: countedIds.size,
      lifetime,
    };
  }

  // ---------------------------------------------------------------------------
  // All-time tally. Each comment counts once per page load, and the background
  // script serialises the storage writes so tabs don't race.
  // ---------------------------------------------------------------------------

  const countedIds = new Set();
  const countedEls = new WeakSet();
  let pendingTally = 0;
  let tallyTimer = null;
  let lifetime = null;

  function commentId(el) {
    return el.getAttribute('thingid') || el.dataset.fullname || el.id || null;
  }

  function tally(el) {
    const id = commentId(el);
    if (id) {
      if (countedIds.has(id)) return;
      countedIds.add(id);
    } else {
      if (countedEls.has(el)) return;
      countedEls.add(el);
    }
    pendingTally += 1;
    if (tallyTimer) return;
    tallyTimer = setTimeout(flushTally, 500);
  }

  function flushTally() {
    tallyTimer = null;
    const delta = pendingTally;
    pendingTally = 0;
    if (!delta) return;
    try {
      const p = api?.runtime?.sendMessage?.({ type: 'rgc:tally', delta });
      if (p && typeof p.then === 'function') {
        p.then((r) => {
          if (r && typeof r.total === 'number') {
            lifetime = r.total;
            updateCounter();
          }
        }).catch(() => {});
      }
    } catch {
      /* extension context gone */
    }
  }

  function loadLifetime() {
    const local = api?.storage?.local;
    if (!local) return Promise.resolve();
    return Promise.resolve(local.get({ lifetime: 0 }))
      .then((r) => { lifetime = Number(r?.lifetime) || 0; })
      .catch(() => {});
  }

  // ---------------------------------------------------------------------------
  // "N low-effort comments hidden" counter: on-page banner + toolbar badge
  // ---------------------------------------------------------------------------

  const BANNER_CLASS = 'rgc-banner';
  let banner = null;
  let lastBadgeCount = -1;

  function describe(count, byKind) {
    const noun = count === 1 ? 'comment' : 'comments';
    const parts = Object.entries(byKind)
      .sort((a, b) => b[1] - a[1])
      .map(([k, n]) => `${n} ${LABELS[k] || k}`);
    const breakdown = parts.length > 1 ? ` (${parts.join(', ')})` : parts.length === 1 ? ` (${LABELS[Object.keys(byKind)[0]]})` : '';
    return `${count} low-effort ${noun}${breakdown}`;
  }

  function ensureBanner() {
    if (banner && banner.isConnected) return banner;
    banner = document.createElement('div');
    banner.className = BANNER_CLASS;
    banner.setAttribute('role', 'status');
    const text = document.createElement('span');
    text.className = `${BANNER_CLASS}__text`;
    const total = document.createElement('span');
    total.className = `${BANNER_CLASS}__total`;
    total.title = 'Collapsed by Not This. since you installed it';
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `${BANNER_CLASS}__btn`;
    btn.addEventListener('click', (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      if (revealed) {
        revealed = false;
        scan();
      } else {
        const s = stats();
        revealedCount = s.total;
        revealedByKind = s.byKind;
        revealed = true;
        restoreAll();
      }
    });
    banner.append(text, total, btn);

    const oldList = document.querySelector('.commentarea .sitetable.nestedlisting');
    const firstNew = document.querySelector('shreddit-comment');
    const anchor = oldList || firstNew;
    if (anchor && anchor.parentNode) {
      anchor.parentNode.insertBefore(banner, anchor);
    } else {
      document.body.appendChild(banner);
    }
    requestAnimationFrame(() => {
      if (banner && banner.isConnected && !isRendered(banner)) {
        banner.classList.add(`${BANNER_CLASS}--floating`);
        document.body.appendChild(banner);
      }
    });
    return banner;
  }
  let revealedByKind = {};

  function removeBanner() {
    if (banner) banner.remove();
    banner = null;
  }

  function sendBadge(count) {
    if (count === lastBadgeCount) return;
    lastBadgeCount = count;
    try {
      const p = api?.runtime?.sendMessage?.({ type: 'rgc:count', count });
      if (p && typeof p.catch === 'function') p.catch(() => {});
    } catch {
      /* extension context gone */
    }
  }

  function updateCounter() {
    const s = stats();
    const count = revealed ? revealedCount : s.total;
    sendBadge(revealed ? 0 : s.total);

    if (!settings.enabled || !settings.showCounter || count === 0) {
      removeBanner();
      return;
    }
    const el = ensureBanner();
    const text = el.querySelector(`.${BANNER_CLASS}__text`);
    const total = el.querySelector(`.${BANNER_CLASS}__total`);
    const btn = el.querySelector(`.${BANNER_CLASS}__btn`);
    total.textContent = lifetime != null ? `${lifetime.toLocaleString()} all time` : '';
    total.hidden = lifetime == null;
    if (revealed) {
      text.textContent = `Showing ${describe(count, revealedByKind)}`;
      btn.textContent = 'Hide again';
    } else {
      const verb = settings.mode === 'hide' ? 'hidden' : 'collapsed';
      text.textContent = `${describe(count, s.byKind)} ${verb}`;
      btn.textContent = 'Show them';
    }
  }

  // ---------------------------------------------------------------------------
  // Wiring
  // ---------------------------------------------------------------------------

  let pending = false;
  function schedule() {
    if (pending) return;
    pending = true;
    setTimeout(() => {
      pending = false;
      scan();
    }, 150);
  }

  function loadSettings() {
    if (!storage) return Promise.resolve({});
    return Promise.resolve(storage.get(null)).then((s) => s || {}).catch(() => ({}));
  }

  api?.storage?.onChanged?.addListener((changes, area) => {
    if (area === 'local' && 'lifetime' in changes) {
      lifetime = Number(changes.lifetime.newValue) || 0;
      updateCounter();
      return;
    }
    if (area !== 'sync') return;
    let touched = false;
    for (const [key, change] of Object.entries(changes)) {
      if (key in DEFAULTS || key === 'includeImages') {
        if ('newValue' in change && change.newValue !== undefined) rawSettings[key] = change.newValue;
        else delete rawSettings[key];
        touched = true;
      }
    }
    if (!touched) return;
    settings = normalizeSettings(rawSettings);
    revealed = false;
    restoreAll();
    scan();
    updateCounter();
  });

  api?.runtime?.onMessage?.addListener((msg, _sender, sendResponse) => {
    if (msg && msg.type === 'rgc:stats') sendResponse(stats());
  });

  // Exposed for the local test fixture (test/fixture.html); harmless on Reddit.
  globalThis.__rgc = {
    scan,
    restoreAll,
    stats,
    classifyBody,
    normalizeText,
    get settings() { return settings; },
    set settings(s) {
      rawSettings = s || {};
      settings = normalizeSettings(rawSettings);
      revealed = false;
    },
  };

  Promise.all([loadSettings(), loadLifetime()]).then(([raw]) => {
    rawSettings = raw;
    settings = normalizeSettings(raw);
    scan();
    new MutationObserver(schedule).observe(document.documentElement, {
      childList: true,
      subtree: true,
    });
  });
})();
