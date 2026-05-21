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

// カレンダー要素を全件取得
function findCalendarElements() {
  const navPanel = document.querySelector('[jscontroller="TKuTKe"]') || document.body;
  const candidates = navPanel.querySelectorAll('div[data-id]');
  const results = Array.from(candidates).filter(
    el => el.querySelector('input[type="checkbox"]')
  );
  if (results.length > 0) return results;

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

const groupColors = {};

function getRandomColorForGroup(groupName) {
  if (groupColors[groupName]) return groupColors[groupName];
  const color = COLOR_PALETTE[Math.floor(Math.random() * COLOR_PALETTE.length)];
  groupColors[groupName] = color;
  return color;
}

function getStoredGroups() {
  return new Promise((resolve) => {
    if (!isChromeContextValid()) { resolve({}); return; }
    try {
      chrome.storage.local.get('calendarGroups', (result) => {
        resolve(result.calendarGroups || {});
      });
    } catch { resolve({}); }
  });
}

function getStoredCalendarCache() {
  return new Promise((resolve) => {
    if (!isChromeContextValid()) { resolve({}); return; }
    try {
      chrome.storage.local.get('calendarCache', (result) => {
        resolve(result.calendarCache || {});
      });
    } catch { resolve({}); }
  });
}

function clearCalendarCache() {
  return new Promise((resolve) => {
    if (!isChromeContextValid()) { resolve(); return; }
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

function initCalendarCache() {
  setTimeout(cacheCurrentCalendars, 2000);
}

let currentSelectedGroupName = null;

async function scrollToReveal(id) {
  const scrollEl = getNavScrollable();
  const saved = scrollEl.scrollTop;
  scrollEl.scrollTop = 0;
  await sleep(150);
  while (true) {
    const el = findCalendarItemById(id);
    if (el) return el;
    if (scrollEl.scrollTop + scrollEl.clientHeight >= scrollEl.scrollHeight - 5) break;
    scrollEl.scrollTop += 150;
    await sleep(150);
  }
  scrollEl.scrollTop = saved;
  return null;
}

async function setCalendarOn(id) {
  let el = findCalendarItemById(id) || await scrollToReveal(id);
  if (!el) { console.log(`[GroupExt] calendar not in DOM: ${id}`); return false; }
  el.scrollIntoView({ behavior: 'instant', block: 'nearest' });
  await sleep(100);
  el = findCalendarItemById(id);
  if (!el) { console.log(`[GroupExt] calendar disappeared after scroll: ${id}`); return false; }
  const checkbox = el.querySelector('input[type="checkbox"]');
  if (!checkbox || checkbox.checked) return false;
  checkbox.click();
  await sleep(80);
  return true;
}

async function setCalendarOff(id) {
  let el = findCalendarItemById(id) || await scrollToReveal(id);
  if (!el) { console.log(`[GroupExt] calendar not in DOM: ${id}`); return false; }
  el.scrollIntoView({ behavior: 'instant', block: 'nearest' });
  await sleep(100);
  el = findCalendarItemById(id);
  if (!el) { console.log(`[GroupExt] calendar disappeared after scroll: ${id}`); return false; }
  const checkbox = el.querySelector('input[type="checkbox"]');
  if (!checkbox || !checkbox.checked) return false;
  checkbox.click();
  await sleep(80);
  return true;
}

function scrollBackToGroupSection() {
  const section = document.querySelector('#custom-group-section');
  if (section) section.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function activateGroup(groupName, calendarIds) {
  const groupIdSet = new Set(calendarIds);

  // スクロールして全カレンダーを収集してから非活性化（仮想スクロール対応）
  const deactivated = [];
  for (const cal of await scrollAndCollectCalendars()) {
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
  if (!isChromeContextValid()) return;
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
  if (!isChromeContextValid()) return;
  try {
    chrome.storage.local.get(['activatedCalendarIds', 'deactivatedCalendarIds'], async (result) => {
      const activated = result.activatedCalendarIds || [];
      const deactivated = result.deactivatedCalendarIds || [];
      for (const id of activated) await setCalendarOff(id);
      for (const id of deactivated) await setCalendarOn(id);
      currentSelectedGroupName = null;
      if (!isChromeContextValid()) return;
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

  // ヘッダーボタン部（アコーディオン）
  const headerContainer = document.createElement('div');
  headerContainer.style.cssText = 'display:flex;align-items:center;justify-content:space-between;width:100%;';

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.classList.add('custom-nUt0vb', 'custom-uQ1ixe');
  btn.style.flex = '1';
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

  // 新規追加「＋」ボタン
  const addBtn = document.createElement('button');
  addBtn.type = 'button';
  addBtn.id = 'add-group-action-btn';
  addBtn.title = '新しいグループを作成';
  addBtn.innerHTML = '<i class="google-material-icons" style="font-size:18px;">add</i>';
  addBtn.style.cssText = 'border:none;background:transparent;cursor:pointer;color:#5f6368;width:32px;height:32px;border-radius:6px;display:flex;align-items:center;justify-content:center;margin-right:12px;transition:background 0.15s;outline:none;';
  addBtn.addEventListener('mouseenter', () => addBtn.style.backgroundColor = '#e8eaed');
  addBtn.addEventListener('mouseleave', () => addBtn.style.backgroundColor = 'transparent');
  addBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    showGroupForm();
  });

  headerContainer.appendChild(btn);
  headerContainer.appendChild(addBtn);

  const container = document.createElement('div');
  container.id = 'group-list-container';
  container.setAttribute('role', 'list');
  container.setAttribute('aria-expanded', 'true');

  const list = document.createElement('ul');
  list.id = 'group-list';
  container.appendChild(list);

  // インラインフォーム用コンテナ
  const formContainer = document.createElement('div');
  formContainer.id = 'group-form-container';
  formContainer.style.display = 'none';
  container.appendChild(formContainer);

  // フッター設定部（キャッシュクリア）
  const footer = document.createElement('div');
  footer.id = 'group-section-footer';
  footer.style.cssText = 'padding:4px 16px;display:flex;justify-content:flex-end;';
  const clearCacheLink = document.createElement('a');
  clearCacheLink.href = '#';
  clearCacheLink.textContent = 'キャッシュをクリア';
  clearCacheLink.classList.add('cache-clear-link');
  clearCacheLink.addEventListener('click', (e) => {
    e.preventDefault();
    if (confirm('カレンダーキャッシュをクリアしますか？')) {
      clearCalendarCache().then(() => {
        alert('キャッシュをクリアしました。');
        showGroupForm();
      });
    }
  });
  footer.appendChild(clearCacheLink);
  container.appendChild(footer);

  btn.addEventListener('click', () => {
    const expanded = btn.getAttribute('aria-expanded') === 'true';
    btn.setAttribute('aria-expanded', String(!expanded));
    container.setAttribute('aria-expanded', String(!expanded));
    btn.querySelector('i').textContent = expanded ? 'keyboard_arrow_down' : 'keyboard_arrow_up';
    container.style.display = expanded ? 'none' : 'block';
  });

  section.appendChild(headerContainer);
  section.appendChild(container);
  targetH2.insertAdjacentElement('afterend', section);

  loadGroupsToPage();
}

// グループ一覧を描画
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
      item.style.cssText = 'display:flex;align-items:center;justify-content:space-between;margin-right:4px;cursor:pointer;position:relative;height:32px;';

      item.addEventListener('mouseenter', () => {
        if (groupName !== currentSelectedGroupName) item.style.backgroundColor = '#f1f3f4';
        item.querySelector('.group-item-actions').style.display = 'flex';
      });
      item.addEventListener('mouseleave', () => {
        if (groupName !== currentSelectedGroupName) item.style.backgroundColor = 'transparent';
        item.querySelector('.group-item-actions').style.display = 'none';
      });

      // チェックボックス部
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
      span.style.flex = '1';

      // ON/OFF切り替えイベント
      const toggleEvent = (e) => {
        e.stopPropagation();
        if (currentSelectedGroupName === groupName) {
          deactivateGroup();
        } else {
          activateGroup(groupName, groups[groupName].map((c) => c.id));
        }
      };
      checkboxDiv.addEventListener('click', toggleEvent);
      span.addEventListener('click', toggleEvent);

      // アクションボタン部（編集・削除）
      const actionsDiv = document.createElement('div');
      actionsDiv.classList.add('group-item-actions');
      actionsDiv.style.cssText = 'display:none;align-items:center;position:absolute;right:8px;top:50%;transform:translateY(-50%);background:inherit;padding-left:8px;';

      // 編集ボタン
      const editBtn = document.createElement('button');
      editBtn.type = 'button';
      editBtn.title = '編集';
      editBtn.innerHTML = '<i class="google-material-icons">edit</i>';
      editBtn.style.cssText = 'border:none;background:transparent;cursor:pointer;outline:none;margin-right:2px;';
      editBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        showGroupForm(groupName);
      });

      // 削除ボタン
      const deleteBtn = document.createElement('button');
      deleteBtn.type = 'button';
      deleteBtn.title = '削除';
      deleteBtn.innerHTML = '<i class="google-material-icons">delete</i>';
      deleteBtn.style.cssText = 'border:none;background:transparent;cursor:pointer;outline:none;';
      deleteBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (confirm(`グループ「${groupName}」を削除しますか？`)) {
          deleteGroup(groupName);
        }
      });

      actionsDiv.appendChild(editBtn);
      actionsDiv.appendChild(deleteBtn);

      item.appendChild(checkboxDiv);
      item.appendChild(span);
      item.appendChild(actionsDiv);
      list.appendChild(item);
    }

    list.style.visibility = 'visible';
  });
}

// グループ作成・編集インラインフォームを展開表示
async function showGroupForm(editingGroupName = null) {
  const formContainer = document.getElementById('group-form-container');
  const list = document.getElementById('group-list');
  const footer = document.getElementById('group-section-footer');
  if (!formContainer) return;

  // リストを非表示にしてフォームを展開
  list.style.display = 'none';
  footer.style.display = 'none';
  formContainer.style.display = 'block';
  formContainer.innerHTML = '読み込み中...';

  // 全カレンダーの取得（DOM ＋ キャッシュ）
  const calendars = await getAllCalendarsFromCacheAndDOM();
  const storedGroups = await getStoredGroups();
  const selectedCalendarIds = new Set(
    editingGroupName ? (storedGroups[editingGroupName] || []).map(c => c.id) : []
  );

  formContainer.innerHTML = `
    <div class="group-form-card">
      <div class="group-form-card-title">
        ${editingGroupName ? 'グループを編集' : 'グループを作成'}
      </div>
      <input type="text" id="inline-group-name-input"
        class="group-form-input"
        placeholder="グループ名を入力"
        value="${editingGroupName || ''}"
      />
      <label class="group-form-cal-label">カレンダーを選択</label>
      <div id="inline-calendar-list" class="group-form-cal-list">
        ${calendars.map(cal => `
          <label class="group-form-cal-item">
            <input type="checkbox" value="${cal.id}" data-name="${cal.name}" ${selectedCalendarIds.has(cal.id) ? 'checked' : ''}/>
            <span>${cal.name}</span>
          </label>
        `).join('')}
      </div>
      <div class="group-form-btns">
        <button id="inline-group-save-btn" class="group-form-btn-save">保存</button>
        <button id="inline-group-cancel-btn" class="group-form-btn-cancel">キャンセル</button>
      </div>
    </div>
  `;

  document.getElementById('inline-group-save-btn').addEventListener('click', () => saveGroupFromForm(editingGroupName));
  document.getElementById('inline-group-cancel-btn').addEventListener('click', hideGroupForm);
}

// フォームを閉じて元のリストに戻す
function hideGroupForm() {
  const formContainer = document.getElementById('group-form-container');
  const list = document.getElementById('group-list');
  const footer = document.getElementById('group-section-footer');
  if (!formContainer) return;

  formContainer.style.display = 'none';
  formContainer.innerHTML = '';
  list.style.display = 'block';
  footer.style.display = 'flex';
  loadGroupsToPage();
}

// フォーム内容をストレージに保存
function saveGroupFromForm(editingGroupName = null) {
  const nameInput = document.getElementById('inline-group-name-input');
  const groupName = nameInput ? nameInput.value.trim() : '';

  if (!groupName) {
    alert('グループ名を入力してください。');
    return;
  }

  const selectedCheckboxes = document.querySelectorAll('#inline-calendar-list input[type="checkbox"]:checked');
  const selectedCalendars = Array.from(selectedCheckboxes).map(cb => ({
    id: cb.value,
    name: cb.getAttribute('data-name')
  }));

  if (selectedCalendars.length === 0) {
    alert('カレンダーを1つ以上選択してください。');
    return;
  }

  getStoredGroups().then((groups) => {
    // 既存グループとの重複チェック（編集時は同名OK）
    if (editingGroupName) {
      delete groups[editingGroupName];
    }
    if (groups[groupName]) {
      alert('同じ名前のグループが既に存在します。');
      return;
    }

    groups[groupName] = selectedCalendars;
    saveGroups(groups).then(() => {
      // 選択中だったグループの名称変更があった場合、状態を引き継ぐ
      if (editingGroupName && currentSelectedGroupName === editingGroupName) {
        currentSelectedGroupName = groupName;
        chrome.storage.local.set({ currentSelectedGroup: groupName });
      }
      hideGroupForm();
    });
  });
}

// グループの削除
function deleteGroup(groupName) {
  getStoredGroups().then((groups) => {
    delete groups[groupName];
    const isActive = currentSelectedGroupName === groupName;

    const doDelete = () => {
      saveGroups(groups).then(() => {
        if (isActive) currentSelectedGroupName = null;
        loadGroupsToPage();
      });
    };

    if (isActive) {
      deactivateGroup();
      setTimeout(doDelete, 300);
    } else {
      doDelete();
    }
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
  if (!isChromeContextValid()) return;
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
