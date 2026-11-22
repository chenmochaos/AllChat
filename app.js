const $ = selector => document.querySelector(selector);
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
const introStyles = ['scatter', 'ripple', 'weave', 'tiles'];

function pickIntroStyle() {
  let previous;
  let remaining = [];
  try {
    const saved = JSON.parse(localStorage.getItem('allchat.intros'));
    if (saved && Array.isArray(saved.remaining)) {
      previous = saved.previous;
      remaining = [...new Set(saved.remaining.filter(id => introStyles.includes(id)))];
    }
  } catch { /* Storage is optional in private windows. */ }
  if (!remaining.length) remaining = [...introStyles];
  const candidates = remaining.length > 1 ? remaining.filter(id => id !== previous) : remaining;
  const selected = candidates[Math.floor(Math.random()*candidates.length)];
  try {
    localStorage.setItem('allchat.intros', JSON.stringify({
      previous: selected, remaining: remaining.filter(id => id !== selected)
    }));
  } catch { /* The randomly selected animation still plays. */ }
  return selected;
}

function drawWordmark(style) {
  // Integer-grid outlines keep the stepped corners crisp at every display size.
  const outlines = {
    A: ['5,1 17,1 17,24 12,28 12,16 6,16 6,25 1,28 1,16 0,16 0,14 1,13 1,7', '6,7 8,5 12,5 12,12 6,12'],
    L: ['2,4 7,0 7,22 13,22 16,19 16,26 5,26 2,29'],
    C: ['6,1 17,1 17,8 12,12 12,5 8,5 6,7 6,22 11,22 12,21 12,18 17,14 17,23 14,26 1,26 1,7'],
    H: ['2,4 7,0 7,12 13,12 13,4 18,0 18,23 13,28 13,16 7,16 7,25 2,29 2,16 0,16 0,14 2,12'],
    T: ['4,1 20,1 20,4 17,7 17,5 13,5 13,24 8,29 8,5 4,5 0,9 0,5']
  };
  const canvas = $('#heroWordmark');
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const word = $('#heroTitle span').textContent.toUpperCase();
  const widths = { A:20, L:18, C:20, H:21, T:21 };
  canvas.width = [...word].reduce((sum, letter) => sum + widths[letter], 0);
  canvas.height = 30;
  const tones = ['#d4d4d4', '#afafaf', '#8d8d8d', '#5a5a5a', '#2f2f2f'];
  const pixels = [];
  let offset = 0;
  for (const letter of word) {
    const path = new Path2D();
    for (const outline of outlines[letter]) {
      outline.split(' ').forEach((pair, i) => {
        const [x,y] = pair.split(',').map(Number);
        if (i === 0) path.moveTo(x,y);
        else path.lineTo(x,y);
      });
      path.closePath();
    }
    for (let y=0; y<30; y++) {
      for (let x=0; x<widths[letter]; x++) {
        if (!ctx.isPointInPath(path,x+0.5,y+0.5,'evenodd')) continue;
        // Sample the reference's 5:2:4:3:5 horizontal bands on the glyph grid.
        const row = (y+0.5) / canvas.height * 19;
        const band = row < 5 ? 0 : row < 7 ? 1 : row < 11 ? 2 : row < 14 ? 3 : 4;
        const column = offset+x;
        let start = column/canvas.width*310 + Math.random()*270;
        if (style === 'ripple') {
          start = Math.max(Math.abs(2*column/canvas.width-1), Math.abs(2*y/canvas.height-1)*0.62)*670;
        } else if (style === 'weave') {
          start = (y%2 ? 1-column/canvas.width : column/canvas.width)*490 + (y%2)*155;
        } else if (style === 'tiles') {
          start = ((Math.floor(column/5)*17 + Math.floor(y/5)*29)%37)*12;
        }
        pixels.push({x:offset+x, y, tone:tones[band], start});
      }
    }
    offset += widths[letter];
  }
  canvas.hidden = false;
  return elapsed => {
    ctx.clearRect(0,0,canvas.width,canvas.height);
    for (const p of pixels) {
      if (elapsed < p.start) continue;
      const age = elapsed-p.start;
      const lift = style === 'tiles' ? Math.round(7*Math.max(0,1-age/270)**2) : 0;
      ctx.fillStyle = style === 'ripple' && age<85 ? '#afafaf' : p.tone;
      ctx.fillRect(p.x,p.y-lift,1,1);
    }
  };
}

function launchIntro() {
  const splash = $('.launch-screen');
  const workspace = $('#workspace');
  const canvas = $('#heroArt');
  const ctx = canvas.getContext('2d');
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  if (!ctx || motion.matches) { splash.remove(); return; }
  const style = pickIntroStyle();
  splash.dataset.effect = style;
  let paintWordmark = drawWordmark(style);
  workspace.inert = true;
  let frame;
  function finish() {
    cancelAnimationFrame(frame);
    motion.removeEventListener('change', finish);
    document.removeEventListener('keydown', skip);
    workspace.inert = false;
    splash.remove();
  }
  function skip(event) { if (event.key === 'Escape') finish(); }
  document.addEventListener('keydown', skip);
  splash.addEventListener('click', finish, {once:true});
  motion.addEventListener('change', finish);
  canvas.width = canvas.clientWidth;
  canvas.height = canvas.clientHeight;
  const pixels = [];
  const grid = 14;
  for (let y = 0; y < canvas.height; y += grid) {
    for (let x = 0; x < canvas.width; x += grid) {
      const edge = Math.max(Math.abs(2*x/canvas.width-1), Math.abs(2*y/canvas.height-1));
      if (Math.random() > edge**3 * 0.48) continue;
      let delay = Math.random()*1050;
      if (style === 'ripple') delay = edge*920 + Math.random()*50;
      if (style === 'weave') delay = ((y/grid)%2 ? 1-x/canvas.width : x/canvas.width)*820 + Math.random()*70;
      if (style === 'tiles') delay = Math.floor(Math.random()*9)*90;
      pixels.push({x, y, start: delay, size: Math.random()<0.2?6:3,
                   tone: Math.floor(32 + Math.random()*80)});
    }
  }
  const start = performance.now();
  function draw(now) {
    const t = now-start;
    if (paintWordmark) {
      paintWordmark(t);
      if (t >= 800) paintWordmark = null;
    }
    ctx.clearRect(0,0,canvas.width,canvas.height);
    for (const p of pixels) {
      if (t < p.start) continue;
      const age = t-p.start;
      const wave = style === 'ripple' ? 1+0.6*Math.max(0,1-Math.abs(age-150)/150) : 1;
      const gray = Math.round(p.tone * Math.min(1,age/200)*wave);
      ctx.fillStyle = 'rgb('+gray+' '+gray+' '+gray+')';
      const drift = Math.max(0,1-age/450)**2 * grid*2;
      const dx = style === 'weave' ? Math.round(((p.y/grid)%2 ? drift : -drift)) : 0;
      const dy = style === 'tiles' ? -Math.round(drift) : 0;
      ctx.fillRect(p.x+dx,p.y+dy,p.size,p.size);
    }
    splash.style.opacity = String(Math.min(1, Math.max(0,(2850-t)/440)));
    if (t < 2850) frame=requestAnimationFrame(draw);
    else finish();
  }
  frame=requestAnimationFrame(draw);
}

launchIntro();
