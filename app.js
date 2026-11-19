const $ = selector => document.querySelector(selector);
const agents = {
  Codex: ['›_', '先按任务拆分，给每一步写明验收条件，再交给执行模型。'],
  Claude: ['✳', '把关键假设和失败场景单列，保留需要人工决定的取舍。'],
  Gemini: ['✧', '用一条最小流程先验证方案，再逐步扩展。'],
  DeepSeek: ['≈', '先实现高频路径，用现有检查验证结果。']
};
const prior = {
  id: 'sample', title: '双模型提案页如何处理部分失败？', models: ['Codex', 'Claude'],
  summaries: ['每个模型独立显示进度。保留已完成的提案和失败原因，刷新后可以接着阅读。', '从 Parley 的运行文件恢复页面。即使一份提案缺失或解析失败，另一份仍然能展开阅读。']
};
const key = 'allchat.workspace.v1';
let workspace = {models: prior.models, rounds: 2, runs: [], active: prior.id};
try {
  const saved = JSON.parse(localStorage.getItem(key));
  if (saved && Array.isArray(saved.runs) && Array.isArray(saved.models)) workspace = saved;
} catch { /* Storage may be unavailable for local files. */ }
function save() {
  try { localStorage.setItem(key, JSON.stringify(workspace)); } catch { /* Keep the session usable in memory. */ }
}
function elem(tag, cls, text) {
  const item = document.createElement(tag);
  if (cls) item.className = cls;
  if (text !== undefined) item.textContent = text;
  return item;
}
function button(label, action, cls = 'primary') {
  const item = elem('button', cls, label);
  item.type = 'button';
  item.onclick = action;
  return item;
}
function openPanel(title) {
  $('#panelTitle').textContent = title;
  $('#panelBody').replaceChildren();
  $('#panel').showModal();
  return $('#panelBody');
}
$('#close').onclick = () => $('#panel').close();
function updateConfig() { $('#modelLabel').textContent = workspace.models.join(' + '); }
$('#config').onclick = () => {
  const body = openPanel('讨论设置');
  const checks = Object.keys(agents).map(name => {
    const label = elem('label', 'option');
    const input = elem('input');
    input.type = 'checkbox'; input.checked = workspace.models.includes(name); input.value = name;
    label.append(input, name); body.append(label);
    return input;
  });
  const limitLabel = elem('label', 'option', '讨论轮数　');
  const select = elem('select');
  for (const n of [2, 3, 4]) select.add(new Option(n + ' 轮', n));
  select.value = workspace.rounds;
  limitLabel.append(select); body.append(limitLabel);
  const submit = button('保存设置', () => {
    workspace.models = checks.filter(item => item.checked).map(item => item.value);
    workspace.rounds = Number(select.value); save(); updateConfig(); $('#panel').close();
  });
  function validate() {
    submit.disabled = checks.filter(item => item.checked).length < 2;
    submit.textContent = submit.disabled ? '至少选两个模型' : '保存设置';
  }
  checks.forEach(input => input.onchange = validate); validate(); body.append(submit);
};
$('#history').onclick = () => {
  const body = openPanel('历史记录');
  for (const run of [...workspace.runs, prior]) {
    body.append(button(run.title, () => {
      workspace.active = run.id; save(); $('#panel').close(); render();
    }, 'entry'));
  }
};
let lastView = '';
let timer;
function render() {
  clearTimeout(timer);
  const run = workspace.runs.find(item => item.id === workspace.active) || prior;
  const sample = run.id === prior.id;
  const elapsed = sample ? 0 : Math.max(0, Date.now() - run.started);
  const received = sample ? 2 : Math.min(run.models.length, Math.floor(elapsed / 950));
  const round = sample ? 1 : Math.min(run.rounds, 1 + Math.max(0, Math.floor((elapsed - run.models.length * 950) / 1400) + 1));
  const done = !sample && elapsed >= run.models.length * 950 + (run.rounds - 1) * 1400;
  const view = [run.id, received, round, done, run.choice, run.handoff].join('|');
  if (view !== lastView) {
    const opened = lastView.split('|')[0] === run.id ?
      Array.from(document.querySelectorAll('details[open]'), item => item.dataset.name) : [];
    lastView = view;
    $('#source').textContent = sample ? '上次实测 · 提案摘要' : '本次讨论 · 模拟';
    $('#when').textContent = sample ? '11 月 19 日' : new Date(run.started).toLocaleTimeString('zh-CN', {hour:'2-digit', minute:'2-digit'});
    $('#runTitle').textContent = run.title;
    $('#summary').textContent = sample ? '首轮完成 · 已收到 2 / 2 份提案' :
      '第 ' + round + ' / ' + run.rounds + ' 轮 · ' + (done ? '互审完成' : round === 1 ? '独立提案' : '交叉审查') + ' · 已收到 ' + received + ' / ' + run.models.length;
    const rows = $('#rows'); rows.replaceChildren();
    run.models.forEach((name, index) => {
      const ready = index < received;
      const detail = elem('details', 'proposal'); detail.dataset.name = name;
      detail.open = opened.includes(name);
      const head = elem('summary');
      head.append(elem('span', 'avatar ' + name.toLowerCase(), agents[name][0]), elem('span', 'row-name', name),
        elem('span', 'row-meta', sample ? ['1 分 41 秒','4 分 33 秒'][index] : ready ? '已提交' : '准备中'));
      detail.append(head, elem('p', 'copy', ready ? sample ? prior.summaries[index] : agents[name][1] : '等待示例提案。'));
      rows.append(detail);
    });
    const next = $('#next'); next.replaceChildren();
    if (done) {
      if (!run.choice) {
        next.append(elem('strong', '', '一项分歧需要你决定'), elem('p', '', '首版先验证主流程，还是同时覆盖异常恢复？'));
        for (const choice of ['先验证主流程', '同时覆盖异常恢复']) {
          next.append(button(choice, () => { run.choice = choice; save(); render(); }, 'quiet'));
        }
      } else {
        next.append(elem('strong', '', run.handoff ? '执行交接草稿' : '最终方案'), elem('p', '', run.choice + '。逐项验证后，由不同模型复审改动。'));
        if (!run.handoff) next.append(button('生成执行交接', () => { run.handoff = true; save(); render(); }));
        else next.append(elem('p', '', '拟交给 DeepSeek · ' + run.title + '。演示到此结束。'));
      }
    }
  }
  if (!sample && !done) timer = setTimeout(render, 250);
}
$('#compose').onsubmit = event => {
  event.preventDefault();
  const title = $('#task').value.trim();
  if (!title) { $('#task').focus(); return; }
  const run = {id: String(Date.now()), started: Date.now(), title, models: [...workspace.models], rounds: workspace.rounds};
  workspace.runs.unshift(run); workspace.active = run.id; save(); $('#task').value = ''; render();
  $('#runTitle').scrollIntoView({block:'nearest', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'});
};
updateConfig();
render();
