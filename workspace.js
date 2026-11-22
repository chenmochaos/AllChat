const catalog = {
  'ChatGPT': ['OpenAI', 'openai'], 'Codex 桌面端': ['OpenAI', 'codex'],
  'Codex CLI': ['OpenAI', 'codex'], 'Claude Desktop': ['Anthropic', 'claude'],
  'Claude Code': ['Anthropic', 'claude'], 'DeepSeek Harness': ['DeepSeek', 'deepseek'],
  'Gemini': ['Google', 'gemini'], '自定义 API': ['API', 'API']
};
const photo = {
  question: '相同照片出现在两个相册里，要直接移走其中一份吗？',
  summary: '大家都同意先找出内容完全一样的照片。分歧在于怎么处理：直接移走更省事，但你以后打开其中一个相册，可能就找不到那张照片了。',
  options: ['先看清单，我来勾选', '直接移到待清理文件夹'],
  outcomes: ['列出重复照片及所在相册，只移动你勾选的文件。', '保留每组的一份原图，把其他副本移到待清理文件夹，并记录原路径。'],
  criteria: ['没勾选的照片仍在原相册。', '每组仍有原图，每个移走的副本都能按清单找回。'],
  drafts: ['按文件内容找重复照片，先列出文件和所在相册。', '把重复副本移到待清理文件夹，保留一份原图。', '记录移动前后的路径，方便把照片放回相册。'],
  reviews: ['移走副本会改变相册内容，先让用户选处理方式。', '清单需要列出相册名，同名文件才容易区分。', '移动操作要保留原路径，否则难以撤回。']
};
const general = {
  question: '执行时，你想先看一份样例，还是一次拿到完整结果？',
  summary: '先看样例，你可以早点调整方向，但中间需要再确认一次。一次做完更省操作，如果理解有偏差，返工范围也更大。',
  options: ['先给我看样例', '一次完成全部'],
  outcomes: ['先交付一个可检查的样例，得到你的反馈后再继续。', '按约定范围完成全部内容，再一起提交结果和核对清单。'],
  criteria: ['第一批仅包含样例，后续范围等你确认。', '交付物逐项对应需求，并标明仍需人工核对的部分。'],
  drafts: ['先确定交付物，整理一份可以核对的清单。', '先做一个小样例，确认方向再展开。', '列出完成标准，让执行者可以逐项核查。'],
  reviews: ['要说清用户在哪一步确认。', '先确定是分批交付还是一次交付。', '把验收条件写成用户能检查的结果。']
};
const defaults = {agents:['Codex CLI','Claude Code','Gemini'], boss:'Claude Desktop', limit:'8'};
const sampleProject = '示例项目/照片整理';
function makeRun(project, title, prefs, sample = false) {
  return {id: crypto.randomUUID(), project, title, agents:[...prefs.agents], boss:prefs.boss,
    limit:prefs.limit, sample, started:Date.now() - (sample ? 6000 : 0), messages:[], choice:null};
}
const sample = makeRun(sampleProject, '整理相册里的重复照片', defaults, true);
const storeKey = 'allchat.projects.v2';
let state = {prefs:{...defaults}, projects:[sampleProject], project:sampleProject,
  runs:[sample], active:{[sampleProject]:sample.id}};
try {
  const stored = JSON.parse(localStorage.getItem(storeKey));
  if (stored) state = stored;
  else {
    const old = JSON.parse(localStorage.getItem('allchat.workspace.v1'));
    if (old?.models?.length) {
      const aliases = {Codex:'Codex CLI', Claude:'Claude Code', DeepSeek:'DeepSeek Harness', Gemini:'Gemini'};
      state.prefs.agents = old.models.map(n => aliases[n]).filter(Boolean);
      if (!state.prefs.agents.length) state.prefs.agents = [...defaults.agents];
    }
    if (old?.runs?.length) {
      const project = '旧版演示记录';
      state.projects.push(project);
      state.runs.push(...old.runs.map(r => ({...r, project, legacy:true})));
      state.active[project] = old.runs[0].id;
    }
  }
} catch { /* Keep the prototype usable without browser storage. */ }
state.projectPrefs = Object.assign(Object.create(null), state.projectPrefs);
state.projectInfo = Object.assign(Object.create(null), state.projectInfo);
function projectInfo(id=state.project) {
  return state.projectInfo[id] || {name:id.split('/').filter(Boolean).at(-1)||id,folder:id};
}
function projectPrefs() { return state.projectPrefs[state.project] ?? state.prefs; }
function save() {
  try { localStorage.setItem(storeKey, JSON.stringify(state)); } catch { /* In-memory session. */ }
}
function activeRun() { return state.runs.find(r => r.project === state.project && r.id === state.active[state.project]); }
function fixture(r) { return r.sample ? photo : general; }
// Captured from the workstation's command paths and installed desktop entries.
const detected = new Set(['ChatGPT','Claude Desktop','Codex CLI','Claude Code']);
const localAgents = Object.keys(catalog).filter(name=>name!=='自定义 API');
function agentIcon(name) {
  const id=catalog[name]?.[1];
  if (!id || id==='API') {
    const fallback=elem('span','agent-symbol api-symbol','{ }');
    fallback.setAttribute('aria-hidden','true');
    return fallback;
  }
  const icon=elem('img','agent-symbol');
  icon.src='assets/icons/'+id+'.svg';
  icon.alt='';
  return icon;
}
function showSnapshot(animate) {
  const rail=$('#agentRail');
  rail.replaceChildren();
  for(const [index,name] of localAgents.entries()) {
    const cell=elem('div','local-entry');
    const face=elem('div','scan-face');
    face.append(agentIcon(name));
    const status=elem('small');
    function reveal() {
      cell.dataset.status=detected.has(name)?'found':'absent';
      status.textContent=detected.has(name)?'已检测到':'未检测到';
    }
    if(animate){
      cell.dataset.status='pending';
      status.textContent='待扫描';
      setTimeout(reveal,360+index*190);
    } else reveal();
    cell.append(face,elem('strong','',name),status);
    rail.append(cell);
  }
  rail.classList.toggle('scanning',animate);
  $('#scanState').textContent=animate?'正在回放扫描…':scanSummary();
}
function scanSummary(){return '本机快照 · '+detected.size+' / '+localAgents.length+' 已检测到';}
$('#scanAgents').onclick=()=>{
  $('#scanAgents').disabled=true;
  $('#scanState').textContent='显示检测快照…';
  showSnapshot(true);
  setTimeout(()=>{
    $('#scanState').textContent=scanSummary();
    $('#scanAgents').disabled=false;
    $('#agentRail').classList.remove('scanning');
  },(localAgents.length-1)*190+360+720);
};
showSnapshot(false);
const dialog = $('#panel');
function panel(title) {
  $('#panelTitle').textContent = title;
  const body = $('#panelBody');
  body.replaceChildren();
  if (!dialog.open) dialog.showModal();
  return body;
}
$('#close').onclick = () => dialog.close();
function selectField(label, values, value) {
  const wrap = elem('label','field',label);
  const select = elem('select');
  for (const item of values) select.append(new Option(item, item, false, item === value));
  wrap.append(select); return {wrap, select};
}
function chooseAgents(body, prefs, onSave, caption) {
  const box = elem('div','agent-list');
  const inputs = Object.entries(catalog).map(([name,[provider]]) => {
    const row = elem('label','agent-option');
    const input = elem('input'); input.type = 'checkbox'; input.value = name; input.checked = prefs.agents.includes(name);
    row.append(agentIcon(name),elem('span','',name),elem('small','',provider),input);
    box.append(row); return input;
  });
  const boss = selectField('BOSS 主持', Object.keys(catalog), prefs.boss);
  const limit = selectField('互评轮数上限', ['6','8','不限'], prefs.limit);
  const btn = button(caption, () => onSave({agents:inputs.filter(i=>i.checked).map(i=>i.value), boss:boss.select.value, limit:limit.select.value}));
  function validate() { btn.disabled = inputs.filter(i=>i.checked).length<2; btn.textContent=btn.disabled?'互评至少需要两位 Agent':caption; }
  inputs.forEach(i=>i.onchange=validate); validate();
  body.append(box,boss.wrap,limit.wrap,btn);
}
$('#config').onclick = () => {
  const body = panel('Agent 配置');
  body.append(elem('p','hint',projectInfo().name+' · '+(state.projectPrefs[state.project]?'项目专属配置':'使用默认配置')));
  const alsoDefault=elem('label','option');
  const checkbox=elem('input'); checkbox.type='checkbox';
  alsoDefault.append(checkbox,'同时设为默认配置');
  chooseAgents(body,projectPrefs(),prefs => {
    state.projectPrefs[state.project]=prefs;
    if(checkbox.checked) state.prefs=prefs;
    save(); dialog.close(); render();
  },'保存项目配置');
  body.insertBefore(alsoDefault,body.lastElementChild);
  if(state.projectPrefs[state.project]) body.append(button('恢复使用默认配置',()=>{
    delete state.projectPrefs[state.project]; save(); dialog.close(); render();
  },'entry'));
};
let view = 'boss', author = '', revision = 0, timer;
function resetView() { view='boss'; author=''; revision=0; $('#task').value=''; }
function selectProject(path) {
  state.projects = [...state.projects.filter(p=>p!==path),path];
  state.project=path; save(); resetView(); closeProjects(); render();
}
function closeProjects(){
  $('#projectPanel').hidden=true;
  $('#project').setAttribute('aria-expanded','false');
  $('#project').focus({preventScroll:true});
}
$('#project').onclick=()=>{
  if(!$('#projectPanel').hidden){closeProjects();return;}
  const recent=$('#recentProjects');
  recent.replaceChildren();
  for(const path of [...state.projects].reverse()) {
    const row=button('',()=>selectProject(path),'project-entry');
    const {name,folder}=projectInfo(path);
    row.append(elem('i','folder-icon'),elem('strong','',name),elem('small','',folder));
    if(path===state.project) row.append(elem('span','hint','当前'));
    recent.append(row);
  }
  $('#projectPanel').hidden=false;
  $('#project').setAttribute('aria-expanded','true');
  $('#addProject').focus();
};
document.addEventListener('pointerdown',e=>{
  if(!$('#projectPanel').hidden && !e.target.closest('#projectPanel,#project')) closeProjects();
});
const createDialog=$('#createProject'), projectNameInput=$('#createName');
let selectedFolder='';
function validateProject(){ $('#confirmCreate').disabled=!(selectedFolder && projectNameInput.value.trim()); }
function setFolder(name){
  if(!name)return;
  if(!projectNameInput.value.trim() || projectNameInput.value===selectedFolder)projectNameInput.value=name;
  selectedFolder=name;
  $('#folderName').textContent=name;
  $('#browseFolder span:last-child').textContent='更换';
  validateProject();
}
$('#addProject').onclick=()=>{
  closeProjects(); $('#createForm').reset(); selectedFolder='';
  $('#folderName').textContent='在此电脑上添加文件夹';
  $('#browseFolder span:last-child').textContent='添加';
  validateProject(); createDialog.showModal();
};
$('#cancelCreate').onclick=$('#closeCreate').onclick=()=>createDialog.close();
projectNameInput.oninput=validateProject;
$('#browseFolder').onclick=async()=>{
  if(window.showDirectoryPicker){
    try { const folder=await window.showDirectoryPicker({mode:'read'}); setFolder(folder.name); return; }
    catch(error){ if(error.name==='AbortError')return; }
  }
  $('#folderFiles').click();
};
$('#folderFiles').onchange=e=>setFolder(e.target.files[0]?.webkitRelativePath.split('/')[0]);
$('#createForm').onsubmit=e=>{
  e.preventDefault();
  const name=projectNameInput.value.trim();
  if(!name||!selectedFolder)return;
  const id=crypto.randomUUID();
  state.projectInfo[id]={name,folder:selectedFolder};
  createDialog.close(); selectProject(id);
};
$('#projectPanel').onkeydown=e=>{if(e.key==='Escape')closeProjects();};
$('#history').onclick = () => {
  const body = panel('项目讨论记录');
  body.append(elem('p','hint',projectInfo().name));
  const runs = state.runs.filter(r=>r.project===state.project);
  for (const r of runs) body.append(button(r.title,()=>{state.active[state.project]=r.id; save(); resetView(); dialog.close(); render();},'entry'));
  if (!runs.length) body.append(elem('p','empty','这个项目还没有讨论。'));
};
function newDiscussion() {
  const body = panel('新讨论');
  body.append(elem('p','hint',projectInfo().name));
  const field = elem('label','field','你想解决什么问题？');
  const brief=elem('textarea'); brief.rows=3; brief.required=true; brief.maxLength=2000; field.append(brief); body.append(field);
  const prefs=projectPrefs();
  body.append(elem('p','hint','本次参会 · '+prefs.agents.join('、')),button('发起演示讨论',()=>{
    if(!brief.value.trim()){brief.value=''; brief.reportValidity(); return;}
    const r=makeRun(state.project,brief.value.trim(),prefs);
    state.runs.unshift(r); state.active[state.project]=r.id; save(); dialog.close(); resetView(); render();
  }));
  brief.focus();
}
$('#newRun').onclick=newDiscussion;
function phase(r) {
  if(r.handoff) return '交接已模拟';
  if(r.choice!==null) return Date.now()-r.decided<1200?'正在确认新版':'全员已确认';
  const elapsed=Date.now()-r.started;
  return elapsed<1000?'独立出案':elapsed<2300?'交叉评审':'等你决定';
}
function bubble(name, text, label='', user=false) {
  const row=elem('div','message '+(user?'user':'assistant'));
  if(!user) {
    const face=elem('span','avatar');
    face.append(agentIcon(name));
    row.append(face);
  }
  const content=elem('div','message-content'), head=elem('div','message-name',name);
  head.append(elem('span','message-label',label));
  content.append(head,elem('p','bubble',text)); row.append(content); return row;
}
function setView(next){ view=next; render(); }
document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>setView(b.dataset.view));
function decide(r,choice) {
  if(r.choice!==null || phase(r)!=='等你决定') return;
  r.choice=choice; r.decided=Date.now(); revision=0;
  r.messages.push({user:true,text:fixture(r).options[choice]},{text:'好。'+fixture(r).outcomes[choice]+' 我把这条写进共同稿 v2，请大家重新确认。'});
  save(); render(); scrollBottom();
}
function scrollBottom(){const log=$('#conversation'); log.scrollTop=log.scrollHeight;}
function bossView(box,r,status) {
  const f=fixture(r);
  box.append(bubble('你',r.title,'需求',true));
  if(['独立出案','交叉评审'].includes(status)){
    box.append(bubble(r.boss,status==='独立出案'?'各位正在分别写第一份提案。':'首轮提案收齐了。各位正在读其他人的意见，准备自己的 v2。','BOSS'));return;
  }
  box.append(bubble(r.boss,f.summary,'BOSS · 第 1 轮汇总'));
  if(r.choice===null){
    const card=elem('section','decision');
    card.append(elem('span','decision-label','待你决定'),elem('h4','',f.question));
    const actions=elem('div','actions');
    f.options.forEach((v,i)=>actions.append(button(v,()=>decide(r,i),i?'secondary':'primary')));
    card.append(actions);box.append(card);
  }
  for(const m of r.messages) box.append(bubble(m.user?'你':r.boss,m.text,m.user?'':'BOSS',m.user));
}
function personalText(r,i,v) {
  const f=fixture(r);
  const base=f.drafts[i%f.drafts.length];
  if(v===1)return base;
  return base+' 修订：'+f.reviews[(i+1)%f.reviews.length];
}
function reviewView(box,r,status) {
  const f=fixture(r);
  box.append(elem('div','stage','独立提案 · v1'));
  r.agents.forEach((n,i)=>box.append(bubble(n,personalText(r,i,1),'个人提案')));
  if(status==='独立出案')return;
  box.append(elem('div','stage','交叉评审 · 第 1 轮'));
  r.agents.forEach((n,i)=>{
    const others=r.agents.filter(a=>a!==n);
    if(others.length)box.append(bubble(n,f.reviews[i%f.reviews.length],'审阅 '+others.join('、')));
  });
  if(status==='交叉评审')return;
  box.append(elem('div','stage','各自修订 · v2'));
  r.agents.forEach((n,i)=>box.append(bubble(n,personalText(r,i,2),'个人提案 v2')));
  if(status==='全员已确认'||r.handoff){
    box.append(elem('div','stage','共同稿 v2 · 全员签认'));
    r.agents.forEach(n=>box.append(bubble(n,'处理方式和验收条件已明确，可以按这版执行。','确认 v2')));
  }
}
function planView(box,r,status) {
  const f=fixture(r), pick=selectField('查看方案',['BOSS 共同稿',...r.agents],author || 'BOSS 共同稿');
  pick.select.onchange=()=>{author=pick.select.value;revision=0;render();};
  const shared=!author||author==='BOSS 共同稿';
  const revised=!['独立出案','交叉评审'].includes(status);
  const max=shared?(r.choice!==null?2:revised?1:0):(revised?2:1);
  box.append(pick.wrap);
  if(!max){box.append(elem('p','empty','等待各位提交修订稿。'));return;}
  const v=Math.min(revision||max,max), bar=elem('div','plan-head');
  bar.append(elem('h2','',shared?'共同方案':author+' 的提案'));
  const switches=elem('div','switch');
  for(let n=1;n<=max;n++){const b=button('v'+n,()=>{revision=n;render();},'version');b.setAttribute('aria-pressed',String(n===v));switches.append(b);}
  bar.append(switches);box.append(bar,elem('h3','',r.title));
  if(!shared){box.append(elem('p','',personalText(r,r.agents.indexOf(author),v)));return;}
  box.append(elem('p','',v===1?f.summary:f.outcomes[r.choice]),elem('h3','',v===1?'待确认':'验收条件'),
    elem('p','',v===1?f.question:f.criteria[r.choice]));
}
function handoff(r){
  const body=panel('交给执行 Agent'), pick=selectField('接收方',Object.keys(catalog),'DeepSeek Harness');
  body.append(elem('p','hint',projectInfo().name+' · 共同稿 v2'),elem('h3','',r.title),elem('p','',fixture(r).outcomes[r.choice]),pick.wrap,
    button('模拟交接',()=>{r.handoff=pick.select.value;save();dialog.close();render();}));
}
function render() {
  clearTimeout(timer);
  const r=activeRun(), box=$('#conversation'), footer=$('#handoff');
  $('#projectName').textContent=projectInfo().name;
  $('#project').title=projectInfo().folder;
  $('#source').textContent='本地演示';
  $('#runTitle').textContent=r?.title||'开始一场讨论';
  const status=r?(r.legacy?'旧版记录':phase(r)):'项目已就绪';
  $('#verdict').textContent=status;
  box.replaceChildren(); footer.replaceChildren(); footer.hidden=true;
  $('#members').replaceChildren(); $('#compose').hidden=!r||r.legacy;
  document.querySelectorAll('[data-view]').forEach(b=>{b.disabled=!r||r.legacy;b.setAttribute('aria-pressed',String(b.dataset.view===view));});
  if(!r){box.append(elem('p','empty','这个项目还没有讨论。'));return;}
  if(r.legacy){box.append(elem('p','empty','旧版演示 · '+r.models.join('、')),elem('p','',r.title));return;}
  const members=$('#members');
  const host=elem('span','host');
  host.append(agentIcon(r.boss),'BOSS · '+r.boss);
  members.append(host);
  for(const name of r.agents) {
    const member=elem('span','roster-name');
    member.append(agentIcon(name),name);
    members.append(member);
  }
  box.classList.toggle('plan',view==='plan');
  if(view==='boss')bossView(box,r,status);
  if(view==='reviews')reviewView(box,r,status);
  if(view==='plan')planView(box,r,status);
  if(status==='全员已确认'||r.handoff){
    footer.hidden=false;
    footer.append(elem('span','',r.handoff?'模拟交接完成 · '+r.handoff:'共同稿 v2 · '+r.agents.length+' 位 Agent 全员确认'));
    if(!r.handoff)footer.append(button('交给执行 Agent',()=>handoff(r)));
  }
  const next=status==='独立出案'?r.started+1000:status==='交叉评审'?r.started+2300:status==='正在确认新版'?r.decided+1200:0;
  if(next)timer=setTimeout(render,Math.max(1,next-Date.now()));
}
$('#compose').onsubmit=e=>{
  e.preventDefault();const r=activeRun(), q=$('#task').value.trim();
  if(!r || !q)return;
  const f=fixture(r);
  const reply=r.choice!==null?'你已经选了“'+f.options[r.choice]+'”。验收时可以这样检查：'+f.criteria[r.choice]:
    '在这个演示里，你可以比较两种做法。第一种会'+f.outcomes[0]+' 第二种会'+f.outcomes[1];
  r.messages.push({user:true,text:q},{text:reply}); save();$('#task').value='';setView('boss');scrollBottom();
};
save();
render();
