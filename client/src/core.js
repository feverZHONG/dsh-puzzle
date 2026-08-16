// dsh-puzzle —— client 半 · 游戏核心（共享状态 + 拼图逻辑 + Host 通信）
// 三个深度耦合的部分合成一个模块（原 store.js + game.js + api.js）：
//   · 共享状态：模块级对象引用（跨组件/重挂载存活），panelState / rerender / store
//   · 拼图逻辑：newGame / tryMove（只改 store，不上报）
//   · 通信/轮询：post / report / save*Config / pullState / pollTick + 操作包装 startGame / move
// 拆分的耦合点：game 改 store、api 包装 game 的上报，拆开反而要跨文件跳，合并后内聚。
var data = require('./data');

// ── 常量 + 共享状态（原 store.js）──
var POLL_MS = 1000;
var PANEL_EVENT = 'dsh-puzzle-panel';
var BOARD = 340;
var GAP = 2;
var MAX_MESSAGES = 30;

var panelState = { open: false, pos: null, dragging: false };
var rerender = { fn: null };

var store = {
  size: 3,
  board: [],
  empty: -1,
  moves: 0,
  elapsed: 0,
  running: false,
  solved: false,
  image: null,      // { url, label }
  imageDim: null,   // { w, h } 自然尺寸（cover 裁剪用）
  preview: false,
  messages: [],
  seenSeq: 0,
  images: [],       // [{ name, url }]
  urlDraft: '',
  quip: '',         // 当前局的莉娅台词（开局随机挑）
  solvedLine: '',   // 完成时随机挑的台词（渲染时固定，不随轮询变）
};

// 面板开关
function bump() {
  if (rerender.fn) rerender.fn(function (x) { return x + 1; });
}
function setPanelOpen(open) {
  panelState.open = open;
  try { window.dispatchEvent(new CustomEvent(PANEL_EVENT)); } catch (e) {}
  bump();
}
function togglePanel() { setPanelOpen(!panelState.open); }

// ── 拼图逻辑（原 game.js：纯游戏，不做通信）──
function isSolvedBoard(b) {
  for (var i = 0; i < b.length; i++) if (b[i] !== i) return false;
  return true;
}

function newGame(n) {
  var total = n * n;
  var board = [];
  for (var i = 0; i < total; i++) board.push(i);
  var e = total - 1;
  var last = -1;
  var steps = n * n * n * 2;
  for (var s = 0; s < steps; s++) {
    var r = Math.floor(e / n), c = e % n;
    var cand = [];
    if (r > 0) cand.push(e - n);
    if (r < n - 1) cand.push(e + n);
    if (c > 0) cand.push(e - 1);
    if (c < n - 1) cand.push(e + 1);
    var options = cand.filter(function (x) { return x !== last; });
    var picked = options[Math.floor(Math.random() * options.length)];
    board[e] = board[picked];
    board[picked] = total - 1;
    last = e;
    e = picked;
  }
  var guard = 0;
  while (isSolvedBoard(board) && guard < 10) {
    var r2 = Math.floor(e / n), c2 = e % n;
    var cand2 = [];
    if (r2 > 0) cand2.push(e - n);
    if (r2 < n - 1) cand2.push(e + n);
    if (c2 > 0) cand2.push(e - 1);
    if (c2 < n - 1) cand2.push(e + 1);
    var pick2 = cand2[Math.floor(Math.random() * cand2.length)];
    board[e] = board[pick2];
    board[pick2] = total - 1;
    e = pick2;
    guard++;
  }
  store.size = n;
  store.board = board;
  store.empty = e;
  store.moves = 0;
  store.elapsed = 0;
  store.running = false;
  store.solved = false;
  store.quip = data.pick(data.QUIPS);
  store.solvedLine = '';
}

// 返回是否真的发生了移动（合法相邻步）：让 move 只在成功时上报
function tryMove(idx) {
  if (store.solved || !store.board.length) return false;
  var n = store.size;
  var e = store.empty;
  var dr = Math.abs(Math.floor(idx / n) - Math.floor(e / n));
  var dc = Math.abs((idx % n) - (e % n));
  if (dr + dc !== 1) return false;
  var b = store.board.slice();
  b[e] = b[idx];
  b[idx] = n * n - 1;
  store.board = b;
  store.empty = idx;
  store.moves += 1;
  store.running = true;
  store.solved = isSolvedBoard(b);
  if (store.solved) {
    store.running = false;
    store.solvedLine = data.pick(data.SOLVED_LINES);
  }
  bump();
  return true;
}

// ── 与 Host 通信 + 换图 + 轮询（原 api.js）──
var booted = false;

function post(path, body) {
  try {
    return fetch(path, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body || {}),
    }).catch(function () {});
  } catch (e) { return null; }
}
function report() {
  post('/dsh-puzzle/report', {
    grid: store.size, moves: store.moves, elapsed: store.elapsed,
    solved: store.solved, running: store.running,
  });
}
function saveImageConfig(image) {
  post('/dsh-puzzle/config', { image: image });
}
function saveGridConfig(grid) {
  post('/dsh-puzzle/config', { grid: grid });
}

// 游戏操作包装：改了状态就上报（保持旧 newGame/tryMove 内 report 的行为）
function startGame(n) {
  newGame(n);
  report();
}
function move(idx) {
  if (tryMove(idx)) report();
}

// 换图：预载自然尺寸（cover 裁剪用），失败回退拉伸
function applyImage(url, label) {
  store.image = { url: url, label: label };
  store.imageDim = null;
  var img = new Image();
  img.onload = function () {
    store.imageDim = { w: img.naturalWidth || 0, h: img.naturalHeight || 0 };
    bump();
  };
  img.onerror = function () {
    store.imageDim = null;
    bump();
  };
  img.src = url;
  startGame(store.size);
  bump();
}

// 轮询：拉消息/配置/图片清单 + 计时
function pullState() {
  fetch('/dsh-puzzle/state', { cache: 'no-store' })
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (d) {
      if (!d || typeof d !== 'object') return;
      var changed = false;
      if (Array.isArray(d.messages) && d.messages.length) {
        var fresh = d.messages.filter(function (m) { return m.seq > store.seenSeq; });
        if (fresh.length) {
          store.messages = store.messages.concat(fresh).slice(-MAX_MESSAGES);
          var lastSeq = fresh[fresh.length - 1].seq;
          if (lastSeq > store.seenSeq) store.seenSeq = lastSeq;
          changed = true;
        }
      }
      if (Array.isArray(d.images)) {
        if (d.images.length !== store.images.length || (d.images.length && d.images[0].name !== (store.images[0] && store.images[0].name))) {
          store.images = d.images;
          changed = true;
        }
      }
      var cfg = d.config;
      if (cfg && typeof cfg === 'object') {
        // 配置没图 = 用内置占位图。把「空」归一成 PLACEHOLDER 再比，否则
        // curUrl 是占位图 data URL、wantUrl 是 null，永远不相等 → 每秒
        // applyImage → 重开一局（占位图一直刷新的根因，0.1.1 修）。
        var wantUrl = cfg.image && typeof cfg.image.url === 'string' ? cfg.image.url : data.PLACEHOLDER;
        var curUrl = store.image ? store.image.url : null;
        if (wantUrl !== curUrl) {
          var label = cfg.image && cfg.image.source === 'file' && cfg.image.name ? cfg.image.name
            : cfg.image && cfg.image.source === 'url' ? '自定义图'
            : '默认小星星';
          applyImage(wantUrl, label);
          changed = true;
        }
        // 启动首拉时把配置里存的格数也恢复（图片分支不再吞掉 grid 恢复）
        if (!booted && Number.isInteger(cfg.grid) && cfg.grid >= 2 && cfg.grid <= 6 && cfg.grid !== store.size) {
          startGame(cfg.grid);
          changed = true;
        }
      }
      booted = true;
      if (changed) bump();
    })
    .catch(function () { /* 轮询失败静默 */ });
}

function pollTick() {
  if (store.running && !store.solved) {
    store.elapsed += 1;
    report();
    bump();
  }
  pullState();
}

module.exports = {
  POLL_MS, PANEL_EVENT, BOARD, GAP, MAX_MESSAGES,
  panelState, rerender, store,
  bump, setPanelOpen, togglePanel,
  isSolvedBoard, newGame, tryMove,
  post, report, saveImageConfig, saveGridConfig, startGame, move, applyImage, pullState, pollTick,
};
