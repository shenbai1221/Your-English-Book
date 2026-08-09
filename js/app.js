/* 纸页单词本：路由与视图逻辑 */
(function () {
  'use strict';
  const appEl = document.getElementById('app');
  const UI = window.UI;
  const esc = UI.esc;

  window.AppState = { data: null, mastery: new Map(), customBooks: new Map(), dbOk: false };

  const state = {
    view: { kind: 'books' },
    query: '',
    bookFilter: 'all',
    currentLetter: '',   // 当前翻页所在的首字母
    navList: [],         // 详情页「上一个/下一个」的单词顺序
    accent: 'us',        // 有道发音：uk=英音(1)，us=美音(2)
    defMode: 'both',     // 释义语言：cn=中文释义，en=英文释义，both=中英对照
    readSize: 16,          // 阅读字号（px，可拖动调节）
    manageMode: false,     // 自定义词本管理模式
    theme: 'paper',        // 纸张颜色：paper/sage/mist/apricot
    swipeDir: 0,           // 滑动方向：1=下一个，-1=上一个
    switchStyle: 'slide',  // 单词切换动画：slide/flip/fade
    switchSpeed: 'normal'  // 动画速度：slow/normal/fast
  };
  try {
    const saved = localStorage.getItem('vocab-accent');
    if (saved === 'uk' || saved === 'us') state.accent = saved;
    const defSaved = localStorage.getItem('vocab-defmode');
    if (defSaved === 'cn' || defSaved === 'en' || defSaved === 'both') state.defMode = defSaved;
    const rs = parseFloat(localStorage.getItem('vocab-readsize'));
    if (rs >= 12 && rs <= 32) state.readSize = rs;
    const themeSaved = localStorage.getItem('vocab-theme');
    if (themeSaved === 'paper' || themeSaved === 'sage' || themeSaved === 'mist' || themeSaved === 'apricot') state.theme = themeSaved;
    const stStyle = localStorage.getItem('vocab-switchstyle');
    if (stStyle === 'slide' || stStyle === 'flip' || stStyle === 'fade') state.switchStyle = stStyle;
    const stSpeed = localStorage.getItem('vocab-switchspeed');
    if (stSpeed === 'slow' || stSpeed === 'normal' || stSpeed === 'fast') state.switchSpeed = stSpeed;
  } catch (e) { /* localStorage 不可用则用默认值 */ }

  /* ---------- 数据与存储 ---------- */
  async function loadData() {
    try {
      const res = await fetch('data/words.json', { cache: 'no-cache' });
      if (res.ok) {
        window.AppState.data = await res.json();
        return;
      }
    } catch (e) {
      /* 以 file:// 直接打开或离线时走内嵌数据 */
    }
    window.AppState.data = window.EMBEDDED_WORDS || null;
  }

  async function initMastery() {
    try {
      const all = await window.VocabDB.all();
      (all || []).forEach((r) => window.AppState.mastery.set(r.id, r));
      const books = await window.VocabDB.allBooks();
      (books || []).forEach((b) => window.AppState.customBooks.set(b.id, b));
      window.AppState.dbOk = true;
    } catch (e) {
      window.AppState.dbOk = false;
      console.warn('IndexedDB 不可用，进度仅保存在内存中：', e);
    }
  }

  async function saveMastery(rec) {
    window.AppState.mastery.set(rec.id, rec);
    if (window.Account) window.Account.markDirty();
    if (!window.AppState.dbOk) return;
    try {
      await window.VocabDB.put(rec);
    } catch (e) {
      console.warn('进度写入失败：', e);
    }
  }

  /* ---------- 路由 ---------- */
  function route() {
    const h = location.hash || '#/';
    const parts = h.slice(1).split('/').filter(Boolean);
    document.body.classList.remove('detail');
    stopAudio();
    closeWordPopup();
    closeBackupModal();
    closeBookMask();
    closeReadSizePanel();
    if (!parts.length) return viewBooks();
    switch (parts[0]) {
      case 'book': return viewBook(parts[1]);
      case 'custom': return viewCustomBook(parts[1]);
      case 'learn': return viewLearn();
      case 'review': return viewReview();
      case 'word': return viewWord(parts[1]);
      default: location.hash = '#/';
    }
  }

  function setTab(name) {
    document.querySelectorAll('.tabbar a').forEach((a) => {
      a.classList.toggle('active', a.dataset.tab === name);
    });
  }

  function topbarHTML(title, sub) {
    return `<header class="topbar">
      <button class="icon-btn" data-action="back" aria-label="返回">‹</button>
      <h1 class="title">${esc(title)}</h1>
      ${sub ? `<span class="sub">${esc(sub)}</span>` : ''}
    </header>`;
  }

  /* ---------- 词库首页 ---------- */
  function viewBooks() {
    setTab('books');
    state.view = { kind: 'books' };
    state.query = '';
    const data = window.AppState.data;
    const cards = data.books.map((b) => {
      const words = data.words.filter((w) => w.book === b.id);
      const total = words.length;
      const done = words.filter((w) => UI.masteryOf(w).done).length;
      const pct = total ? Math.round((done / total) * 100) : 0;
      return `<a class="book-card bk-${esc(b.id)}" href="#/book/${esc(b.id)}">
        <div class="name">${esc(b.name)}</div>
        <div class="sub">${esc(b.subtitle)}</div>
        <div class="tag">${esc(b.tagline || '')}</div>
        <div class="stat"><span>${total} 词</span><span>已掌握 ${done}/${total}</span></div>
        <div class="bar"><i style="width:${pct}%"></i></div>
      </a>`;
    }).join('');
    appEl.innerHTML = `
      <header class="topbar"><h1 class="title">纸页单词本</h1></header>
      <div class="hero">
        <h1>词库</h1>
        <p>选择一本词书开始背诵，学习进度会自动保存在本机。</p>
      </div>
      <div class="books">${cards}</div>
      ${themeRowHTML()}
      ${customBooksHTML()}
      <div class="backup-actions">
        <button class="backup-btn" data-action="open-account">👤 账号</button>
        <button class="backup-btn" data-action="export-progress">导出学习进度</button>
        <button class="backup-btn" data-action="import-progress">导入学习进度</button>
      </div>
      <div class="foot-note">纸页单词本 · 离线可用 · 数据仅存于你的设备</div>`;
  }

  /* ---------- 列表视图骨架 ---------- */
  function listShellHTML() {
    return `
      <div class="list-head">
        <div class="search">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
            <circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input id="search" type="search" placeholder="搜索单词 / 中文释义…" autocomplete="off" value="${esc(state.query)}">
        </div>
        <div class="alpha" id="alpha-row"></div>
      </div>
      <div id="list-area"></div>`;
  }

  function lettersOf(words) {
    return [...new Set(words.map((w) => w.word[0].toUpperCase()))].sort();
  }

  function alphaHTML(letters) {
    return letters.map((l) =>
      `<button class="${l === state.currentLetter ? 'on' : ''}" data-action="flip-letter" data-letter="${l}">${l}</button>`
    ).join('');
  }

  function wordRowHTML(w, opts) {
    const m = UI.masteryOf(w);
    const status = m.done
      ? '<span class="done">✓ 已掌握</span>'
      : `<span>${m.count}/${m.total}</span>`;
    return `<a class="word-row" href="#/word/${encodeURIComponent(w.word)}">
      <div class="main"><div class="w">${esc(w.word)}</div><div class="ph">${esc(w.phonetic || '')}</div></div>
      ${opts.showBook ? UI.bookBadge(w.book) : ''}
      ${opts.manage ? '<button class="row-remove" data-action="remove-from-book" data-word="' + esc(w.word) + '">×</button>' : ''}
      <span class="meta">${status}</span><span class="chev">›</span>
    </a>`;
  }

  /* 翻页：某一首字母的单词页 */
  function pageHTML(letter, words, opts) {
    const items = words.filter((w) => w.word[0].toUpperCase() === letter);
    if (!items.length) return emptyHTML('这里还没有单词');
    return `<section class="page" data-letter="${letter}">
      <div class="group-head"><b>${letter}</b><span class="rule"></span><small>${items.length} 词</small></div>
      ${items.map((w) => wordRowHTML(w, opts)).join('')}
    </section>`;
  }

  /* 搜索模式：平铺结果 */
  function flatListHTML(words, opts) {
    if (!words.length) return emptyHTML(state.query ? '没有找到匹配的单词' : '这里还没有单词');
    return `<section class="page">${words.map((w) => wordRowHTML(w, opts || listOpts())).join('')}</section>`;
  }

  function reviewRowHTML(w) {
    const m = UI.masteryOf(w);
    const remaining = m.total - m.count;
    const status = m.done
      ? '<span class="meta done">✓ 已掌握</span>'
      : `<span class="meta todo">还有 ${remaining} 个释义未掌握</span>`;
    return `<a class="word-row" href="#/word/${encodeURIComponent(w.word)}">
      <div class="main"><div class="w">${esc(w.word)}</div><div class="ph">${esc(w.phonetic || '')}</div></div>
      ${UI.bookBadge(w.book)}
      ${status}<span class="chev">›</span>
    </a>`;
  }

  function reviewListHTML(words) {
    if (!words.length) {
      return emptyHTML(state.query ? '没有找到匹配的单词' : '还没有在复习中的单词\n勾选任意释义后，单词会出现在这里，并提示剩余释义');
    }
    const groups = [];
    const map = new Map();
    const dateOf = (w) => {
      const m = UI.masteryOf(w);
      return m.masteredAt || (m.rec && m.rec.updatedAt) || 0;
    };
    words
      .slice()
      /* 按移入复习的时间先后排序：同一天内即按学会顺序排列 */
      .sort((a, b) => dateOf(a) - dateOf(b))
      .forEach((w) => {
        const d = UI.fmtDate(dateOf(w));
        if (!map.has(d.key)) {
          const g = { label: d.group, key: d.key, items: [] };
          map.set(d.key, g);
          groups.push(g);
        }
        map.get(d.key).items.push(w);
      });
    groups.reverse(); /* 日期分组从新到旧：今天、昨天、更早 */
    return `<div class="list">${groups.map((g) => `
      <div class="date-group">
        <div class="date-head"><b>${g.label}</b><span class="rule"></span><small>${g.items.length} 词</small></div>
        ${g.items.map((w) => reviewRowHTML(w)).join('')}
      </div>`).join('')}</div>`;
  }

  function emptyHTML(text) {
    return `<div class="empty"><div class="big">❦</div>${String(text).split('\n').map((l) => `<p>${esc(l)}</p>`).join('')}</div>`;
  }

  /* ---------- 单词列表视图 ---------- */
  function viewBook(bookId) {
    if (!window.AppState.data.books.some((b) => b.id === bookId)) {
      location.hash = '#/';
      return;
    }
    const b = UI.bookById(bookId);
    setTab('books');
    state.view = { kind: 'book', bookId: bookId };
    state.query = '';
    state.bookFilter = 'all';
    state.currentLetter = '';
    appEl.innerHTML = topbarHTML(`${b.name}词书`, b.subtitle) + listShellHTML();
    refreshListArea();
  }

  function viewLearn() {
    setTab('learn');
    state.view = { kind: 'learn' };
    state.query = '';
    state.bookFilter = 'all';
    state.currentLetter = '';
    const all = window.AppState.data.words.filter((w) => !UI.masteryOf(w).done);
    const chips = ['all'].concat(window.AppState.data.books.map((b) => b.id)).map((id) => {
      const name = id === 'all' ? '全部' : UI.bookById(id).name;
      return `<button class="chip ${state.bookFilter === id ? 'on' : ''}" data-action="set-book" data-book="${id}">${esc(name)}</button>`;
    }).join('');
    appEl.innerHTML = topbarHTML('学习', `${all.length} 词学习中`) +
      `<div class="chips">${chips}</div>` + listShellHTML();
    refreshListArea();
  }

  function viewReview() {
    setTab('review');
    state.view = { kind: 'review' };
    state.query = '';
    state.currentLetter = '';
    const progressed = window.AppState.data.words.filter((w) => UI.masteryOf(w).count > 0);
    const partial = progressed.filter((w) => !UI.masteryOf(w).done).length;
    const sub = partial ? `${progressed.length} 词 · ${partial} 个未完成` : `${progressed.length} 词`;
    appEl.innerHTML = topbarHTML('复习', sub) + listShellHTML();
    refreshListArea();
  }

  function getViewWords() {
    const data = window.AppState.data;
    const v = state.view;
    let words = [];
    if (v.kind === 'book') {
      words = data.words.filter((w) => w.book === v.bookId);
    } else if (v.kind === 'learn') {
      words = data.words.filter((w) =>
        !UI.masteryOf(w).done && (state.bookFilter === 'all' || w.book === state.bookFilter)
      );
    } else if (v.kind === 'review') {
      words = data.words.filter((w) => UI.masteryOf(w).count > 0);
    } else if (v.kind === 'custom') {
      const book = window.AppState.customBooks.get(v.bookId);
      const ids = new Set(book ? book.wordIds : []);
      words = data.words.filter((w) => ids.has(w.word));
    }
    words = words.filter((w) => UI.matchWord(w, state.query));
    return UI.sortWords(words);
  }

  function refreshListArea() {
    const v = state.view;
    const words = getViewWords();
    state.navList = words.map((w) => w.word);

    const alphaRow = document.getElementById('alpha-row');
    const area = document.getElementById('list-area');
    if (!area) return;

    if (v.kind === 'review' || state.query) {
      if (alphaRow) {
        alphaRow.innerHTML = '';
        alphaRow.style.display = 'none';
      }
      area.innerHTML = v.kind === 'review' ? reviewListHTML(words) : flatListHTML(words, listOpts());
      return;
    }

    const letters = lettersOf(words);
    if (!letters.includes(state.currentLetter)) state.currentLetter = letters[0] || '';
    if (alphaRow) {
      alphaRow.style.display = '';
      alphaRow.innerHTML = alphaHTML(letters);
    }
    area.innerHTML = state.currentLetter
      ? pageHTML(state.currentLetter, words, listOpts())
      : emptyHTML('这里还没有单词');
  }

  /* 翻页动画：切到另一个首字母 */
  function flipLetter(letter) {
    const v = state.view;
    if (v.kind === 'review' || state.query) return;
    if (letter === state.currentLetter) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    const words = getViewWords();
    if (!words.some((w) => w.word[0].toUpperCase() === letter)) return;
    const forward = letter > state.currentLetter;
    state.currentLetter = letter;
    const area = document.getElementById('list-area');
    if (!area) return;
    const old = area.firstElementChild;
    if (old && old.classList) old.classList.add(forward ? 'page-out-left' : 'page-out-right');
    document.querySelectorAll('#alpha-row button').forEach((b) => {
      b.classList.toggle('on', b.dataset.letter === letter);
    });
    setTimeout(() => {
      area.innerHTML = pageHTML(letter, words, { showBook: v.kind !== 'book' });
      const pg = area.firstElementChild;
      if (pg) pg.classList.add(forward ? 'page-in-forward' : 'page-in-back');
      window.scrollTo(0, 0);
    }, 200);
  }

  /* ---------- 单词详情 ---------- */
  function progressAreaHTML(w) {
    const m = UI.masteryOf(w);
    const pct = m.total ? Math.round((m.count / m.total) * 100) : 0;
    const d = m.masteredAt ? UI.fmtDate(m.masteredAt) : null;
    return `
      <div class="progress-line">
        <div class="bar"><i style="width:${pct}%"></i></div>
        <span>已掌握 ${m.count}/${m.total}</span>
      </div>
      ${d ? `<div class="banner" id="mastered-banner">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>
        <span>已移入复习 · ${d.group}</span>
      </div>` : ''}`;
  }

  function wordNavHTML(w) {
    const idx = state.navList.indexOf(w.word);
    const total = state.navList.length;
    if (idx < 0 || total < 2) return '';
    return `<nav class="word-nav">
      <button class="nav-btn" data-action="prev-word" ${idx === 0 ? 'disabled' : ''}>‹ 上一个</button>
      <span class="nav-pos">${idx + 1} / ${total}</span>
      <button class="nav-btn" data-action="next-word" ${idx === total - 1 ? 'disabled' : ''}>下一个 ›</button>
    </nav>`;
  }

  function phoneticHTML(w) {
    const parts = [];
    if (w.ukphone) parts.push(`<span class="ph-part"><i>英</i>${esc(w.ukphone)}</span>`);
    if (w.usphone) parts.push(`<span class="ph-part"><i>美</i>${esc(w.usphone)}</span>`);
    if (!parts.length && w.phonetic) parts.push(`<span class="ph-part">${esc(w.phonetic)}</span>`);
    return parts.join('');
  }

  function sentencesHTML(w) {
    const list = w.sentences || [];
    if (!list.length) return '';
    return `<section class="sec"><h3>例句 EXAMPLES<span class="rule"></span></h3><div class="sentence-list">${list.map((s) => `
      <div class="sentence-item">
        <div class="s-en">${esc(s.en)}</div>
        ${s.cn ? `<div class="s-cn">${esc(s.cn)}</div>` : ''}
      </div>`).join('')}
    </div></section>`;
  }

  function phrasesHTML(w) {
    const list = w.phrases || [];
    if (!list.length) return '';
    return `<section class="sec"><h3>短语 PHRASES<span class="rule"></span></h3><div class="phrase-list">${list.map((p) => `
      <div class="phrase-item">
        <span class="p-en">${esc(p.phrase)}</span>
        ${p.cn ? `<span class="p-cn">${esc(p.cn)}</span>` : ''}
      </div>`).join('')}
    </div></section>`;
  }

  function relWordsHTML(w) {
    const list = w.relWords || [];
    if (!list.length) return '';
    return `<section class="sec"><h3>同根词 RELATED WORDS<span class="rule"></span></h3>${list.map((g) => `
      <div class="rel-group">
        <b>${esc(g.pos || '')}</b>
        ${(g.words || []).map((x) => `
          <span class="rel-item"><i>${esc(x.word)}</i>${x.meaning ? `<em>${esc(x.meaning)}</em>` : ''}</span>`).join('')}
      </div>`).join('')}
    </section>`;
  }

  function synonymsHTML(w) {
    const list = w.synonyms || [];
    if (!list.length) return '';
    const groups = list.map((s) => {
      if (typeof s === 'string') {
        return `<div class="chips-line">${chipWordHTML(s)}</div>`;
      }
      const label = [s.pos, s.meaning].filter(Boolean).join(' ');
      return `<div class="syn-group">
        ${label ? `<div class="syn-label">${esc(label)}</div>` : ''}
        <div class="chips-line">${(s.words || []).map((x) => chipWordHTML(x)).join('')}</div>
      </div>`;
    }).join('');
    return `<section class="sec"><h3>近义词 SYNONYMS<span class="rule"></span></h3>${groups}</section>`;
  }

  function chipWordHTML(word) {
    return `<button type="button" class="chipword" data-action="pop-word" data-word="${esc(word)}">${esc(word)}</button>`;
  }

  function defModeSwitchHTML() {
    const opts = [
      ['cn', '中'],
      ['en', 'EN'],
      ['both', '对照']
    ];
    return '<span class="accent-switch defmode-switch" role="group" aria-label="释义语言">' +
      opts.map(([m, label]) => '<button class="' + (state.defMode === m ? 'on' : '') + '" data-action="set-defmode" data-mode="' + m + '">' + label + '</button>').join('') +
      '</span>';
  }

  function defsHTML(w) {
    const m = UI.masteryOf(w);
    return w.definitions.map((d, i) => `
      <div class="def-item">
        <input type="checkbox" class="def-check" id="def-${i}" data-action="toggle-def" data-word="${esc(w.word)}" data-i="${i}" ${m.checkedSet.has(i) ? 'checked' : ''}>
        <div class="def-body">
          <span class="def-pos">${esc(d.pos)}</span>
          ${state.defMode !== 'en' ? '<div class="def-meaning">' + esc(d.meaning) + '</div>' : ''}
          ${state.defMode !== 'cn' && d.en ? '<div class="def-en">' + esc(d.en) + '</div>' : ''}
          ${d.example ? '<div class="def-example">' + esc(d.example) + '</div>' : ''}
        </div>
      </div>`).join('');
  }

  function wordBodyHTML(w) {
    const b = UI.bookById(w.book);
    const syn = synonymsHTML(w);
    const anti = w.antonyms && w.antonyms.length
      ? `<section class="sec"><h3>反义词 ANTONYMS<span class="rule"></span></h3><div class="chips-line">${w.antonyms.map((s) => chipWordHTML(typeof s === 'string' ? s : (s.word || s))).join('')}</div></section>`
      : '';
    const mem = w.remMethod
      ? `<section class="sec"><h3>记忆法 MEMORY<span class="rule"></span></h3><p class="etym">${esc(w.remMethod)}</p></section>`
      : '';
    return `
      <div class="meta-line">
        <a class="badge-book bk-${esc(b.id)}" href="#/book/${esc(b.id)}">${esc(b.name)}词书</a>
        <span class="diff">难度 ${UI.diffLabel(w.difficulty)} <span class="diff-dots">${UI.diffDots(w.difficulty)}</span></span>
        <span class="accent-switch" role="group" aria-label="选择发音">
          <button class="${state.accent === 'uk' ? 'on' : ''}" data-action="set-accent" data-accent="uk">英音</button>
          <button class="${state.accent === 'us' ? 'on' : ''}" data-action="set-accent" data-accent="us">美音</button>
        </span>
        ${defModeSwitchHTML()}
        <button class="book-add" data-action="open-book-picker" data-word="${esc(w.word)}">＋ 词本</button>
      </div>
      <div class="progress-area">${progressAreaHTML(w)}</div>
      <section class="sec">
        <h3>词源 ETYMOLOGY<span class="rule"></span></h3>
        <p class="etym">${esc(w.etymology || '暂无词源信息')}</p>
      </section>
      ${mem}
      <section class="sec">
        <h3>释义 DEFINITIONS<span class="rule"></span></h3>
        <div class="defs-list" data-word="${esc(w.word)}">${defsHTML(w)}</div>
      </section>
      ${sentencesHTML(w)}
      ${phrasesHTML(w)}
      ${relWordsHTML(w)}
      ${syn}
      ${anti}
      <p class="sec-note">提示：把全部释义勾选后，本词会自动从「学习」移入「复习」。</p>`;
  }

  function viewWord(wordId) {
    const id = decodeURIComponent(wordId);
    const w = window.AppState.data.words.find((x) => x.word === id);
    if (!w) {
      location.hash = '#/';
      return;
    }
    document.body.classList.add('detail');
    state.view = { kind: 'word', wordId: id };
    if (!state.navList.includes(w.word)) {
      /* 深链等场景：按所属词书的字母顺序兜底 */
      state.navList = UI.sortWords(window.AppState.data.words.filter((x) => x.book === w.book)).map((x) => x.word);
    }
    appEl.innerHTML = topbarHTML('释义', '') + `
      <article class="detail word-detail">
        <div class="word-head">
          <div class="grow">
            <h2>${esc(w.word)}</h2>
            <div class="phonetic">${phoneticHTML(w)}</div>
          </div>
          <button class="speak" data-action="speak" data-word="${esc(w.word)}" aria-label="播放发音">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
              <path d="M15.5 8.5a5 5 0 0 1 0 7"/>
              <path d="M19 5a9 9 0 0 1 0 14"/>
            </svg>
          </button>
        </div>
        ${wordBodyHTML(w)}
        ${wordNavHTML(w)}
      </article>`;
    if (state.swipeDir) {
      const art = appEl.querySelector('.detail');
      if (art) {
        const dir = state.swipeDir;
        if (state.switchStyle === 'flip') {
          art.dataset.flipDir = dir === 1 ? 'left' : 'right';
          art.style.setProperty('--flip-op', '0.3');
        }
        if (state.switchStyle === 'fade') art.classList.add('fade-in');
        else if (state.switchStyle === 'flip') art.classList.add(dir === 1 ? 'flip-in-right' : 'flip-in-left');
        else art.classList.add(dir === 1 ? 'swipe-in-right' : 'swipe-in-left');
        const animCls = ['swipe-in-right', 'swipe-in-left', 'flip-in-right', 'flip-in-left', 'fade-in'].find((c) => art.classList.contains(c));
        if (animCls) {
          setTimeout(() => {
            art.classList.remove(animCls);
            art.removeAttribute('data-flip-dir');
            art.style.setProperty('--flip-op', '0');
          }, switchOutMs() + 120);
        }
      }
      state.swipeDir = 0;
    }
    window.scrollTo(0, 0);
  }

  /* ---------- 近/反义词弹窗 ---------- */
  let popupRect = null;

  function openWordPopup(word) {
    const target = window.AppState.data.words.find((x) => x.word.toLowerCase() === String(word).trim().toLowerCase());
    if (!target) {
      UI.toast('词库中暂无「' + word + '」');
      return;
    }
    let mask = document.getElementById('word-popup-mask');
    if (!mask) {
      mask = document.createElement('div');
      mask.id = 'word-popup-mask';
      mask.className = 'popup-mask';
      mask.innerHTML = `
        <div class="word-popup" id="word-popup" role="dialog" aria-label="单词详情">
          <div class="popup-head">
            <div class="popup-word">
              <h3></h3>
              <div class="phonetic"></div>
            </div>
            <button class="speak popup-speak" data-action="speak" data-word="" aria-label="播放发音">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
                <path d="M15.5 8.5a5 5 0 0 1 0 7"/>
                <path d="M19 5a9 9 0 0 1 0 14"/>
              </svg>
            </button>
            <button class="popup-close" data-action="popup-close" aria-label="关闭">×</button>
          </div>
          <div class="popup-body word-detail"></div>
        </div>`;
      document.body.appendChild(mask);
      makeDraggable(mask.querySelector('.word-popup'));
    }
    const popup = mask.querySelector('.word-popup');
    popup.querySelector('.popup-word h3').textContent = target.word;
    popup.querySelector('.popup-word .phonetic').innerHTML = phoneticHTML(target);
    popup.querySelector('.popup-speak').dataset.word = target.word;
    popup.querySelector('.popup-body').innerHTML = wordBodyHTML(target);
    popup.querySelector('.popup-body').scrollTop = 0;
    mask.classList.add('show');
    if (popupRect) {
      /* 保留上次拖动后的位置 */
      popup.style.position = 'fixed';
      popup.style.left = popupRect.left + 'px';
      popup.style.top = popupRect.top + 'px';
      popup.style.transform = 'none';
    }
  }

  function closeWordPopup() {
    const mask = document.getElementById('word-popup-mask');
    if (mask) mask.classList.remove('show');
  }

  function makeDraggable(popup) {
    const head = popup.querySelector('.popup-head');
    let dragging = false;
    let startX = 0;
    let startY = 0;
    head.addEventListener('pointerdown', (e) => {
      if (e.target.closest('button')) return;
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      const rect = popup.getBoundingClientRect();
      popupRect = rect;
      popup.style.position = 'fixed';
      popup.style.left = rect.left + 'px';
      popup.style.top = rect.top + 'px';
      popup.style.transform = 'none';
      startX = e.clientX;
      startY = e.clientY;
      dragging = true;
      head.classList.add('dragging');
      document.body.classList.add('no-select');
      try { head.setPointerCapture(e.pointerId); } catch (err) { /* 忽略 */ }
      e.preventDefault();
    });
    head.addEventListener('pointermove', (e) => {
      if (!dragging || !popupRect) return;
      const x = Math.max(8, Math.min(window.innerWidth - popupRect.width - 8, popupRect.left + (e.clientX - startX)));
      const y = Math.max(8, Math.min(window.innerHeight - 120 - 8, popupRect.top + (e.clientY - startY)));
      popup.style.left = x + 'px';
      popup.style.top = y + 'px';
    });
    const stop = () => {
      if (!dragging) return;
      dragging = false;
      head.classList.remove('dragging');
      document.body.classList.remove('no-select');
    };
    head.addEventListener('pointerup', stop);
    head.addEventListener('pointercancel', stop);
  }

  async function toggleDef(wordId, idx, checked, rootEl) {
    const w = window.AppState.data.words.find((x) => x.word === wordId);
    if (!w) return;
    let rec = window.AppState.mastery.get(wordId);
    if (!rec) rec = { id: wordId, checked: [], masteredAt: null, updatedAt: Date.now() };
    rec.checked = (rec.checked || []).filter((i) => i !== idx);
    if (checked) rec.checked.push(idx);
    rec.updatedAt = Date.now();
    const total = w.definitions.length;
    const wasMastered = !!rec.masteredAt;
    const nowDone = total > 0 && rec.checked.filter((i) => i >= 0 && i < total).length === total;
    if (nowDone && !wasMastered) rec.masteredAt = Date.now();
    if (!nowDone && wasMastered) rec.masteredAt = null;
    await saveMastery(rec);
    const area = rootEl ? rootEl.querySelector('.progress-area') : document.querySelector('.progress-area');
    if (area) area.innerHTML = progressAreaHTML(w);
    if (nowDone && !wasMastered) UI.toast('已移入复习');
    else if (!nowDone && wasMastered) UI.toast('已移回学习');
  }

  /* ---------- 发音（有道接口，失败时回退系统语音） ---------- */
  let currentAudio = null;

  function stopAudio() {
    if (currentAudio) {
      try {
        currentAudio.onerror = null;
        currentAudio.pause();
        currentAudio.src = '';
        currentAudio.load();
      } catch (e) { /* 忽略 */ }
      currentAudio = null;
    }
    if ('speechSynthesis' in window) {
      try { speechSynthesis.cancel(); } catch (e) { /* 忽略 */ }
    }
  }

  function speakFallback(word) {
    if (!('speechSynthesis' in window)) return;
    try {
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(word);
      u.lang = state.accent === 'uk' ? 'en-GB' : 'en-US';
      u.rate = 0.85;
      speechSynthesis.speak(u);
    } catch (e) { /* 忽略回退失败 */ }
  }

  function speakWord(word) {
    stopAudio();
    const type = state.accent === 'uk' ? 1 : 2;
    const url = 'https://dict.youdao.com/dictvoice?audio=' + encodeURIComponent(word) + '&type=' + type;
    const audio = new Audio(url);
    currentAudio = audio;
    let triedFallback = false;
    const fallback = () => {
      if (triedFallback) return;
      triedFallback = true;
      UI.toast('语音加载失败，已切换系统发音');
      speakFallback(word);
    };
    audio.onerror = () => fallback();
    audio.play().catch((err) => {
      /* 被我们自己中断的旧播放（AbortError）不算失败 */
      if (err && err.name === 'AbortError') return;
      fallback();
    });
  }

  function navigateWord(dir) {
    if (state.view.kind !== 'word') return false;
    const w = window.AppState.data.words.find((x) => x.word === state.view.wordId);
    if (!w) return false;
    const idx = state.navList.indexOf(w.word);
    if (idx < 0) return false;
    const target = state.navList[idx + dir];
    if (!target) return false;
    location.replace('#/word/' + encodeURIComponent(target));
    return true;
  }

  /* ---------- 事件 ---------- */
  document.addEventListener('click', (e) => {
    if (swipeConsumed) { swipeConsumed = false; return; }
    const maskIds = ['word-popup-mask', 'backup-mask', 'book-name-mask', 'book-picker-mask', 'readsize-mask'];
    if (e.target && maskIds.indexOf(e.target.id) >= 0) {
      closeWordPopup();
      closeBackupModal();
      closeBookMask();
      closeReadSizePanel();
      return;
    }
    if (e.target && (e.target.id === 'word-popup-mask' || e.target.id === 'backup-mask')) {
      closeWordPopup();
      closeBackupModal();
      return;
    }
    const t = e.target.closest('[data-action]');
    if (!t) return;
    const action = t.dataset.action;
    if (action === 'back') {
      if (history.length > 1) history.back();
      else location.hash = '#/';
    } else if (action === 'flip-letter') {
      flipLetter(t.dataset.letter);
    } else if (action === 'set-book') {
      state.bookFilter = t.dataset.book;
      state.currentLetter = '';
      document.querySelectorAll('.chip').forEach((c) => c.classList.toggle('on', c.dataset.book === state.bookFilter));
      refreshListArea();
    } else if (action === 'speak') {
      speakWord(t.dataset.word);
    } else if (action === 'set-accent') {
      state.accent = t.dataset.accent;
      try { localStorage.setItem('vocab-accent', state.accent); } catch (err) { /* 忽略 */ }
      if (window.Account) window.Account.markDirty();
      document.querySelectorAll('.accent-switch button').forEach((b) => {
        b.classList.toggle('on', b.dataset.accent === state.accent);
      });
    } else if (action === 'set-defmode') {
      state.defMode = t.dataset.mode;
      try { localStorage.setItem('vocab-defmode', state.defMode); } catch (err) { /* 忽略 */ }
      if (window.Account) window.Account.markDirty();
      document.querySelectorAll('.defmode-switch button').forEach((b) => {
        b.classList.toggle('on', b.dataset.mode === state.defMode);
      });
      document.querySelectorAll('.defs-list').forEach((el) => {
        const w = window.AppState.data.words.find((x) => x.word === el.dataset.word);
        if (w) el.innerHTML = defsHTML(w);
      });
    } else if (action === 'open-account') {
      if (window.Account) window.Account.open();
    } else if (action === 'export-progress') {
      openBackupModal('export');
    } else if (action === 'import-progress') {
      openBackupModal('import');
    } else if (action === 'backup-close') {
      closeBackupModal();
    } else if (action === 'backup-copy') {
      progressJSON().then((t) => copyTextToClipboard(t));
    } else if (action === 'backup-download') {
      const d = new Date();
      progressJSON().then((t) => {
        downloadText('paper-vocab-progress-' + d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0') + '.json', t);
      });
    } else if (action === 'backup-import') {
      const paste = document.getElementById('backup-paste');
      const records = parseProgressText(paste ? paste.value : '');
      if (records) doImport(records);
      else UI.toast('备份内容为空或格式不正确');
    } else if (action === 'set-theme') {
      applyTheme(t.dataset.theme, true);
    } else if (action === 'create-book') {
      openCreateBookModal();
    } else if (action === 'confirm-create-book') {
      const input = document.getElementById('new-book-name');
      const name = input ? input.value.trim() : '';
      if (!name) { UI.toast('请输入词本名称'); return; }
      const book = { id: 'custom-' + Date.now(), name: name, createdAt: Date.now(), wordIds: [] };
      saveCustomBook(book);
      closeBookMask();
      UI.toast('已创建词本「' + name + '」');
      route();
    } else if (action === 'picker-close') {
      closeBookMask();
    } else if (action === 'open-book-picker') {
      openBookPicker(t.dataset.word || state.view.wordId);
    } else if (action === 'add-to-book') {
      const book = window.AppState.customBooks.get(t.dataset.book);
      const word = state.view.wordId;
      if (book && word && book.wordIds.indexOf(word) < 0) {
        book.wordIds.push(word);
        saveCustomBook(book);
        UI.toast('已加入「' + book.name + '」');
        const btn = document.querySelector('#book-picker-mask [data-book="' + t.dataset.book + '"]');
        if (btn) {
          btn.disabled = true;
          const cnt = btn.querySelector('.picker-count');
          if (cnt) cnt.textContent = '已在词本中';
        }
      }
    } else if (action === 'create-book-and-add') {
      const input = document.getElementById('new-book-name');
      const name = input ? input.value.trim() : '';
      const word = state.view.wordId;
      if (!name) { UI.toast('请输入词本名称'); return; }
      const book = { id: 'custom-' + Date.now(), name: name, createdAt: Date.now(), wordIds: word ? [word] : [] };
      saveCustomBook(book);
      closeBookMask();
      UI.toast('已创建并加入「' + name + '」');
    } else if (action === 'toggle-manage') {
      state.manageMode = !state.manageMode;
      document.querySelectorAll('.book-tools .chip').forEach((c) => c.classList.toggle('on', c === t));
      refreshListArea();
    } else if (action === 'remove-from-book') {
      e.preventDefault();
      const book = window.AppState.customBooks.get(state.view.bookId);
      const word = t.dataset.word;
      if (book && word) {
        book.wordIds = book.wordIds.filter((x) => x !== word);
        saveCustomBook(book);
        const sub = document.querySelector('.topbar .sub');
        if (sub) sub.textContent = book.wordIds.length + ' 词';
        refreshListArea();
        UI.toast('已从词本移除');
      }
    } else if (action === 'delete-book') {
      const book = window.AppState.customBooks.get(state.view.bookId);
      if (!book) return;
      if (t.dataset.confirm !== '1') {
        t.dataset.confirm = '1';
        t.textContent = '确认删除？';
        return;
      }
      window.AppState.customBooks.delete(book.id);
      if (window.AppState.dbOk) { try { window.VocabDB.deleteBook(book.id); } catch (e) { /* 忽略 */ } }
      if (window.Account) window.Account.pushTombstone(book.id);
      UI.toast('已删除词本「' + book.name + '」');
      location.hash = '#/';
    } else if (action === 'panel-close') {
      closeReadSizePanel();
    } else if (action === 'font-minus') {
      applyReadSize(clampReadSize(state.readSize - 1), true);
      syncReadSizePanel();
    } else if (action === 'font-plus') {
      applyReadSize(clampReadSize(state.readSize + 1), true);
      syncReadSizePanel();
    } else if (action === 'font-reset') {
      applyReadSize(16, true);
      syncReadSizePanel();
    } else if (action === 'set-switch-style') {
      state.switchStyle = t.dataset.style;
      try { localStorage.setItem('vocab-switchstyle', state.switchStyle); } catch (e) { /* 忽略 */ }
      if (window.Account) window.Account.markDirty();
      syncReadSizePanel();
    } else if (action === 'set-switch-speed') {
      state.switchSpeed = t.dataset.speed;
      try { localStorage.setItem('vocab-switchspeed', state.switchSpeed); } catch (e) { /* 忽略 */ }
      if (window.Account) window.Account.markDirty();
      applySwitchSettings();
      syncReadSizePanel();
    } else if (action === 'pop-word') {
      openWordPopup(t.dataset.word);
    } else if (action === 'popup-close') {
      closeWordPopup();
    } else if (action === 'prev-word') {
      state.swipeDir = -1;
      navigateWord(-1);
    } else if (action === 'next-word') {
      state.swipeDir = 1;
      navigateWord(1);
    } else if (action === 'toggle-def') {
      toggleDef(t.dataset.word, Number(t.dataset.i), t.checked, t.closest('.word-detail'));
      t.blur(); /* 取消复选框聚焦，让下一次点击立即生效 */
    }
  });

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeWordPopup();
      closeBackupModal();
      closeBookMask();
      closeReadSizePanel();
      return;
    }
    if (!document.body.classList.contains('detail')) return;
    const tag = (e.target && e.target.tagName) || '';
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      state.swipeDir = -1;
      navigateWord(-1);
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      state.swipeDir = 1;
      navigateWord(1);
    }
  });

  let composing = false;
  let searchTimer = null;
  appEl.addEventListener('compositionstart', () => { composing = true; });
  appEl.addEventListener('compositionend', (e) => {
    composing = false;
    if (e.target && e.target.id === 'search') {
      const q = e.target.value;
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => { state.query = q; refreshListArea(); }, 120);
    }
  });
  appEl.addEventListener('input', (e) => {
    if (e.target && e.target.id === 'search' && !composing) {
      const q = e.target.value;
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => { state.query = q; refreshListArea(); }, 120);
    }
  });

  /* ---------- 阅读字号调节（右下角拖动） ---------- */
  function applyReadSize(px, persist) {
    state.readSize = px;
    document.documentElement.style.setProperty('--read-size', px + 'px');
    const label = document.getElementById('read-size-label');
    if (label) label.style.fontSize = Math.min(1.6, px / 16) + 'rem';
    const bubble = document.getElementById('read-size-bubble');
    if (bubble) bubble.textContent = px + 'px';
    const pnl = document.getElementById('readsize-mask');
    if (pnl && pnl.classList.contains('show')) syncReadSizePanel();
    if (persist) {
      try { localStorage.setItem('vocab-readsize', String(px)); } catch (e) { /* 忽略 */ }
      if (window.Account) window.Account.markDirty();
    }
  }

  function setupReadSizeKnob() {
    if (document.getElementById('read-size-knob')) return;
    const knob = document.createElement('div');
    knob.id = 'read-size-knob';
    knob.className = 'read-size-knob';
    knob.setAttribute('role', 'slider');
    knob.setAttribute('aria-label', '拖动调节字号');
    knob.innerHTML = '<span class="knob-label" id="read-size-label">Aa</span><span class="knob-bubble" id="read-size-bubble"></span>';
    document.body.appendChild(knob);
    applyReadSize(state.readSize, false);

    let startX = 0;
    let startY = 0;
    let startSize = 0;
    let moved = 0;

    knob.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      startX = e.clientX;
      startY = e.clientY;
      startSize = state.readSize;
      moved = 0;
      knob.classList.add('dragging', 'showing');
      document.body.classList.add('no-select');
      try { knob.setPointerCapture(e.pointerId); } catch (err) { /* 忽略 */ }
      e.preventDefault();
    });
    knob.addEventListener('pointermove', (e) => {
      if (!knob.classList.contains('dragging')) return;
      moved = Math.max(moved, Math.abs(e.clientX - startX), Math.abs(e.clientY - startY));
      const px = Math.max(12, Math.min(32, Math.round((startSize + (startY - e.clientY) * 0.25) * 2) / 2));
      applyReadSize(px, false);
    });
    const stop = () => {
      if (!knob.classList.contains('dragging')) return;
      knob.classList.remove('dragging', 'showing');
      document.body.classList.remove('no-select');
      if (moved < 6) openReadSizePanel(); /* 轻点重置为默认 */
      else applyReadSize(state.readSize, true);
    };
    knob.addEventListener('pointerup', stop);
    knob.addEventListener('pointercancel', stop);
  }


  /* ---------- 学习进度备份与恢复 ---------- */
  async function progressJSON() {
    let records = [];
    try {
      const all = await window.VocabDB.all();
      records = (all || []).map((rec) => ({
        id: rec.id,
        checked: rec.checked || [],
        masteredAt: rec.masteredAt || null,
        updatedAt: rec.updatedAt || Date.now()
      }));
    } catch (e) {
      window.AppState.mastery.forEach((rec) => {
        records.push({
          id: rec.id,
          checked: rec.checked || [],
          masteredAt: rec.masteredAt || null,
          updatedAt: rec.updatedAt || Date.now()
        });
      });
    }
    return JSON.stringify({
      app: '纸页单词本',
      type: 'paper-vocab-progress',
      version: 1,
      exportedAt: new Date().toISOString(),
      count: records.length,
      records: records
    }, null, 2);
  }

  function downloadText(filename, text) {
    try {
      const blob = new Blob([text], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 3000);
    } catch (e) {
      UI.toast('下载失败，请使用复制功能');
    }
  }

  function fallbackCopy(text) {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      return ok;
    } catch (e) {
      return false;
    }
  }

  function copyTextToClipboard(text) {
    const done = () => UI.toast('已复制，请孌善保存');
    const fail = () => UI.toast('复制失败，请手动选择文本复制');
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, () => {
        if (fallbackCopy(text)) done(); else fail();
      });
    } else {
      if (fallbackCopy(text)) done(); else fail();
    }
  }

  async function openBackupModal(mode) {
    let mask = document.getElementById('backup-mask');
    if (!mask) {
      mask = document.createElement('div');
      mask.id = 'backup-mask';
      mask.className = 'backup-mask';
      document.body.appendChild(mask);
    }
    let exportCount = 0;
    if (mode === 'export') {
      const t = await progressJSON();
      try { exportCount = JSON.parse(t).records.length; } catch (e) { exportCount = 0; }
    }
    let inner;
    if (mode === 'export') {
      inner = '<p class="backup-tip">已导出 ' + exportCount + ' 条掌握记录，请保存到安全位置。</p>'
        + '<div class="backup-actions-row">'
        + '<button class="backup-btn primary" data-action="backup-copy">复制备份内容</button>'
        + '<button class="backup-btn" data-action="backup-download">下载 .json 文件</button>'
        + '</div>';
    } else {
      inner = '<p class="backup-tip">选择备份文件或粘贴备份内容，导入将覆盖同名单词的当前进度。</p>'
        + '<label class="backup-file">选择备份文件<input type="file" id="backup-file" accept=".json,application/json"></label>'
        + '<textarea id="backup-paste" class="backup-paste" placeholder="或在此粘贴备份内容…" rows="5"></textarea>'
        + '<button class="backup-btn primary" data-action="backup-import">开始导入</button>';
    }
    mask.innerHTML = '<div class="backup-modal">'
      + '<div class="backup-head"><h3>' + (mode === 'export' ? '导出学习进度' : '导入学习进度') + '</h3>'
      + '<button class="popup-close" data-action="backup-close" aria-label="关闭">×</button></div>'
      + '<div class="backup-body">' + inner + '</div></div>';
    mask.classList.add('show');
  }

  function closeBackupModal() {
    const mask = document.getElementById('backup-mask');
    if (mask) mask.classList.remove('show');
  }

  function parseProgressText(text) {
    try {
      const data = JSON.parse(text);
      const records = Array.isArray(data) ? data : (data && Array.isArray(data.records) ? data.records : null);
      if (!records) return null;
      return records.map((r) => ({
        id: String(r.id || '').trim(),
        checked: Array.isArray(r.checked) ? r.checked.filter((i) => Number.isInteger(i)).slice(0, 50) : [],
        masteredAt: typeof r.masteredAt === 'number' ? r.masteredAt : null,
        updatedAt: typeof r.updatedAt === 'number' ? r.updatedAt : Date.now()
      })).filter((r) => r.id);
    } catch (e) {
      return null;
    }
  }

  async function doImport(records) {
    if (!records.length) {
      UI.toast('备份内容为空或格式不正确');
      return;
    }
    for (const rec of records) {
      await saveMastery(rec);
    }
    closeBackupModal();
    UI.toast('导入成功 ' + records.length + ' 条记录');
    route();
  }

  document.addEventListener('change', (e) => {
    if (e.target && e.target.id === 'backup-file' && e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const reader = new FileReader();
      reader.onload = () => {
        const records = parseProgressText(String(reader.result || ''));
        if (records) doImport(records);
        else UI.toast('备份文件格式不正确');
      };
      reader.onerror = () => UI.toast('读取文件失败');
      reader.readAsText(file);
    }
  });


  /* ---------- 自定义词本 ---------- */
  async function saveCustomBook(book) {
    book.updatedAt = Date.now();
    window.AppState.customBooks.set(book.id, book);
    if (window.Account) window.Account.markDirty();
    if (!window.AppState.dbOk) return;
    try { await window.VocabDB.putBook(book); } catch (e) { console.warn('词本写入失败', e); }
  }

  function customBooksHTML() {
    const books = [...window.AppState.customBooks.values()].sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
    const cards = books.map((b) => {
      const words = window.AppState.data.words.filter((w) => b.wordIds.indexOf(w.word) >= 0);
      const total = words.length;
      const done = words.filter((w) => UI.masteryOf(w).done).length;
      const pct = total ? Math.round((done / total) * 100) : 0;
      return '<a class="book-card bk-custom" href="#/custom/' + encodeURIComponent(b.id) + '">'
        + '<div class="name">' + esc(b.name) + '</div>'
        + '<div class="sub">我的词本 · ' + (b.wordIds.length) + ' 词</div>'
        + '<div class="stat"><span>' + total + ' 词</span><span>已掌握 ' + done + '/' + total + '</span></div>'
        + '<div class="bar"><i style="width:' + pct + '%"></i></div></a>';
    }).join('');
    return '<div class="custom-section"><div class="section-title">我的词本</div>'
      + '<div class="books">' + cards
      + '<button class="book-card new-book" data-action="create-book"><div class="name">＋ 新建词本</div><div class="sub">从词库中挑选单词</div></button>'
      + '</div></div>';
  }

  function themeRowHTML() {
    const themes = [['paper', '#f7f1e3'], ['sage', '#edf2e3'], ['mist', '#e9eef3'], ['apricot', '#f5ead9']];
    return '<div class="theme-row"><span>纸张</span>'
      + themes.map(([t]) => '<button class="swatch ' + (state.theme === t ? 'on' : '') + '" data-action="set-theme" data-theme="' + t + '" style="background:' + themes.find((x) => x[0] === t)[1] + '" aria-label="' + t + '"></button>').join('')
      + '</div>';
  }

  function applyTheme(theme, persist) {
    state.theme = theme;
    document.documentElement.dataset.theme = theme;
    if (persist) {
      try { localStorage.setItem('vocab-theme', theme); } catch (e) { /* 忽略 */ }
      if (window.Account) window.Account.markDirty();
    }
    document.querySelectorAll('.swatch').forEach((el) => {
      el.classList.toggle('on', el.dataset.theme === theme);
    });
  }

  function openCreateBookModal() {
    const mask = document.createElement('div');
    mask.id = 'book-name-mask';
    mask.className = 'backup-mask';
    mask.innerHTML = '<div class="backup-modal">'
      + '<div class="backup-head"><h3>新建词本</h3><button class="popup-close" data-action="picker-close" aria-label="关闭">×</button></div>'
      + '<div class="backup-body"><p class="backup-tip">给词本起个名字，之后在单词详情页点「＋ 词本」把单词加进来。</p>'
      + '<input id="new-book-name" class="backup-paste" placeholder="词本名称（如：易混词）" maxlength="30">'
      + '<button class="backup-btn primary" data-action="confirm-create-book">创建词本</button></div></div>';
    document.body.appendChild(mask);
    mask.classList.add('show');
    const input = mask.querySelector('#new-book-name');
    if (input) setTimeout(() => input.focus(), 50);
  }

  function closeBookMask() {
    const m = document.getElementById('book-name-mask');
    if (m) m.remove();
    const p = document.getElementById('book-picker-mask');
    if (p) p.remove();
  }

  function openBookPicker(word) {
    closeBookMask();
    const mask = document.createElement('div');
    mask.id = 'book-picker-mask';
    mask.className = 'backup-mask';
    const books = [...window.AppState.customBooks.values()];
    const list = books.length ? books.map((b) => {
      const has = b.wordIds.indexOf(word) >= 0;
      return '<button class="picker-row" data-action="add-to-book" data-book="' + esc(b.id) + '" ' + (has ? 'disabled' : '') + '>'
        + '<span class="picker-name">' + esc(b.name) + '</span>'
        + '<span class="picker-count">' + (has ? '已在词本中' : b.wordIds.length + ' 词') + '</span></button>';
    }).join('') : '<p class="backup-tip">还没有词本，先创建一个吧。</p>';
    mask.innerHTML = '<div class="backup-modal">'
      + '<div class="backup-head"><h3>加入词本 · ' + esc(word) + '</h3><button class="popup-close" data-action="picker-close" aria-label="关闭">×</button></div>'
      + '<div class="backup-body">' + list
      + '<div class="picker-new"><input id="new-book-name" class="backup-paste" placeholder="新词本名称" maxlength="30"><button class="backup-btn primary" data-action="create-book-and-add">新建并加入</button></div>'
      + '</div></div>';
    document.body.appendChild(mask);
    mask.classList.add('show');
  }

  function viewCustomBook(bookId) {
    const b = window.AppState.customBooks.get(bookId);
    if (!b) { location.hash = '#/'; return; }
    setTab('books');
    state.view = { kind: 'custom', bookId: bookId };
    state.query = '';
    state.bookFilter = 'all';
    state.currentLetter = '';
    state.manageMode = false;
    appEl.innerHTML = topbarHTML(b.name, b.wordIds.length + ' 词')
      + '<div class="chips book-tools">'
      + '<button class="chip" data-action="toggle-manage">管理单词</button>'
      + '<button class="chip" data-action="delete-book">删除词本</button>'
      + '</div>'
      + listShellHTML();
    refreshListArea();
  }

  function listOpts() {
    return { showBook: state.view.kind !== 'book', manage: state.view.kind === 'custom' && state.manageMode };
  }

  /* ---------- 左右滑动切换单词 ---------- */
  function hasNeighbor(dir) {
    if (state.view.kind !== 'word') return false;
    const w = window.AppState.data.words.find((x) => x.word === state.view.wordId);
    if (!w) return false;
    const idx = state.navList.indexOf(w.word);
    if (idx < 0) return false;
    return !!state.navList[idx + dir];
  }

  let swipeState = null;
  let swipeConsumed = false;
  appEl.addEventListener('pointerdown', (e) => {
    if (!document.body.classList.contains('detail')) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const art = e.target.closest('.detail');
    if (!art) return;
    if (e.target.closest('button, a, input, .chipword, .speak, .read-size-knob')) return;
    swipeState = { art: art, startX: e.clientX, startY: e.clientY, dx: 0, axis: null, active: false, pointerId: e.pointerId, t0: Date.now() };
    try { art.setPointerCapture(e.pointerId); } catch (err) { /* 忽略 */ }
  });
  appEl.addEventListener('pointermove', (e) => {
    if (!swipeState || e.pointerId !== swipeState.pointerId) return;
    const dx = e.clientX - swipeState.startX;
    const dy = e.clientY - swipeState.startY;
    if (!swipeState.axis) {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
      swipeState.axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
      if (swipeState.axis === 'y') { swipeState = null; return; }
      swipeState.active = true;
      swipeState.art.classList.add('swiping');
      document.body.classList.add('no-select');
    }
    if (!swipeState.active) return;
    swipeState.dx = dx;
    const w = window.innerWidth || 390;
    const ratio = Math.min(1, Math.abs(dx) / (w * 0.6));
    const scale = 1 - ratio * 0.05;
    swipeState.art.dataset.flipDir = dx < 0 ? 'right' : 'left';
    swipeState.art.style.setProperty('--flip-op', String(Math.min(0.32, ratio * 0.34)));
    swipeState.art.style.transform = 'translateX(' + dx + 'px) scale(' + scale.toFixed(3) + ')';
    swipeState.art.style.opacity = String(1 - Math.min(0.35, ratio * 0.55));
  });
  function endSwipe(e) {
    if (!swipeState || e.pointerId !== swipeState.pointerId) return;
    const s = swipeState;
    swipeState = null;
    if (!s.active) return;
    document.body.classList.remove('no-select');
    const art = s.art;
    art.classList.remove('swiping');
    art.style.opacity = '';
    const dx = s.dx;
    const vx = Math.abs(dx) / Math.max(1, Date.now() - (s.t0 || Date.now()));
    const springBack = () => {
      art.style.transition = 'transform 0.3s cubic-bezier(0.2, 1.25, 0.4, 1), opacity 0.3s ease';
      art.style.transform = '';
      art.style.opacity = '';
      art.style.setProperty('--flip-op', '0');
      setTimeout(() => { art.style.transition = ''; }, 340);
    };
    const threshold = 72;
    const outClass = (dir) => {
      if (state.switchStyle === 'fade') return 'fade-out';
      if (state.switchStyle === 'flip') return dir === 1 ? 'flip-out-left' : 'flip-out-right';
      return dir === 1 ? 'swipe-out-left' : 'swipe-out-right';
    };
    const go = (dir) => {
      if (!hasNeighbor(dir)) return false;
      state.swipeDir = dir;
      art.dataset.flipDir = dir === 1 ? 'right' : 'left';
      art.style.setProperty('--flip-op', '0.32');
      art.classList.add(outClass(dir));
      setTimeout(() => { navigateWord(dir); }, switchOutMs());
      return true;
    };
    const fast = vx > 0.9;
    if (dx <= -threshold || (dx < -30 && fast)) { if (!go(1)) springBack(); }
    else if (dx >= threshold || (dx > 30 && fast)) { if (!go(-1)) springBack(); }
    else { springBack(); }
    swipeConsumed = true;
    setTimeout(() => { swipeConsumed = false; }, 350);
  }
  appEl.addEventListener('pointerup', endSwipe);
  appEl.addEventListener('pointercancel', endSwipe);


  /* ---------- 显示设置面板（字号 / 切换动画 / 速度） ---------- */
  const SWITCH_SPEED = { slow: 340, normal: 200, fast: 130 };

  function switchOutMs() {
    return SWITCH_SPEED[state.switchSpeed] || 200;
  }

  function applySwitchSettings() {
    const out = (switchOutMs() / 1000).toFixed(2) + 's';
    const inn = (Math.round(switchOutMs() * 1.15) / 1000).toFixed(2) + 's';
    document.documentElement.style.setProperty('--switch-out', out);
    document.documentElement.style.setProperty('--switch-in', inn);
  }

  function clampReadSize(v) {
    return Math.max(12, Math.min(32, Math.round(v * 2) / 2));
  }

  function openReadSizePanel() {
    let mask = document.getElementById('readsize-mask');
    if (!mask) {
      mask = document.createElement('div');
      mask.id = 'readsize-mask';
      mask.className = 'readsize-mask';
      mask.innerHTML = '<div class="readsize-panel">'
        + '<div class="panel-head"><h3>显示设置</h3><button class="popup-close" data-action="panel-close" aria-label="关闭">×</button></div>'
        + '<div class="panel-body">'
        + '<div class="panel-row"><span class="panel-label">字号</span>'
        + '<button class="fs-btn" data-action="font-minus" aria-label="减小字号">−</button>'
        + '<input type="range" id="font-range" min="12" max="32" step="0.5">'
        + '<button class="fs-btn" data-action="font-plus" aria-label="增大字号">＋</button>'
        + '<span class="fs-val" id="font-value"></span></div>'
        + '<div class="panel-row"><span class="panel-label">切换动画</span>'
        + '<span class="accent-switch" role="group">'
        + '<button data-action="set-switch-style" data-style="slide">滑动</button>'
        + '<button data-action="set-switch-style" data-style="flip">翻页</button>'
        + '<button data-action="set-switch-style" data-style="fade">淡入</button>'
        + '</span></div>'
        + '<div class="panel-row"><span class="panel-label">动画速度</span>'
        + '<span class="accent-switch" role="group">'
        + '<button data-action="set-switch-speed" data-speed="slow">慢</button>'
        + '<button data-action="set-switch-speed" data-speed="normal">标准</button>'
        + '<button data-action="set-switch-speed" data-speed="fast">快</button>'
        + '</span></div>'
        + '<div class="panel-row"><button class="backup-btn" data-action="font-reset">恢复默认字号</button></div>'
        + '</div></div>';
      document.body.appendChild(mask);
      document.addEventListener('input', (e) => {
        if (e.target && e.target.id === 'font-range') {
          applyReadSize(clampReadSize(parseFloat(e.target.value)), true);
          syncReadSizePanel();
        }
      });
    }
    mask.classList.add('show');
    syncReadSizePanel();
  }

  function closeReadSizePanel() {
    const m = document.getElementById('readsize-mask');
    if (m) m.classList.remove('show');
  }

  function syncReadSizePanel() {
    const range = document.getElementById('font-range');
    if (range) range.value = String(state.readSize);
    const val = document.getElementById('font-value');
    if (val) val.textContent = (Math.round(state.readSize * 10) / 10) + 'px';
    document.querySelectorAll('#readsize-mask [data-action="set-switch-style"]').forEach((b) => {
      b.classList.toggle('on', b.dataset.style === state.switchStyle);
    });
    document.querySelectorAll('#readsize-mask [data-action="set-switch-speed"]').forEach((b) => {
      b.classList.toggle('on', b.dataset.speed === state.switchSpeed);
    });
  }


  /* ---------- 账号：设置读取/应用钩子 ---------- */
  window.AccountHooks = {
    getSettings: function () {
      return { accent: state.accent, defMode: state.defMode, readSize: state.readSize,
        theme: state.theme, switchStyle: state.switchStyle, switchSpeed: state.switchSpeed };
    },
    applySettings: function (s) {
      if (!s) return;
      if (s.accent && (s.accent === 'uk' || s.accent === 'us')) {
        state.accent = s.accent;
        try { localStorage.setItem('vocab-accent', state.accent); } catch (e) { /* 忽略 */ }
        document.querySelectorAll('.accent-switch button').forEach((b) => {
          b.classList.toggle('on', b.dataset.accent === state.accent);
        });
      }
      if (s.defMode && (s.defMode === 'cn' || s.defMode === 'en' || s.defMode === 'both')) {
        state.defMode = s.defMode;
        try { localStorage.setItem('vocab-defmode', state.defMode); } catch (e) { /* 忽略 */ }
        document.querySelectorAll('.defmode-switch button').forEach((b) => {
          b.classList.toggle('on', b.dataset.mode === state.defMode);
        });
        document.querySelectorAll('.defs-list').forEach((el) => {
          const w = window.AppState.data.words.find((x) => x.word === el.dataset.word);
          if (w) el.innerHTML = defsHTML(w);
        });
      }
      if (typeof s.readSize === 'number' && s.readSize >= 12 && s.readSize <= 32) {
        applyReadSize(s.readSize, true);
      }
      if (s.theme && ['paper', 'sage', 'mist', 'apricot'].indexOf(s.theme) >= 0) {
        applyTheme(s.theme, true);
      }
      if (s.switchStyle && ['slide', 'flip', 'fade'].indexOf(s.switchStyle) >= 0) {
        state.switchStyle = s.switchStyle;
        try { localStorage.setItem('vocab-switchstyle', state.switchStyle); } catch (e) { /* 忽略 */ }
      }
      if (s.switchSpeed && ['slow', 'normal', 'fast'].indexOf(s.switchSpeed) >= 0) {
        state.switchSpeed = s.switchSpeed;
        try { localStorage.setItem('vocab-switchspeed', state.switchSpeed); } catch (e) { /* 忽略 */ }
      }
      applySwitchSettings();
      syncReadSizePanel();
    }
  };

  /* ---------- 启动 ---------- */




  function registerSW() {
    if (window.Capacitor || !('serviceWorker' in navigator) || !/^https?:$/.test(location.protocol)) {
      return;
    }
    if (navigator.serviceWorker) {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    }
  }

  async function init() {
    await loadData();
    if (!window.AppState.data) {
      appEl.innerHTML = '<div class="empty"><div class="big">❦</div><p>词库加载失败，请检查 data/words.json 是否存在。</p></div>';
      return;
    }
    await initMastery();
    setupReadSizeKnob();
    applySwitchSettings();
    applyTheme(state.theme, false);
    registerSW();
    /* 安卓系统返回键：先返回应用内上一页，首页时退出应用 */
    if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.App) {
      window.Capacitor.Plugins.App.addListener('backButton', () => {
        const mask = document.getElementById('word-popup-mask');
        if (mask && mask.classList.contains('show')) {
          closeWordPopup();
          return;
        }
        if (location.hash && location.hash !== '#/') {
          if (history.length > 1) history.back();
          else location.hash = '#/';
        } else {
          window.Capacitor.Plugins.App.exitApp();
        }
      });
    }
    window.addEventListener('hashchange', route);
    route();
    if (window.Account) window.Account.init();
  }

  init();
})();
