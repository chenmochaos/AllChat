const modelData = {
  gpt: {
    name: 'GPT-6.2 Astra', role: '架构视角', className: 'gpt',
    copy: '把任务拆成“讨论层”和“执行层”。讨论层只产出经过验证的计划文件，执行层在隔离 worktree 里落地，二者之间用结构化交接连接。',
    bullets: ['先锁定交接协议', '执行与评审严格隔离']
  },
  claude: {
    name: 'Claude', role: '产品视角', className: 'claude',
    copy: '核心是让人能看懂为什么方案收敛。每轮都保留独立提案、分歧来源和 BOSS 的取舍，不要把“多数同意”当作正确性证明。',
    bullets: ['每个结论都要有来源', '分歧应成为可操作决策']
  },
  gemini: {
    name: 'Gemini', role: '系统视角', className: 'gemini',
    copy: '用并行任务减少等待，把上下文、轮次和成本作为一等数据。模型只读共享快照，BOSS 负责整理，避免多个 Agent 同时写项目造成冲突。',
    bullets: ['并行读取同一快照', '为轮次设置硬上限']
  },
  deepseek: {
    name: 'DeepSeek', role: '成本视角', className: 'deepseek',
    copy: '首版应先验证工作流是否让人省力，再接真实供应商。模型配置保持可替换：规划用强模型，执行和格式化可以用便宜模型。',
    bullets: ['先做可观测的闭环', '按阶段优化模型成本']
  }
};

const state = { round: 0, maxRounds: 3, started: false, final: false, confirmed: false };
const $ = (selector) => document.querySelector(selector);

function selectedModels() {
  return [...document.querySelectorAll('.model-toggle input:checked')].map((input) => input.value);
}

function showToast(message) {
  const toast = $('#toast');
  toast.textContent = message;
  toast.classList.add('show');
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => toast.classList.remove('show'), 2400);
}

function renderProposals() {
  const grid = $('#proposal-grid');
  grid.innerHTML = selectedModels().map((id) => {
    const model = modelData[id];
    return `<article class="proposal-card"><div class="proposal-head"><span class="model-dot ${model.className}">${id === 'gemini' ? '✦' : id[0].toUpperCase()}</span><span class="proposal-name">${model.name}</span><span class="proposal-role">${model.role}</span></div><p>${model.copy}</p><ul>${model.bullets.map((bullet) => `<li>${bullet}</li>`).join('')}</ul></article>`;
  }).join('');
}

function renderBoss() {
  const selected = selectedModels();
  const current = state.round;
  const reviewPairs = selected.length > 1 ? selected.slice(0, Math.min(3, selected.length)).map((id, index) => {
    const target = selected[(index + 1) % selected.length];
    return `<div class="review-item"><span class="review-model"><span class="model-dot ${modelData[id].className}">${id === 'gemini' ? '✦' : id[0].toUpperCase()}</span>${modelData[id].name}</span><span class="review-arrow">→</span><span class="review-target">${modelData[target].name}</span><span class="review-note">指出接入时机仍需人工决策</span></div>`;
  }).join('') : '';
  $('#review-items').innerHTML = reviewPairs;
  const extra = current > 1 ? `<div class="decision-list"><div class="decision-box"><label>已合并</label><p>独立提案 + 交叉审查应落成可追踪的 Markdown 产物。</p></div><div class="decision-box"><label>本轮变化</label><p>增加人工确认闸门；未解决的接入时机不阻塞原型验证。</p></div></div>` : '';
  $('#boss-body').innerHTML = `<strong>共识：</strong> ${selected.length} 个模型都支持“先规划、后执行、再独立审查”的分层流程。BOSS 建议把方案和审查记录保存为可复盘的文件，${current > 1 ? '并将用户确认设为执行前的硬闸门。' : '先用本地演示验证交互，再接入真实模型。'}${extra}`;
  $('#current-round').textContent = current;
  $('#round-count').textContent = current;
  $('#round-title').textContent = current === 1 ? '第一轮 · 独立方案' : `第 ${current} 轮 · BOSS 修订`;
  $('#round-subtitle').textContent = current === 1 ? '各模型先独立回答，暂不互相查看' : '吸收上一轮审查，保留仍有证据分歧的决策点';
  $('#boss-round-meta').textContent = `第 ${current} / ${state.maxRounds} 轮 · ${Math.max(0, state.maxRounds - current)} 轮修订机会`;
  if (current >= state.maxRounds) {
    $('#revise-button').classList.add('hidden');
    $('#round-complete').classList.remove('hidden');
    $('#phase-status').textContent = '达到上限';
    $('#phase-status').className = 'status-pill pending';
    $('#consensus-badge').innerHTML = '<i></i> 保留 1 项分歧';
  } else {
    $('#revise-button').classList.remove('hidden');
    $('#round-complete').classList.add('hidden');
    $('#phase-status').textContent = '演示完成';
    $('#phase-status').className = 'status-pill running';
    $('#consensus-badge').innerHTML = '<i></i> 部分收敛';
  }
}

function startDiscussion() {
  const task = $('#task-input').value.trim();
  const models = selectedModels();
  if (!task) { showToast('先写下这次要解决的问题'); $('#task-input').focus(); return; }
  if (models.length < 2) { showToast('至少选择两个规划模型'); return; }
  state.started = true; state.final = false; state.confirmed = false; state.round = 1; state.maxRounds = Number($('#max-rounds').value);
  $('#empty-state').classList.add('hidden'); $('#final-view').classList.add('hidden'); $('#discussion-view').classList.remove('hidden');
  renderProposals(); renderBoss();
  showToast(`${models.length} 个模型已完成独立方案（演示）`);
  window.scrollTo({ top: document.querySelector('.flow-section').offsetTop - 20, behavior: 'smooth' });
}

function nextRound() {
  if (state.round >= state.maxRounds) return;
  state.round += 1; renderBoss(); showToast(`BOSS 已完成第 ${state.round} 轮修订（演示）`);
}

function showFinal() {
  state.final = true; $('#discussion-view').classList.add('hidden'); $('#final-view').classList.remove('hidden'); $('#final-round-number').textContent = state.round;
  $('.flow-tab[data-tab="discussion"]').classList.remove('selected'); $('.flow-tab[data-tab="final"]').classList.add('selected');
}

function confirmPlan() {
  state.confirmed = true; $('#handoff-panel').classList.remove('hidden'); $('#confirm-button').classList.add('hidden');
  const task = $('#task-input').value.trim();
  $('#handoff-text').textContent = `执行模型：GPT-6.1 Sol\n任务：${task}\n\n已确认方案：\n- 多模型独立规划 → 交叉审查 → BOSS 综合\n- 执行前保留人工确认闸门\n- 执行后由不同模型审查变更与测试\n\n执行要求：读取当前项目上下文，先复述计划，再在隔离 worktree 中实施。\n验证要求：运行项目已有检查，并逐项回报结果。`;
  showToast('交接内容已生成，可复制给执行模型');
}

function resetDemo() {
  state.round = 0; state.started = false; state.final = false; state.confirmed = false;
  $('#empty-state').classList.remove('hidden'); $('#discussion-view').classList.add('hidden'); $('#final-view').classList.add('hidden'); $('#handoff-panel').classList.add('hidden'); $('#confirm-button').classList.remove('hidden');
  $('.flow-tab[data-tab="discussion"]').classList.add('selected'); $('.flow-tab[data-tab="final"]').classList.remove('selected'); $('#round-count').textContent = '0'; $('#task-input').value = '为现有 Web 应用设计一套多模型协作开发流程，支持并行规划、交叉审查、有限轮次收敛，并由快速模型执行。';
}

document.addEventListener('DOMContentLoaded', () => {
  $('#start-button').addEventListener('click', startDiscussion);
  $('#revise-button').addEventListener('click', nextRound);
  $('#finalize-button').addEventListener('click', showFinal);
  $('#confirm-button').addEventListener('click', confirmPlan);
  $('#reset-button').addEventListener('click', resetDemo);
  $('#resolve-button').addEventListener('click', () => showToast('已保留为你的决策点，BOSS 不会替你拍板'));
  $('#copy-button').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText($('#handoff-text').textContent); $('#copy-feedback').textContent = '已复制'; } catch { $('#copy-feedback').textContent = '请手动选择复制'; }
    window.setTimeout(() => { $('#copy-feedback').textContent = ''; }, 1800);
  });
  document.querySelectorAll('.flow-tab').forEach((tab) => tab.addEventListener('click', () => {
    if (!state.started) { showToast('先开始一次方案讨论'); return; }
    if (tab.dataset.tab === 'final') { if (!state.final) showFinal(); } else { state.final = false; $('#final-view').classList.add('hidden'); $('#discussion-view').classList.remove('hidden'); }
    document.querySelectorAll('.flow-tab').forEach((item) => item.classList.toggle('selected', item === tab));
  }));
  $('#max-rounds').addEventListener('change', (event) => { state.maxRounds = Number(event.target.value); if (state.started) renderBoss(); });
});
