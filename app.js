// ============================================================
// English Trainer App
// SM-2 Spaced Repetition, mehrstufiges Lernen, lokale Persistenz
// ============================================================

const STORAGE_KEY = 'english_trainer_data_v1';
const SESSION_KEY = 'english_trainer_session_v1';

// ============ State ============
const state = {
  items: [],            // alle Sätze + Vokabeln mit Lernfortschritt
  categories: {},
  view: 'learn',
  currentItem: null,
  cardFlipped: false,
  filterCategory: null,
  filterType: null,     // 'phrase' | 'vocab' | null
  sessionCount: 0,
  searchQuery: '',
};

// ============ Storage ============
function saveItems() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.items));
  } catch (e) { console.error('Save fehlgeschlagen', e); }
}

function saveSession() {
  try {
    const today = new Date().toDateString();
    localStorage.setItem(SESSION_KEY, JSON.stringify({ date: today, count: state.sessionCount }));
  } catch (e) {}
}

function loadSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return;
    const data = JSON.parse(raw);
    if (data.date === new Date().toDateString()) {
      state.sessionCount = data.count || 0;
    }
  } catch (e) {}
}

// ============ Initialisierung ============
async function init() {
  loadSession();

  // 1) Versuche, gespeicherte Items zu laden
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) {
    try {
      state.items = JSON.parse(saved);
    } catch (e) {
      state.items = [];
    }
  }

  // 2) content.json laden (für Kategorien + um neue Items zu mergen)
  const content = await window.ContentLoader.load();
  state.categories = content.categories || {};

  if (state.items.length === 0) {
    // Erste Initialisierung
    state.items = content.items.map((item, i) => createNewItem(item, i));
    saveItems();
  } else {
    // Merge: Neue Items aus content.json hinzufügen, die noch nicht im State sind
    const existingKeys = new Set(state.items.map(i => makeKey(i)));
    let added = 0;
    content.items.forEach((item, i) => {
      if (!existingKeys.has(makeKey(item))) {
        state.items.push(createNewItem(item, state.items.length + i));
        added++;
      }
    });
    if (added > 0) {
      saveItems();
      showToast(`${added} neue Einträge geladen`);
    }
  }

  setupEventListeners();
  render();
}

function makeKey(item) {
  return (item.de + '||' + item.en).toLowerCase().trim();
}

function createNewItem(base, idx) {
  const item = {
    id: 'i_' + Date.now() + '_' + idx + '_' + Math.random().toString(36).slice(2, 7),
    de: base.de,
    en: base.en,
    cat: base.cat,
    type: base.type || 'phrase',
    // SM-2
    ef: 2.5,
    interval: 0,
    reps: 0,
    nextReview: Date.now(),
    // Lernfortschritt
    level: 1,          // 1 = Karten, 2 = Tippen
    correctCount: 0,
    seenCount: 0,
  };
  // Bei Dialogen: zusätzliche Felder übernehmen
  if (base.type === 'dialogue') {
    item.lines = base.lines || [];
    item.title = base.title || '';
  }
  return item;
}

// ============ SM-2 Algorithm ============
function updateCard(item, quality) {
  // quality: 0 = Nochmal, 1 = Schwer, 2 = Gut, 3 = Einfach
  const sm2Quality = [1, 3, 4, 5][quality];
  item.seenCount++;

  if (sm2Quality < 3) {
    item.reps = 0;
    item.interval = 0;
  } else {
    item.correctCount++;
    if (item.reps === 0) item.interval = 1;
    else if (item.reps === 1) item.interval = 3;
    else item.interval = Math.round(item.interval * item.ef);
    item.reps++;
    item.ef = Math.max(1.3, item.ef + (0.1 - (5 - sm2Quality) * (0.08 + (5 - sm2Quality) * 0.02)));
  }

  // Auf Tipp-Modus hochstufen nach 3 erfolgreichen Wiederholungen
  if (item.reps >= 3 && item.level === 1) item.level = 2;

  item.nextReview = Date.now() + item.interval * 24 * 60 * 60 * 1000;
}

function getDueItems(opts = {}) {
  const now = Date.now();
  // Standard: keine Dialoge im Lern-View (die haben eigenen Tab)
  const includeTypes = opts.types || ['phrase', 'vocab'];
  let due = state.items.filter(i =>
    i.nextReview <= now && includeTypes.includes(i.type || 'phrase')
  );
  if (state.filterCategory) due = due.filter(i => i.cat === state.filterCategory);
  if (state.filterType) due = due.filter(i => i.type === state.filterType);

  // Sortierung: Erst neue, dann nach Fälligkeit
  due.sort((a, b) => {
    if (a.seenCount === 0 && b.seenCount > 0) return -1;
    if (b.seenCount === 0 && a.seenCount > 0) return 1;
    return a.nextReview - b.nextReview;
  });
  return due;
}

function getDueDialogues() {
  return getDueItems({ types: ['dialogue'] });
}

// ============ Render ============
function render() {
  document.querySelectorAll('.tab-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.view === state.view);
  });
  document.getElementById('streak-info').textContent = state.sessionCount + ' gelernt heute';

  const content = document.getElementById('content');
  if (state.view === 'learn') renderLearn(content);
  else if (state.view === 'dialogues') renderDialogues(content);
  else if (state.view === 'categories') renderCategories(content);
  else if (state.view === 'manage') renderManage(content);
  else if (state.view === 'stats') renderStats(content);
}

function renderLearn(content) {
  const due = getDueItems();

  if (due.length === 0) {
    const next = state.items
      .filter(i => !state.filterCategory || i.cat === state.filterCategory)
      .sort((a, b) => a.nextReview - b.nextReview)[0];
    const nextTime = next ? new Date(next.nextReview) : null;
    content.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">✓</div>
        <h3>Alles erledigt!</h3>
        <p>Keine Karten fällig${state.filterCategory ? ' in dieser Kategorie' : ''}.</p>
        ${nextTime ? `<p style="font-size:12px;">Nächste Karte: ${formatTime(nextTime)}</p>` : ''}
        ${state.filterCategory ? '<button class="btn" onclick="clearFilter()">Alle Kategorien zeigen</button>' : ''}
      </div>
    `;
    return;
  }

  const item = due[0];
  state.currentItem = item;
  const cat = state.categories[item.cat] || { label: item.cat, icon: '📌' };
  const typeLabel = item.type === 'vocab' ? 'Vokabel' : 'Satz';

  // Filter-Banner anzeigen wenn aktiv
  const filterBannerHTML = state.filterCategory ? `
    <div class="filter-banner">
      <span>Filter: ${state.categories[state.filterCategory]?.label || state.filterCategory}</span>
      <button class="filter-clear" onclick="clearFilter()">Entfernen</button>
    </div>
  ` : '';

  if (item.level === 2) {
    // ======== Tipp-Modus ========
    content.innerHTML = `
      ${filterBannerHTML}
      <div class="mode-bar">
        <span class="pill pill-info">⌨ Tipp-Modus · ${typeLabel}</span>
        <span class="pill">${due.length} fällig</span>
      </div>
      <div class="prompt-card">
        <div class="card-cat">${cat.label}</div>
        <div class="card-text">${escapeHtml(item.de)}</div>
      </div>
      <textarea id="answer-input" class="typing-input"
                placeholder="Auf Englisch eintippen..."
                autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false"></textarea>
      <div class="btn-row" style="margin-top:12px;">
        <button class="btn btn-primary" onclick="checkAnswer()">Prüfen</button>
        <button class="btn" onclick="skipToFlashcard()">Anzeigen</button>
      </div>
      <div id="result-box"></div>
    `;
    setTimeout(() => {
      const inp = document.getElementById('answer-input');
      if (inp) {
        inp.focus();
        inp.addEventListener('keydown', e => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) checkAnswer();
        });
      }
    }, 50);
  } else {
    // ======== Karten-Modus ========
    content.innerHTML = `
      ${filterBannerHTML}
      <div class="mode-bar">
        <span class="pill">🃏 Karten-Modus · ${typeLabel}</span>
        <span class="pill">${due.length} fällig</span>
      </div>
      <div class="flip-card" id="flip-card" onclick="flipCard()">
        <div class="flip-inner">
          <div class="flip-face">
            <div class="card-cat">${cat.label}</div>
            <div class="card-text">${escapeHtml(item.de)}</div>
            <div class="card-hint">Antippen zum Umdrehen</div>
          </div>
          <div class="flip-face flip-back">
            <div class="card-cat">English</div>
            <div class="card-text">${escapeHtml(item.en)}</div>
            <div class="card-hint">Antippen zum Zurückdrehen</div>
          </div>
        </div>
      </div>
      <div id="rating-area" style="display:none;">
        <p class="section-title" style="text-align:center;">Wie gut wusstest du es?</p>
        <div class="rating-row">
          <button class="rating-btn again" onclick="rateCard(0)">Nochmal</button>
          <button class="rating-btn" onclick="rateCard(1)">Schwer</button>
          <button class="rating-btn" onclick="rateCard(2)">Gut</button>
          <button class="rating-btn easy" onclick="rateCard(3)">Einfach</button>
        </div>
      </div>
    `;
  }
}

// ============ Dialog-View ============
function renderDialogues(content) {
  const due = getDueDialogues();

  // Filter-Banner für Dialog-Kategorie
  const filterBannerHTML = state.filterCategory ? `
    <div class="filter-banner">
      <span>Filter: ${state.categories[state.filterCategory]?.label || state.filterCategory}</span>
      <button class="filter-clear" onclick="clearFilter()">Entfernen</button>
    </div>
  ` : '';

  if (due.length === 0) {
    const allDialogues = state.items.filter(i => i.type === 'dialogue');
    if (allDialogues.length === 0) {
      content.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">💬</div>
          <h3>Keine Dialoge vorhanden</h3>
          <p>Lade neue Dialoge per Import, oder warte auf das nächste Content-Update.</p>
        </div>
      `;
      return;
    }
    const next = allDialogues
      .filter(i => !state.filterCategory || i.cat === state.filterCategory)
      .sort((a, b) => a.nextReview - b.nextReview)[0];
    const nextTime = next ? new Date(next.nextReview) : null;
    content.innerHTML = `
      ${filterBannerHTML}
      <div class="empty-state">
        <div class="empty-icon">✓</div>
        <h3>Alle Dialoge erledigt!</h3>
        <p>Keine Dialoge fällig${state.filterCategory ? ' in dieser Kategorie' : ''}.</p>
        ${nextTime ? `<p style="font-size:12px;">Nächster Dialog: ${formatTime(nextTime)}</p>` : ''}
        ${state.filterCategory ? '<button class="btn" onclick="clearFilter()">Alle Kategorien zeigen</button>' : ''}
      </div>
    `;
    return;
  }

  const item = due[0];
  state.currentItem = item;
  const cat = state.categories[item.cat] || { label: item.cat };
  const lines = item.lines || [];

  // Dialog-Zeilen rendern (mit alternierenden Sprechern A/B)
  const renderLines = (key) => lines.map((line, idx) => {
    const speaker = idx % 2 === 0 ? 'A' : 'B';
    return `
      <div class="dialog-line">
        <span class="dialog-speaker speaker-${speaker.toLowerCase()}">${speaker}</span>
        <span class="dialog-text">${escapeHtml(line[key])}</span>
      </div>
    `;
  }).join('');

  content.innerHTML = `
    ${filterBannerHTML}
    <div class="mode-bar">
      <span class="pill">💬 Dialog · ${cat.label}</span>
      <span class="pill">${due.length} fällig</span>
    </div>
    <div class="flip-card dialog-card" id="flip-card" onclick="flipCard()">
      <div class="flip-inner">
        <div class="flip-face dialog-face">
          <div class="card-cat">${escapeHtml(item.title || cat.label)}</div>
          <div class="dialog-lines">${renderLines('de')}</div>
          <div class="card-hint">Antippen zum Umdrehen</div>
        </div>
        <div class="flip-face flip-back dialog-face">
          <div class="card-cat">English</div>
          <div class="dialog-lines">${renderLines('en')}</div>
          <div class="card-hint">Antippen zum Zurückdrehen</div>
        </div>
      </div>
    </div>
    <div id="rating-area" style="display:none;">
      <p class="section-title" style="text-align:center;">Wie gut konntest du den Dialog übersetzen?</p>
      <div class="rating-row">
        <button class="rating-btn again" onclick="rateCard(0)">Nochmal</button>
        <button class="rating-btn" onclick="rateCard(1)">Schwer</button>
        <button class="rating-btn" onclick="rateCard(2)">Gut</button>
        <button class="rating-btn easy" onclick="rateCard(3)">Einfach</button>
      </div>
    </div>
  `;
}

function renderCategories(content) {
  const phraseCats = Object.entries(state.categories).filter(([k, c]) => c.type === 'phrase');
  const vocabCats = Object.entries(state.categories).filter(([k, c]) => c.type === 'vocab');
  const dialogueCats = Object.entries(state.categories).filter(([k, c]) => c.type === 'dialogue');

  let html = '';
  if (state.filterCategory) {
    html += `
      <div class="filter-banner">
        <span>Filter: ${state.categories[state.filterCategory]?.label || state.filterCategory}</span>
        <button class="filter-clear" onclick="clearFilter()">Entfernen</button>
      </div>
    `;
  }

  html += `<p class="section-title">Tippe eine Kategorie, um gezielt zu üben.</p>`;

  html += `<div class="cat-section-title">📣 Sätze (${phraseCats.length})</div>`;
  html += '<div class="cat-list">';
  phraseCats.forEach(([key, cat]) => html += renderCategoryRow(key, cat, 'learn'));
  html += '</div>';

  html += `<div class="cat-section-title">📖 Vokabeln (${vocabCats.length})</div>`;
  html += '<div class="cat-list">';
  vocabCats.forEach(([key, cat]) => html += renderCategoryRow(key, cat, 'learn'));
  html += '</div>';

  if (dialogueCats.length > 0) {
    html += `<div class="cat-section-title">💬 Dialoge (${dialogueCats.length})</div>`;
    html += '<div class="cat-list">';
    dialogueCats.forEach(([key, cat]) => html += renderCategoryRow(key, cat, 'dialogues'));
    html += '</div>';
  }

  content.innerHTML = html;
}

function renderCategoryRow(key, cat, targetView = 'learn') {
  const items = state.items.filter(i => i.cat === key);
  const due = items.filter(i => i.nextReview <= Date.now()).length;
  const mastered = items.filter(i => i.reps >= 3).length;
  return `
    <div class="cat-item" onclick="selectCategory('${key}', '${targetView}')">
      <div class="cat-info">
        <div class="cat-icon">${getCatIcon(cat.icon)}</div>
        <div>
          <div class="cat-name">${cat.label}</div>
          <div class="cat-meta">${items.length} Einträge · ${mastered} gemeistert</div>
        </div>
      </div>
      ${due > 0 ? `<span class="pill pill-warning">${due} fällig</span>` : '<span style="color:var(--text-3)">›</span>'}
    </div>
  `;
}

function renderManage(content) {
  let html = `
    <div class="btn-row" style="margin-bottom:12px;">
      <button class="btn btn-primary" onclick="showAddModal()">+ Neuer Eintrag</button>
      <label class="btn" style="display:flex;align-items:center;justify-content:center;cursor:pointer;">
        📁 Import
        <input type="file" accept=".json" onchange="handleImport(event)" />
      </label>
    </div>

    <div class="import-section">
      <p><strong>Tipp:</strong> Mehr Inhalte mit einer JSON-Datei importieren. Du kannst Claude bitten dir eine zu erstellen.</p>
      <button class="btn" onclick="exportData()">Aktuelle Daten exportieren</button>
    </div>

    <input type="text" class="search-input" placeholder="Suchen..." id="search-input" value="${escapeHtml(state.searchQuery)}" oninput="updateSearch(this.value)" />

    <p class="section-title">${state.items.length} Einträge in deiner Sammlung</p>
    <div class="manage-list">
  `;

  const q = state.searchQuery.toLowerCase();
  const filtered = state.items
    .filter(i => !q || i.de.toLowerCase().includes(q) || i.en.toLowerCase().includes(q))
    .slice()
    .reverse()
    .slice(0, 100);

  filtered.forEach(item => {
    const cat = state.categories[item.cat] || { label: item.cat };
    html += `
      <div class="item-row">
        <div class="item-content">
          <div class="item-en">${escapeHtml(item.en)}</div>
          <div class="item-de">${escapeHtml(item.de)}</div>
          <div class="item-cat">${item.type === 'vocab' ? '📖' : '📣'} ${cat.label}</div>
        </div>
        <button class="delete-btn" onclick="deleteItem('${item.id}')" aria-label="Löschen">✕</button>
      </div>
    `;
  });

  if (filtered.length === 100 && state.items.length > 100) {
    html += `<p style="text-align:center;font-size:12px;color:var(--text-3);padding:12px;">Nur die ersten 100 angezeigt. Verwende die Suche.</p>`;
  }

  html += '</div>';
  content.innerHTML = html;

  // Focus restore (Suchfeld behält Fokus)
  const inp = document.getElementById('search-input');
  if (inp && state.searchQuery) {
    inp.focus();
    inp.setSelectionRange(state.searchQuery.length, state.searchQuery.length);
  }
}

function renderStats(content) {
  const total = state.items.length;
  const mastered = state.items.filter(i => i.reps >= 3).length;
  const learning = state.items.filter(i => i.seenCount > 0 && i.reps < 3).length;
  const newItems = state.items.filter(i => i.seenCount === 0).length;
  const due = state.items.filter(i => i.nextReview <= Date.now()).length;
  const totalSeen = state.items.reduce((a, p) => a + p.seenCount, 0);
  const totalCorrect = state.items.reduce((a, p) => a + p.correctCount, 0);
  const accuracy = totalSeen > 0 ? Math.round((totalCorrect / totalSeen) * 100) : 0;

  const phrasesCount = state.items.filter(i => i.type === 'phrase').length;
  const vocabsCount = state.items.filter(i => i.type === 'vocab').length;
  const dialoguesCount = state.items.filter(i => i.type === 'dialogue').length;

  content.innerHTML = `
    <div class="stat-grid">
      ${statCard('Gemeistert', mastered, '🏆')}
      ${statCard('Am Lernen', learning, '📈')}
      ${statCard('Neu', newItems, '✨')}
      ${statCard('Fällig jetzt', due, '⏰')}
    </div>

    <div class="progress-card">
      <div style="display:flex;justify-content:space-between;font-size:12px;color:var(--text-2);">
        <span>Gesamtfortschritt</span>
        <span>${mastered} / ${total}</span>
      </div>
      <div class="progress-bar"><div class="progress-fill" style="width:${total > 0 ? (mastered / total * 100) : 0}%"></div></div>
    </div>

    <div class="progress-card">
      <div style="display:flex;justify-content:space-between;align-items:center;">
        <span style="font-size:13px;">Trefferquote</span>
        <span style="font-size:13px;font-weight:600;">${accuracy}%</span>
      </div>
    </div>

    <div class="progress-card">
      <div style="display:flex;justify-content:space-between;align-items:center;">
        <span style="font-size:13px;">Heute gelernt</span>
        <span style="font-size:13px;font-weight:600;">${state.sessionCount}</span>
      </div>
    </div>

    <div class="progress-card">
      <div style="display:flex;justify-content:space-between;align-items:center;">
        <span style="font-size:13px;">Sätze / Vokabeln / Dialoge</span>
        <span style="font-size:13px;font-weight:600;">${phrasesCount} / ${vocabsCount} / ${dialoguesCount}</span>
      </div>
    </div>

    <p class="section-title" style="margin-top:24px;">Einstellungen</p>
    <div class="settings-list">
      <div class="settings-row" onclick="exportData()">
        <span>Daten exportieren (Backup)</span><span>›</span>
      </div>
      <div class="settings-row danger" onclick="resetAll()">
        <span>Fortschritt zurücksetzen</span><span>›</span>
      </div>
    </div>
  `;
}

function statCard(label, value, icon) {
  return `
    <div class="stat-card">
      <div style="display:flex;justify-content:space-between;align-items:center;">
        <span class="stat-label">${label}</span>
        <span>${icon}</span>
      </div>
      <div class="stat-value">${value}</div>
    </div>
  `;
}

// ============ Helpers ============
function getCatIcon(iconName) {
  const map = {
    'ti-hand-stop': '👋', 'ti-ear': '👂', 'ti-bulb': '💡', 'ti-help-circle': '❓',
    'ti-message': '💬', 'ti-arrow-back': '↩', 'ti-pause': '⏸', 'ti-arrows-shuffle': '🔀',
    'ti-check': '✓', 'ti-arrows-exchange': '⇄', 'ti-calendar-event': '📅', 'ti-chart-bar': '📊',
    'ti-video': '📹', 'ti-briefcase': '💼', 'ti-currency-euro': '€', 'ti-shopping-cart': '🛒',
    'ti-bolt': '⚡', 'ti-clock': '🕐', 'ti-tag': '🏷', 'ti-link': '🔗',
    'ti-device-laptop': '💻', 'ti-coffee': '☕',
    'ti-alert-circle': '⚠️', 'ti-presentation': '🎤',
  };
  return map[iconName] || '📌';
}

function escapeHtml(s) {
  const div = document.createElement('div');
  div.textContent = s;
  return div.innerHTML;
}

function formatTime(date) {
  const diff = date - Date.now();
  const hours = Math.round(diff / 36e5);
  if (hours < 24) return `in ${hours}h`;
  return `in ${Math.round(hours / 24)} Tagen`;
}

function showToast(text) {
  // Alte Toasts entfernen
  document.querySelectorAll('.toast').forEach(t => t.remove());
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = text;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2600);
}

// Levenshtein-Distanz für Tipp-Fehler-Toleranz
function compareStrings(a, b) {
  const norm = s => s.toLowerCase().replace(/[.,!?;:'"\-]/g, '').replace(/\s+/g, ' ').trim();
  const na = norm(a), nb = norm(b);
  if (na === nb) return 1.0;
  const m = [];
  for (let i = 0; i <= nb.length; i++) m[i] = [i];
  for (let j = 0; j <= na.length; j++) m[0][j] = j;
  for (let i = 1; i <= nb.length; i++) {
    for (let j = 1; j <= na.length; j++) {
      if (nb[i - 1] === na[j - 1]) m[i][j] = m[i - 1][j - 1];
      else m[i][j] = Math.min(m[i - 1][j - 1] + 1, m[i][j - 1] + 1, m[i - 1][j] + 1);
    }
  }
  return 1 - (m[nb.length][na.length] / Math.max(na.length, nb.length));
}

// ============ Actions ============
function flipCard() {
  const fc = document.getElementById('flip-card');
  if (!fc) return;
  fc.classList.toggle('flipped');
  state.cardFlipped = fc.classList.contains('flipped');
  // Rating-Buttons erscheinen nach erstem Umdrehen und bleiben danach sichtbar
  if (state.cardFlipped) {
    document.getElementById('rating-area').style.display = 'block';
  }
}

function rateCard(quality) {
  if (!state.currentItem) return;
  updateCard(state.currentItem, quality);
  state.sessionCount++;
  saveItems();
  saveSession();
  state.cardFlipped = false;
  render();
}

function checkAnswer() {
  const inp = document.getElementById('answer-input');
  const ans = inp.value.trim();
  if (!ans) return;
  const correct = state.currentItem.en;
  const similarity = compareStrings(ans, correct);
  const resultBox = document.getElementById('result-box');
  let quality, cls, msg;
  if (similarity >= 0.95) {
    quality = 3; cls = 'result-correct'; msg = '✓ Perfekt!';
    resultBox.innerHTML = `<div class="result-box ${cls}">${msg}</div>`;
  } else if (similarity >= 0.75) {
    quality = 2; cls = 'result-close'; msg = '~ Fast richtig.';
    resultBox.innerHTML = `<div class="result-box ${cls}">${msg}<div class="result-solution">Lösung: ${escapeHtml(correct)}</div></div>`;
  } else {
    quality = 0; cls = 'result-wrong'; msg = '✕ Nicht ganz.';
    resultBox.innerHTML = `<div class="result-box ${cls}">${msg}<div class="result-solution">Lösung: ${escapeHtml(correct)}</div></div>`;
  }
  resultBox.innerHTML += `
    <div class="btn-row" style="margin-top:10px;">
      <button class="btn btn-primary btn-full" onclick="continueAfterCheck(${quality})">Weiter</button>
    </div>
  `;
}

function continueAfterCheck(quality) {
  rateCard(quality);
}

function skipToFlashcard() {
  if (!state.currentItem) return;
  state.currentItem.level = 1;
  render();
}

function selectCategory(key, targetView = 'learn') {
  state.filterCategory = key;
  state.view = targetView;
  render();
}

function clearFilter() {
  state.filterCategory = null;
  state.filterType = null;
  render();
}

function updateSearch(val) {
  state.searchQuery = val;
  renderManage(document.getElementById('content'));
}

function deleteItem(id) {
  if (!confirm('Diesen Eintrag wirklich löschen?')) return;
  state.items = state.items.filter(i => i.id !== id);
  saveItems();
  render();
}

function resetAll() {
  if (!confirm('Allen Fortschritt zurücksetzen? Die Einträge bleiben erhalten.')) return;
  state.items.forEach(i => {
    i.ef = 2.5; i.interval = 0; i.reps = 0;
    i.nextReview = Date.now(); i.level = 1;
    i.correctCount = 0; i.seenCount = 0;
  });
  state.sessionCount = 0;
  saveItems();
  saveSession();
  showToast('Fortschritt zurückgesetzt');
  render();
}

// ============ Add / Import / Export ============
function showAddModal() {
  const modalRoot = document.getElementById('modal-root');
  const catOptions = Object.entries(state.categories)
    .map(([k, c]) => `<option value="${k}">${c.label}</option>`).join('');
  modalRoot.innerHTML = `
    <div class="modal-bg" onclick="if(event.target===this)closeModal()">
      <div class="modal-box">
        <h3 class="modal-title">Neuer Eintrag</h3>
        <div class="form-group">
          <label class="form-label">Typ</label>
          <select id="new-type" class="form-select">
            <option value="phrase">Satz</option>
            <option value="vocab">Vokabel</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Deutsch</label>
          <textarea id="new-de" class="form-textarea" placeholder="z.B. Lass uns das vertagen."></textarea>
        </div>
        <div class="form-group">
          <label class="form-label">Englisch</label>
          <textarea id="new-en" class="form-textarea" placeholder="z.B. Let's postpone this."></textarea>
        </div>
        <div class="form-group">
          <label class="form-label">Kategorie</label>
          <select id="new-cat" class="form-select">${catOptions}</select>
        </div>
        <div class="btn-row">
          <button class="btn" onclick="closeModal()">Abbrechen</button>
          <button class="btn btn-primary" onclick="addItem()">Hinzufügen</button>
        </div>
      </div>
    </div>
  `;
}

function closeModal() {
  document.getElementById('modal-root').innerHTML = '';
}

function addItem() {
  const deEl = document.getElementById('new-de');
  const enEl = document.getElementById('new-en');
  const catEl = document.getElementById('new-cat');
  const typeEl = document.getElementById('new-type');
  if (!deEl || !enEl || !catEl || !typeEl) return;

  const de = deEl.value.trim();
  const en = enEl.value.trim();
  const cat = catEl.value;
  const type = typeEl.value;

  if (!de || !en) {
    showToast('Bitte beide Übersetzungen eingeben');
    return;
  }

  // Duplikat-Check
  const key = (de + '||' + en).toLowerCase();
  if (state.items.some(i => makeKey(i) === key)) {
    showToast('Dieser Eintrag existiert bereits');
    return;
  }

  state.items.push(createNewItem({ de, en, cat, type }, state.items.length));
  saveItems();
  closeModal();
  showToast('Eintrag hinzugefügt');
  render();
}

// ============ Import / Export ============
function handleImport(event) {
  const file = event.target.files[0];
  if (!file) return;

  // Datei-Größe prüfen (max 5 MB)
  if (file.size > 5 * 1024 * 1024) {
    showToast('Datei zu groß (max. 5 MB)');
    event.target.value = '';
    return;
  }

  const reader = new FileReader();
  reader.onload = e => {
    let data;
    try {
      data = JSON.parse(e.target.result);
    } catch (err) {
      showToast('Ungültige JSON-Datei');
      console.log('Import: JSON Parse Error -', err.message);
      event.target.value = '';
      return;
    }

    const newItems = Array.isArray(data) ? data : (data.items || []);
    if (!Array.isArray(newItems) || !newItems.length) {
      showToast('Keine Einträge in der Datei');
      event.target.value = '';
      return;
    }

    // Neue Kategorien mergen (falls vorhanden)
    if (data.categories && typeof data.categories === 'object') {
      Object.entries(data.categories).forEach(([k, c]) => {
        if (!state.categories[k] && c && c.label) {
          state.categories[k] = c;
        }
      });
    }

    const existingKeys = new Set(state.items.map(i => makeKey(i)));
    const validCats = new Set(Object.keys(state.categories));
    let added = 0;
    let skipped = 0;
    let invalidCat = 0;

    newItems.forEach(item => {
      if (!item || typeof item !== 'object') { skipped++; return; }
      if (!item.de || !item.en || typeof item.de !== 'string' || typeof item.en !== 'string') {
        skipped++; return;
      }
      if (existingKeys.has(makeKey(item))) { skipped++; return; }

      // Kategorie validieren - bei unbekannter Kategorie als 'business' einsortieren
      let cat = item.cat;
      if (!validCats.has(cat)) {
        cat = item.type === 'vocab' ? 'business' : (item.type === 'dialogue' ? 'meeting_start' : 'opinion');
        invalidCat++;
      }

      // Type bestimmen (phrase, vocab, dialogue)
      let type = 'phrase';
      if (item.type === 'vocab') type = 'vocab';
      else if (item.type === 'dialogue') type = 'dialogue';

      const newItem = {
        de: item.de.trim(),
        en: item.en.trim(),
        cat,
        type,
      };
      // Dialog-Felder übernehmen
      if (type === 'dialogue') {
        newItem.lines = Array.isArray(item.lines) ? item.lines : [];
        newItem.title = item.title || '';
      }

      state.items.push(createNewItem(newItem, state.items.length + added));
      existingKeys.add(makeKey(item));
      added++;
    });

    saveItems();
    let msg = `${added} importiert`;
    if (skipped > 0) msg += `, ${skipped} übersprungen`;
    if (invalidCat > 0) msg += ` (${invalidCat} ohne Kategorie)`;
    showToast(msg);
    render();
  };
  reader.onerror = () => {
    showToast('Datei konnte nicht gelesen werden');
  };
  reader.readAsText(file);
  event.target.value = '';
}

function exportData() {
  const exportObj = {
    version: '1.0',
    exportedAt: new Date().toISOString(),
    categories: state.categories,
    items: state.items.map(i => {
      const base = {
        de: i.de, en: i.en, cat: i.cat, type: i.type,
        // Lernfortschritt mitexportieren
        reps: i.reps, ef: i.ef, interval: i.interval, level: i.level,
      };
      if (i.type === 'dialogue') {
        base.lines = i.lines;
        base.title = i.title;
      }
      return base;
    }),
  };
  const blob = new Blob([JSON.stringify(exportObj, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `english-trainer-export-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('Export heruntergeladen');
}

// ============ Event Listener ============
function setupEventListeners() {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      state.view = btn.dataset.view;
      render();
    });
  });

  document.getElementById('menu-btn').addEventListener('click', () => {
    state.view = 'stats';
    render();
  });
}

// Make functions globally available for inline handlers
window.flipCard = flipCard;
window.rateCard = rateCard;
window.checkAnswer = checkAnswer;
window.continueAfterCheck = continueAfterCheck;
window.skipToFlashcard = skipToFlashcard;
window.selectCategory = selectCategory;
window.clearFilter = clearFilter;
window.deleteItem = deleteItem;
window.resetAll = resetAll;
window.showAddModal = showAddModal;
window.closeModal = closeModal;
window.addItem = addItem;
window.handleImport = handleImport;
window.exportData = exportData;
window.updateSearch = updateSearch;

// ============ Start ============
init();
