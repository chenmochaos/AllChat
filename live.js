const token=document.querySelector('meta[name="allchat-token"]').content;
const stages={draft:'独立提案',join:'新成员出案',review:'交叉评审',revise:'各自修订',merge:'BOSS 汇总',vote:'共同稿签认',
  choice:'等待你的取舍',limit:'已达轮数上限',approved:'全员已确认',ended:'用户已结束',execute:'执行中',delivered:'执行 Agent 已回复',ask:'BOSS 解释'};
let workspace, project, run, view='boss', selectedFolder, selectedVersion='', scanTimers=[];
let projectId=localStorage.getItem('allchat.live.project'), runId=null, lastRender='';
const note=$('.demo-note');
note.setAttribute('role','status');
async function api(path,data){
  const response=await fetch('/api/'+path,{method:data?'POST':'GET',headers:{'X-AllChat':token,'Content-Type':'application/json'},
    ...(data?{body:JSON.stringify(data)}:{})});
  const result=await response.json();
  if(!response.ok)throw Error(result.error||'无法连接本地服务。');
  return result;
}
function guard(fn){
  return async event=>{
    event?.preventDefault();
    const el=event?.currentTarget;
    if(el?.dataset.busy)return;
    if(el)el.dataset.busy='true';
    try{await fn(event);}
    catch(error){
      note.textContent=error.message;
      const opened=document.querySelector('dialog[open]');
      if(opened){
        const msg=opened.querySelector('.live-error')||elem('p','live-error');
        msg.setAttribute('role','alert');msg.textContent=error.message;opened.append(msg);
      }
    }finally{if(el)delete el.dataset.busy;}
  };
}
function capabilityLabel(name,info){
  if(info.ready)return '已找到接口';
  if(name.endsWith('API'))return '未配置';
  return info.installed?'仅手动可用':'未检测到';
}
function agentRail(animate=false){
  scanTimers.forEach(clearTimeout);scanTimers=[];
  const rail=$('#agentRail');rail.replaceChildren();rail.classList.toggle('scanning',animate);
  const entries=Object.entries(workspace.agents).filter(([n])=>!n.endsWith('API'));
  $('#scanState').textContent=entries.filter(([,a])=>a.installed).length+' / '+entries.length+' 已检测到';
  entries.forEach(([name,info],i)=>{
    const cell=elem('div','local-entry'),face=elem('div','scan-face'),label=elem('small');
    face.append(agentIcon(name));cell.append(face,elem('strong','',name),label);rail.append(cell);
    cell.title=info.detail||'';
    const reveal=()=>{cell.dataset.status=info.installed?'found':'absent';label.textContent=capabilityLabel(name,info);};
    if(animate){cell.dataset.status='pending';label.textContent='扫描中';scanTimers.push(setTimeout(reveal,250+i*170));}
    else reveal();
  });
  if(animate)scanTimers.push(setTimeout(()=>rail.classList.remove('scanning'),entries.length*170+900));
}
async function refresh(selectLatest=false){
  workspace=await api('state');
  project=workspace.projects.find(p=>p.id===projectId)||workspace.projects[0];
  projectId=project?.id;
  if(projectId)localStorage.setItem('allchat.live.project',projectId);
  const recent=workspace.runs.filter(r=>r.project===projectId);
  if(selectLatest||!recent.some(r=>r.id===runId))runId=recent[0]?.id;
  await loadRun();
}
async function loadRun(){
  const id=runId;
  const data=id?await api('run/'+id):null;
  if(id!==runId)return;
  run=data;render();
}
function chooseProject(id){
  projectId=id;runId=null;view='boss';selectedVersion='';lastRender='';$('#task').value='';
  $('#projectPanel').hidden=true;$('#project').setAttribute('aria-expanded','false');
  return refresh(true);
}
$('#project').onclick=()=>{
  const box=$('#projectPanel');box.hidden=!box.hidden;$('#project').setAttribute('aria-expanded',String(!box.hidden));
  const recent=$('#recentProjects');recent.replaceChildren();
  for(const p of workspace.projects)recent.append(button(p.name+' · '+p.path,guard(()=>chooseProject(p.id)),'entry'));
};
$('#addProject').onclick=()=>{
  $('#projectPanel').hidden=true;$('#project').setAttribute('aria-expanded','false');
  $('#createForm').reset();selectedFolder=null;$('#folderName').textContent='在此电脑上添加文件夹';
  $('#browseFolder span:last-child').textContent='添加';$('#confirmCreate').disabled=true;$('#createProject').showModal();
};
$('#closeCreate').onclick=$('#cancelCreate').onclick=()=>$('#createProject').close();
function validateProject(){ $('#confirmCreate').disabled=!(selectedFolder&&$('#createName').value.trim()); }
$('#createName').oninput=validateProject;
$('#browseFolder').onclick=guard(async()=>{
  const folder=await api('folder',{});
  if(!folder.token)return;
  if(!$('#createName').value.trim()||$('#createName').value===selectedFolder?.name)$('#createName').value=folder.name;
  selectedFolder=folder;$('#folderName').textContent=folder.name;$('#browseFolder span:last-child').textContent='更换';validateProject();
});
$('#createForm').onsubmit=guard(async()=>{
  if(!selectedFolder)return;
  const p=await api('projects',{folder:selectedFolder.token,name:$('#createName').value.trim()});
  $('#createProject').close();await chooseProject(p.id);
});
$('#config').onclick=()=>{
  const body=panel('Agent 配置'), prefs=project?.prefs||workspace.defaults;
  body.append(elem('p','hint',project?project.name+' · '+(project.prefs?'项目专属配置':'使用默认配置'):'默认配置'));
  const inputs=[];
  for(const [name,cap] of Object.entries(workspace.agents)){
    if(!cap.installed && name!=='自定义 API')continue;
    const row=elem('label','agent-option'),input=elem('input');
    input.type='checkbox';input.value=name;input.disabled=!cap.ready;input.checked=cap.ready&&prefs.agents.includes(name);
    row.title=cap.detail||'';
    inputs.push(input);row.append(agentIcon(name),elem('span','',name),elem('small','',capabilityLabel(name,cap)),input);body.append(row);
  }
  const ready=Object.keys(workspace.agents).filter(n=>workspace.agents[n].ready);
  const boss=selectField('BOSS 主持',ready,prefs.boss),limit=selectField('轮数上限',['6','8','不限',...(prefs.limit&&![6,8].includes(prefs.limit)?[String(prefs.limit)]:[])],String(prefs.limit||'不限'));
  const label=elem('label','option'),also=elem('input');also.type='checkbox';label.append(also,'同时设为默认');
  body.append(boss.wrap,limit.wrap);if(project)body.append(label);
  body.append(button('保存配置',guard(async()=>{
    await api('prefs',{project:projectId,asDefault:also.checked,prefs:{agents:inputs.filter(i=>i.checked).map(i=>i.value),boss:boss.select.value,limit:Number(limit.select.value)||0}});
    dialog.close();await refresh();
  })));
  if(project?.prefs)body.append(button('恢复使用默认配置',guard(async()=>{
    await api('prefs',{project:projectId,inherit:true,prefs:workspace.defaults});dialog.close();await refresh();
  }),'entry'));
};
$('#newRun').onclick=()=>{
  if(!project){$('#addProject').click();return;}
  const body=panel('新讨论'), brief=elem('textarea'),materials=elem('textarea');
  const prefs=project.prefs||workspace.defaults;
  brief.rows=3;brief.maxLength=8000;materials.rows=3;materials.maxLength=100000;
  const label=elem('label','field','你想解决什么问题？'),source=elem('label','field','共享材料（可选）');
  label.append(brief);source.append(materials);
  const files=elem('input');files.type='file';files.multiple=true;files.accept='.txt,.md,.json,.csv,.js,.py,.html,.css,.yaml,.toml,.yml';
  files.onchange=guard(async()=>{
    let text=materials.value;
    for(const f of files.files){
      if(f.size>400000)throw Error('请选择较小的文本材料。');
      text+='\n\n'+f.name+'\n'+await f.text();
    }
    if(text.length>100000)throw Error('材料总长度超出十万字符。');
    materials.value=text;
  });
  source.append(files);
  const key=crypto.randomUUID();
  body.append(elem('p','hint',project.path),label,source,elem('p','hint','参会 · '+prefs.agents.join('、')),button('发起讨论',guard(async()=>{
    const r=await api('runs',{id:key,project:projectId,title:brief.value,materials:materials.value});
    runId=r.id;selectedVersion='';view='boss';dialog.close();await refresh();
  })));brief.focus();
};
$('#history').onclick=guard(async()=>{
  await refresh();
  const body=panel('项目讨论记录'), rows=workspace.runs.filter(r=>r.project===projectId);
  for(const r of rows)body.append(button(r.title+' · '+stages[r.stage],guard(async()=>{
    runId=r.id;selectedVersion='';view='boss';dialog.close();await loadRun();
  }),'entry'));
  if(!rows.length)body.append(elem('p','empty','这个项目还没有讨论。'));
});
async function act(action,data={}){
  const id=runId;
  const result=await api('action',{id,action,revision:run.plans.at(-1)?.digest,...data});
  if(id===runId){run=result;render();}
}
function decide(){
  const body=panel('告诉 BOSS 你的决定'),answer=elem('textarea'),field=elem('label','field',run.plans.at(-1)?.question||'补充要求或说明下轮方向');
  answer.rows=4;field.append(answer);body.append(field,button('提交并继续',guard(async()=>{
    await act('decide',{text:answer.value});dialog.close();
  })));
}
function changeMembers(){
  const body=panel('调整本次参会名单'),checks=[];
  for(const [name,info] of Object.entries(workspace.agents)){
    if(!info.ready)continue;
    const row=elem('label','agent-option'),input=elem('input');
    input.type='checkbox';input.checked=run.agents.some(agent=>({'Codex 桌面端':'ChatGPT',Gemini:'Gemini CLI'}[agent]||agent)===name);input.value=name;
    checks.push(input);row.append(agentIcon(name),name,input);body.append(row);
  }
  body.append(button('按新名单重新评审',guard(async()=>{
    await act('members',{agents:checks.filter(i=>i.checked).map(i=>i.value)});dialog.close();
  })));
}
function handoff(){
  const body=panel('交给执行 Agent'),ready=Object.keys(workspace.agents).filter(n=>workspace.agents[n].ready);
  const pick=selectField('执行 Agent',ready,run.executor||'DeepSeek Harness');
  body.append(elem('p','hint',project.path+' · 共同稿 v'+run.plans.at(-1).version),pick.wrap,button('交接并开始执行',guard(async()=>{
    await act('handoff',{agent:pick.select.value});dialog.close();
  })));
}
function render(){
  const signature=JSON.stringify([project,run,view,selectedVersion]);
  if(signature===lastRender)return;
  lastRender=signature;
  $('#projectName').textContent=project?.name||'项目文件夹';$('#project').title=project?.path||'选择项目';
  $('#source').textContent='本地工作区';
  const failed=run?.jobs.find(j=>j.status==='failed');
  $('#verdict').textContent=run?(failed?'等待重试':stages[run.stage])+' · 第 '+run.round+' 轮':'';
  $('#runTitle').textContent=run?.title||(project?'开始一场讨论':'选择项目文件夹');
  const box=$('#conversation'),footer=$('#handoff'),members=$('#members');
  const scroll=box.scrollTop,stick=scroll>0&&box.scrollHeight-box.clientHeight-scroll<30;
  box.replaceChildren();footer.replaceChildren();members.replaceChildren();
  footer.hidden=true;$('#compose').hidden=!run;
  document.querySelectorAll('[data-view]').forEach(b=>{b.disabled=!run;b.setAttribute('aria-pressed',String(b.dataset.view===view));});
  if(!run)return;
  for(const [name,host] of [[run.boss,true],...run.agents.map(n=>[n,false])]){
    const member=elem('span',host?'host':'roster-name');member.append(agentIcon(name),(host?'BOSS · ':'')+name);members.append(member);
  }
  const finished=run.jobs.filter(j=>j.status==='done');
  if(view==='reviews'){
    for(const j of run.jobs.filter(j=>!['ask','execute'].includes(j.stage))){
      let text=j.text||({working:'正在处理…',queued:'等待派发',failed:j.error,superseded:'名单已更新'}[j.status]);
      if(j.stage==='vote'&&j.parsed)text=j.parsed.approve?'已确认当前共同稿，可以执行。':j.parsed.objection;
      if(j.stage==='merge'&&j.parsed)text=j.parsed.summary||j.parsed.plan;
      const item=bubble(j.agent,text,stages[j.stage]+' · 第 '+j.round+' 轮');
      item.id='job-'+j.id;box.append(item);
      if(j.stage==='review'){
        const refs=finished.filter(x=>x.agent!==j.agent&&(j.round===1?x.stage==='draft':x.stage==='revise'&&x.round===j.round-1));
        for(const x of refs)box.append(button('查看 '+x.agent+' 原稿',()=>document.getElementById('job-'+x.id)?.scrollIntoView({block:'nearest'}),'secondary'));
      }
    }
    if(Object.values(run.sessions).some(Boolean)){
      const details=elem('details'),summary=elem('summary','','原生会话编号');
      details.append(summary);
      for(const [role,id] of Object.entries(run.sessions))if(id)details.append(elem('p','hint',role+' · '+id));
      box.append(details);
    }
  }else if(view==='plan'){
    const versions=[...run.plans.map(p=>['共同稿 v'+p.version,p.plan]),...finished.filter(j=>['draft','revise'].includes(j.stage)).map(j=>[j.agent+' v'+(j.stage==='draft'?1:j.round+1),j.text])];
    if(versions.length){
      const current=versions.find(([n])=>n===selectedVersion)||versions[run.plans.length?run.plans.length-1:0];
      const pick=selectField('方案版本',versions.map(([n])=>n),current[0]);
      pick.select.onchange=()=>{selectedVersion=pick.select.value;render();};box.append(pick.wrap,elem('p','bubble',current[1]));
    }else box.append(elem('p','hint','等待首份提案。'));
  }else{
    box.append(bubble('你',run.title,'需求',true));
    for(const p of run.plans)box.append(bubble(run.boss,(p.summary||p.plan)+(p.question?'\n\n'+p.question:''),'BOSS · 共同稿 v'+p.version));
    for(const d of run.decisions)box.append(bubble('你',d,'决定',true));
    for(const q of run.questions){box.append(bubble('你',q.text,'提问',true));if(q.answer)box.append(bubble(run.boss,q.answer,'BOSS'));}
    for(const j of finished.filter(j=>j.stage==='execute'))box.append(bubble(j.agent,j.text,'执行回执'));
    if(!run.plans.length)box.append(elem('p','hint',stages[run.stage]+' · '+finished.length+' 份回复已保存'));
  }
  if(failed){
    footer.append(elem('span','',failed.agent+' · '+failed.error),button('重试这一项',guard(()=>act('retry',{job:failed.id}))));
  }else if(run.error)footer.append(elem('span','',run.error),button('重试保存',guard(()=>act('recover'))));
  else if(['choice','limit'].includes(run.stage)){
    footer.append(elem('span','',run.stage==='limit'?'仍有分歧，已到轮数上限':'需要你作决定'),button('补充并继续',decide),
      button('结束讨论',guard(()=>act('end')),'secondary'));
  }else if(run.stage==='approved')footer.append(elem('span','','所有参与者已确认共同稿 v'+run.plans.at(-1).version),button('修改要求',decide,'secondary'),button('交给执行 Agent',handoff));
  if((failed||['limit','choice','approved'].includes(run.stage))&&!['execute','delivered','ended'].includes(run.stage))footer.append(button('调整成员',changeMembers,'secondary'));
  footer.hidden=!footer.childElementCount;
  box.scrollTop=stick?box.scrollHeight:scroll;
}
document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>{view=b.dataset.view;render();});
$('#compose').onsubmit=guard(async()=>{await act('ask',{text:$('#task').value});$('#task').value='';view='boss';render();});
$('#scanAgents').textContent='识别本机 Agent';
$('#scanAgents').onclick=guard(async()=>{workspace=await api('state');agentRail(true);});
note.textContent='';
async function poll(){
  try{if(!document.hidden && runId)await loadRun();}
  catch(e){note.textContent=e.message;}
  finally{setTimeout(poll,1200);}
}
guard(async()=>{await refresh();agentRail();poll();})();
