// dsh-puzzle —— client 半 · 插件入口（bundle 导出：inject / apply）
// 职责：apply 期建 1s 轮询（跨组件重挂载存活）+ 初始局/首拉 + 三个槽位注册：
//   conversation.input.left（小开关）/ shell.overlay（浮窗面板）/ settings.section（图库管理）。
// 纯编排：逻辑全在 core.js，组件全在 panel.js / ui.js。
var react = require('react');
var core = require('./core');
var Panel = require('./panel');
var UI = require('./ui');

exports.inject = ['slots'];
exports.apply = function (ctx) {
  // 轮询一次建好（跨面板/设置页重挂载存活）；ctx.effect 卸载自动清理
  ctx.effect(function () {
    var id = setInterval(core.pollTick, core.POLL_MS);
    return function () { clearInterval(id); };
  }, 'dsh-puzzle: poll');

  // 初始局 + 首拉（拉回配置的格数/图片）
  core.startGame(3);
  core.pullState();

  var slots = ctx.get('slots');
  if (slots === undefined) return;
  // 入口只留一个：输入框工具行左端的小开关（发送框内、附件/计划旁边），
  // 不再占用侧栏底部（和「已归档」挤一排）与会话标题行（被吐槽乱放）。
  slots.inject('conversation.input.left', function () {
    return slots.register(
      {
        name: 'conversation.input.left',
        id: 'dsh-puzzle-toggle',
        order: 90,
        label: function () { return '莉娅拼图'; },
      },
      UI.InputToggle
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
      Panel.PuzzlePanel
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
      function (props) { return react.createElement(UI.PuzzleSettings, { ctx: ctx }); }
    );
  });

  console.log('[dsh-puzzle-plugin] client loaded');
};
