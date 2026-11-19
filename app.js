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
const example = {id:'annotated-example', title:'中断后，如何继续一次讨论？', models:prior.models};
const key = 'allchat.workspace.v1';
let workspace = {models: prior.models, runs: [], active: example.id};
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
  for (const run of [...workspace.runs, example, prior]) {
    body.append(button(run.title, () => {
      workspace.active = run.id; revisionChoice = null; save(); $('#panel').close(); render();
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
let revisionChoice = null;
$('#new').onclick = () => { $('#composer').showModal(); $('#task').focus(); };
function render() {
  clearTimeout(timer);
  const run = [...workspace.runs, prior].find(item => item.id === workspace.active) || example;
  const archive = run.id === prior.id;
  const preview = run.id === example.id;
  const live = !archive && !preview && run.consensusDemo;
  const elapsed = Math.max(0, Date.now() - (run.started || Date.now()));
  const total = run.models.length;
  const received = live ? Math.min(total, Math.floor(elapsed / 950)) : total;
  const latest = demoReview(run.models, elapsed);
  const available = preview ? 2 : live ? latest.revision : 1;
  const version = Math.min(revisionChoice || (preview ? 1 : available), available);
  const ballot = preview || (live && version < available) ?
    demoReview(run.models, total * 950 + total * 1100 * version) : latest;
  const votes = live || preview ? ballot.votes : {};
  const critic = run.models.find(name => votes[name] && votes[name] !== '无异议，可执行');
  const confirmed = (live || preview) && ballot.done;
  const view = [run.id, received, version, available, ...Object.values(votes), run.handoff].join('|');
  if (view !== lastView) {
    const sameRun = lastView.split('|')[0] === run.id;
    const expanded = sameRun ? [...document.querySelectorAll('#rows details[open]')].map(d => d.dataset.name) : [];
    lastView = view;
    $('#runTitle').textContent = run.title;
    $('#source').textContent = archive ? '实测归档' : preview ? '批注示例' : '本地演示';
    $('#summary').textContent = archive ? '2026.11.19　 /　 两份独立提案' : preview ?
      '方案修订回放　 /　 Codex × Claude' : run.models.join(' × ') + '　 /　 模拟讨论';
    const versions = $('#versions'); versions.replaceChildren();
    for (let n = 1; n <= available; n++) {
      const tab = button('v' + n, () => { revisionChoice = n === available ? null : n; if (preview) revisionChoice = n; render(); }, 'version');
      tab.setAttribute('aria-pressed', String(n === version)); versions.append(tab);
    }
    $('#topic').textContent = archive ? '独立保存每个模型的提案' : '按模型保存讨论进度';
    $('#lead').textContent = '每份提案独立保存。先完成的方案可以立即阅读，其他模型继续生成。';
    const clause = $('#clause'); clause.replaceChildren();
    const annotation = $('#annotation');
    annotation.hidden = !critic;
    if (critic) {
      const mark = button('重新打开页面后，恢复上一次讨论。', () => {
        annotation.hidden = !annotation.hidden;
        mark.setAttribute('aria-expanded', String(!annotation.hidden));
      }, 'ink');
      mark.setAttribute('aria-controls','annotation'); mark.setAttribute('aria-expanded','true');
      clause.append(mark);
      $('#annotator').textContent = critic + '　/　异议';
    } else {
      clause.textContent = version === 2 || archive ? '重新打开页面后，已完成的提案仍可阅读，未完成的模型保留各自的状态。' : '重新打开页面后，恢复上一次讨论。';
    }
    $('#verdict').textContent = archive ? '首轮实测 · 2 份提案' : !preview && !live ? '旧版演示记录' :
      received < total ? '独立提案 · ' + received + ' / ' + total : confirmed ? '全员确认可执行' : '交叉审查 · v' + version;
    const rows = $('#rows'); rows.replaceChildren();
    run.models.forEach((name,index) => {
      const item = elem('details'); item.dataset.name = name; item.open = expanded.includes(name);
      const head = elem('summary'); head.append(elem('b','agent', name));
      const state = archive ? ['1 分 41 秒','4 分 33 秒'][index] : name === critic ? '有异议' : votes[name] ? '已确认' : received > index ? '已提案' : '准备中';
      head.append(elem('span',name === critic ? 'issue' : 'state',state)); item.append(head);
      const copy = archive ? prior.summaries[index] : preview ? (name === 'Codex' ? '逐个保存参与者的结果，每次刷新按任务标识读取。' : '明确部分完成时的恢复行为，再交给执行模型。') : received > index ? agents[name][1] : '等待提案。';
      item.append(elem('p','copy',copy)); rows.append(item);
    });
    const next = $('#next'); next.replaceChildren();
    if (run.choice) next.append(elem('p','small','历史决策 · ' + run.choice));
    if (confirmed || run.handoff) {
      if (run.handoff) next.append(elem('p','small','执行交接草稿 · DeepSeek　/　' + run.title));
      else if (!preview) next.append(button('生成执行交接', () => { run.handoff = true; save(); render(); }));
    }
  }
  if (live && !latest.done) timer = setTimeout(render,250);
}
$('#compose').onsubmit = event => {
  event.preventDefault();
  const title = $('#task').value.trim();
  if (!title) { $('#task').focus(); return; }
  const run = {id: String(Date.now()), started: Date.now(), title, models: [...workspace.models], consensusDemo: true};
  revisionChoice = null; $('#composer').close(); workspace.runs.unshift(run); workspace.active = run.id; save(); $('#task').value = ''; render();
  $('#runTitle').scrollIntoView({block:'nearest', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'});
};
updateConfig();
render();
