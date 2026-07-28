/* 构建脚本：将 src/ 下的分块源码拼接为单文件 index.html
 *  用法：node build.js
 *  产物：index.html（双击即用，纯本地离线）
 *  顺序：part1_head.html(含<!DOCTYPE>/<head>/<body><div class="app">) + part2_body.html(界面骨架)
 *        + <script> 包裹 part3_core / part4_analysis / part5_render / part6_ai </script>
 *        + </body></html>
 *  说明：源(src) 与产物(index.html) 必须一致；本脚本是唯一拼接入口，避免手工双写错位。
 */
const fs = require('fs');
const path = require('path');
const SRC = path.join(__dirname, 'src');
const read = f => fs.readFileSync(path.join(SRC, f), 'utf8');

const parts = [
  read('part1_head.html'),
  read('part2_body.html'),
  '\n',
  '<script>\n',
  read('part3_core.js'),
  '\n',
  read('part4_analysis.js'),
  '\n',
  read('part5_render.js'),
  '\n',
  read('part6_ai.js'),
  '\n',
  read('part_help.js'),
  '\n',
  read('part7_datatip.js'),
  '\n</script>\n</body>\n</html>\n'
];

const html = parts.join('');
fs.writeFileSync(path.join(__dirname, 'index.html'), html, 'utf8');
console.log('index.html 已重建（' + html.length + ' 字节）');
