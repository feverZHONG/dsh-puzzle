// dsh-puzzle —— client 半 · 小 UI 组件（输入框开关 + 设置页图库管理）
// 两个小槽位组件合成一个模块：InputToggle（conversation.input.left 入口开关）+
// PuzzleSettings（settings.section 图库管理，数据全部 fetch + 本地 useState，不读共享 store）。
var react = require('react');
var core = require('./core');
var data = require('./data');

// ── 输入框工具行常驻开关（conversation.input.left：发送框内、附件/计划旁边的
//    小控件，官方预留 small always-visible control）──
function InputToggle() {
  var tickState = react.useState(0);
  var setTick = tickState[1];
  react.useEffect(function () {
    function onEvt() { setTick(function (x) { return x + 1; }); }
    window.addEventListener(core.PANEL_EVENT, onEvt);
    return function () { window.removeEventListener(core.PANEL_EVENT, onEvt); };
  }, []);
  return react.createElement('button', {
    type: 'button',
    title: '莉娅拼图',
    'aria-label': '莉娅拼图',
    'aria-expanded': core.panelState.open,
    onClick: core.togglePanel,
    style: {
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      width: 26, height: 26, borderRadius: 7, cursor: 'pointer', padding: 0,
      border: '1px solid var(--dsw-alias-border-l2, rgba(128,128,128,0.3))',
      background: core.panelState.open ? 'var(--dsw-alias-interactive-bg-hover, rgba(128,128,128,0.15))' : 'transparent',
      color: 'var(--dsw-alias-label-primary, inherit)',
      fontSize: 14, lineHeight: 1, flex: 'none',
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
    core.saveImageConfig({ source: 'file', name: im.name, url: im.url });
    core.applyImage(im.url, im.name);
  }
  function useUrl() {
    var v = (urlText || '').trim();
    if (!v) return;
    setError('');
    setUrlText('');
    core.saveImageConfig({ source: 'url', name: null, url: v });
    core.applyImage(v, '自定义图');
  }
  function usePlaceholder() {
    setError('');
    core.saveImageConfig(null);
    core.applyImage(data.PLACEHOLDER, '默认小星星');
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

module.exports = { InputToggle, PuzzleSettings };
