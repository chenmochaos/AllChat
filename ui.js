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
