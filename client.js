// 莉娅拼图插件 —— Client 半（dsh client bundle，手写）
// 功能：
//   1. 侧栏底部「🧩 拼图」开关（sidebar.footer.action）+ 可拖拽浮窗面板（shell.overlay）
//   2. 滑块拼图（2×2 ~ 6×6）：步数/用时、新局、预览、完成庆祝；图片 cover 裁剪切片
//   3. 换图三路：puzzles/ 图片库下拉、直链 URL 输入、或等莉娅用 puzzle_set_image 换（1s 轮询自动生效）
//   4. 莉娅消息气泡：puzzle_talk 发的话轮询显示
//   5. 设置 → 莉娅拼图 小节：图片库管理（缩略图/使用/URL/刷新）+ 当前局摘要
// 样式全内联 + dsw alias 变量；轮询在 apply 期用 ctx.effect 建一次（跨组件重挂载存活）。
window.__ModuleLoader__.load({
  id: 'dsh-puzzle-plugin',
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });

    var react = require('react');

    var POLL_MS = 1000;
    var PANEL_EVENT = 'dsh-puzzle-panel';
    var BOARD = 340;
    var GAP = 2;
    var MAX_MESSAGES = 30;

    // ── 共享状态（模块级，跨组件/重挂载存活）──
    var panelState = { open: false, pos: null, dragging: false };
    var rerender = { fn: null };
    var booted = false;

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
    };

    // ── 内置占位图（纯字符串 SVG data URL，零依赖）──
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

    // ── 面板开关 ──
    function bump() {
      if (rerender.fn) rerender.fn(function (x) { return x + 1; });
    }
    function setPanelOpen(open) {
      panelState.open = open;
      try { window.dispatchEvent(new CustomEvent(PANEL_EVENT)); } catch (e) {}
      bump();
    }
    function togglePanel() { setPanelOpen(!panelState.open); }

    // ── 拼图逻辑 ──
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
        var pick = options[Math.floor(Math.random() * options.length)];
        board[e] = board[pick];
        board[pick] = total - 1;
        last = e;
        e = pick;
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
      report();
    }

    function tryMove(idx) {
      if (store.solved || !store.board.length) return;
      var n = store.size;
      var e = store.empty;
      var dr = Math.abs(Math.floor(idx / n) - Math.floor(e / n));
      var dc = Math.abs((idx % n) - (e % n));
      if (dr + dc !== 1) return;
      var b = store.board.slice();
      b[e] = b[idx];
      b[idx] = n * n - 1;
      store.board = b;
      store.empty = idx;
      store.moves += 1;
      store.running = true;
      store.solved = isSolvedBoard(b);
      if (store.solved) store.running = false;
      report();
      bump();
    }

    // ── 与 Host 的通信 ──
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
      newGame(store.size);
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
            var wantUrl = cfg.image && typeof cfg.image.url === 'string' ? cfg.image.url : null;
            var curUrl = store.image ? store.image.url : null;
            if (wantUrl !== curUrl) {
              if (wantUrl) {
                applyImage(wantUrl, cfg.image.source === 'file' && cfg.image.name ? cfg.image.name : '自定义图');
              } else {
                applyImage(PLACEHOLDER, '默认小星星');
              }
              changed = true;
            } else if (!booted && Number.isInteger(cfg.grid) && cfg.grid >= 2 && cfg.grid <= 6 && cfg.grid !== store.size) {
              newGame(cfg.grid);
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

    // ── 游戏面板（shell.overlay 可拖拽浮窗）──
    function PuzzlePanel() {
      var tickState = react.useState(0);
      var setTick = tickState[1];

      react.useEffect(function () {
        rerender.fn = setTick;
        function onEvt() { setTick(function (x) { return x + 1; }); }
        window.addEventListener(PANEL_EVENT, onEvt);
        return function () {
          rerender.fn = null;
          window.removeEventListener(PANEL_EVENT, onEvt);
        };
      }, []);

      if (!panelState.open) return null;

      var n = store.size;
      var total = n * n;
      var piece = Math.floor((BOARD - (n - 1) * GAP) / n);
      var span = n * piece + (n - 1) * GAP;
      var imgSrc = store.image ? store.image.url : PLACEHOLDER;

      // cover 裁剪：图片按比例放大铺满棋盘，居中裁切
      var cov = null;
      if (store.imageDim && store.imageDim.w && store.imageDim.h) {
        var scale = Math.max(span / store.imageDim.w, span / store.imageDim.h);
        var sw = store.imageDim.w * scale, sh = store.imageDim.h * scale;
        cov = { sw: sw, sh: sh, ox: (sw - span) / 2, oy: (sh - span) / 2 };
      }
      if (!cov) cov = { sw: span, sh: span, ox: 0, oy: 0 };

      var eRow = Math.floor(store.empty / n);
      var eCol = store.empty % n;

      var cells = [];
      for (var idx = 0; idx < total; idx++) {
        var val = store.board[idx];
        var isEmpty = val === total - 1;
        var r = Math.floor(idx / n), c = idx % n;
        var movable = !isEmpty && Math.abs(r - eRow) + Math.abs(c - eCol) === 1;
        var style = { width: piece, height: piece };
        if (!isEmpty) {
          var gr = Math.floor(val / n), gc = val % n;
          style.backgroundImage = 'url("' + imgSrc + '")';
          style.backgroundSize = cov.sw + 'px ' + cov.sh + 'px';
          style.backgroundPosition = '-' + (gc * (piece + GAP) + cov.ox) + 'px -' + (gr * (piece + GAP) + cov.oy) + 'px';
          style.backgroundRepeat = 'no-repeat';
        }
        cells.push(react.createElement('div', {
          key: idx,
          onClick: function (i) { return function () { tryMove(i); }; }(idx),
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
          gap: GAP,
          padding: 4,
          borderRadius: 10,
          background: 'var(--dsw-alias-bg-layer-2, rgba(128,128,128,0.14))',
          boxShadow: '0 2px 10px rgba(0,0,0,0.12)',
          width: 'max-content',
        },
      }, cells);

      var mm = Math.floor(store.elapsed / 60);
      var ss = store.elapsed % 60;
      var timeStr = (mm < 10 ? '0' : '') + mm + ':' + (ss < 10 ? '0' : '') + ss;

      var sizeOpts = [2, 3, 4, 5, 6].map(function (s) {
        return react.createElement('option', { key: s, value: String(s) }, s + '×' + s);
      });

      // 图片下拉：占位图 + puzzles 图库
      var imgOpts = [react.createElement('option', { key: '__none__', value: '__none__' }, '内置占位图')]
        .concat(store.images.map(function (im) {
          return react.createElement('option', { key: im.name, value: im.name }, im.name);
        }));
      var currentImgName = store.image && store.images.length
        ? store.images.filter(function (im) { return im.url === store.image.url; }).map(function (im) { return im.name; })[0]
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
            newGame(g);
            saveGridConfig(g);
            bump();
          },
          style: btnStyle,
        }, sizeOpts),
        react.createElement('button', { type: 'button', style: btnStyle, onClick: function () { newGame(n); bump(); } }, '新局'),
        react.createElement('button', { type: 'button', style: btnStyle, onClick: function () { store.preview = !store.preview; bump(); } }, store.preview ? '收起预览' : '预览'),
        react.createElement('span', { style: { fontSize: 12, opacity: 0.75 } },
          '步数 ' + store.moves + ' · ' + timeStr + ' · 图：' + (store.image ? store.image.label : '默认小星星')));

      var imgRow = react.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', margin: '4px 0' } },
        react.createElement('select', {
          value: currentImgName || '__none__',
          onChange: function (e) {
            var v = e.target.value;
            if (v === '__none__') {
              applyImage(PLACEHOLDER, '默认小星星');
              saveImageConfig(null);
            } else {
              var hit = store.images.filter(function (im) { return im.name === v; })[0];
              if (hit) {
                applyImage(hit.url, hit.name);
                saveImageConfig({ source: 'file', name: hit.name, url: hit.url });
              }
            }
            bump();
          },
          style: btnStyle,
        }, imgOpts),
        react.createElement('input', {
          type: 'text',
          placeholder: '粘贴图片 URL',
          value: store.urlDraft,
          onChange: function (e) { store.urlDraft = e.target.value; },
          style: Object.assign({}, btnStyle, { width: 150, background: 'transparent' }),
        }),
        react.createElement('button', {
          type: 'button',
          style: btnStyle,
          onClick: function () {
            var v = (store.urlDraft || '').trim();
            if (!v) return;
            store.urlDraft = '';
            applyImage(v, '自定义图');
            saveImageConfig({ source: 'url', name: null, url: v });
            bump();
          },
        }, '换图'));

      var lastMsg = store.messages.length ? store.messages[store.messages.length - 1] : null;
      var bubbleEl = lastMsg
        ? react.createElement('div', {
            style: {
              marginTop: 8, fontSize: 12, lineHeight: '1.5',
              background: 'linear-gradient(90deg, rgba(255,209,220,0.92), rgba(251,194,235,0.92))',
              color: '#43223f', padding: '6px 10px', borderRadius: '10px 10px 10px 2px',
            },
          }, '莉娅：' + lastMsg.text)
        : null;

      var overlay = null;
      if (store.solved) {
        overlay = react.createElement('div', {
          onClick: function () { newGame(n); bump(); },
          style: {
            position: 'absolute', inset: 0, background: 'rgba(24,18,36,0.82)',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            gap: 10, borderRadius: 10, color: '#fff', zIndex: 5, textAlign: 'center', padding: 12,
          },
        },
          react.createElement('div', { style: { fontSize: 19, fontWeight: 700 } }, '🎉 拼完啦！'),
          react.createElement('div', { style: { fontSize: 12, opacity: 0.85 } },
            store.moves + ' 步 · ' + timeStr + ' · 哼，本天使才没有一直在偷看'),
          react.createElement('button', {
            type: 'button',
            onClick: function (e) { e.stopPropagation(); newGame(n); bump(); },
            style: btnStyle,
          }, '再来一局'));
      } else if (store.preview) {
        overlay = react.createElement('div', {
          onClick: function () { store.preview = false; bump(); },
          style: {
            position: 'absolute', inset: 0, background: 'rgba(24,18,36,0.82)',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            gap: 10, borderRadius: 10, color: '#fff', zIndex: 5, textAlign: 'center', padding: 12,
          },
        },
          react.createElement('img', { src: imgSrc, alt: '预览', style: { maxWidth: '100%', maxHeight: 240, borderRadius: 6, boxShadow: '0 4px 18px rgba(0,0,0,0.4)' } }),
          react.createElement('div', { style: { fontSize: 12, opacity: 0.85 } }, (store.image ? store.image.label : '默认小星星') + ' · 点任意处收起'));
      }

      // 面板定位（默认右上，可拖拽；刷新页面后回默认）
      if (!panelState.pos) {
        panelState.pos = {
          x: Math.max(8, (window.innerWidth || 1200) - 430),
          y: Math.max(8, 90),
        };
      }
      var pos = panelState.pos;

      function onHeaderDown(e) {
        if (e.button !== 0) return;
        e.preventDefault();
        var sx = e.clientX, sy = e.clientY;
        var bx = pos.x, by = pos.y;
        var moved = false;
        function onMove(ev) {
          moved = true;
          panelState.pos = { x: bx + (ev.clientX - sx), y: by + (ev.clientY - sy) };
          bump();
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
            onClick: function () { setPanelOpen(false); },
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

    // ── 侧栏开关（照 dsh-liya-archives 模式：图标常显、文字仅宽栏；窄栏变 36px 圆形）──
    function PuzzleToggle(props) {
      var wide = !!(props && props.wide);
      var tickState = react.useState(0);
      var setTick = tickState[1];
      react.useEffect(function () {
        function onEvt() { setTick(function (x) { return x + 1; }); }
        window.addEventListener(PANEL_EVENT, onEvt);
        return function () { window.removeEventListener(PANEL_EVENT, onEvt); };
      }, []);
      return react.createElement('div', {
        style: {
          flex: 'none', alignItems: 'center', display: 'flex', position: 'relative',
          width: wide ? '100%' : 36, height: wide ? 49 : 36,
          margin: wide ? '8px 0 0' : 0,
          justifyContent: wide ? 'stretch' : 'center',
        },
      },
        react.createElement('button', {
          type: 'button',
          title: '莉娅拼图',
          'aria-label': '莉娅拼图',
          'aria-expanded': panelState.open,
          onClick: togglePanel,
          style: {
            width: wide ? '100%' : 36, height: wide ? 49 : 36,
            borderRadius: wide ? 12 : '50%',
            cursor: 'pointer', border: 'none', fontFamily: 'inherit', fontSize: 14,
            color: 'var(--dsw-alias-label-primary, inherit)',
            background: panelState.open ? 'var(--dsw-alias-interactive-bg-hover, rgba(128,128,128,0.15))' : 'transparent',
            display: 'inline-flex', alignItems: 'center',
            justifyContent: wide ? 'flex-start' : 'center',
            gap: 8, padding: wide ? '0 8px 0 6px' : 0,
            overflow: 'hidden', whiteSpace: 'nowrap',
          },
        },
          react.createElement('span', { 'aria-hidden': 'true', style: { flex: 'none', fontSize: 16 } }, '🧩'),
          wide ? react.createElement('span', { style: { textOverflow: 'ellipsis', overflow: 'hidden', minWidth: 0 } }, '拼图') : null));
    }

    // ── 会话头部常驻开关（conversation.session.header.actions，永远可见）──
    function HeaderToggle() {
      var tickState = react.useState(0);
      var setTick = tickState[1];
      react.useEffect(function () {
        function onEvt() { setTick(function (x) { return x + 1; }); }
        window.addEventListener(PANEL_EVENT, onEvt);
        return function () { window.removeEventListener(PANEL_EVENT, onEvt); };
      }, []);
      return react.createElement('button', {
        type: 'button',
        title: '莉娅拼图',
        'aria-label': '莉娅拼图',
        onClick: togglePanel,
        style: {
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          width: 28, height: 28, borderRadius: 8, cursor: 'pointer',
          border: '1px solid var(--dsw-alias-border-l2, rgba(128,128,128,0.3))',
          background: panelState.open ? 'var(--dsw-alias-interactive-bg-hover, rgba(128,128,128,0.15))' : 'var(--dsw-alias-bg-layer-1, transparent)',
          color: 'var(--dsw-alias-label-primary, inherit)',
          fontSize: 15, lineHeight: 1, flex: 'none',
        },
      }, '🧩');
    }

    // ── 设置页：莉娅拼图（图片库管理 + 当前局摘要）──
    function PuzzleSettings() {
      var imagesState = react.useState([]);
      var images = imagesState[0];
      var setImages = imagesState[1];
      var stateState = react.useState(null);
      var st = stateState[0];
      var setSt = stateState[1];
      var errState = react.useState('');
      var error = errState[0];
      var setError = errState[1];
      var urlState = react.useState('');
      var urlText = urlState[0];
      var setUrlText = urlState[1];

      function loadAll() {
        fetch('/dsh-puzzle/state', { cache: 'no-store' })
          .then(function (r) { return r.ok ? r.json() : null; })
          .then(function (d) {
            if (!d) return;
            if (Array.isArray(d.images)) setImages(d.images);
            if (d.report && typeof d.report === 'object') setSt(d.report);
            if (d.config && d.config.image) setSt(function (prev) {
              var merged = Object.assign({}, prev || {});
              merged.currentImage = d.config.image;
              return merged;
            });
          })
          .catch(function () {});
      }

      react.useEffect(function () {
        loadAll();
        var id = setInterval(loadAll, 2000);
        return function () { clearInterval(id); };
      }, []);

      function refresh() {
        setError('');
        fetch('/dsh-puzzle/refresh', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })
          .then(function (r) { return r.json(); })
          .then(function (d) {
            if (d && d.ok && Array.isArray(d.images)) { setImages(d.images); }
            else { setError((d && d.error) || '刷新失败'); }
          })
          .catch(function () { setError('刷新失败（Host 路由不可达）'); });
      }

      function useImage(im) {
        setError('');
        post('/dsh-puzzle/config', { image: { source: 'file', name: im.name, url: im.url } });
        applyImage(im.url, im.name);
      }
      function useUrl() {
        var v = (urlText || '').trim();
        if (!v) return;
        setError('');
        setUrlText('');
        post('/dsh-puzzle/config', { image: { source: 'url', name: null, url: v } });
        applyImage(v, '自定义图');
      }
      function usePlaceholder() {
        setError('');
        post('/dsh-puzzle/config', { image: null });
        applyImage(PLACEHOLDER, '默认小星星');
      }

      var btnStyle = {
        cursor: 'pointer', font: 'inherit', fontSize: 13,
        color: 'var(--dsw-alias-label-primary)', background: 'var(--dsw-alias-bg-layer-3)',
        border: '1px solid var(--dsw-alias-border-l2)', borderRadius: 8, padding: '5px 12px',
      };

      var nodes = [
        react.createElement('h2', { key: 'head', style: { margin: '0 0 8px', fontSize: 16, fontWeight: 600 } }, '莉娅拼图'),
        react.createElement('p', { key: 'tip', style: { margin: '0 0 10px', fontSize: 14, lineHeight: '22px', color: 'var(--dsw-alias-label-secondary)' } },
          '滑块拼图小游戏，随时点侧栏「🧩 拼图」打开。图丢进插件目录 puzzles/ 后点「刷新图片」即识别；也可以直接粘贴图片 URL，或让莉娅用 puzzle_set_image 换图。'),
      ];

      if (st) {
        nodes.push(react.createElement('div', { key: 'now', style: { marginBottom: 12, padding: '10px 14px', borderRadius: 12, border: '1px solid var(--dsw-alias-border-l2)', background: 'var(--dsw-alias-bg-layer-1)' } },
          react.createElement('div', { style: { fontSize: 13, color: 'var(--dsw-alias-label-secondary)' } }, '当前局'),
          react.createElement('div', { style: { fontSize: 15, fontWeight: 600, marginTop: 2 } },
            (st.grid || '?') + '×' + (st.grid || '?') + ' · ' + (st.solved ? '✅ 已完成' : (st.running ? '▶ 进行中' : '⏸ 未开始'))),
          react.createElement('div', { style: { marginTop: 4, fontSize: 13, color: 'var(--dsw-alias-label-tertiary)' } },
            '步数 ' + st.moves + ' · 用时 ' + st.elapsed + ' 秒' +
            (st.currentImage && st.currentImage.source === 'file' && st.currentImage.name ? ' · 图：' + st.currentImage.name
              : st.currentImage && st.currentImage.source === 'url' ? ' · 图：自定义 URL'
              : ' · 图：默认小星星'))));
      }

      nodes.push(react.createElement('div', { key: 'toolbar', style: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 } },
        react.createElement('button', { type: 'button', onClick: refresh, style: btnStyle }, '🔃 刷新图片'),
        react.createElement('span', { style: { fontSize: 12, color: 'var(--dsw-alias-label-tertiary)' } }, images.length + ' 张可用')));

      if (error) {
        nodes.push(react.createElement('div', { key: 'err', style: { marginBottom: 10, padding: '8px 12px', borderRadius: 10, fontSize: 13, color: 'var(--dsw-alias-state-danger-primary, #e5484d)', border: '1px solid var(--dsw-alias-state-danger-primary, #e5484d)', background: 'var(--dsw-alias-bg-layer-1)' } }, error));
      }

      nodes.push(react.createElement('div', { key: 'url', style: { display: 'flex', gap: 8, marginBottom: 12, alignItems: 'center' } },
        react.createElement('input', {
          type: 'text', placeholder: '粘贴图片 URL（http 或 data:）', value: urlText,
          onChange: function (e) { setUrlText(e.target.value); },
          style: {
            flex: '1 1 auto', font: 'inherit', fontSize: 13, padding: '5px 10px',
            border: '1px solid var(--dsw-alias-border-l2)', borderRadius: 8,
            background: 'var(--dsw-alias-bg-layer-1)', color: 'var(--dsw-alias-label-primary)',
          },
        }),
        react.createElement('button', { type: 'button', onClick: useUrl, style: btnStyle }, '使用'),
        react.createElement('button', { type: 'button', onClick: usePlaceholder, style: btnStyle }, '用占位图')));

      nodes.push(react.createElement('div', { key: 'list' },
        images.length === 0
          ? react.createElement('div', { style: { padding: 12, borderRadius: 12, border: '1px dashed var(--dsw-alias-border-l2)', color: 'var(--dsw-alias-label-tertiary)', fontSize: 13, lineHeight: '20px' } },
              '还没有可用图片。把图放进插件目录 puzzles/（如 ' + 'dsh-puzzle/puzzles/ 下）后点「刷新图片」，或粘贴 URL。')
          : images.map(function (im) {
              return react.createElement('div', {
                key: im.name,
                style: {
                  display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8, padding: 8,
                  border: '1px solid var(--dsw-alias-border-l2)', borderRadius: 12,
                  background: 'var(--dsw-alias-bg-layer-1)',
                },
              },
                react.createElement('img', { src: im.url, alt: im.name, style: { width: 56, height: 56, objectFit: 'cover', borderRadius: 8, flex: 'none' } }),
                react.createElement('span', { style: { flex: '1 1 auto', fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, im.name),
                react.createElement('button', { type: 'button', onClick: function () { useImage(im); }, style: btnStyle }, '使用'));
            })));

      nodes.push(react.createElement('p', { key: 'hint', style: { margin: '10px 0 0', fontSize: 12, lineHeight: '18px', color: 'var(--dsw-alias-label-tertiary)' } },
        '莉娅可以发话到拼图面板（puzzle_talk）、查你拼到哪（puzzle_state）、直接换图（puzzle_set_image）。'));

      return react.createElement('div', { key: 'dsh-puzzle', style: { padding: '4px 0', color: 'var(--dsw-alias-label-primary)' } }, nodes);
    }

    exports.inject = ['slots'];
    exports.apply = function (ctx) {
      // 轮询一次建好（跨面板/设置页重挂载存活）；ctx.effect 卸载自动清理
      ctx.effect(function () {
        var id = setInterval(pollTick, POLL_MS);
        return function () { clearInterval(id); };
      }, 'dsh-puzzle: poll');

      // 初始局 + 首拉（拉回配置的格数/图片）
      newGame(3);
      pullState();

      var slots = ctx.get('slots');
      if (slots === undefined) return;
      slots.inject('sidebar.footer.action', function () {
        return slots.register(
          {
            name: 'sidebar.footer.action',
            id: 'dsh-puzzle-toggle',
            order: 20,
            label: function () { return '莉娅拼图'; },
          },
          PuzzleToggle
        );
      });
      slots.inject('conversation.session.header.actions', function () {
        return slots.register(
          {
            name: 'conversation.session.header.actions',
            id: 'dsh-puzzle-open',
            order: 30,
            label: function () { return '莉娅拼图'; },
          },
          HeaderToggle
        );
      });
      slots.inject('shell.overlay', function () {
        return slots.register(
          {
            name: 'shell.overlay',
            id: 'dsh-puzzle-panel',
            order: 30,
            label: function () { return '莉娅拼图'; },
          },
          PuzzlePanel
        );
      });
      slots.inject('settings.section', function () {
        return slots.register(
          {
            name: 'settings.section',
            id: 'dsh-puzzle',
            order: 130,
            label: function () { return '莉娅拼图'; },
          },
          function (props) { return react.createElement(PuzzleSettings, { ctx: ctx }); }
        );
      });

      console.log('[dsh-puzzle-plugin] client loaded');
    };

    module.exports = exports;
    return module.exports;
  },
});
