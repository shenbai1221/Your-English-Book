/* 生成 js/data-embedded.js（file:// 直接打开时的回退词库）
 * 用法：node scripts/build-embedded.js
 * 修改词库请编辑 data/words.json 后运行本脚本。
 */
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const data = JSON.parse(fs.readFileSync(path.join(root, 'data', 'words.json'), 'utf8'));

const out =
  '// 此文件由 data/words.json 自动生成，用于以 file:// 协议直接打开时作为回退数据。\n' +
  '// 如需修改词库，请编辑 data/words.json 后运行 node scripts/build-embedded.js 重新生成。\n' +
  'window.EMBEDDED_WORDS = ' + JSON.stringify(data) + ';\n';

fs.writeFileSync(path.join(root, 'js', 'data-embedded.js'), out);
console.log('已生成 js/data-embedded.js（' + out.length + ' 字节，' + data.words.length + ' 词）');
