const $ = selector => document.querySelector(selector);
const proposalDelay = 600;
const reviewDelay = 650;
const agents = {
  Codex: ['›_', '每位模型的提案单独保存。先完成的可以直接读，别让整个讨论等最慢的一位。'],
  Claude: ['✳', '先定义刷新时要恢复的状态。正在生成、已完成和失败都应该分开显示。'],
  Gemini: ['✧', '可以给每次讨论一个固定标识，刷新后从同一条记录读回已有的提案。'],
  DeepSeek: ['≈', '加一个部分失败的用例：一位模型失败时，其他模型已交的提案仍能打开。']
};
const prior = {
  id: 'sample', title: '双模型提案页如何处理部分失败？', models: ['Codex', 'Claude'],
  summaries: ['每个模型独立显示进度。保留已完成的提案和失败原因，刷新后可以接着阅读。', '从 Parley 的运行文件恢复页面。即使一份提案缺失或解析失败，另一份仍然能展开阅读。']
};
const example = {id:'annotated-example', title:'中断后，如何继续一次讨论？', models:['Codex','Gemini','DeepSeek','Claude']};
const key = 'allchat.workspace.v1';
let workspace = {models: example.models, runs: [], active: example.id};
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
function portrait(name) {
  const image = elem('img', 'portrait');
  image.src = 'assets/icons/' + name.toLowerCase() + '.svg';
  image.alt = '';
  return image;
}
function openPanel(title) {
  $('#panelTitle').textContent = title;
  $('#panelBody').replaceChildren();
  $('#panel').showModal();
  return $('#panelBody');
}
$('#close').onclick = () => $('#panel').close();
function updateConfig() {
  $('#composeModels').replaceChildren(...workspace.models.map(portrait));
  $('#config').title = '参会模型：' + workspace.models.join('、');
}
$('#config').onclick = () => {
  const body = openPanel('讨论设置');
  const checks = Object.keys(agents).map(name => {
    const label = elem('label', 'option');
    const input = elem('input');
    input.type = 'checkbox'; input.checked = workspace.models.includes(name); input.value = name;
    label.append(input, portrait(name), name); body.append(label);
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
      workspace.active = run.id; revisionChoice = null; save(); $('#panel').close(); showView(false); render();
    }, 'entry'));
  }
};
let lastView = '';
let timer;
// Replay fixture votes in arrival order. Each new plan revision has its own ballot.
function demoReview(models, elapsed) {
  const votes = {};
  let revision = 1;
  let arrived = Math.max(0, Math.floor((elapsed - models.length * proposalDelay) / reviewDelay));
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
let displayedRun;
const conversation = $('#conversation');
const acceptance = '刷新后，已完成的提案仍可打开；未完成的参与者各自保留原状态。';
const objection = '如果刷新时还有模型没返回，已经提交的提案会保留吗？需要把这个场景写进验收条件。';

function showView(plan) {
  $('#plan').hidden = !plan;
  conversation.hidden = plan;
  $('#showChat').setAttribute('aria-pressed', String(!plan));
  $('#showPlan').setAttribute('aria-pressed', String(plan));
}
$('#showChat').onclick = () => showView(false);
$('#showPlan').onclick = () => showView(true);

function message(kind, author, text, label = '') {
  const item = elem('div', 'message ' + kind);
  const content = elem('div', 'message-content');
  const name = elem('div', 'message-name', author);
  if (kind === 'assistant') {
    const avatar = elem('span', 'avatar');
    avatar.append(portrait(author));
    item.append(avatar);
    item.dataset.author = author;
    item.tabIndex = -1;
  }
  if (label) name.append(elem('span', 'message-label', label));
  content.append(name, elem('p', 'bubble', text));
  item.append(content);
  return item;
}

function render() {
  clearTimeout(timer);
  const run = [...workspace.runs, prior].find(item => item.id === workspace.active) || example;
  const archive = run.id === prior.id;
  const preview = run.id === example.id;
  const live = !archive && !preview && Boolean(run.consensusDemo);
  const total = run.models.length;
  const elapsed = live ? Math.max(0, Date.now() - run.started) : 0;
  const received = live ? Math.min(total, Math.floor(elapsed / proposalDelay)) : total;
  const endOfReview = version => total * (proposalDelay + reviewDelay * version);
  const current = demoReview(run.models, preview ? endOfReview(1) : elapsed);
  const available = preview ? 2 : current.revision;
  const version = Math.min(revisionChoice || current.revision, available);
  const ballot = preview || version < current.revision ? demoReview(run.models, endOfReview(version)) : current;
  const stateKey = JSON.stringify([run.id, received, current, version, run.handoff]);

  if (stateKey !== lastView) {
    const changedRun = displayedRun !== run.id;
    const nearEnd = !conversation.hidden && conversation.scrollHeight - conversation.clientHeight - conversation.scrollTop < 70;
    const focusedMember = $('#members').contains(document.activeElement) ? document.activeElement.dataset.name : '';
    displayedRun = run.id;
    lastView = stateKey;

    $('#runTitle').textContent = run.title;
    $('#source').textContent = archive ? '实测归档' : preview ? '评审示例' : '本地演示';
    $('#memberCount').textContent = total + ' 位 AI';
    const acknowledged = Object.values(current.votes).filter(vote => vote === '无异议，可执行').length;
    $('#verdict').textContent = archive ? '首轮已完成' : preview ? '方案修订回放' : !live ? '历史讨论' :
      current.done ? '全员确认，可执行' : received < total ? '独立提案 · ' + received + ' / ' + total :
      '评审 v' + current.revision + ' · ' + acknowledged + ' / ' + total + ' 已确认';

    const messages = [
      message('user', '需求', preview ? '刷新后怎么继续上一次讨论？请确定页面应该恢复哪些内容。' : run.title),
      elem('div', 'stage', '独立提案')
    ];
    run.models.slice(0, received).forEach((name, i) => {
      messages.push(message('assistant', name, archive ? prior.summaries[i] : agents[name][1]));
    });

    const lastRevision = preview ? version : current.revision;
    if (preview || (live && received === total)) {
      for (let n = 1; n <= lastRevision; n++) {
        const review = n === lastRevision && !preview ? current : demoReview(run.models, endOfReview(n));
        const divider = elem('div', 'stage', '方案评审 · v' + n);
        messages.push(divider);
        if (n > 1) messages.push(elem('p', 'change', acceptance));
        for (const [name, vote] of Object.entries(review.votes)) {
          const approved = vote === '无异议，可执行';
          messages.push(message('assistant', name, approved ? '当前方案没有歧义，可以按这版执行。' : objection,
            (approved ? '已确认' : '有异议') + ' · v' + n));
        }
        if (review.done) messages.push(elem('div', 'stage', '评审结束 · 全员已确认 v' + n));
      }
    }
    if (live && !current.done) {
      const waiting = run.models.find((name, index) => received < total ? index >= received : !current.votes[name]);
      const typing = elem('p', 'typing', waiting ? waiting + ' 正在' + (received < total ? '拟定提案' : '审查方案') : '正在修订方案');
      const dots = elem('span', 'dots');
      dots.setAttribute('aria-hidden', 'true');
      dots.append(elem('i'), elem('i'), elem('i'));
      typing.append(dots);
      messages.push(typing);
    }

    const keep = changedRun ? 0 : [...conversation.children].findIndex((node, i) => !messages[i] || !node.isEqualNode(messages[i]));
    const firstChange = keep < 0 ? conversation.children.length : keep;
    while (conversation.children.length > firstChange) conversation.lastElementChild.remove();
    conversation.append(...messages.slice(firstChange));

    const members = run.models.map(name => {
      const member = button('', () => {
        showView(false);
        const last = [...conversation.querySelectorAll('[data-author]')].findLast(item => item.dataset.author === name);
        if (!last) return;
        last.scrollIntoView({block:'nearest', behavior:matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth'});
        last.focus({preventScroll:true});
      }, 'member');
      member.dataset.name = name;
      member.append(portrait(name), elem('span', '', name));
      return member;
    });
    $('#members').replaceChildren(...members);
    if (focusedMember) members.find(member => member.dataset.name === focusedMember)?.focus({preventScroll:true});

    $('#versions').textContent = available > 1 ? '· v' + version : '';
    const planBody = $('#planBody');
    const versionRow = elem('div', 'switch');
    for (let n = 1; n <= available; n++) {
      const tab = button('v' + n, () => {
        revisionChoice = n;
        render();
        $('#planBody .switch [aria-pressed="true"]')?.focus({preventScroll:true});
      }, 'version');
      tab.setAttribute('aria-pressed', String(n === version));
      versionRow.append(tab);
    }
    const title = elem('div','plan-head');
    title.append(elem('h2','','方案正文'), versionRow);
    planBody.replaceChildren(title);
    if (archive || (!preview && !live)) {
      planBody.append(elem('p','','这次记录包含独立提案。'));
    } else if (received < total) {
      planBody.append(elem('p','','正在收集独立提案。'));
    } else {
      planBody.append(elem('h3','','按模型恢复讨论状态'), elem('p','','分别保存每位模型的提案和进度，刷新时按讨论记录加载。'),
        elem('h3','','验收条件'), elem('p','',version === 1 ? '重新打开页面后，恢复上一次讨论。' : acceptance));
      if (Object.values(ballot.votes).some(vote => vote !== '无异议，可执行')) planBody.append(elem('p','plan-status','待解决 · ' + objection));
      if (ballot.done) planBody.append(elem('p','plan-status','已确认 · ' + total + ' 位模型同意 v' + version + ' 可执行'));
    }

    const handoff = $('#handoff');
    const ready = live && current.done;
    handoff.hidden = !ready && !run.handoff;
    handoff.replaceChildren();
    if (run.handoff) handoff.append(elem('p','','执行交接草稿 · DeepSeek'));
    else if (ready) handoff.append(elem('span','','最终方案 v' + current.revision), button('生成执行交接', () => {
      run.handoff = true; save(); render();
    }));
    if (changedRun) conversation.scrollTop = 0;
    else if (live && nearEnd) conversation.scrollTop = conversation.scrollHeight;
  }
  if (live && !current.done) timer = setTimeout(render, 150);
}

$('#compose').onsubmit = event => {
  event.preventDefault();
  const title = $('#task').value.trim();
  if (!title) { $('#task').focus(); return; }
  const now = Date.now();
  const run = {id: String(now), started: now, title, models: [...workspace.models], consensusDemo: true};
  revisionChoice = null;
  workspace.runs.unshift(run);
  workspace.active = run.id;
  save();
  $('#task').value = '';
  showView(false);
  render();
};
function drawHero() {
  const canvas = $('#heroArt');
  const context = canvas.getContext('2d');
  if (!context) return;

  function fill(color, x, y, width, height) {
    context.fillStyle = color;
    context.fillRect(x, y, width, height);
  }

  function panel(x, y, width, height, border) {
    fill(border, x + 1, y, width - 2, height);
    fill(border, x, y + 1, width, height - 2);
    fill('#141414', x + 1, y + 1, width - 2, height - 2);
  }

  // Keep the field quiet behind the title and brighten the proposal paths on the right.
  for (let y = 2; y < canvas.height; y += 3) {
    for (let x = 2; x < canvas.width; x += 3) {
      const signal = Math.sin(x / 12 + y / 8) + Math.cos(y / 12 - x / 16);
      const intensity = Math.min(1, Math.max(0, (x - 82) / 23));
      const shade = Math.round(16 + intensity * (7 + (signal + 2) * 7));
      fill(`rgb(${shade} ${shade} ${shade})`, x, y, 1, 1);
    }
  }

  const symbols = [
    ['100', '010', '001', '010', '100'],
    ['00100', '00100', '11111', '00100', '00100'],
    ['00100', '01110', '11111', '01110', '00100'],
    ['10101', '01110', '11111', '01110', '10101']
  ];
  [25, 48, 71, 94].forEach((y, index) => {
    fill('#535353', 136, y + 8, 20, 1);
    fill('#9c9c9c', 141 + index * 2, y + 8, 3, 1);
    panel(109, y, 28, 17, '#6a6a6a');
    symbols[index].forEach((row, dy) => {
      [...row].forEach((pixel, dx) => {
        if (pixel === '1') fill('#eaeaea', 113 + dx, y + 6 + dy, 1, 1);
      });
    });
    fill('#ababab', 122, y + 6, 10, 1);
    fill('#555', 122, y + 10, 6 + index, 1);
  });

  fill('#727272', 155, 33, 1, 70);
  fill('#898989', 155, 67, 15, 1);
  [33, 56, 79, 102].forEach(y => fill('#d0d0d0', 154, y - 1, 3, 3));
  fill('#eaeaea', 154, 66, 3, 3);
  fill('#777', 166, 66, 2, 3);
  panel(170, 52, 25, 32, '#eaeaea');
  fill('#dadada', 175, 58, 14, 2);
  [64, 67, 70].forEach(y => fill('#777', 175, y, 11, 1));
  fill('#ddd', 178, 75, 2, 2);
  fill('#ddd', 180, 77, 2, 2);
  fill('#ddd', 182, 75, 2, 2);
  fill('#ddd', 184, 73, 2, 2);
}

drawHero();
updateConfig();
render();
