/* 纸页单词本 - 后端 API 客户端（账号 / 云同步） */
(function () {
  'use strict';
  const KEY = 'vocab-account';
  const DEFAULT_BASE = 'https://your-english-book.worldamong123.workers.dev';
  let token = null;
  let username = '';
  let base = DEFAULT_BASE;
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || '{}');
    token = saved.token || null;
    username = saved.username || '';
    base = saved.base || DEFAULT_BASE;
  } catch (e) { /* 忽略 */ }

  function persist() {
    try {
      localStorage.setItem(KEY, JSON.stringify({ token: token, username: username, base: base }));
    } catch (e) { /* 忽略 */ }
  }

  async function req(method, path, body) {
    const headers = {};
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (token) headers['Authorization'] = 'Bearer ' + token;
    let res;
    try {
      res = await fetch(base + path, {
        method: method,
        headers: headers,
        body: body !== undefined ? JSON.stringify(body) : undefined
      });
    } catch (e) {
      throw new Error('无法连接服务器（' + (base || '同源') + '）');
    }
    let data = null;
    try { data = await res.json(); } catch (e) { /* 忽略 */ }
    if (!res.ok) throw new Error((data && data.error) || ('网络错误(' + res.status + ')'));
    return data;
  }

  window.Backend = {
    get base() { return base; },
    get loggedIn() { return !!token; },
    get username() { return username; },
    setBase(v) {
      base = String(v || '').trim().replace(/\/+$/, '');
      persist();
    },
    async register(u, p) {
      const d = await req('POST', '/api/auth/register', { username: u, password: p });
      token = d.token;
      username = d.user.username;
      persist();
      return d;
    },
    async login(u, p) {
      const d = await req('POST', '/api/auth/login', { username: u, password: p });
      token = d.token;
      username = d.user.username;
      persist();
      return d;
    },
    logout() {
      token = null;
      username = '';
      persist();
    },
    me() {
      return req('GET', '/api/user/me');
    },
    syncGet() {
      return req('GET', '/api/sync');
    },
    syncPut(payload) {
      return req('PUT', '/api/sync', payload);
    }
  };
})();
