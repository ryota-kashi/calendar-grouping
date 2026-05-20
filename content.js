// カレンダー要素を全件取得
function findCalendarElements() {
  return Array.from(document.querySelectorAll('div[jscontroller="rHQf4"][data-id]'));
}

// カレンダー要素からIDを取得（複数フォールバックあり）
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

// 現在DOMに存在する全カレンダーを { id, name } 配列で返す
function getAllCalendars() {
  const calendars = [];
  for (const el of findCalendarElements()) {
    const id = getCalendarId(el);
    const nameEl = el.querySelector('.toUqff');
    if (!id || !nameEl) continue;
    const span = nameEl.querySelector('span[jsslot]');
    const name = span ? span.innerText.trim() : nameEl.innerText.trim();
    if (name) calendars.push({ id, name });
  }
  return calendars;
}

// カレンダーが現在ONかどうか（DOMに存在しない場合は false）
function isCalendarOn(id) {
  const el = findCalendarItemById(id);
  if (!el) return false;
  const checkbox = el.querySelector('input[type="checkbox"][jsname="YPqjbf"]');
  return checkbox ? checkbox.checked : false;
}

const COLOR_PALETTE = [
  '#AD1457', '#F4511E', '#E4C441', '#0B8043', '#3F51B5',
  '#8E24AA', '#D81B60', '#EF6C00', '#C0CA33', '#009688',
  '#7986CB', '#795548', '#D50000', '#F09300', '#7CB342',
  '#33B679', '#4285F4', '#9E69AF', '#A79B8E', '#616161',
  '#E67C73', '#F6BF26',
];

const groupColors = {};

function getRandomColorForGroup(groupName) {
  if (groupColors[groupName]) return groupColors[groupName];
  const color = COLOR_PALETTE[Math.floor(Math.random() * COLOR_PALETTE.length)];
  groupColors[groupName] = color;
  return color;
}

function getStoredGroups() {
  return new Promise((resolve) => {
    chrome.storage.local.get('calendarGroups', (result) => {
      resolve(result.calendarGroups || {});
    });
  });
}

function getStoredCalendarCache() {
  return new Promise((resolve) => {
    chrome.storage.local.get('calendarCache', (result) => {
      resolve(result.calendarCache || {});
    });
  });
}

function clearCalendarCache() {
  return new Promise((resolve) => {
    chrome.storage.local.set({ calendarCache: {} }, resolve);
  });
}

function cacheCurrentCalendars() {
  getStoredCalendarCache().then((cache) => {
    let updated = false;
    for (const cal of getAllCalendars()) {
      if (!cache[cal.id]) {
        cache[cal.id] = cal;
        updated = true;
      }
    }
    if (updated) chrome.storage.local.set({ calendarCache: cache });
  });
}

async function getAllCalendarsFromCacheAndDOM() {
  const cache = await getStoredCalendarCache();
  const map = new Map(Object.entries(cache));
  for (const cal of getAllCalendars()) {
    map.set(cal.id, cal);
  }
  const newCache = {};
  map.forEach((v, k) => { newCache[k] = v; });
  chrome.storage.local.set({ calendarCache: newCache });
  return Array.from(map.values());
}

function initCalendarCache() {
  setTimeout(cacheCurrentCalendars, 2000);
}

let currentSelectedGroupName = null;

// カレンダーをONにする。viewport外なら即座にスクロールしてクリック
function setCalendarOn(id) {
  const el = findCalendarItemById(id);
  if (!el) {
    console.log(`[GroupExt] calendar not in DOM: ${id}`);
    return false;
  }
  const checkbox = el.querySelector('input[type="checkbox"][jsname="YPqjbf"]');
  if (!checkbox || checkbox.checked) return false;
  el.scrollIntoView({ behavior: 'instant', block: 'nearest' });
  checkbox.click();
  return true;
}

// カレンダーをOFFにする。viewport外なら即座にスクロールしてクリック
function setCalendarOff(id) {
  const el = findCalendarItemById(id);
  if (!el) {
    console.log(`[GroupExt] calendar not in DOM: ${id}`);
    return false;
  }
  const checkbox = el.querySelector('input[type="checkbox"][jsname="YPqjbf"]');
  if (!checkbox || !checkbox.checked) return false;
  el.scrollIntoView({ behavior: 'instant', block: 'nearest' });
  checkbox.click();
  return true;
}

// 全カレンダー操作後にグループセクションまでスムーズスクロールで戻る
function scrollBackToGroupSection() {
  const section = document.querySelector('#custom-group-section');
  if (section) section.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// グループをON: グループ外のONカレンダーをすべてOFFにしてからグループのみON
function activateGroup(groupName, calendarIds) {
  const groupIdSet = new Set(calendarIds);

  // グループ外でONのカレンダーをすべてOFFにして記録
  const deactivated = [];
  for (const cal of getAllCalendars()) {
    if (!groupIdSet.has(cal.id) && isCalendarOn(cal.id)) {
      setCalendarOff(cal.id);
      deactivated.push(cal.id);
    }
  }

  // グループ内で現在OFFのカレンダーをONにして記録
  const activated = [];
  for (const id of calendarIds) {
    if (!isCalendarOn(id)) {
      setCalendarOn(id);
      activated.push(id);
    }
  }

  currentSelectedGroupName = groupName;
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
}

// グループをOFF: グループON時の状態変更をすべて元に戻す
function deactivateGroup() {
  chrome.storage.local.get(['activatedCalendarIds', 'deactivatedCalendarIds'], (result) => {
    const activated = result.activatedCalendarIds || [];
    const deactivated = result.deactivatedCalendarIds || [];
    for (const id of activated) {
      setCalendarOff(id);
    }
    for (const id of deactivated) {
      setCalendarOn(id);
    }
    currentSelectedGroupName = null;
    chrome.storage.local.remove(
      ['currentSelectedGroup', 'activatedCalendarIds', 'deactivatedCalendarIds'],
      () => {
        scrollBackToGroupSection();
        loadGroupsToPage();
      }
    );
  });
}

// Google Calendar サイドバーにグループセクションを注入
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
    <div class="x5FT4e kkUTBb">
      <div class="o8t45d">
        <div class="aIwHYe">${sectionName}</div>
        <i class="google-material-icons meh4fc hggPq Dk9A5d" aria-hidden="true">keyboard_arrow_up</i>
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

// グループ一覧をサイドバーに描画
function loadGroupsToPage() {
  getStoredGroups().then((groups) => {
    const list = document.getElementById('group-list');
    if (!list) return;

    list.style.visibility = 'hidden';
    list.innerHTML = '';

    for (const groupName of Object.keys(groups)) {
      const color = getRandomColorForGroup(groupName);
      const isActive = groupName === currentSelectedGroupName;

      const item = document.createElement('div');
      item.style.cssText = 'display:flex;align-items:center;transition:background-color 0.3s ease;margin-right:4px;cursor:pointer;';

      item.addEventListener('mouseenter', () => {
        if (groupName !== currentSelectedGroupName) item.style.backgroundColor = '#f0f0f0';
      });
      item.addEventListener('mouseleave', () => {
        if (groupName !== currentSelectedGroupName) item.style.backgroundColor = 'transparent';
      });

      // Google Calendar のスタイルに合わせたチェックボックス構造
      const checkboxDiv = document.createElement('div');
      checkboxDiv.classList.add('zZj8Pb', 'EaVNbc');
      checkboxDiv.style.marginRight = '-10px';

      const checkboxWrapper = document.createElement('div');
      checkboxWrapper.classList.add('lcPUt');

      const checkboxContainer = document.createElement('div');
      checkboxContainer.classList.add('VfPpkd-MPu53c', 'Ne8lhe', 'swXlm', 'az2ine', 'iIJNvc', 'd7WT8c');

      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.classList.add('VfPpkd-muHVFf-bMcfAe');
      checkbox.checked = isActive;

      const checkboxIcon = document.createElement('div');
      checkboxIcon.classList.add('VfPpkd-YQoJzd');
      checkboxIcon.style.borderColor = color;
      if (isActive) checkboxIcon.style.backgroundColor = color;
      checkboxIcon.innerHTML = `
        <svg aria-hidden="true" class="VfPpkd-HUofsb" viewBox="0 0 24 24">
          <path class="VfPpkd-HUofsb-Jt5cK" fill="none" d="M1.73,12.91 8.1,19.28 22.79,4.59" stroke="white" stroke-width="2"></path>
        </svg>
        <div class="VfPpkd-SJnn3d"></div>
      `;

      checkboxContainer.appendChild(checkbox);
      checkboxContainer.appendChild(checkboxIcon);
      checkboxWrapper.appendChild(checkboxContainer);
      checkboxDiv.appendChild(checkboxWrapper);

      const span = document.createElement('span');
      span.classList.add('toUqff', 'qZvm2d-ibnC6b-bN97Pc', 'HRaT6d');
      span.textContent = groupName;

      item.appendChild(checkboxDiv);
      item.appendChild(span);
      list.appendChild(item);

      item.addEventListener('click', () => {
        if (currentSelectedGroupName === groupName) {
          deactivateGroup();
        } else {
          activateGroup(groupName, groups[groupName].map((c) => c.id));
        }
      });
    }

    list.style.visibility = 'visible';
  });
}

// ナビパネルを監視してグループセクションが消えたら再注入
function observeNavPanel() {
  const target =
    document.querySelector('.hEtGGf.HDIIVe.sBn5T[jscontroller="TKuTKe"]') ||
    document.body;

  new MutationObserver(() => {
    if (!document.querySelector('#custom-group-section')) {
      insertGroupSection();
    }
  }).observe(target, { childList: true, subtree: true });

  insertGroupSection();
}

// ストレージからグループ選択状態を復元して再適用
function getCurrentSelectedGroup() {
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
}

// popup.js からのメッセージを受け取る
function setMessageListener() {
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
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
  getCurrentSelectedGroup();
  observeNavPanel();
  setMessageListener();
  initCalendarCache();
}

initialize();
