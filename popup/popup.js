'use strict';

const api = globalThis.browser ?? globalThis.chrome;

const RULE_DEFAULTS = {
  gif: true, image: false, emote: true, phrase: true, link: true,
  bot: true, pasta: true, quote: false, short: false, score: false,
};
const DEFAULTS = {
  enabled: true, mode: 'collapse', showCounter: true, keepReplies: false,
  rules: RULE_DEFAULTS, shortWords: 3, scoreBelow: 0, mutedUsers: [],
};
const LABELS = {
  gif: 'GIF', image: 'image', emote: 'emoji', phrase: '"this"', link: 'link-only',
  bot: 'bot', pasta: 'copypasta', quote: 'quote-only', short: 'short', score: 'downvoted',
  muted: 'muted',
};

const $ = (id) => document.getElementById(id);
const $enabled = $('enabled');
const $body = $('body');
const $rules = [...document.querySelectorAll('input[data-rule]')];
const $modes = [...document.querySelectorAll('input[name="mode"]')];
const $shortWords = $('shortWords');
const $scoreBelow = $('scoreBelow');
const $keepReplies = $('keepReplies');
const $showCounter = $('showCounter');
const $mutedUsers = $('mutedUsers');
const $status = $('status');

function normalize(raw) {
  const r = raw || {};
  const s = { ...DEFAULTS, ...r };
  s.rules = { ...RULE_DEFAULTS, ...(r.rules || {}) };
  if ('includeImages' in r && !(r.rules && 'image' in r.rules)) s.rules.image = !!r.includeImages;
  s.mutedUsers = Array.isArray(s.mutedUsers) ? s.mutedUsers : [];
  return s;
}

let current = normalize({});

function render(s) {
  $enabled.checked = s.enabled;
  $body.setAttribute('aria-disabled', String(!s.enabled));
  $rules.forEach((cb) => { cb.checked = !!s.rules[cb.dataset.rule]; });
  $modes.forEach((r) => { r.checked = r.value === s.mode; });
  $shortWords.value = s.shortWords;
  $scoreBelow.value = s.scoreBelow;
  $keepReplies.checked = s.keepReplies;
  $showCounter.checked = s.showCounter;
  $mutedUsers.value = s.mutedUsers.join('\n');
}

async function load() {
  const stored = await api.storage.sync.get(null);
  current = normalize(stored);
  render(current);
}

function save(patch) {
  Object.assign(current, patch);
  return api.storage.sync.set(patch);
}

function statsSoon() {
  setTimeout(refreshStats, 350);
}

$enabled.addEventListener('change', async () => {
  await save({ enabled: $enabled.checked });
  $body.setAttribute('aria-disabled', String(!$enabled.checked));
  statsSoon();
});

$rules.forEach((cb) => cb.addEventListener('change', async () => {
  const rules = { ...current.rules, [cb.dataset.rule]: cb.checked };
  await save({ rules });
  statsSoon();
}));

$modes.forEach((r) => r.addEventListener('change', async () => {
  if (r.checked) {
    await save({ mode: r.value });
    statsSoon();
  }
}));

$shortWords.addEventListener('change', async () => {
  const n = Math.min(20, Math.max(1, parseInt($shortWords.value, 10) || DEFAULTS.shortWords));
  $shortWords.value = n;
  await save({ shortWords: n });
  statsSoon();
});

$scoreBelow.addEventListener('change', async () => {
  const n = parseInt($scoreBelow.value, 10);
  const v = Number.isFinite(n) ? n : DEFAULTS.scoreBelow;
  $scoreBelow.value = v;
  await save({ scoreBelow: v });
  statsSoon();
});

$keepReplies.addEventListener('change', async () => {
  await save({ keepReplies: $keepReplies.checked });
  statsSoon();
});

$showCounter.addEventListener('change', async () => {
  await save({ showCounter: $showCounter.checked });
});

let mutedTimer = null;
$mutedUsers.addEventListener('input', () => {
  clearTimeout(mutedTimer);
  mutedTimer = setTimeout(async () => {
    const list = $mutedUsers.value
      .split(/\r?\n/)
      .map((u) => u.trim().replace(/^\/?u\//i, ''))
      .filter(Boolean);
    await save({ mutedUsers: [...new Set(list.map((u) => u.toLowerCase()))] });
    statsSoon();
  }, 400);
});

// ---- Per-page stats ---------------------------------------------------------

async function refreshStats() {
  try {
    const [tab] = await api.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) throw new Error('no tab');
    const s = await api.tabs.sendMessage(tab.id, { type: 'rgc:stats' });
    if (!s) throw new Error('no response');
    $status.textContent = '';
    if (!s.enabled) {
      $status.textContent = 'Paused on this page.';
      return;
    }
    if (s.revealed) {
      $status.textContent = `Showing ${s.revealedCount} low-effort comment${s.revealedCount === 1 ? '' : 's'} on this page (you clicked "Show them").`;
      return;
    }
    if (!s.total) {
      $status.textContent = 'No low-effort comments found on this page yet.';
      return;
    }
    const verb = s.mode === 'hide' ? 'hidden' : 'collapsed';
    const parts = Object.entries(s.byKind || {})
      .sort((a, b) => b[1] - a[1])
      .map(([k, n]) => `${n} ${LABELS[k] || k}`)
      .join(', ');
    const strong = document.createElement('strong');
    strong.textContent = String(s.total);
    $status.append(strong, ` low-effort comment${s.total === 1 ? '' : 's'} ${verb} on this page`, parts ? ` (${parts}).` : '.');
  } catch {
    $status.textContent = 'Open a Reddit comment thread to see stats.';
  }
}

// ---- All-time tally ---------------------------------------------------------

const $lifetime = $('lifetime');
const $reset = $('reset');
let resetArmed = null;

function renderLifetime(n) {
  $lifetime.textContent = '';
  const strong = document.createElement('strong');
  strong.textContent = (Number(n) || 0).toLocaleString();
  $lifetime.append('All time: ', strong, ` low-effort comment${n === 1 ? '' : 's'} hidden`);
}

async function loadLifetime() {
  try {
    const { lifetime = 0 } = await api.storage.local.get({ lifetime: 0 });
    renderLifetime(lifetime);
  } catch {
    $lifetime.textContent = '';
  }
}

api.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && 'lifetime' in changes) renderLifetime(changes.lifetime.newValue);
});

// Two-click reset: first click arms it for 4 seconds, second click resets.
$reset.addEventListener('click', async () => {
  if (!resetArmed) {
    $reset.textContent = 'Click again to reset';
    $reset.classList.add('confirm');
    resetArmed = setTimeout(() => {
      resetArmed = null;
      $reset.textContent = 'Reset';
      $reset.classList.remove('confirm');
    }, 4000);
    return;
  }
  clearTimeout(resetArmed);
  resetArmed = null;
  $reset.textContent = 'Reset';
  $reset.classList.remove('confirm');
  try {
    await api.runtime.sendMessage({ type: 'rgc:reset-lifetime' });
  } catch {
    await api.storage.local.set({ lifetime: 0 });
  }
  renderLifetime(0);
});

load().then(refreshStats);
loadLifetime();
