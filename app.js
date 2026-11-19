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
let workspace = {models: prior.models, runs: [], active: prior.id};
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
  const submit = button('保存设置', () => {
    workspace.models = checks.filter(item => item.checked).map(item => item.value);
    save(); updateConfig(); $('#panel').close();
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
// Replay fixture votes in arrival order. Each new plan revision has its own ballot.
function demoReview(models, elapsed) {
  const votes = {};
  let revision = 1;
  let arrived = Math.max(0, Math.floor((elapsed - models.length * 950) / 1100));
  for (const version of [1, 2]) {
    if (!arrived) break;
    revision = version;
    for (const model of models) delete votes[model];
    for (const model of models) {
      if (!arrived) break;
      votes[model] = version === 1 && model === models.at(-1) ? '异常恢复缺少验收条件' : '无异议，可执行';
      arrived--;
    }
  }
  return {revision, votes, done: models.every(model => votes[model] === '无异议，可执行')};
}
function render() {
  clearTimeout(timer);
  const run = workspace.runs.find(item => item.id === workspace.active) || prior;
  const sample = run.id === prior.id;
  const elapsed = sample ? 0 : Math.max(0, Date.now() - run.started);
  const received = sample ? 2 : Math.min(run.models.length, Math.floor(elapsed / 950));
  const legacy = !sample && !run.consensusDemo;
  const {revision, votes, done} = demoReview(run.models, sample || legacy ? 0 : elapsed);
  const view = [run.id, received, revision, ...Object.values(votes), run.handoff].join('|');
  if (view !== lastView) {
    const opened = lastView.split('|')[0] === run.id ?
      Array.from(document.querySelectorAll('details[open]'), item => item.dataset.name) : [];
    lastView = view;
    $('#source').textContent = sample ? '上次实测 · 提案摘要' : '本次讨论 · 模拟';
    $('#when').textContent = sample ? '11 月 19 日' : new Date(run.started).toLocaleTimeString('zh-CN', {hour:'2-digit', minute:'2-digit'});
    $('#runTitle').textContent = run.title;
    $('#summary').textContent = sample ? '首轮完成 · 已收到 2 / 2 份提案' :
      legacy ? '旧版演示记录 · 未记录逐模型确认' :
      received < run.models.length ? '独立提案 · 已收到 ' + received + ' / ' + run.models.length :
      '方案 v' + revision + ' · ' + (done ? '全员确认可执行，讨论已结束' : '交叉审查中');
    const rows = $('#rows'); rows.replaceChildren();
    run.models.forEach((name, index) => {
      const ready = index < received;
      const detail = elem('details', 'proposal'); detail.dataset.name = name;
      detail.open = opened.includes(name);
      const head = elem('summary');
      head.append(elem('span', 'avatar ' + name.toLowerCase(), agents[name][0]), elem('span', 'row-name', name),
        elem('span', 'row-meta', sample ? ['1 分 41 秒','4 分 33 秒'][index] : votes[name] || (ready ? '已提交' : '准备中')));
      detail.append(head, elem('p', 'copy', ready ? sample ? prior.summaries[index] : agents[name][1] : '等待示例提案。'));
      rows.append(detail);
    });
    const next = $('#next'); next.replaceChildren();
    if (legacy && run.choice) next.append(elem('p', '', '历史决策 · ' + run.choice));
    if (revision > 1) next.append(elem('p', '', 'v2 已补充验收条件：刷新后继续读取已有提案，失败项可以单独恢复。'));
    if (done || (legacy && run.handoff)) {
        next.append(elem('strong', '', run.handoff ? '执行交接草稿' : '最终方案'));
        if (!run.handoff) next.append(button('生成执行交接', () => { run.handoff = true; save(); render(); }));
        else next.append(elem('p', '', '拟交给 DeepSeek · ' + run.title + '。演示到此结束。'));
    }
  }
  if (!sample && !legacy && !done) timer = setTimeout(render, 250);
}
$('#compose').onsubmit = event => {
  event.preventDefault();
  const title = $('#task').value.trim();
  if (!title) { $('#task').focus(); return; }
  const run = {id: String(Date.now()), started: Date.now(), title, models: [...workspace.models], consensusDemo: true};
  workspace.runs.unshift(run); workspace.active = run.id; save(); $('#task').value = ''; render();
  $('#runTitle').scrollIntoView({block:'nearest', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'});
};
updateConfig();
render();
