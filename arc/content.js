const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function isChromeContextValid() {
  try { return !!chrome.runtime.id; } catch { return false; }
}

// ナビパネル内でスクロール可能なコンテナを取得
function getNavScrollable() {
  const navPanel = document.querySelector('[jscontroller="TKuTKe"]') || document.body;
  if (navPanel.scrollHeight > navPanel.clientHeight + 10) return navPanel;
  function find(el, depth) {
    if (depth === 0) return null;
    for (const child of el.children) {
      const oy = getComputedStyle(child).overflowY;
      if ((oy === 'auto' || oy === 'scroll') && child.scrollHeight > child.clientHeight + 10) {
        return child;
      }
      const found = find(child, depth - 1);
      if (found) return found;
    }
    return null;
  }
  return find(navPanel, 5) || navPanel;
}

// ナビパネルを上から下までスクロールして全カレンダーを収集し元の位置に戻す
async function scrollAndCollectCalendars() {
  const scrollEl = getNavScrollable();
  const saved = scrollEl.scrollTop;
  const collected = new Map();

  const collect = () => {
    for (const el of findCalendarElements()) {
      const id = getCalendarId(el);
      if (!id || collected.has(id)) continue;
      const nameEl = el.querySelector('.toUqff');
      if (!nameEl) continue;
      const span = nameEl.querySelector('span[jsslot]');
      const name = (span || nameEl).innerText.trim();
      if (name) collected.set(id, { id, name });
    }
  };

  scrollEl.scrollTop = 0;
  await sleep(80);
  collect();

  while (scrollEl.scrollTop + scrollEl.clientHeight < scrollEl.scrollHeight - 5) {
    scrollEl.scrollTop += 150;
    await sleep(80);
    collect();
  }

  scrollEl.scrollTop = saved;
  return Array.from(collected.values());
}

// カレンダー要素を全件取得（マイカレンダー・他のカレンダー両セクション対応）
function findCalendarElements() {
  // jscontroller="rHQf4" がカレンダー項目の正確なセレクタ（両セクション共通）
  const results = Array.from(document.querySelectorAll('div[jscontroller="rHQf4"][data-id]'));
  if (results.length > 0) return results;

  // フォールバック: チェックボックスを持つ data-id 要素を広く検索
  return Array.from(document.querySelectorAll('div[data-id]')).filter(
    el => el.querySelector('input[type="checkbox"]')
  );
}

// カレンダー要素からIDを取得
function getCalendarId(calendarItem) {
  const id = calendarItem.getAttribute('data-id');
  if (id) return id;

  const checkbox = calendarItem.querySelector('input[type="checkbox"]');
  if (checkbox) {
    const cbId = checkbox.getAttribute('id');
    if (cbId) return cbId;
  }

  const nameEl = calendarItem.querySelector('.toUqff');
  if (nameEl) {
    const span = nameEl.querySelector('span[jsslot]');
    return span ? span.innerText.trim() : nameEl.innerText.trim();
  }

  return null;
}

// IDでカレンダー要素を検索
function findCalendarItemById(id) {
  for (const el of findCalendarElements()) {
    if (getCalendarId(el) === id) return el;
  }
  return null;
}

// 現在DOMに存在する全カレンダーを取得
function getAllCalendars() {
  const calendars = [];
  for (const el of findCalendarElements()) {
    const id = getCalendarId(el);
    const nameEl = el.querySelector('.toUqff');
    if (!id) continue;
    if (!nameEl) continue;
    const span = nameEl.querySelector('span[jsslot]');
    const name = span ? span.innerText.trim() : nameEl.innerText.trim();
    if (name) calendars.push({ id, name });
  }
  return calendars;
}

// カレンダーが現在ONかどうか
function isCalendarOn(id) {
  const el = findCalendarItemById(id);
  if (!el) return false;
  const checkbox = el.querySelector('input[type="checkbox"]');
  return checkbox ? checkbox.checked : false;
}

const COLOR_PALETTE = [
  '#AD1457', '#F4511E', '#E4C441', '#0B8043', '#3F51B5',
  '#8E24AA', '#D81B60', '#EF6C00', '#C0CA33', '#009688',
  '#7986CB', '#795548', '#D50000', '#F09300', '#7CB342',
  '#33B679', '#4285F4', '#9E69AF', '#A79B8E', '#616161',
  '#E67C73', '#F6BF26',
];

function getRandomColorForGroup(groupName) {
  let hash = 0;
  for (let i = 0; i < groupName.length; i++) {
    hash = ((hash << 5) - hash) + groupName.charCodeAt(i);
    hash |= 0;
  }
  return COLOR_PALETTE[Math.abs(hash) % COLOR_PALETTE.length];
}

function getStoredGroups() {
  return new Promise((resolve) => {
    try {
      chrome.storage.local.get('calendarGroups', (result) => {
        resolve(result.calendarGroups || {});
      });
    } catch { resolve({}); }
  });
}

function saveGroups(groups) {
  return new Promise((resolve) => {
    try {
      chrome.storage.local.set({ calendarGroups: groups }, resolve);
    } catch { resolve(); }
  });
}

function getStoredCalendarCache() {
  return new Promise((resolve) => {
    try {
      chrome.storage.local.get('calendarCache', (result) => {
        resolve(result.calendarCache || {});
      });
    } catch { resolve({}); }
  });
}

function clearCalendarCache() {
  return new Promise((resolve) => {
    try {
      chrome.storage.local.set({ calendarCache: {} }, resolve);
    } catch { resolve(); }
  });
}

function cacheCurrentCalendars() {
  if (!isChromeContextValid()) return;
  getStoredCalendarCache().then((cache) => {
    let updated = false;
    for (const cal of getAllCalendars()) {
      if (!cache[cal.id]) {
        cache[cal.id] = cal;
        updated = true;
      }
    }
    if (updated) {
      try { chrome.storage.local.set({ calendarCache: cache }); } catch { /* invalidated */ }
    }
  });
}

async function getAllCalendarsFromCacheAndDOM() {
  const cache = await getStoredCalendarCache();
  const map = new Map(Object.entries(cache));
  for (const cal of await scrollAndCollectCalendars()) {
    map.set(cal.id, cal);
  }
  const newCache = {};
  map.forEach((v, k) => { newCache[k] = v; });
  try { chrome.storage.local.set({ calendarCache: newCache }); } catch { /* invalidated */ }
  return Array.from(map.values());
}

// カレンダー要素がDOMに追加されたとき即座にキャッシュするオブザーバー
function observeCalendarDOMChanges() {
  const observer = new MutationObserver((mutations) => {
    if (!isChromeContextValid()) { observer.disconnect(); return; }
    let hasCalendarNodes = false;
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node.nodeType !== Node.ELEMENT_NODE) continue;
        if (
          node.matches?.('div[jscontroller="rHQf4"][data-id]') ||
          node.querySelector?.('div[jscontroller="rHQf4"][data-id]')
        ) {
          hasCalendarNodes = true;
          break;
        }
      }
      if (hasCalendarNodes) break;
    }
    if (hasCalendarNodes) cacheCurrentCalendars();
  });
  observer.observe(document.body, { childList: true, subtree: true });
}

function initCalendarCache() {
  // 段階的にキャッシュ（ページ読み込み直後・少し後・遅れて展開されるセクション用）
  setTimeout(cacheCurrentCalendars, 1000);
  setTimeout(cacheCurrentCalendars, 3000);
  setTimeout(cacheCurrentCalendars, 6000);
  // 「その他のカレンダー」展開時など、後から現れる要素も自動キャッシュ
  observeCalendarDOMChanges();
}

let currentSelectedGroupName = null;

async function scrollToReveal(id) {
  const scrollEl = getNavScrollable();
  const saved = scrollEl.scrollTop;
  scrollEl.scrollTop = 0;
  await sleep(50);
  while (true) {
    const el = findCalendarItemById(id);
    if (el) return el;
    if (scrollEl.scrollTop + scrollEl.clientHeight >= scrollEl.scrollHeight - 5) break;
    scrollEl.scrollTop += 150;
    await sleep(50);
  }
  scrollEl.scrollTop = saved;
  return null;
}

async function setCalendarOn(id) {
  const el = findCalendarItemById(id) || await scrollToReveal(id);
  if (!el) return false;
  const checkbox = el.querySelector('input[type="checkbox"]');
  if (!checkbox || checkbox.checked) return false;
  el.scrollIntoView({ behavior: 'instant', block: 'nearest' });
  checkbox.click();
  return true;
}

async function setCalendarOff(id) {
  const el = findCalendarItemById(id) || await scrollToReveal(id);
  if (!el) return false;
  const checkbox = el.querySelector('input[type="checkbox"]');
  if (!checkbox || !checkbox.checked) return false;
  el.scrollIntoView({ behavior: 'instant', block: 'nearest' });
  checkbox.click();
  return true;
}

function scrollBackToGroupSection() {
  const section = document.querySelector('#custom-group-section');
  if (section) section.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function activateGroup(groupName, calendarIds) {
  const groupIdSet = new Set(calendarIds);

  const deactivated = [];
  for (const cal of getAllCalendars()) {
    if (!groupIdSet.has(cal.id) && isCalendarOn(cal.id)) {
      await setCalendarOff(cal.id);
      deactivated.push(cal.id);
    }
  }

  const activated = [];
  for (const id of calendarIds) {
    if (!isCalendarOn(id)) {
      await setCalendarOn(id);
      activated.push(id);
    }
  }

  currentSelectedGroupName = groupName;
  try {
    chrome.storage.local.set(
      {
        currentSelectedGroup: groupName,
        activatedCalendarIds: activated,
        deactivatedCalendarIds: deactivated,
      },
      () => {
        scrollBackToGroupSection();
        loadGroupsToPage();
      }
    );
  } catch { /* invalidated */ }
}

function deactivateGroup() {
  try {
    chrome.storage.local.get(['activatedCalendarIds', 'deactivatedCalendarIds'], async (result) => {
      const activated = result.activatedCalendarIds || [];
      const deactivated = result.deactivatedCalendarIds || [];
      for (const id of activated) await setCalendarOff(id);
      for (const id of deactivated) await setCalendarOn(id);
      currentSelectedGroupName = null;
      try {
        chrome.storage.local.remove(
          ['currentSelectedGroup', 'activatedCalendarIds', 'deactivatedCalendarIds'],
          () => {
            scrollBackToGroupSection();
            loadGroupsToPage();
          }
        );
      } catch { /* invalidated */ }
    });
  } catch { /* invalidated */ }
}

function insertGroupSection() {
  if (document.querySelector('#custom-group-section')) return;

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

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.classList.add('custom-nUt0vb', 'custom-uQ1ixe');
  btn.setAttribute('aria-expanded', 'true');
  btn.innerHTML = `
    <div class="GsuJoe"></div>
    <div class="x5FT4e kkUTBb" style="width:100%;">
      <div class="o8t45d" style="display:flex;align-items:center;justify-content:space-between;width:100%;">
        <div class="aIwHYe">${sectionName}</div>
        <i class="google-material-icons meh4fc hggPq Dk9A5d" aria-hidden="true" style="margin-right:12px;">keyboard_arrow_up</i>
      </div>
    </div>
  `;

  const container = document.createElement('div');
  container.id = 'group-list-container';
  container.setAttribute('role', 'list');
  container.setAttribute('aria-expanded', 'true');

  const list = document.createElement('ul');
  list.id = 'group-list';
  container.appendChild(list);

  btn.addEventListener('click', () => {
    const expanded = btn.getAttribute('aria-expanded') === 'true';
    btn.setAttribute('aria-expanded', String(!expanded));
    container.setAttribute('aria-expanded', String(!expanded));
    btn.querySelector('i').textContent = expanded ? 'keyboard_arrow_down' : 'keyboard_arrow_up';
    container.style.display = expanded ? 'none' : 'block';
  });

  section.appendChild(btn);
  section.appendChild(container);
  targetH2.insertAdjacentElement('afterend', section);

  loadGroupsToPage();
}

function loadGroupsToPage() {
  getStoredGroups().then((groups) => {
    const list = document.getElementById('group-list');
    if (!list) return;

    list.style.visibility = 'hidden';
    list.innerHTML = '';

    for (const groupName of Object.keys(groups)) {
      const color = getRandomColorForGroup(groupName);
      const isActive = groupName === currentSelectedGroupName;

      const item = document.createElement('li');
      item.classList.add('group-item-row');
      if (isActive) item.classList.add('group-item-active');
      item.style.cssText = 'display:flex;align-items:center;gap:10px;padding:0 12px 0 16px;cursor:pointer;height:32px;';

      const colorDot = document.createElement('div');
      colorDot.classList.add('group-color-dot');
      colorDot.style.background = color;

      const span = document.createElement('span');
      span.classList.add('toUqff');
      span.textContent = groupName;
      span.style.cssText = 'flex:1;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;';

      item.addEventListener('click', () => {
        if (currentSelectedGroupName === groupName) {
          deactivateGroup();
        } else {
          activateGroup(groupName, groups[groupName].map((c) => c.id));
        }
      });

      item.appendChild(colorDot);
      item.appendChild(span);
      list.appendChild(item);
    }

    list.style.visibility = 'visible';
  });
}

function observeNavPanel() {
  const target =
    document.querySelector('.hEtGGf.HDIIVe.sBn5T[jscontroller="TKuTKe"]') ||
    document.body;

  const observer = new MutationObserver(() => {
    if (!isChromeContextValid()) { observer.disconnect(); return; }
    if (!document.querySelector('#custom-group-section')) {
      insertGroupSection();
    }
  });
  observer.observe(target, { childList: true, subtree: true });

  insertGroupSection();
}

function getCurrentSelectedGroup() {
  try {
    chrome.storage.local.get('currentSelectedGroup', (result) => {
      currentSelectedGroupName = result.currentSelectedGroup || null;
      if (currentSelectedGroupName) {
        getStoredGroups().then((groups) => {
          const group = groups[currentSelectedGroupName];
          if (group) {
            activateGroup(currentSelectedGroupName, group.map((c) => c.id));
          } else {
            currentSelectedGroupName = null;
            loadGroupsToPage();
          }
        });
      } else {
        loadGroupsToPage();
      }
    });
  } catch { /* invalidated */ }
}

function setMessageListener() {
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.action === 'ping') {
      sendResponse({ pong: true });
    } else if (message.action === 'getCalendars') {
      getAllCalendarsFromCacheAndDOM().then((calendars) => sendResponse({ calendars }));
    } else if (message.action === 'activateGroup') {
      activateGroup(message.groupName, message.calendarIds);
      sendResponse({ success: true });
    } else if (message.action === 'deactivateGroup') {
      deactivateGroup();
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

function initialize() {
  if (window.__calendarGroupingInitialized) return;
  window.__calendarGroupingInitialized = true;
  getCurrentSelectedGroup();
  observeNavPanel();
  setMessageListener();
  initCalendarCache();
}

initialize();
