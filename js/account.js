/* 纸页单词本 - 账号界面与云同步引擎 */
(function () {
  'use strict';
  const UI = window.UI;
  let syncTimer = null;
  let syncing = false;
  let lastSyncTime = 0;

  function markDirty() {
    if (!window.Backend || !window.Backend.loggedIn) return;
    clearTimeout(syncTimer);
    syncTimer = setTimeout(pushNow, 1500);
  }

  function pushTombstone(id) {
    if (!window.Backend || !window.Backend.loggedIn) return;
    window.Backend.syncPut({
      mastery: [],
      customBooks: [{ id: id, deleted: true, updatedAt: Date.now() }],
      settings: null
    }).catch(() => {});
  }

  function getSettings() {
    return window.AccountHooks ? window.AccountHooks.getSettings() : {};
  }

  async function pushNow() {
    if (!window.Backend || !window.Backend.loggedIn || syncing) return;
    syncing = true;
    try {
      const payload = {
        mastery: window.AppState ? Array.from(window.AppState.mastery.values()) : [],
        customBooks: window.AppState ? Array.from(window.AppState.customBooks.values()) : [],
        settings: Object.assign(getSettings(), { updatedAt: Date.now() })
      };
      const res = await window.Backend.syncPut(payload);
      applyServer(res);
      lastSyncTime = Date.now();
      setStatus('已同步 ' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
    } catch (e) {
      setStatus('同步失败，稍后自动重试');
    } finally {
      syncing = false;
    }
  }

  function applyServer(data) {
    if (!data) return;
    const mastery = data.mastery || [];
    const books = data.customBooks || [];
    for (const rec of mastery) {
      if (!rec || typeof rec.id !== 'string') continue;
      const local = window.AppState.mastery.get(rec.id);
      if (!local || (Number(rec.updatedAt) || 0) >= (Number(local.updatedAt) || 0)) {
        window.AppState.mastery.set(rec.id, rec);
        if (window.VocabDB) window.VocabDB.put(rec).catch(() => {});
      }
    }
    for (const b of books) {
      if (!b || typeof b.id !== 'string') continue;
      if (b.deleted) {
        if (window.AppState.customBooks.has(b.id)) {
          window.AppState.customBooks.delete(b.id);
          if (window.VocabDB) window.VocabDB.deleteBook(b.id).catch(() => {});
        }
        continue;
      }
      const local = window.AppState.customBooks.get(b.id);
      if (!local || (Number(b.updatedAt) || 0) >= (Number(local.updatedAt) || 0)) {
        window.AppState.customBooks.set(b.id, b);
        if (window.VocabDB) window.VocabDB.putBook(b).catch(() => {});
      }
    }
    if (data.settings && window.AccountHooks) window.AccountHooks.applySettings(data.settings);
  }

  async function pullSync() {
    if (!window.Backend || !window.Backend.loggedIn) return false;
    try {
      const data = await window.Backend.syncGet();
      applyServer(data);
      return true;
    } catch (e) {
      return false;
    }
  }

  /* ---------- 账号对话框 ---------- */
  function dialogHTML() {
    const srv = (window.Backend && window.Backend.base) || '';
    const logged = !!(window.Backend && window.Backend.loggedIn);
    const uname = (window.Backend && window.Backend.username) || '';
    return '<div class="account-dialog">'
      + '<div class="backup-head"><h3>账号与云同步</h3><button class="popup-close" data-account-action="close" aria-label="关闭">×</button></div>'
      + '<div class="backup-body">'
      + '<p class="backup-tip">登录后可把学习进度、自定义词本和设置备份到云端，换设备不丢数据。</p>'
      + '<div class="acc-status' + (logged ? ' on' : '') + '" id="acc-status">'
      + (logged ? ('已登录：' + UI.esc(uname) + (lastSyncTime ? ' · 上次同步 ' + new Date(lastSyncTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '')) : '未登录（离线使用不受影响）')
      + '</div>'
      + '<label class="acc-label">服务器地址</label>'
      + '<input id="acc-server" class="backup-paste" placeholder="https://your-english-book.xxx.workers.dev" value="' + UI.esc(srv) + '">'
      + '<label class="acc-label">用户名</label>'
      + '<input id="acc-user" class="backup-paste" placeholder="2-20 位字母、数字、下划线或中文" maxlength="20">'
      + '<label class="acc-label">密码</label>'
      + '<input id="acc-pass" class="backup-paste" type="password" placeholder="至少 6 位" maxlength="64">'
      + '<div class="account-actions">'
      + '<button class="backup-btn primary" data-account-action="login">登录</button>'
      + '<button class="backup-btn" data-account-action="register">注册</button>'
      + (logged ? '<button class="backup-btn" data-account-action="logout">退出登录</button>' : '')
      + '</div>'
      + '</div></div>';
  }

  function open() {
    let mask = document.getElementById('account-mask');
    if (!mask) {
      mask = document.createElement('div');
      mask.id = 'account-mask';
      mask.className = 'backup-mask account-mask';
      document.body.appendChild(mask);
    }
    mask.innerHTML = dialogHTML();
    mask.classList.add('show');
    const serverInput = document.getElementById('acc-server');
    if (serverInput && !serverInput.value) serverInput.value = location.origin;
  }

  function close() {
    const mask = document.getElementById('account-mask');
    if (mask) mask.classList.remove('show');
  }

  function setStatus(text) {
    const el = document.getElementById('acc-status');
    if (el) el.textContent = text;
  }

  function val(id) {
    const el = document.getElementById(id);
    return el ? el.value.trim() : '';
  }

  async function doAuth(mode) {
    const server = val('acc-server');
    const u = val('acc-user');
    const p = val('acc-pass');
    if (!u || !p) { UI.toast('请输入用户名和密码'); return; }
    if (window.Backend) window.Backend.setBase(server);
    try {
      if (mode === 'register') await window.Backend.register(u, p);
      else await window.Backend.login(u, p);
      const ok = await pullSync();
      await pushNow();
      UI.toast(mode === 'register' ? '注册成功，数据已同步' : '登录成功，数据已同步');
      if (!ok) UI.toast('已登录，但首次拉取云端数据失败，可稍后重试');
      const mask = document.getElementById('account-mask');
      if (mask) mask.innerHTML = dialogHTML();
    } catch (e) {
      UI.toast(e.message || '操作失败');
    }
  }

  function doLogout() {
    if (window.Backend) window.Backend.logout();
    const mask = document.getElementById('account-mask');
    if (mask) mask.innerHTML = dialogHTML();
    UI.toast('已退出登录');
  }

  document.addEventListener('click', (e) => {
    const mask = document.getElementById('account-mask');
    if (mask && mask.classList.contains('show')) {
      if (e.target === mask) { close(); return; }
      const t = e.target.closest('[data-account-action]');
      if (t) {
        const action = t.dataset.accountAction;
        if (action === 'close') close();
        else if (action === 'login') doAuth('login');
        else if (action === 'register') doAuth('register');
        else if (action === 'logout') doLogout();
        return;
      }
    }
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const mask = document.getElementById('account-mask');
      if (mask && mask.classList.contains('show') && document.activeElement && document.activeElement.closest('#account-mask')) {
        e.preventDefault();
        doAuth('login');
      }
    }
  });

  async function init() {
    if (window.Backend && window.Backend.loggedIn) {
      const ok = await pullSync();
      if (ok) lastSyncTime = Date.now();
      setTimeout(markDirty, 2000);
    }
  }

  window.Account = {
    init: init,
    open: open,
    close: close,
    markDirty: markDirty,
    pushTombstone: pushTombstone,
    pushNow: pushNow
  };
})();
