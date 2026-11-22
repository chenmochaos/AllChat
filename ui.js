const catalog = {
  'Claude Code': ['Anthropic', 'claude'], 'Claude Desktop': ['Anthropic', 'claude'],
  'ChatGPT': ['OpenAI', 'openai'], 'Codex CLI': ['OpenAI', 'codex'],
  'Gemini CLI': ['Google', 'gemini'], 'Grok Build': ['xAI', 'grok'],
  'OpenCode': ['OpenCode', 'opencode'], 'OpenClaw': ['OpenClaw', 'openclaw'],
  'Hermes': ['Nous Research', 'hermes'], 'Pi': ['Pi', 'pi'],
  'MiniMax Code': ['MiniMax', 'minimax'], 'Kimi Code': ['Moonshot AI', 'kimi'],
  'DeepSeek Harness': ['DeepSeek', 'deepseek'], 'Antigravity': ['Google', 'antigravity'],
  'Oh My Pi': ['Oh My Pi', 'omp'], 'Copilot CLI': ['GitHub', 'copilot'],
  'WorkBuddy': ['Tencent', 'workbuddy'], 'ZCode': ['Z.AI', 'zcode'], '自定义 API': ['API', 'api']
};

const agentsToggle=$('#toggleAgents');
const agentPanel=$('#localAgents');
function showAgentPanel(open){
  agentPanel.hidden=!open;
  agentsToggle.setAttribute('aria-expanded',String(open));
}
agentsToggle.onclick=()=>showAgentPanel(agentPanel.hidden);
document.addEventListener('pointerdown',event=>{
  if(!agentPanel.hidden && !agentPanel.contains(event.target) && !agentsToggle.contains(event.target))showAgentPanel(false);
});
document.addEventListener('keydown',event=>{
  if(event.key==='Escape' && !agentPanel.hidden){
    showAgentPanel(false);
    agentsToggle.focus({preventScroll:true});
  }
});

function agentIcon(name) {
  const legacy={'Codex 桌面端':'openai','Gemini':'gemini','DeepSeek API':'deepseek'};
  const id=catalog[name]?.[1]||legacy[name]||'api';
  const icon=elem('img','agent-symbol');
  icon.src='assets/icons/'+id+'.svg';
  icon.alt='';
  return icon;
}

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

let treeSignature = '';
const foldedProjects = new Set();
function projectTree(projects, runs, projectId, runId, select) {
  const signature = JSON.stringify([projects, runs.map(r=>[r.id,r.project,r.title]), projectId,runId,[...foldedProjects]]);
  if (signature === treeSignature) return;
  treeSignature = signature;
  const tree = $('#projectTree');
  tree.replaceChildren();
  for (const project of projects) {
    const group=elem('div','project-group'), row=elem('div','project-row');
    const expanded=!foldedProjects.has(project.id);
    const toggle=button(expanded?'⌄':'›',()=>{
      if(expanded) foldedProjects.add(project.id); else foldedProjects.delete(project.id);
      projectTree(projects,runs,projectId,runId,select);
    },'tree-toggle');
    toggle.setAttribute('aria-expanded',String(expanded));
    toggle.setAttribute('aria-label',(expanded?'折叠 ':'展开 ')+project.name);
    const chats=runs.filter(r=>r.project===project.id);
    const folder=button('',()=>{
      foldedProjects.delete(project.id);
      select(project.id,project.id===projectId?runId:chats[0]?.id||null);
    },'tree-folder');
    folder.append(elem('span','folder-icon'),elem('span','',project.name)); folder.title=project.path;
    row.classList.toggle('current-project',project.id===projectId);
    const create=button('＋',()=>{foldedProjects.delete(project.id);select(project.id,null);},'project-create');
    create.title='在「'+project.name+'」中新建会话';create.setAttribute('aria-label',create.title);
    row.append(toggle,folder,create);group.append(row);
    if(expanded){
      for(const r of chats){
        const entry=button(r.title,()=>select(project.id,r.id),'tree-chat');
        entry.title=r.title;
        if(r.id===runId && project.id===projectId)entry.setAttribute('aria-current','page');
        group.append(entry);
      }
    }
    tree.append(group);
  }
  if(!projects.length)tree.append(button('导入第一个项目',()=>$('#addProject').click(),'entry'));
}

function composeMode(hasRun) {
  $('.chat').classList.toggle('empty-chat',!hasRun);
  $('#task').placeholder=hasRun?'问 BOSS 关于这个项目的问题…':'输入你的问题或目标…';
  $('#attach').hidden=hasRun;
}
$('#task').addEventListener('keydown',event=>{
  if(event.key==='Enter' && !event.shiftKey && !event.isComposing && event.keyCode!==229){
    event.preventDefault();$('#compose').requestSubmit();
  }
});

function coordinationReply(r) {
  return bubble(r.boss,'收到。我来协调这次讨论，请 '+r.agents.join('、')+' 各自准备第一版方案。','BOSS · 调度通知');
}
const progressPhrases={
  draft:['正在整理第一版思路…','正在梳理目标和约束…','正在准备独立提案…'],
  review:['正在逐份读其他人的方案…','正在对照假设和风险…','正在整理评审意见…'],
  revise:['正在根据互评修订…','正在整理新版提案…'],
  vote:['正在核对共同稿…','正在复核验收条件…']
};
function workingText(r,job){
  const options=progressPhrases[job.stage]||['正在处理…'];
  let value=0;
  for(const ch of r.id+job.id)value=(31*value+ch.charCodeAt(0))>>>0;
  return options[value%options.length];
}
