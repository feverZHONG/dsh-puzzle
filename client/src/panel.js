// dsh-puzzle —— client 半 · 游戏浮窗面板（shell.overlay 可拖拽）
// 职责：滑块拼图棋盘 + 工具行（格数/新局/预览）+ 图片行（图库下拉/URL 换图）+
// 莉娅气泡 + 完成庆祝/预览遮罩 + 标题栏拖拽。
// 所有状态走 core.store / core.panelState（core.js 共享引用），操作走 core.*（通信包装）。
var react = require('react');
var core = require('./core');
var data = require('./data');

function PuzzlePanel() {
  var tickState = react.useState(0);
  var setTick = tickState[1];

  react.useEffect(function () {
    core.rerender.fn = setTick;
    function onEvt() { setTick(function (x) { return x + 1; }); }
    window.addEventListener(core.PANEL_EVENT, onEvt);
    return function () {
      core.rerender.fn = null;
      window.removeEventListener(core.PANEL_EVENT, onEvt);
    };
  }, []);

  if (!core.panelState.open) return null;

  var n = core.store.size;
  var total = n * n;
  var piece = Math.floor((core.BOARD - (n - 1) * core.GAP) / n);
  var span = n * piece + (n - 1) * core.GAP;
  var imgSrc = core.store.image ? core.store.image.url : data.PLACEHOLDER;

  // cover 裁剪：图片按比例放大铺满棋盘，居中裁切
  var cov = null;
  if (core.store.imageDim && core.store.imageDim.w && core.store.imageDim.h) {
    var scale = Math.max(span / core.store.imageDim.w, span / core.store.imageDim.h);
    var sw = core.store.imageDim.w * scale, sh = core.store.imageDim.h * scale;
    cov = { sw: sw, sh: sh, ox: (sw - span) / 2, oy: (sh - span) / 2 };
  }
  if (!cov) cov = { sw: span, sh: span, ox: 0, oy: 0 };

  var eRow = Math.floor(core.store.empty / n);
  var eCol = core.store.empty % n;

  var cells = [];
  for (var idx = 0; idx < total; idx++) {
    var val = core.store.board[idx];
    var isEmpty = val === total - 1;
    var r = Math.floor(idx / n), c = idx % n;
    var movable = !isEmpty && Math.abs(r - eRow) + Math.abs(c - eCol) === 1;
    var style = { width: piece, height: piece };
    if (!isEmpty) {
      var gr = Math.floor(val / n), gc = val % n;
      style.backgroundImage = 'url("' + imgSrc + '")';
      style.backgroundSize = cov.sw + 'px ' + cov.sh + 'px';
      style.backgroundPosition = '-' + (gc * (piece + core.GAP) + cov.ox) + 'px -' + (gr * (piece + core.GAP) + cov.oy) + 'px';
      style.backgroundRepeat = 'no-repeat';
    }
    cells.push(react.createElement('div', {
      key: idx,
      onClick: function (i) { return function () { core.move(i); }; }(idx),
      style: Object.assign({
        position: 'relative',
        borderRadius: 3,
        boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.18)',
        cursor: isEmpty ? 'default' : 'pointer',
        userSelect: 'none',
      }, style, isEmpty ? {
        background: 'rgba(0,0,0,0.16)',
        boxShadow: 'inset 0 2px 6px rgba(0,0,0,0.2)',
      } : {}, movable ? { outline: '2px solid rgba(255,150,180,0.9)', outlineOffset: -1, zIndex: 1 } : {}),
    }));
  }

  var boardEl = react.createElement('div', {
    style: {
      display: 'grid',
      gridTemplateColumns: 'repeat(' + n + ', ' + piece + 'px)',
      gap: core.GAP,
      padding: 4,
      borderRadius: 10,
      background: 'var(--dsw-alias-bg-layer-2, rgba(128,128,128,0.14))',
      boxShadow: '0 2px 10px rgba(0,0,0,0.12)',
      width: 'max-content',
    },
  }, cells);

  var mm = Math.floor(core.store.elapsed / 60);
  var ss = core.store.elapsed % 60;
  var timeStr = (mm < 10 ? '0' : '') + mm + ':' + (ss < 10 ? '0' : '') + ss;

  var sizeOpts = [2, 3, 4, 5, 6].map(function (s) {
    return react.createElement('option', { key: s, value: String(s) }, s + '×' + s);
  });

  // 图片下拉：占位图 + puzzles 图库
  var imgOpts = [react.createElement('option', { key: '__none__', value: '__none__' }, '内置占位图')]
    .concat(core.store.images.map(function (im) {
      return react.createElement('option', { key: im.name, value: im.name }, im.name);
    }));
  var currentImgName = core.store.image && core.store.images.length
    ? core.store.images.filter(function (im) { return im.url === core.store.image.url; }).map(function (im) { return im.name; })[0]
    : null;

  var btnStyle = {
    font: 'inherit', fontSize: 12, lineHeight: '1.4', padding: '3px 10px', borderRadius: 8,
    border: '1px solid var(--dsw-alias-border-l2, rgba(128,128,128,0.35))',
    background: 'var(--dsw-alias-bg-layer-1, rgba(255,255,255,0.6))',
    color: 'var(--dsw-alias-label-primary, inherit)', cursor: 'pointer',
  };

  var toolRow = react.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', margin: '8px 0' } },
    react.createElement('select', {
      value: String(n),
      onChange: function (e) {
        var g = Number(e.target.value);
        core.startGame(g);
        core.saveGridConfig(g);
        core.bump();
      },
      style: btnStyle,
    }, sizeOpts),
    react.createElement('button', { type: 'button', style: btnStyle, onClick: function () { core.startGame(n); core.bump(); } }, '新局'),
    react.createElement('button', { type: 'button', style: btnStyle, onClick: function () { core.store.preview = !core.store.preview; core.bump(); } }, core.store.preview ? '收起预览' : '预览'),
    react.createElement('span', { style: { fontSize: 12, opacity: 0.75 } },
      '步数 ' + core.store.moves + ' · ' + timeStr + ' · 图：' + (core.store.image ? core.store.image.label : '默认小星星')));

  var imgRow = react.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', margin: '4px 0' } },
    react.createElement('select', {
      value: currentImgName || '__none__',
      onChange: function (e) {
        var v = e.target.value;
        if (v === '__none__') {
          core.applyImage(data.PLACEHOLDER, '默认小星星');
          core.saveImageConfig(null);
        } else {
          var hit = core.store.images.filter(function (im) { return im.name === v; })[0];
          if (hit) {
            core.applyImage(hit.url, hit.name);
            core.saveImageConfig({ source: 'file', name: hit.name, url: hit.url });
          }
        }
        core.bump();
      },
      style: btnStyle,
    }, imgOpts),
    react.createElement('input', {
      type: 'text',
      placeholder: '粘贴图片 URL',
      value: core.store.urlDraft,
      onChange: function (e) { core.store.urlDraft = e.target.value; },
      style: Object.assign({}, btnStyle, { width: 150, background: 'transparent' }),
    }),
    react.createElement('button', {
      type: 'button',
      style: btnStyle,
      onClick: function () {
        var v = (core.store.urlDraft || '').trim();
        if (!v) return;
        core.store.urlDraft = '';
        core.applyImage(v, '自定义图');
        core.saveImageConfig({ source: 'url', name: null, url: v });
        core.bump();
      },
    }, '换图'));

  var lastMsg = core.store.messages.length ? core.store.messages[core.store.messages.length - 1] : null;
  var bubbleEl = null;
  if (lastMsg) {
    bubbleEl = react.createElement('div', {
      style: {
        marginTop: 8, fontSize: 12, lineHeight: '1.5',
        background: 'linear-gradient(90deg, rgba(255,209,220,0.92), rgba(251,194,235,0.92))',
        color: '#43223f', padding: '6px 10px', borderRadius: '10px 10px 10px 2px',
      },
    }, '莉娅：' + lastMsg.text);
  } else if (core.store.quip) {
    bubbleEl = react.createElement('div', {
      style: {
        marginTop: 8, fontSize: 12, lineHeight: '1.5',
        color: 'var(--dsw-alias-label-secondary, #888)',
        padding: '2px 2px', borderRadius: 8, fontStyle: 'italic',
      },
    }, '✦ ' + core.store.quip);
  }

  var overlay = null;
  if (core.store.solved) {
    overlay = react.createElement('div', {
      onClick: function () { core.startGame(n); core.bump(); },
      style: {
        position: 'absolute', inset: 0, background: 'rgba(24,18,36,0.82)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        gap: 10, borderRadius: 10, color: '#fff', zIndex: 5, textAlign: 'center', padding: 12,
      },
    },
      react.createElement('div', { style: { fontSize: 19, fontWeight: 700 } }, '🎉 拼完啦！'),
      react.createElement('div', { style: { fontSize: 12, opacity: 0.85 } },
        core.store.moves + ' 步 · ' + timeStr + ' · ' + (core.store.solvedLine || '哼，本天使才没有一直在偷看')),
      react.createElement('button', {
        type: 'button',
        onClick: function (e) { e.stopPropagation(); core.startGame(n); core.bump(); },
        style: btnStyle,
      }, '再来一局'));
  } else if (core.store.preview) {
    overlay = react.createElement('div', {
      onClick: function () { core.store.preview = false; core.bump(); },
      style: {
        position: 'absolute', inset: 0, background: 'rgba(24,18,36,0.82)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        gap: 10, borderRadius: 10, color: '#fff', zIndex: 5, textAlign: 'center', padding: 12,
      },
    },
      react.createElement('img', { src: imgSrc, alt: '预览', style: { maxWidth: '100%', maxHeight: 240, borderRadius: 6, boxShadow: '0 4px 18px rgba(0,0,0,0.4)' } }),
      react.createElement('div', { style: { fontSize: 12, opacity: 0.85 } }, (core.store.image ? core.store.image.label : '默认小星星') + ' · 点任意处收起'));
  }

  // 面板定位（默认右上，可拖拽；刷新页面后回默认）
  if (!core.panelState.pos) {
    core.panelState.pos = {
      x: Math.max(8, (window.innerWidth || 1200) - 430),
      y: Math.max(8, 90),
    };
  }
  var pos = core.panelState.pos;

  function onHeaderDown(e) {
    if (e.button !== 0) return;
    e.preventDefault();
    var sx = e.clientX, sy = e.clientY;
    var bx = pos.x, by = pos.y;
    function onMove(ev) {
      core.panelState.pos = { x: bx + (ev.clientX - sx), y: by + (ev.clientY - sy) };
      core.bump();
    }
    function onUp() {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }

  return react.createElement('div', {
    style: {
      position: 'fixed', left: pos.x, top: pos.y, zIndex: 3000,
      width: 400, maxWidth: 'calc(100vw - 16px)',
      maxHeight: 'calc(100vh - 24px)', overflowY: 'auto',
      background: 'var(--dsw-alias-bg-layer-3, #ffffff)',
      color: 'var(--dsw-alias-label-primary, inherit)',
      border: '1px solid var(--dsw-alias-border-l2, rgba(128,128,128,0.35))',
      borderRadius: 14, boxShadow: '0 12px 40px rgba(0,0,0,0.3)',
      fontFamily: 'system-ui, -apple-system, "Segoe UI", "Microsoft YaHei", sans-serif',
      fontSize: 13, userSelect: 'none',
    },
  },
    react.createElement('div', {
      onMouseDown: onHeaderDown,
      style: {
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '10px 14px', cursor: 'move',
        borderBottom: '1px solid var(--dsw-alias-border-l2, rgba(128,128,128,0.2))',
        background: 'linear-gradient(90deg, rgba(255,209,220,0.35), rgba(251,194,235,0.35))',
        borderRadius: '14px 14px 0 0',
      },
      title: '按住标题可拖动',
    },
      react.createElement('span', { style: { fontWeight: 600, fontSize: 14 } }, '🧩 莉娅拼图'),
      react.createElement('button', {
        type: 'button',
        onClick: function () { core.setPanelOpen(false); },
        style: {
          border: 0, background: 'transparent', cursor: 'pointer',
          color: 'var(--dsw-alias-label-tertiary, #999)', fontSize: 15, padding: '2px 6px',
        },
      }, '✕')),
    react.createElement('div', { style: { padding: '4px 14px 12px' } },
      toolRow,
      react.createElement('div', { style: { position: 'relative', width: 'max-content' } }, boardEl, overlay),
      imgRow,
      bubbleEl));
}

module.exports = { PuzzlePanel };
