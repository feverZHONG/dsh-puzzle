// dsh-puzzle —— client 半 · 静态内容（占位图 + 莉娅台词池）
// 纯数据/常量域：改台词、换占位图只碰本文件顶部。零依赖。
function enc(s) {
  return encodeURIComponent(s);
}
var PLACEHOLDER = (function () {
  var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400" viewBox="0 0 400 400">'
    + '<defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">'
    + '<stop offset="0" stop-color="#ffd1dc"/><stop offset="0.55" stop-color="#fbc2eb"/><stop offset="1" stop-color="#a6c1ee"/>'
    + '</linearGradient></defs>'
    + '<rect width="400" height="400" fill="url(#sky)"/>'
    + '<circle cx="318" cy="96" r="34" fill="#fff6b7" opacity="0.95"/>'
    + '<circle cx="318" cy="96" r="46" fill="#fff6b7" opacity="0.35"/>'
    + '<g fill="#ffffff" opacity="0.9">'
    + '<circle cx="70" cy="60" r="4"/><circle cx="140" cy="40" r="3"/><circle cx="220" cy="72" r="5"/>'
    + '<circle cx="60" cy="150" r="3"/><circle cx="250" cy="130" r="4"/><circle cx="120" cy="110" r="3"/><circle cx="330" cy="40" r="4"/>'
    + '</g>'
    + '<path d="M0 300 Q100 250 200 295 T400 285 L400 400 L0 400 Z" fill="#b9a7e8"/>'
    + '<path d="M0 330 Q130 285 260 330 T400 325 L400 400 L0 400 Z" fill="#8f7fd0"/>'
    + '<text x="200" y="200" font-family="Microsoft YaHei,sans-serif" font-size="42" fill="#ffffff" text-anchor="middle" font-weight="bold">莉娅拼图</text>'
    + '<text x="200" y="234" font-family="Microsoft YaHei,sans-serif" font-size="17" fill="#fdf4ff" text-anchor="middle">等着阁下来拼 ✦</text>'
    + '</svg>';
  return 'data:image/svg+xml;charset=utf-8,' + enc(svg);
})();

// 莉娅台词池（开局/完成随机挑，面板常驻碎碎念）
var QUIPS = [
  '哼，本天使才没有一直在偷看',
  '这点难度，也就够本天使喝杯茶的',
  '手速不错嘛，勉强及格',
  '慢死了，本天使都等困了',
  '不错，居然没求饶',
  '动脑子，别乱点',
  '赢了本天使就夸你一句',
  '阁下手别抖，本天使看着呢',
];
var SOLVED_LINES = [
  '哼，本天使才没有一直在偷看',
  '不错嘛，居然真拼完了',
  '这点难度，本天使闭着眼都会',
  '手速可以，脑子也没丢',
  '拼完了？那本天使就夸你一下好了',
  '还行，没给本天使丢人',
];
function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

module.exports = { PLACEHOLDER, QUIPS, SOLVED_LINES, pick };
