# 複数グループ同時アクティベーション実装プラン

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** カレンダーグループを複数同時にONにできる「複数選択モード」を追加し、既存の「切り替えモード」と設定で切り替えられるようにする。

**Architecture:** `currentSelectedGroupName: string | null` を `activeGroups: string[]` に置き換え。グループON時に `originalCalendarState` スナップショットを取得し、全OFFで完全復元。モード設定は `multiGroupMode: boolean` ストレージキーで管理し、Googleカレンダーサイドバーの⚙ボタンとサイドパネルのトグルから変更可能。

**Tech Stack:** Chrome Extension MV3 (content script, side panel), chrome.storage.local, vanilla JS/CSS

---

## ファイル構成

| ファイル | 変更種別 | 内容 |
|---------|---------|------|
| `content.js` | 修正 | `activeGroups`変数・ストレージヘルパー・活性化ロジック・DOM構造・`loadGroupsToPage`・メッセージリスナー更新 |
| `content.css` | 修正 | ⚙ボタン・設定パネル・すべてOFFボタンのスタイル追加 |
| `sidepanel.html` | 修正 | モード切り替えトグルUI追加 |
| `sidepanel.css` | 修正 | トグルスタイル追加 |
| `sidepanel.js` | 修正 | `multiGroupMode` の読み書き・ストレージ同期 |
| `arc/content.js` | 修正 | `content.js` と同じ変更をミラー |
| `arc/content.css` | 修正 | `content.css` と同じ変更をミラー |
| `manifest.json` | 修正 | バージョン `1.2.5` → `1.3.0` |

---

### Task 1: モジュール変数・ストレージヘルパー・コア活性化ロジック

**Files:**
- Modify: `content.js:247` (`let currentSelectedGroupName = null;` を置き換え)
- Modify: `content.js:293-345` (`activateGroup`, `deactivateGroup` を置き換え)

#### ストレージ変数の置き換えと新規ヘルパー

- [ ] **Step 1: `currentSelectedGroupName` を `activeGroups` に置き換える**

`content.js` の247行目:
```js
// 変更前:
let currentSelectedGroupName = null;

// 変更後:
let activeGroups = [];
```

- [ ] **Step 2: `getStoredMultiGroupMode` ヘルパーを `getStoredOrder` の直後（158行目付近）に追加**

```js
function getStoredMultiGroupMode() {
  return new Promise((resolve) => {
    if (!isChromeContextValid()) { resolve(false); return; }
    try {
      chrome.storage.local.get('multiGroupMode', (result) => {
        resolve(!!result.multiGroupMode);
      });
    } catch { resolve(false); }
  });
}
```

- [ ] **Step 3: カレンダー状態操作ヘルパーを `setCalendarOff` の直後（291行目付近）に追加**

```js
async function captureCurrentCalendarState() {
  const state = {};
  for (const cal of await scrollAndCollectCalendars()) {
    state[cal.id] = isCalendarOn(cal.id);
  }
  return state;
}

async function applyCalendarState(targetOnIds) {
  for (const cal of await scrollAndCollectCalendars()) {
    if (targetOnIds.has(cal.id)) {
      await setCalendarOn(cal.id);
    } else {
      await setCalendarOff(cal.id);
    }
  }
}

async function restoreOriginalState(originalCalendarState) {
  for (const [id, wasOn] of Object.entries(originalCalendarState)) {
    if (wasOn) {
      await setCalendarOn(id);
    } else {
      await setCalendarOff(id);
    }
  }
}
```

- [ ] **Step 4: `activateGroup` を以下の実装で置き換える（旧293-325行を削除して差し替え）**

```js
async function activateGroup(groupName) {
  if (!isChromeContextValid()) return;
  const [groups, isMulti, stored] = await Promise.all([
    getStoredGroups(),
    getStoredMultiGroupMode(),
    new Promise((resolve) => {
      try {
        chrome.storage.local.get(['activeGroups', 'originalCalendarState'], (r) => resolve(r));
      } catch { resolve({}); }
    }),
  ]);

  let newActive = stored.activeGroups || [];
  let originalState = stored.originalCalendarState || null;

  if (newActive.length === 0) {
    originalState = await captureCurrentCalendarState();
  }

  if (isMulti) {
    if (!newActive.includes(groupName)) newActive = [...newActive, groupName];
  } else {
    newActive = [groupName];
  }

  const targetOnIds = new Set();
  for (const name of newActive) {
    for (const cal of (groups[name] || [])) {
      targetOnIds.add(cal.id);
    }
  }

  await applyCalendarState(targetOnIds);
  activeGroups = newActive;

  try {
    chrome.storage.local.set(
      { activeGroups: newActive, originalCalendarState: originalState },
      () => { loadGroupsToPage(); }
    );
  } catch { /* invalidated */ }
}
```

- [ ] **Step 5: `deactivateGroup` を以下の実装で置き換える（旧327-345行を削除して差し替え）**

```js
async function deactivateGroup(groupName) {
  if (!isChromeContextValid()) return;
  const stored = await new Promise((resolve) => {
    try {
      chrome.storage.local.get(['activeGroups', 'originalCalendarState'], (r) => resolve(r));
    } catch { resolve({}); }
  });

  const newActive = (stored.activeGroups || []).filter((n) => n !== groupName);
  const originalState = stored.originalCalendarState || {};

  if (newActive.length === 0) {
    await restoreOriginalState(originalState);
    activeGroups = [];
    try {
      chrome.storage.local.remove(
        ['activeGroups', 'originalCalendarState'],
        () => { loadGroupsToPage(); }
      );
    } catch { /* invalidated */ }
  } else {
    const groups = await getStoredGroups();
    const targetOnIds = new Set();
    for (const name of newActive) {
      for (const cal of (groups[name] || [])) {
        targetOnIds.add(cal.id);
      }
    }
    await applyCalendarState(targetOnIds);
    activeGroups = newActive;
    try {
      chrome.storage.local.set(
        { activeGroups: newActive },
        () => { loadGroupsToPage(); }
      );
    } catch { /* invalidated */ }
  }
}
```

- [ ] **Step 6: `resetAllGroups` を `deactivateGroup` の直後に追加**

```js
async function resetAllGroups() {
  if (!isChromeContextValid()) return;
  const stored = await new Promise((resolve) => {
    try {
      chrome.storage.local.get('originalCalendarState', (r) => resolve(r));
    } catch { resolve({}); }
  });

  await restoreOriginalState(stored.originalCalendarState || {});
  activeGroups = [];
  try {
    chrome.storage.local.remove(
      ['activeGroups', 'originalCalendarState'],
      () => { loadGroupsToPage(); }
    );
  } catch { /* invalidated */ }
}
```

- [ ] **Step 7: コミット**

```bash
git add content.js
git commit -m "refactor: activeGroups配列とコア活性化ロジックを実装"
```

---

### Task 2: `insertGroupSection` DOM構造変更（⚙ボタン・設定パネル・リセットコンテナ）

**Files:**
- Modify: `content.js:347` (`GROUP_SECTION_VERSION` を `'4'` に変更)
- Modify: `content.js:349-414` (`insertGroupSection` 関数全体を差し替え)
- Modify: `content.css` (スタイルを追加)

- [ ] **Step 1: `GROUP_SECTION_VERSION` を `'4'` に変更**

```js
const GROUP_SECTION_VERSION = '4';
```

- [ ] **Step 2: `insertGroupSection` 全体を以下で差し替え**

```js
function insertGroupSection() {
  const existing = document.querySelector('#custom-group-section');
  if (existing) {
    if (existing.dataset.version === GROUP_SECTION_VERSION) return;
    existing.remove();
  }

  let targetH2 = null;
  let sectionName = 'カレンダーグループ';

  for (const h2 of document.querySelectorAll('h2.XuJrye')) {
    const text = h2.textContent.trim();
    if (text === 'カレンダー リスト') {
      targetH2 = h2;
    } else if (text === 'Calendar list') {
      targetH2 = h2;
      sectionName = 'Calendar groups';
    }
  }

  if (!targetH2) {
    console.error('[GroupExt] カレンダー リスト の h2 が見つかりません');
    return;
  }

  const section = document.createElement('div');
  section.id = 'custom-group-section';
  section.dataset.version = GROUP_SECTION_VERSION;

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.classList.add('custom-nUt0vb', 'custom-uQ1ixe');
  btn.setAttribute('aria-expanded', 'true');
  btn.innerHTML = `
    <div class="GsuJoe"></div>
    <div class="x5FT4e kkUTBb" style="width:100%;">
      <div class="o8t45d" style="display:flex;align-items:center;justify-content:space-between;width:100%;">
        <div class="aIwHYe">${sectionName}</div>
        <div style="display:flex;align-items:center;">
          <button type="button" class="group-gear-btn" title="グループ選択モード設定" style="border:none;background:none;cursor:pointer;padding:4px;border-radius:4px;color:#5f6368;display:flex;align-items:center;font-size:16px;line-height:1;margin-right:2px;">⚙</button>
          <i class="google-material-icons meh4fc hggPq Dk9A5d" aria-hidden="true" style="margin-right:12px;">keyboard_arrow_up</i>
        </div>
      </div>
    </div>
  `;

  const settingsPanel = document.createElement('div');
  settingsPanel.id = 'group-settings-panel';
  settingsPanel.style.display = 'none';
  settingsPanel.innerHTML = `
    <div class="group-settings-inner">
      <div class="group-settings-title">グループ選択モード</div>
      <label class="group-settings-label">
        <input type="radio" name="group-mode" value="single">
        <div>
          <div class="group-settings-mode-name">切り替えモード</div>
          <div class="group-settings-mode-desc">1つのグループのみON</div>
        </div>
      </label>
      <label class="group-settings-label">
        <input type="radio" name="group-mode" value="multi">
        <div>
          <div class="group-settings-mode-name">複数選択モード</div>
          <div class="group-settings-mode-desc">複数グループを同時にON可能</div>
        </div>
      </label>
    </div>
  `;

  const container = document.createElement('div');
  container.id = 'group-list-container';
  container.setAttribute('role', 'list');
  container.setAttribute('aria-expanded', 'true');

  const list = document.createElement('ul');
  list.id = 'group-list';
  container.appendChild(list);

  const resetContainer = document.createElement('div');
  resetContainer.id = 'group-reset-container';

  btn.addEventListener('click', () => {
    const expanded = btn.getAttribute('aria-expanded') === 'true';
    btn.setAttribute('aria-expanded', String(!expanded));
    container.setAttribute('aria-expanded', String(!expanded));
    btn.querySelector('i').textContent = expanded ? 'keyboard_arrow_down' : 'keyboard_arrow_up';
    container.style.display = expanded ? 'none' : 'block';
  });

  const gearBtn = btn.querySelector('.group-gear-btn');
  gearBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const isOpen = settingsPanel.style.display !== 'none';
    settingsPanel.style.display = isOpen ? 'none' : 'block';
    gearBtn.style.background = isOpen ? '' : 'rgba(26,115,232,0.12)';
    gearBtn.style.color = isOpen ? '' : '#1a73e8';
  });

  settingsPanel.querySelectorAll('input[name="group-mode"]').forEach((radio) => {
    radio.addEventListener('change', () => {
      if (!isChromeContextValid()) return;
      const isMulti = radio.value === 'multi';
      try {
        chrome.storage.local.set({ multiGroupMode: isMulti });
      } catch { /* invalidated */ }
    });
  });

  section.appendChild(btn);
  section.appendChild(settingsPanel);
  section.appendChild(container);
  section.appendChild(resetContainer);
  targetH2.insertAdjacentElement('afterend', section);

  getStoredMultiGroupMode().then((isMulti) => {
    settingsPanel.querySelectorAll('input[name="group-mode"]').forEach((r) => {
      r.checked = r.value === (isMulti ? 'multi' : 'single');
    });
  });

  loadGroupsToPage();
}
```

- [ ] **Step 3: `content.css` にスタイルを追加（ファイル末尾に追記）**

```css
/* === ⚙ 設定パネル === */
.group-settings-inner {
  margin: 0 8px 8px;
  padding: 10px 12px;
  background: #fff;
  border: 1px solid #dadce0;
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.12);
}

.group-settings-title {
  font-size: 11px;
  font-weight: 600;
  color: #5f6368;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 8px;
}

.group-settings-label {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 0;
  cursor: pointer;
}

.group-settings-label input[type="radio"] {
  accent-color: #1a73e8;
  flex-shrink: 0;
}

.group-settings-mode-name {
  font-size: 12px;
  color: #202124;
  font-weight: 500;
}

.group-settings-mode-desc {
  font-size: 11px;
  color: #5f6368;
}

/* === すべてOFFボタン === */
.group-reset-btn {
  display: block;
  width: calc(100% - 28px);
  margin: 4px 14px 6px;
  padding: 5px 12px;
  background: #fff;
  color: #5f6368;
  border: 1px solid #dadce0;
  border-radius: 4px;
  font-size: 12px;
  font-family: 'Google Sans', Roboto, sans-serif;
  cursor: pointer;
  text-align: center;
  transition: background 0.15s, border-color 0.15s;
}

.group-reset-btn:hover {
  background: #f1f3f4;
  border-color: #bdc1c6;
}
```

- [ ] **Step 4: コミット**

```bash
git add content.js content.css
git commit -m "feat: Googleカレンダーサイドバーに⚙設定パネルとリセットコンテナを追加"
```

---

### Task 3: `loadGroupsToPage` / `initActiveGroups` / リスナー更新

**Files:**
- Modify: `content.js:416-469` (`loadGroupsToPage` 全体を差し替え)
- Modify: `content.js:487-507` (`getCurrentSelectedGroup` → `initActiveGroups` に置き換え)
- Modify: `content.js:509-531` (`setMessageListener` を更新)
- Modify: `content.js:533-544` (`setStorageListener` を更新)
- Modify: `content.js:546-554` (`initialize` を更新)

- [ ] **Step 1: `loadGroupsToPage` 全体を以下で差し替え**

```js
function loadGroupsToPage() {
  Promise.all([getStoredGroups(), getStoredOrder()]).then(([groups, order]) => {
    const list = document.getElementById('group-list');
    const resetContainer = document.getElementById('group-reset-container');
    if (!list) return;

    list.style.visibility = 'hidden';
    list.innerHTML = '';

    const names = Object.keys(groups);
    const sorted = [
      ...order.filter((n) => groups[n]),
      ...names.filter((n) => !order.includes(n)),
    ];

    for (const groupName of sorted) {
      const color = getRandomColorForGroup(groupName);
      const isActive = activeGroups.includes(groupName);

      const item = document.createElement('li');
      item.classList.add('group-item-row');
      if (isActive) item.classList.add('group-item-active');
      item.style.cssText = 'display:flex;align-items:center;gap:8px;padding:0 12px 0 16px;cursor:pointer;height:32px;';

      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = isActive;
      checkbox.tabIndex = -1;
      checkbox.style.cssText = `width:14px;height:14px;flex-shrink:0;accent-color:${color};pointer-events:none;`;

      const colorDot = document.createElement('div');
      colorDot.classList.add('group-color-dot');
      colorDot.style.background = color;

      const span = document.createElement('span');
      span.textContent = groupName;
      span.style.cssText = 'flex:1;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;';

      item.addEventListener('click', () => {
        if (activeGroups.includes(groupName)) {
          deactivateGroup(groupName);
        } else {
          activateGroup(groupName);
        }
      });

      item.appendChild(checkbox);
      item.appendChild(colorDot);
      item.appendChild(span);
      list.appendChild(item);
    }

    list.style.visibility = 'visible';

    if (resetContainer) {
      resetContainer.innerHTML = '';
      if (activeGroups.length > 0) {
        const resetBtn = document.createElement('button');
        resetBtn.type = 'button';
        resetBtn.classList.add('group-reset-btn');
        resetBtn.textContent = 'すべてOFF';
        resetBtn.addEventListener('click', () => resetAllGroups());
        resetContainer.appendChild(resetBtn);
      }
    }
  });
}
```

- [ ] **Step 2: `getCurrentSelectedGroup` を `initActiveGroups` に置き換え（旧487-507行を削除して差し替え）**

```js
function initActiveGroups() {
  if (!isChromeContextValid()) return;
  try {
    chrome.storage.local.get('activeGroups', (result) => {
      const storedActive = result.activeGroups || [];
      activeGroups = storedActive;
      if (storedActive.length > 0) {
        getStoredGroups().then((groups) => {
          const targetOnIds = new Set();
          for (const name of activeGroups) {
            for (const cal of (groups[name] || [])) {
              targetOnIds.add(cal.id);
            }
          }
          applyCalendarState(targetOnIds).then(() => loadGroupsToPage());
        });
      } else {
        loadGroupsToPage();
      }
    });
  } catch { /* invalidated */ }
}
```

- [ ] **Step 3: `setMessageListener` を以下で差し替え**

```js
function setMessageListener() {
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.action === 'ping') {
      sendResponse({ pong: true });
    } else if (message.action === 'getCalendars') {
      getAllCalendarsFromCacheAndDOM().then((calendars) => sendResponse({ calendars }));
    } else if (message.action === 'activateGroup') {
      activateGroup(message.groupName);
      sendResponse({ success: true });
    } else if (message.action === 'deactivateGroup') {
      deactivateGroup(message.groupName);
      sendResponse({ success: true });
    } else if (message.action === 'resetAllGroups') {
      resetAllGroups();
      sendResponse({ success: true });
    } else if (message.action === 'refreshGroupList') {
      loadGroupsToPage();
      sendResponse({ success: true });
    } else if (message.action === 'clearCache') {
      clearCalendarCache().then(() => sendResponse({ success: true }));
    } else {
      sendResponse({ success: false });
    }
    return true;
  });
}
```

- [ ] **Step 4: `setStorageListener` を以下で差し替え（`multiGroupMode` 変更時にラジオボタンを同期）**

```js
function setStorageListener() {
  if (!isChromeContextValid()) return;
  try {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local' || !isChromeContextValid()) return;
      if ('calendarGroups' in changes || 'calendarGroupsOrder' in changes) {
        insertGroupSection();
        loadGroupsToPage();
      }
      if ('multiGroupMode' in changes) {
        const panel = document.getElementById('group-settings-panel');
        if (panel) {
          const isMulti = !!changes.multiGroupMode.newValue;
          panel.querySelectorAll('input[name="group-mode"]').forEach((r) => {
            r.checked = r.value === (isMulti ? 'multi' : 'single');
          });
        }
      }
    });
  } catch { /* invalidated */ }
}
```

- [ ] **Step 5: `initialize` を `initActiveGroups` を呼ぶよう更新**

```js
function initialize() {
  if (window.__calendarGroupingInitialized) return;
  window.__calendarGroupingInitialized = true;
  initActiveGroups();
  observeNavPanel();
  setMessageListener();
  setStorageListener();
  initCalendarCache();
}
```

- [ ] **Step 6: Googleカレンダーで動作確認（拡張機能を再ロード後）**
  - グループをクリック → カレンダーが切り替わること
  - ⚙ボタンをクリック → 設定パネルが開閉すること
  - 切り替えモードで2つ目のグループをクリック → 1つ目がOFFになること
  - 複数選択モードで2つ目のグループをクリック → 両方チェックが入ること
  - 複数グループON時に「すべてOFF」ボタンが表示され、クリックで元の状態に戻ること
  - すべてのグループをOFFにすると「すべてOFF」ボタンが消えること

- [ ] **Step 7: コミット**

```bash
git add content.js
git commit -m "feat: loadGroupsToPage/initActiveGroups/リスナーをactiveGroups対応に更新"
```

---

### Task 4: サイドパネルのモード切り替えUI（sidepanel.html + sidepanel.css）

**Files:**
- Modify: `sidepanel.html:54-66` (グループ一覧セクションにトグル行を追加)
- Modify: `sidepanel.css` (トグルスタイルを追加)

- [ ] **Step 1: `sidepanel.html` のグループ一覧セクション内にトグル行を追加**

`<div class="sp-section-header">` ブロックの直後（`<div id="groupList"` の直前）に以下を挿入:

```html
        <div class="sp-mode-row">
          <span class="sp-mode-label">複数グループ同時ON</span>
          <label class="sp-toggle">
            <input type="checkbox" id="multiGroupToggle">
            <span class="sp-toggle-slider"></span>
          </label>
        </div>
```

変更後のセクション全体:
```html
      <!-- グループ一覧 -->
      <div class="sp-section">
        <div class="sp-section-header">
          <span class="sp-section-title">グループ一覧</span>
          <button id="createGroupBtn" class="sp-create-btn">
            <svg viewBox="0 0 20 20" fill="currentColor" width="11" height="11">
              <path fill-rule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clip-rule="evenodd"/>
            </svg>
            新規作成
          </button>
        </div>
        <div class="sp-mode-row">
          <span class="sp-mode-label">複数グループ同時ON</span>
          <label class="sp-toggle">
            <input type="checkbox" id="multiGroupToggle">
            <span class="sp-toggle-slider"></span>
          </label>
        </div>
        <div id="groupList" class="sp-group-list"></div>
      </div>
```

- [ ] **Step 2: `sidepanel.css` にトグルスタイルを追加（ファイル末尾に追記）**

```css
/* === モード切り替えトグル === */
.sp-mode-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 2px 10px;
}

.sp-mode-label {
  font-size: 13px;
  color: var(--text-secondary);
}

.sp-toggle {
  position: relative;
  display: inline-block;
  width: 36px;
  height: 20px;
  flex-shrink: 0;
}

.sp-toggle input {
  opacity: 0;
  width: 0;
  height: 0;
}

.sp-toggle-slider {
  position: absolute;
  cursor: pointer;
  inset: 0;
  background: #30363d;
  border-radius: 20px;
  transition: 0.2s;
}

.sp-toggle-slider::before {
  position: absolute;
  content: '';
  width: 14px;
  height: 14px;
  left: 3px;
  bottom: 3px;
  background: #8b949e;
  border-radius: 50%;
  transition: 0.2s;
}

.sp-toggle input:checked + .sp-toggle-slider {
  background: rgba(99, 102, 241, 0.35);
}

.sp-toggle input:checked + .sp-toggle-slider::before {
  background: var(--accent-light);
  transform: translateX(16px);
}
```

- [ ] **Step 3: コミット**

```bash
git add sidepanel.html sidepanel.css
git commit -m "feat: サイドパネルに複数グループモード切り替えトグルを追加"
```

---

### Task 5: サイドパネルのモード切り替えロジック（sidepanel.js）

**Files:**
- Modify: `sidepanel.js:326-331` (`chrome.storage.onChanged` リスナーを更新)
- Modify: `sidepanel.js:335-350` (DOMContentLoaded ハンドラーにトグル初期化を追加)

- [ ] **Step 1: `chrome.storage.onChanged` リスナーを以下で差し替え（`multiGroupMode` 変更時にトグルを同期）**

```js
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  if ('calendarGroups' in changes || 'calendarGroupsOrder' in changes) {
    loadGroups();
  }
  if ('multiGroupMode' in changes) {
    const toggle = document.getElementById('multiGroupToggle');
    if (toggle) toggle.checked = !!changes.multiGroupMode.newValue;
  }
});
```

- [ ] **Step 2: DOMContentLoaded ハンドラー内の末尾（`clearCacheBtn` リスナーの後）に以下を追加**

```js
  // multiGroupMode の初期値を読み込んでトグルに反映
  chrome.storage.local.get('multiGroupMode', (result) => {
    const toggle = document.getElementById('multiGroupToggle');
    if (toggle) toggle.checked = !!result.multiGroupMode;
  });

  document.getElementById('multiGroupToggle').addEventListener('change', (e) => {
    chrome.storage.local.set({ multiGroupMode: e.target.checked });
  });
```

- [ ] **Step 3: サイドパネルで動作確認**
  - サイドパネルを開いてトグルが「切り替えモード」（OFF）で表示されること
  - トグルをONにするとGoogleカレンダーサイドバーの⚙設定パネルのラジオボタンが「複数選択モード」に変わること
  - 逆に⚙から変更するとサイドパネルのトグルも連動すること

- [ ] **Step 4: コミット**

```bash
git add sidepanel.js
git commit -m "feat: サイドパネルのmultiGroupModeトグルをストレージと双方向同期"
```

---

### Task 6: arc/ 版にミラー適用

**Files:**
- Modify: `arc/content.js` (Task 1〜3 と同じ変更を適用)
- Modify: `arc/content.css` (Task 2 の CSS と同じ変更を適用)

> **注意:** 現時点で `arc/content.js` と `content.js` は内容が完全に一致している。Task 1〜3 で content.js に加えた変更をそのまま arc/content.js にも適用する。content.css についても同様。

- [ ] **Step 1: `arc/content.js` に Task 1〜3 と同じ変更を適用**

具体的には:
- `let currentSelectedGroupName = null;` → `let activeGroups = [];`
- `getStoredMultiGroupMode` ヘルパーを追加
- `captureCurrentCalendarState`, `applyCalendarState`, `restoreOriginalState` を追加
- `activateGroup` を差し替え
- `deactivateGroup` を差し替え
- `resetAllGroups` を追加
- `GROUP_SECTION_VERSION = '4'`
- `insertGroupSection` を差し替え
- `loadGroupsToPage` を差し替え
- `getCurrentSelectedGroup` → `initActiveGroups` に置き換え
- `setMessageListener` を差し替え
- `setStorageListener` を差し替え
- `initialize` を更新

- [ ] **Step 2: `arc/content.css` に Task 2 と同じ CSS を追加（ファイル末尾に追記）**

```css
/* === ⚙ 設定パネル === */
.group-settings-inner {
  margin: 0 8px 8px;
  padding: 10px 12px;
  background: #fff;
  border: 1px solid #dadce0;
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.12);
}

.group-settings-title {
  font-size: 11px;
  font-weight: 600;
  color: #5f6368;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 8px;
}

.group-settings-label {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 0;
  cursor: pointer;
}

.group-settings-label input[type="radio"] {
  accent-color: #1a73e8;
  flex-shrink: 0;
}

.group-settings-mode-name {
  font-size: 12px;
  color: #202124;
  font-weight: 500;
}

.group-settings-mode-desc {
  font-size: 11px;
  color: #5f6368;
}

/* === すべてOFFボタン === */
.group-reset-btn {
  display: block;
  width: calc(100% - 28px);
  margin: 4px 14px 6px;
  padding: 5px 12px;
  background: #fff;
  color: #5f6368;
  border: 1px solid #dadce0;
  border-radius: 4px;
  font-size: 12px;
  font-family: 'Google Sans', Roboto, sans-serif;
  cursor: pointer;
  text-align: center;
  transition: background 0.15s, border-color 0.15s;
}

.group-reset-btn:hover {
  background: #f1f3f4;
  border-color: #bdc1c6;
}
```

- [ ] **Step 3: arc版の差分がメイン版と一致することを確認**

```bash
diff content.js arc/content.js
diff content.css arc/content.css
```

Expected: no output (identical)

- [ ] **Step 4: コミット**

```bash
git add arc/content.js arc/content.css
git commit -m "feat: arc版にも複数グループアクティベーション機能を適用"
```

---

### Task 7: バージョン更新・統合テスト・コミット

**Files:**
- Modify: `manifest.json` (version `1.2.5` → `1.3.0`)

- [ ] **Step 1: `manifest.json` のバージョンを更新**

```json
"version": "1.3.0",
```

- [ ] **Step 2: 全体の統合テスト（Googleカレンダーで拡張機能を再ロードして確認）**

  **切り替えモード（デフォルト）:**
  - グループ1をクリック → グループ1のカレンダーがON、他のカレンダーがOFF
  - グループ2をクリック → グループ2のカレンダーがON、グループ1のカレンダーがOFF
  - グループ2を再度クリック → 全カレンダーが元の状態に戻る
  - 「すべてOFF」ボタンが消える

  **複数選択モード（⚙またはサイドパネルで有効化）:**
  - グループ1をクリック → グループ1のカレンダーがON
  - グループ2をクリック → グループ1+2両方のカレンダーがON
  - どのグループにも属さないカレンダーがOFFになる
  - グループ1を再度クリック → グループ1がOFF、グループ2だけがONに
  - 「すべてOFF」ボタンをクリック → 全カレンダーが元の状態に完全復元

  **ページリロード耐性:**
  - グループがONの状態でGoogleカレンダーをリロード → 同じグループがONのまま復元される

  **モード同期:**
  - ⚙パネルで複数選択モードに変更 → サイドパネルのトグルがONになる
  - サイドパネルでトグルをOFF → ⚙パネルのラジオが切り替えモードになる

- [ ] **Step 3: コミット**

```bash
git add manifest.json
git commit -m "chore: バージョンを1.3.0に更新（複数グループアクティベーション機能追加）"
```
