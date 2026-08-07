# Your English Book · 纸页单词本

一款纸质词典风格的离线背单词应用，纯前端实现，支持网页（PWA）、Windows 桌面与安卓三端。

## 功能特性

- 九大词库：四级 / 六级 / 考研 / 雅思 / 托福 / GRE / SAT / GMAT / BEC，共 19,727 词
- 词典式详情：英/美音标、词源、中英释义、例句翻译、短语、同根词、近反义词、记忆法
- A–Z 翻页浏览与搜索定位
- 释义勾选掌握机制，自动移入复习，按学习顺序排列
- 复习板块提示剩余释义，支持取消勾选退回学习
- 有道真人发音（英音 / 美音），离线自动回退系统语音
- 近反义词弹窗查看，支持左右滑动 / 左右键 / 按钮切换单词
- 中英释义一键切换（中 / EN / 对照）
- 右下角拖动调节阅读字号，排版自适应
- 纸张颜色主题（米白 / 豆绿 / 雾蓝 / 暖杏）
- 自定义词本：自建词本并从词库中挑选单词
- 学习进度导出 / 导入，换机不丢数据
- 完全离线可用，数据仅存本地（IndexedDB）

## 使用方式

### 网页版

直接用浏览器打开 `index.html` 即可（词库内置）；或起一个本地静态服务：

```bash
python -m http.server 8123
```

访问 `http://localhost:8123`，可在浏览器中“安装应用”获得 PWA 体验。

### Windows 桌面版

项目根目录运行：

```bash
npm install
npm run dist
```


### 安卓版

需要 JDK 21 与 Android SDK（compileSdk 36）

```bash
npx cap sync android
cd android && ./gradlew assembleRelease
```

## 技术栈

- 原生 HTML / CSS / JavaScript（无框架）
- IndexedDB 本地存储
- Service Worker 离线缓存（PWA）
- Electron（桌面封装）
- Capacitor（安卓封装）
- 有道词典发音接口（可联网时使用，离线自动回退系统语音）

## 项目结构

```
├── index.html          入口页面
├── css/                纸质词典风格样式
├── js/                 应用逻辑（路由、词库、学习、复习、发音、备份）
├── data/words.json     内置词库（19,727 词）
├── web/                安卓端资源副本（生成）
├── main.js             Electron 桌面壳
├── package.json        依赖与打包配置
├── scripts/           词库导入与内嵌副本生成脚本
└── capacitor.config.json  Capacitor 配置
```

## 词库来源

词库数据整理自 [kajweb/dict](https://github.com/kajweb/dict)（有道词典数据），仅供学习使用。

## 免责声明

本项目为个人学习项目，词库数据版权归原作者所有，请勿用于商业用途。
