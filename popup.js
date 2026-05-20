let currentSelectedGroup = null;

const COLOR_PALETTE = [
  '#AD1457', '#F4511E', '#E4C441', '#0B8043', '#3F51B5',
  '#8E24AA', '#D81B60', '#EF6C00', '#C0CA33', '#009688',
  '#7986CB', '#795548', '#D50000', '#F09300', '#7CB342',
  '#33B679', '#4285F4', '#9E69AF', '#A79B8E', '#616161',
  '#E67C73', '#F6BF26',
];
const groupColors = {};
function getColorForGroup(name) {
  if (!groupColors[name]) {
    groupColors[name] = COLOR_PALETTE[Object.keys(groupColors).length % COLOR_PALETTE.length];
  }
  return groupColors[name];
}

document.addEventListener('DOMContentLoaded', initialize);

function initialize() {
  loadCalendars();
  loadGroups();
  setAddGroupButtonListener();
  setEditButtonListeners();
  setClearCacheButtonListener();
  restoreSelectedGroup();
}

// content script に 1 回だけカレンダー一覧を問い合わせる
function loadCalendars() {
  return getCalendarsFromContentScript()
    .then(displayCalendarList)
    .catch((err) => {
      console.error(err);
      alert('カレンダーの情報を取得できませんでした。Googleカレンダーのページが完全にロードされてから、再度お試しください。');
    });
}

function getCalendarsFromContentScript() {
  return new Promise((resolve, reject) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (!tabs.length) return reject('タブが見つかりません');
      chrome.tabs.sendMessage(tabs[0].id, { action: 'getCalendars' }, (response) => {
        if (chrome.runtime.lastError || !response?.calendars) {
          return reject(chrome.runtime.lastError?.message || 'No response');
        }
        resolve(response.calendars);
      });
    });
  });
}

function displayCalendarList(calendars) {
  const div = document.getElementById('calendarList');
  div.innerHTML = '';
  if (!calendars.length) {
    div.textContent = 'カレンダーが見つかりませんでした。';
    return;
  }
  for (const cal of calendars) {
    addCalendarItem(cal, div);
  }
}

function addCalendarItem(calendar, container) {
  const label = document.createElement('label');
  label.classList.add('calendar-item');
  label.dataset.id = calendar.id;

  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.value = calendar.id;

  const span = document.createElement('span');
  span.textContent = calendar.name;

  label.appendChild(checkbox);
  label.appendChild(span);
  container.appendChild(label);
}

function getStoredGroups() {
  return new Promise((resolve) => {
    chrome.storage.local.get('calendarGroups', (result) => {
      resolve(result.calendarGroups || {});
    });
  });
}

function saveGroups(groups) {
  return new Promise((resolve) => {
    chrome.storage.local.set({ calendarGroups: groups }, resolve);
  });
}

function loadGroups() {
  getStoredGroups().then((groups) => {
    const list = document.getElementById('groupList');
    list.innerHTML = '';
    const section = document.getElementById('groupSection');

    if (!Object.keys(groups).length) {
      section.style.display = 'none';
      return;
    }

    section.style.display = 'block';
    for (const name of Object.keys(groups)) {
      addGroupItem(name);
    }
    updateGroupSelection();
  });
}

function addGroupItem(groupName) {
  const list = document.getElementById('groupList');

  const div = document.createElement('div');
  div.classList.add('group-item');
  if (currentSelectedGroup === groupName) div.classList.add('active');
  div.dataset.name = groupName;

  const dot = document.createElement('div');
  dot.classList.add('group-color-dot');
  dot.style.background = getColorForGroup(groupName);

  const nameSpan = document.createElement('span');
  nameSpan.textContent = groupName;
  nameSpan.classList.add('group-name');
  if (currentSelectedGroup === groupName) nameSpan.classList.add('selected');
  nameSpan.addEventListener('click', () => toggleGroup(groupName));

  const actions = document.createElement('div');
  actions.classList.add('group-actions');

  const editBtn = document.createElement('button');
  editBtn.classList.add('icon-btn');
  editBtn.innerHTML = '<span class="material-icons">edit</span>';
  editBtn.addEventListener('click', (e) => { e.stopPropagation(); startEditingGroup(groupName); });

  const deleteBtn = document.createElement('button');
  deleteBtn.classList.add('icon-btn', 'delete');
  deleteBtn.innerHTML = '<span class="material-icons">delete</span>';
  deleteBtn.addEventListener('click', (e) => { e.stopPropagation(); deleteGroup(groupName); });

  actions.appendChild(editBtn);
  actions.appendChild(deleteBtn);

  div.appendChild(dot);
  div.appendChild(nameSpan);
  div.appendChild(actions);
  list.appendChild(div);
}

function updateGroupSelection() {
  document.querySelectorAll('.group-item').forEach((item) => {
    const isSelected = item.dataset.name === currentSelectedGroup;
    item.classList.toggle('active', isSelected);
    item.querySelector('.group-name').classList.toggle('selected', isSelected);
  });
}

function restoreSelectedGroup() {
  chrome.storage.local.get('currentSelectedGroup', (result) => {
    currentSelectedGroup = result.currentSelectedGroup || null;
    updateGroupSelection();
  });
}

function setAddGroupButtonListener() {
  document.getElementById('addGroupBtn').addEventListener('click', createGroup);
}

function setEditButtonListeners() {
  document.getElementById('updateGroupBtn').addEventListener('click', updateGroup);
  document.getElementById('cancelEditBtn').addEventListener('click', cancelEditing);
}

function setClearCacheButtonListener() {
  document.getElementById('clearCacheBtn').addEventListener('click', () => {
    if (!confirm('カレンダーキャッシュをクリアしますか？')) return;
    sendToContentScript({ action: 'clearCache' })
      .then(() => { loadCalendars(); alert('キャッシュをクリアしました。'); })
      .catch(() => alert('キャッシュのクリアに失敗しました。'));
  });
}

function sendToContentScript(message) {
  return new Promise((resolve, reject) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (!tabs.length) return reject('タブが見つかりません');
      chrome.tabs.sendMessage(tabs[0].id, message, (response) => {
        if (chrome.runtime.lastError || !response?.success) {
          return reject(chrome.runtime.lastError?.message || 'Failed');
        }
        resolve(response);
      });
    });
  });
}

function notifyContentScript() {
  sendToContentScript({ action: 'refreshGroupList' }).catch(console.error);
}

function getSelectedCalendarsFrom(containerId) {
  const selected = [];
  document.querySelectorAll(`#${containerId} input[type="checkbox"]:checked`).forEach((cb) => {
    selected.push({ id: cb.value, name: cb.nextSibling.textContent });
  });
  return selected;
}

function createGroup() {
  const name = document.getElementById('groupNameInput').value.trim();
  if (!name) return alert('グループ名を入力してください。');

  getStoredGroups().then((groups) => {
    if (groups[name]) return alert('同じ名前のグループが既に存在します。');

    const selected = getSelectedCalendarsFrom('calendarList');
    if (!selected.length) return alert('カレンダーが選択されていません。');

    groups[name] = selected;
    saveGroups(groups).then(() => {
      loadGroups();
      notifyContentScript();
      document.getElementById('groupNameInput').value = '';
      document.querySelectorAll('#calendarList input[type="checkbox"]')
        .forEach((cb) => { cb.checked = false; });
      showToast(`グループ「${name}」を作成しました！`);
    });
  });
}

function deleteGroup(groupName) {
  if (!confirm(`「${groupName}」グループを削除しますか？`)) return;

  getStoredGroups().then((groups) => {
    delete groups[groupName];
    const isActive = currentSelectedGroup === groupName;

    const doDelete = () => {
      saveGroups(groups).then(() => {
        if (isActive) currentSelectedGroup = null;
        loadGroups();
        notifyContentScript();
      });
    };

    if (isActive) {
      sendToContentScript({ action: 'deactivateGroup' }).finally(doDelete);
    } else {
      doDelete();
    }
  });
}

function startEditingGroup(groupName) {
  document.getElementById('editGroupSection').style.display = 'block';
  document.getElementById('createGroupSection').style.display = 'none';
  document.getElementById('editGroupNameInput').value = groupName;
  document.getElementById('editGroupSection').dataset.editingGroup = groupName;

  const editList = document.getElementById('editCalendarList');
  editList.innerHTML = '';

  const origItems = Array.from(
    document.getElementById('calendarList').querySelectorAll('.calendar-item')
  );
  getStoredGroups().then((groups) => {
    const groupCals = groups[groupName] || [];
    for (const item of origItems) {
      const clone = item.cloneNode(true);
      clone.querySelector('input').checked = groupCals.some(
        (c) => c.id === clone.querySelector('input').value
      );
      editList.appendChild(clone);
    }
  });
}

function updateGroup() {
  const section = document.getElementById('editGroupSection');
  const oldName = section.dataset.editingGroup;
  const newName = document.getElementById('editGroupNameInput').value.trim();
  if (!newName) return alert('グループ名を入力してください。');

  getStoredGroups().then((groups) => {
    if (newName !== oldName && groups[newName]) {
      return alert('同じ名前のグループが既に存在します。');
    }

    const selected = getSelectedCalendarsFrom('editCalendarList');
    if (!selected.length) return alert('カレンダーが選択されていません。');

    delete groups[oldName];
    groups[newName] = selected;

    saveGroups(groups).then(() => {
      if (currentSelectedGroup === oldName) currentSelectedGroup = newName;
      loadGroups();
      notifyContentScript();
      cancelEditing();
    });
  });
}

function cancelEditing() {
  document.getElementById('editGroupSection').style.display = 'none';
  document.getElementById('createGroupSection').style.display = 'block';
  document.getElementById('editGroupSection').dataset.editingGroup = '';
  document.getElementById('editGroupNameInput').value = '';
  document.getElementById('editCalendarList').innerHTML = '';
}

function showToast(message) {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.classList.add('visible');
  setTimeout(() => toast.classList.remove('visible'), 2500);
}

function toggleGroup(groupName) {
  if (currentSelectedGroup === groupName) {
    currentSelectedGroup = null;
    sendToContentScript({ action: 'deactivateGroup' })
      .catch(console.error)
      .finally(() => updateGroupSelection());
  } else {
    currentSelectedGroup = groupName;
    getStoredGroups().then((groups) => {
      const calendarIds = (groups[groupName] || []).map((c) => c.id);
      sendToContentScript({ action: 'activateGroup', groupName, calendarIds })
        .catch(console.error)
        .finally(() => updateGroupSelection());
    });
  }
}
