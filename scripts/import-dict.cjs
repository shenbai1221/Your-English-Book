/*
 * 从 kajweb/dict（https://github.com/kajweb/dict）导入词库
 * 严格按源 JSON 格式提取要素：英/美音标、中释+英释、例句+翻译、短语、同根词、
 * 近义词（词性/释义分组）、反义词、记忆法。
 * 用法：node scripts/import-dict.cjs <解压目录>
 * 生成 data/words.json，并同步生成 js/data-embedded.js。
 */
const fs = require('fs');
const path = require('path');
const os = require('os');

const root = path.resolve(__dirname, '..');
const srcDir = process.argv[2] || path.join(os.tmpdir(), 'kajweb-extract');

/* 六本词书 -> 软件分类映射 */
const BOOKS = [
  { file: 'CET4_2.json',    bookId: 'cet4',    difficulty: 1 },
  { file: 'CET6_2.json',    bookId: 'cet6',    difficulty: 2 },
  { file: 'KaoYan_2.json',  bookId: 'kaoyan',  difficulty: 3 },
  { file: 'IELTS_2.json',   bookId: 'ielts',   difficulty: 3 },
  { file: 'TOEFL_2.json',   bookId: 'toefl',   difficulty: 4 },
  { file: 'GRE_2.json',     bookId: 'gre',     difficulty: 5 }
];

const POS = {
  v: 'v.', vt: 'v.', vi: 'v.', n: 'n.', adj: 'adj.', adv: 'adv.',
  prep: 'prep.', conj: 'conj.', pron: 'pron.', num: 'num.', art: 'art.',
  aux: 'aux.', int: 'int.', abbr: 'abbr.', phr: 'phr.', det: 'det.',
  modal: 'modal v.', ad: 'adv.', a: 'adj.'
};

/* README 建议：清除少量法语字符 */
const FRAN = [['é', 'e'], ['ê', 'e'], ['è', 'e'], ['ë', 'e'], ['à', 'a'], ['â', 'a'],
  ['ç', 'c'], ['î', 'i'], ['ï', 'i'], ['ô', 'o'], ['ù', 'u'], ['û', 'u'],
  ['ü', 'u'], ['ÿ', 'y']];
function cleanFran(s) {
  return String(s || '').split('').map((ch) => {
    const hit = FRAN.find(([f]) => f === ch);
    return hit ? hit[1] : ch;
  }).join('');
}

function clean(s) {
  return String(s || '').replace(/\s+/g, ' ').replace(/^[,，;；:\s]+|[,，;；:\s]+$/g, '').trim();
}

function normalizePos(p) {
  if (!p) return '';
  const k = clean(p).toLowerCase();
  return POS[k] || (k ? k + '.' : '');
}

function phoneticOf(raw) {
  if (!raw) return '';
  return '/' + clean(raw).replace(/'/g, 'ˈ') + '/';
}

function cap(arr, n) {
  return (arr || []).slice(0, n);
}

/* trans -> definitions（中释 + 英释） */
function toDefinitions(c) {
  const defs = [];
  const seen = new Set();
  const trans = Array.isArray(c.trans) ? c.trans : [];
  for (const t of trans) {
    const pos = normalizePos(t.pos);
    const meaning = clean(t.tranCn);
    if (!meaning) continue;
    const key = pos + '|' + meaning;
    if (seen.has(key)) continue;
    seen.add(key);
    defs.push({ pos, meaning, en: clean(t.tranOther || ''), example: '', exampleCn: '' });
  }
  return defs;
}

/* sentence.sentences -> 例句（英文 + 中文翻译） */
function toSentences(c) {
  const list = (c && c.sentence && Array.isArray(c.sentence.sentences)) ? c.sentence.sentences : [];
  return cap(list
    .map((s) => ({ en: clean(s.sContent), cn: clean(s.sCn) }))
    .filter((s) => s.en), 3);
}

/* phrase.phrases -> 短语（英文 + 中文） */
function toPhrases(c) {
  const list = (c && c.phrase && Array.isArray(c.phrase.phrases)) ? c.phrase.phrases : [];
  return cap(list
    .map((p) => ({ phrase: clean(p.pContent), cn: clean(p.pCn) }))
    .filter((p) => p.phrase), 5);
}

/* relWord.rels -> 同根词（按词性分组） */
function toRelWords(c) {
  const groups = (c && c.relWord && Array.isArray(c.relWord.rels)) ? c.relWord.rels : [];
  return cap(groups.map((g) => {
    const words = (g.words || [])
      .map((x) => ({ word: clean(x.hwd), meaning: clean(x.tran) }))
      .filter((x) => x.word);
    return words.length ? { pos: normalizePos(g.pos), words: cap(words, 3) } : null;
  }).filter(Boolean), 3);
}

/* syno.synos -> 近义词（按词性/释义分组） */
function toSynonyms(c) {
  const groups = (c && c.syno && Array.isArray(c.syno.synos)) ? c.syno.synos : [];
  return cap(groups.map((g) => {
    const words = (g.hwds || []).map((h) => clean(h.w)).filter(Boolean);
    return words.length ? { pos: normalizePos(g.pos), meaning: clean(g.tran), words: cap(words, 4) } : null;
  }).filter(Boolean), 3);
}

/* antos.anto -> 反义词 */
function toAntonyms(c) {
  const list = (c && c.antos && Array.isArray(c.antos.anto)) ? c.antos.anto : [];
  return cap(list.map((a) => clean(a.hwd)).filter(Boolean), 8);
}

function remMethodOf(c) {
  return clean(c && c.remMethod && c.remMethod.val);
}

function findJsonDir(book) {
  const direct = path.join(srcDir, book.file);
  if (fs.existsSync(direct)) return direct;
  const sub = path.join(srcDir, book.file.replace(/\.json$/, ''), book.file);
  if (fs.existsSync(sub)) return sub;
  const dirs = fs.existsSync(srcDir) ? fs.readdirSync(srcDir) : [];
  for (const d of dirs) {
    const cand = path.join(srcDir, d, book.file);
    if (fs.existsSync(cand)) return cand;
  }
  return null;
}

function readBook(book) {
  const file = findJsonDir(book);
  if (!file) throw new Error('找不到 ' + book.file + '，请先解压词书到 ' + srcDir);
  const words = [];
  let bad = 0;
  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    if (!line.trim()) continue;
    let rec;
    try {
      rec = JSON.parse(line);
    } catch (e) {
      bad++;
      continue;
    }
    const head = rec.headWord || (rec.content && rec.content.word && rec.content.word.wordHead);
    if (!head) continue;
    const w = cleanFran(clean(head));
    if (!w) continue;
    const c = rec.content && rec.content.word && rec.content.word.content;
    const defs = toDefinitions(c);
    if (!defs.length) continue;

    const us = phoneticOf(c.usphone);
    const uk = phoneticOf(c.ukphone);
    const entry = {
      word: w,
      phonetic: us || uk,
      etymology: '',
      definitions: defs,
      synonyms: toSynonyms(c),
      antonyms: toAntonyms(c),
      book: book.bookId,
      difficulty: book.difficulty
    };
    if (uk) entry.ukphone = uk;
    if (us) entry.usphone = us;
    const rem = remMethodOf(c);
    if (rem) entry.remMethod = rem;
    const sentences = toSentences(c);
    if (sentences.length) entry.sentences = sentences;
    const phrases = toPhrases(c);
    if (phrases.length) entry.phrases = phrases;
    const relWords = toRelWords(c);
    if (relWords.length) entry.relWords = relWords;
    words.push(entry);
  }
  console.log(`  ${book.bookId.padEnd(7)} <- ${book.file.padEnd(16)} 读取 ${words.length} 词${bad ? '，跳过坏行 ' + bad : ''}`);
  return words;
}

function main() {
  const dataPath = path.join(root, 'data', 'words.json');
  const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
  /* 仅保留人工编写的词条（带词源），其余全部按源 JSON 重新导入 */
  const existing = (data.words || []).filter((w) => w.etymology);

  const merged = [];
  const seen = new Set();
  for (const w of existing) {
    const key = w.word.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(w);
  }
  console.log('保留原有人工词条：' + merged.length);

  let imported = 0;
  for (const book of BOOKS) {
    const words = readBook(book);
    for (const w of words) {
      const key = w.word.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(w);
      imported++;
    }
  }
  console.log('新增导入：' + imported + ' 词，总计：' + merged.length + ' 词');

  data.words = merged;
  fs.writeFileSync(dataPath, JSON.stringify(data));
  console.log('已写入 data/words.json（' + fs.statSync(dataPath).size + ' 字节）');

  const embedPath = path.join(root, 'js', 'data-embedded.js');
  const out =
    '// 此文件由 data/words.json 自动生成，用于以 file:// 协议直接打开时作为回退数据。\n' +
    '// 如需修改词库，请编辑 data/words.json 后运行 node scripts/build-embedded.js 重新生成。\n' +
    'window.EMBEDDED_WORDS = ' + JSON.stringify(data) + ';\n';
  fs.writeFileSync(embedPath, out);
  console.log('已生成 js/data-embedded.js（' + out.length + ' 字节）');
}

main();
