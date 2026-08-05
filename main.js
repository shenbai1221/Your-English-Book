/* 纸页单词本 - Electron 桌面壳 */
const { app, BrowserWindow, protocol, shell } = require('electron');
const path = require('path');
const fs = require('fs');

const APP_SCHEME = 'app';

protocol.registerSchemesAsPrivileged([
  {
    scheme: APP_SCHEME,
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true
    }
  }
]);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json'
};

function createWindow() {
  const win = new BrowserWindow({
    width: 1000,
    height: 780,
    minWidth: 380,
    minHeight: 600,
    show: !process.env.SMOKE_TEST,
    autoHideMenuBar: true,
    backgroundColor: '#f7f1e3',
    icon: path.join(__dirname, 'build', 'icon.ico'),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: false
    }
  });

  /* 外链交给系统浏览器 */
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    const u = new URL(url);
    if (u.protocol !== APP_SCHEME + ':') {
      e.preventDefault();
      if (/^https?:/i.test(url)) shell.openExternal(url);
    }
  });

  win.loadURL(APP_SCHEME + '://app/index.html');
  return win;
}

app.whenReady().then(() => {
  /* 自定义 app:// 协议，提供稳定的本地源，保证 fetch 与 IndexedDB 可用 */
  protocol.handle(APP_SCHEME, async (request) => {
    const url = new URL(request.url);
    let rel = decodeURIComponent(url.pathname);
    if (rel === '/' || rel === '') rel = '/index.html';
    const filePath = path.join(__dirname, rel);
    try {
      const data = await fs.promises.readFile(filePath);
      const ext = path.extname(filePath).toLowerCase();
      return new Response(data, {
        headers: { 'Content-Type': MIME[ext] || 'application/octet-stream' }
      });
    } catch (err) {
      return new Response('Not Found', { status: 404 });
    }
  });

  if (process.env.SMOKE_TEST) {
    /* 冒烟测试使用独立数据目录，不影响真实数据 */
    app.setPath('userData', path.join(app.getPath('temp'), 'paper-vocab-smoke'));
  }

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

/* ---------- 冒烟测试模式：加载完成后写结果文件并退出 ---------- */
if (process.env.SMOKE_TEST) {
  app.whenReady().then(() => {
    const win = BrowserWindow.getAllWindows()[0];
    if (!win) return;
    win.webContents.on('did-finish-load', async () => {
      try {
        const result = await win.webContents.executeJavaScript(`(async () => {
          const wait = (ms) => new Promise((r) => setTimeout(r, ms));
          for (let i = 0; i < 200; i++) {
            if (document.querySelectorAll('.book-card').length === 6) break;
            await wait(100);
          }
          let dbOk = false;
          try {
            await window.VocabDB.put({ id: '__smoke__', checked: [], masteredAt: null, updatedAt: Date.now() });
            const all = await window.VocabDB.all();
            dbOk = all.some((r) => r.id === '__smoke__');
            await window.VocabDB.clear();
          } catch (e) { dbOk = false; }
          return {
            books: document.querySelectorAll('.book-card').length,
            words: window.AppState && window.AppState.data ? window.AppState.data.words.length : -1,
            dbOk: dbOk,
            title: document.title
          };
        })()`);
        if (process.env.SMOKE_OUT) {
          fs.writeFileSync(process.env.SMOKE_OUT, JSON.stringify(result));
        }
      } catch (e) {
        if (process.env.SMOKE_OUT) {
          fs.writeFileSync(process.env.SMOKE_OUT, JSON.stringify({ error: e.message }));
        }
      } finally {
        setTimeout(() => app.exit(0), 300);
      }
    });
  });
}
