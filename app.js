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
function drawWordmark() {
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
        const band = y < 6 ? 0 : y < 12 ? 1 : y < 19 ? 2 : y < 26 ? 3 : 4;
        ctx.fillStyle = tones[band];
        ctx.fillRect(offset+x,y,1,1);
      }
    }
    offset += widths[letter];
  }
  canvas.hidden = false;
}

function animateHero() {
  const canvas = $('#heroArt');
  const context = canvas.getContext('2d');
  if (!context) return;

  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  const toggle = $('#heroMotion');
  const shades = ['#202020', '#2f2f2f', '#2f2f2f', '#5a5a5a', '#5a5a5a', '#8d8d8d'];
  let pixels = [];
  let visible = false;
  let paused = false;
  let frame = 0;
  let elapsed = 0;
  let previousTime = 0;

  function draw(time) {
    context.clearRect(0, 0, canvas.width, canvas.height);
    for (const pixel of pixels) {
      const wave = Math.sin(pixel.phase + time + pixel.y / 51);
      const shimmer = Math.cos(pixel.phase / 4 - time * 0.44 + pixel.x / 89);
      const light = pixel.density * (wave * 0.54 + shimmer * 0.3 + 0.27);
      if (light <= 0.16) continue;
      context.fillStyle = shades[Math.min(shades.length - 1, Math.floor(light * 6))];
      context.fillRect(pixel.x, pixel.y, pixel.size, pixel.size);
    }
  }

  function resize() {
    canvas.width = canvas.clientWidth;
    canvas.height = canvas.clientHeight;
    pixels = [];
    const spacing = Math.round(Math.max(13, Math.min(canvas.width / 86, 22)));
    const columns = Math.ceil(canvas.width / spacing);
    const rows = Math.ceil(canvas.height / spacing);

    // Concentrate the moving field along the edges so the heading stays legible.
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < columns; col++) {
        const x = (col + 0.5) / columns * 2 - 1;
        const y = (row + 0.5) / rows * 2 - 1;
        const corners = Math.abs(x) ** 2 * (0.23 + 0.77 * Math.abs(y) ** 2);
        const density = Math.max(corners, Math.abs(y) ** 8 * 0.4);
        if (density < 0.16) continue;
        const seed = (col * 13 + row * 17 + col * row * 29) % 101;
        pixels.push({x: col * spacing + 3, y: row * spacing + 3, size: Math.floor(spacing / 2),
          phase: seed * 0.69, density});
      }
    }
    draw(elapsed);
  }

  function tick(time) {
    if (!previousTime) previousTime = time;
    const delta = time - previousTime;
    if (delta >= 72) {
      elapsed += Math.min(delta, 150) / 1250;
      previousTime = time;
      draw(elapsed);
    }
    frame = requestAnimationFrame(tick);
  }

  function syncAnimation() {
    const playing = visible && !document.hidden && !motion.matches && !paused;
    if (playing && !frame) {
      previousTime = 0;
      frame = requestAnimationFrame(tick);
    } else if (!playing && frame) {
      cancelAnimationFrame(frame);
      frame = 0;
    }

    toggle.hidden = motion.matches;
    const label = paused ? 'Resume background animation' : 'Pause background animation';
    toggle.setAttribute('aria-label', label);
    toggle.title = label;
    toggle.firstElementChild.textContent = paused ? '▶' : 'Ⅱ';
  }

  toggle.onclick = () => { paused = !paused; syncAnimation(); };
  motion.addEventListener('change', syncAnimation);
  document.addEventListener('visibilitychange', syncAnimation);
  new ResizeObserver(resize).observe(canvas);
  new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    syncAnimation();
  }).observe(canvas);
  syncAnimation();
}

drawWordmark();
animateHero();
