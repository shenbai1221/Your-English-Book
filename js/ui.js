/* 界面辅助函数 */
(function () {
  'use strict';

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }[c]));
  }

  let toastTimer = null;
  function toast(msg) {
    const el = document.getElementById('toast');
    if (!el) return;
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
  }

  function bookById(id) {
    const data = window.AppState && window.AppState.data;
    return (data && data.books.find((b) => b.id === id)) || { id: id || '', name: id || '', subtitle: '' };
  }

  function sortWords(words) {
    return words.slice().sort((a, b) => a.word.localeCompare(b.word, 'en'));
  }

  function masteryOf(word) {
    const rec = (window.AppState && window.AppState.mastery.get(word.word)) || null;
    const total = word.definitions.length;
    const checkedSet = new Set();
    let count = 0;
    if (rec) {
      (rec.checked || []).forEach((i) => {
        if (Number.isInteger(i) && i >= 0 && i < total && !checkedSet.has(i)) {
          checkedSet.add(i);
          count++;
        }
      });
    }
    return {
      rec: rec,
      checkedSet: checkedSet,
      count: count,
      total: total,
      done: total > 0 && count === total,
      masteredAt: (rec && rec.masteredAt) || null
    };
  }

  function diffDots(n) {
    n = Math.max(1, Math.min(5, Number(n) || 1));
    let out = '';
    for (let i = 1; i <= 5; i++) {
      out += i <= n ? '●' : '<span class="off">●</span>';
    }
    return out;
  }

  function diffLabel(n) {
    return ['', '基础', '基础', '进阶', '高阶', '拔尖'][Math.max(1, Math.min(5, Number(n) || 1))];
  }

  function bookBadge(bookId) {
    const b = bookById(bookId);
    return `<span class="badge-book bk-${esc(b.id)}">${esc(b.name)}</span>`;
  }

  function fmtDate(ts) {
    const d = new Date(ts);
    const now = new Date();
    const dayStart = (t) => new Date(t.getFullYear(), t.getMonth(), t.getDate()).getTime();
    const diffDays = Math.round((dayStart(now) - dayStart(d)) / 86400000);
    let group;
    if (diffDays === 0) group = '今天';
    else if (diffDays === 1) group = '昨天';
    else if (diffDays > 1 && diffDays < 7) group = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][d.getDay()];
    else group = `${d.getMonth() + 1}月${d.getDate()}日`;
    return {
      key: `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`,
      group: group,
      full: `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`
    };
  }

  function matchWord(w, q) {
    q = q.trim().toLowerCase();
    if (!q) return true;
    if (w.word.toLowerCase().includes(q)) return true;
    if ((w.phonetic || '').toLowerCase().includes(q)) return true;
    if ((w.etymology || '').toLowerCase().includes(q)) return true;
    if (w.definitions.some((d) => (d.meaning || '').toLowerCase().includes(q))) return true;
    return false;
  }

  window.UI = {
    esc: esc,
    toast: toast,
    bookById: bookById,
    sortWords: sortWords,
    masteryOf: masteryOf,
    diffDots: diffDots,
    diffLabel: diffLabel,
    bookBadge: bookBadge,
    fmtDate: fmtDate,
    matchWord: matchWord
  };
})();
