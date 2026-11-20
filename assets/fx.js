// 배경 세계: 반짝이는 별, 흐르는 리본, 입자 꼬리를 남기는 혜성, 탭할 때 터지는 별, 카드 기울기
(() => {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const PAL = ['#ffe81a', '#ff4fd8', '#2ee6ff', '#8cff4a', '#ff9a2e', '#a084ff'];
  const sky = document.getElementById('sky'), sc = sky.getContext('2d');
  const fx = document.getElementById('fx'), fc = fx.getContext('2d');
  let W = 0, H = 0, DPR = 1;
  const rand = (a, b) => a + Math.random() * (b - a);

  function size() {
    DPR = Math.min(2, window.devicePixelRatio || 1);
    W = innerWidth; H = innerHeight;
    for (const c of [sky, fx]) { c.width = Math.round(W * DPR); c.height = Math.round(H * DPR); }
    sc.setTransform(DPR, 0, 0, DPR, 0, 0);
    fc.setTransform(DPR, 0, 0, DPR, 0, 0);
  }

  // 오목한 네 꼭지 별
  function starPath(ctx, x, y, r, rot) {
    const k = r * 0.16, c = Math.cos(rot), s = Math.sin(rot);
    const P = (px, py) => [x + px * c - py * s, y + px * s + py * c];
    ctx.beginPath();
    ctx.moveTo(...P(0, -r));
    ctx.quadraticCurveTo(...P(k, -k), ...P(r, 0));
    ctx.quadraticCurveTo(...P(k, k), ...P(0, r));
    ctx.quadraticCurveTo(...P(-k, k), ...P(-r, 0));
    ctx.quadraticCurveTo(...P(-k, -k), ...P(0, -r));
    ctx.closePath();
  }

  /* ---------- 하늘 ---------- */
  let sparkles = [];
  const ribbons = [
    { y: .2, amp: 38, f: .006, sp: .00028, th: 70, c: PAL[1], a: .13 },
    { y: .55, amp: 46, f: .0045, sp: -.0002, th: 90, c: PAL[2], a: .1 },
    { y: .85, amp: 30, f: .007, sp: .00034, th: 60, c: PAL[0], a: .1 },
  ];
  const comets = [];
  let nextComet = 1200;

  function seed() {
    const n = Math.round(Math.min(70, (W * H) / 11000));
    sparkles = Array.from({ length: n }, () => ({
      x: Math.random() * W, y: Math.random() * H,
      r: rand(1.2, 3.6), ph: Math.random() * 6.28, sp: rand(.0008, .0024),
      vy: rand(-.006, -.018), c: Math.random() < .55 ? '#ffffff' : PAL[(Math.random() * PAL.length) | 0],
    }));
  }

  function spawnComet() {
    const fromLeft = Math.random() < .5;
    const ang = rand(.25, .55) * (fromLeft ? 1 : -1);
    const speed = rand(.32, .5);
    const c = PAL[(Math.random() * PAL.length) | 0];
    const dots = Array.from({ length: 90 }, () => ({ p: Math.random(), j: (Math.random() - .5) * 2, r: rand(.6, 1.8) }));
    comets.push({
      x: fromLeft ? -60 : W + 60, y: rand(-40, H * .5),
      vx: Math.cos(ang) * speed * (fromLeft ? 1 : -1), vy: Math.abs(Math.sin(ang)) * speed,
      c, c2: PAL[(PAL.indexOf(c) + 2) % PAL.length], r: rand(10, 18), rot: 0, len: rand(160, 260), dots,
    });
  }

  function drawSky(t, dt) {
    sc.clearRect(0, 0, W, H);
    const sy = window.scrollY || 0;

    // 깊이감을 주는 큰 빛 덩어리
    const g1 = sc.createRadialGradient(W * .15 + Math.sin(t * .0002) * 40, H * .1, 0, W * .15, H * .1, Math.max(W, H) * .7);
    g1.addColorStop(0, 'rgba(120, 60, 255, .28)'); g1.addColorStop(1, 'rgba(120, 60, 255, 0)');
    sc.fillStyle = g1; sc.fillRect(0, 0, W, H);
    const g2 = sc.createRadialGradient(W * .9, H * .85 + Math.cos(t * .00025) * 40, 0, W * .9, H * .85, Math.max(W, H) * .6);
    g2.addColorStop(0, 'rgba(255, 60, 190, .18)'); g2.addColorStop(1, 'rgba(255, 60, 190, 0)');
    sc.fillStyle = g2; sc.fillRect(0, 0, W, H);

    // 물결 리본
    for (const rb of ribbons) {
      const base = rb.y * H - sy * .08;
      sc.beginPath();
      for (let x = -20; x <= W + 20; x += 16) {
        const y = base + Math.sin(x * rb.f + t * rb.sp * 6) * rb.amp;
        x === -20 ? sc.moveTo(x, y) : sc.lineTo(x, y);
      }
      for (let x = W + 20; x >= -20; x -= 16) {
        const y = base + rb.th + Math.sin(x * rb.f * 1.3 + t * rb.sp * 5 + 1.2) * rb.amp * .7;
        sc.lineTo(x, y);
      }
      sc.closePath();
      const lg = sc.createLinearGradient(0, 0, W, 0);
      lg.addColorStop(0, rb.c + '00'); lg.addColorStop(.5, rb.c + Math.round(rb.a * 255).toString(16).padStart(2, '0')); lg.addColorStop(1, rb.c + '00');
      sc.fillStyle = lg; sc.fill();
    }

    // 반짝이
    for (const s of sparkles) {
      s.y += s.vy * dt; if (s.y < -10) { s.y = H + 10; s.x = Math.random() * W; }
      const a = .25 + .75 * Math.abs(Math.sin(t * s.sp + s.ph));
      sc.globalAlpha = a;
      sc.fillStyle = s.c;
      starPath(sc, s.x, s.y - sy * .03, s.r * (.7 + a * .6), t * s.sp * .5);
      sc.fill();
    }
    sc.globalAlpha = 1;

    // 혜성: 머리는 별, 꼬리는 흩뿌린 입자
    if (!reduce) {
      nextComet -= dt;
      if (nextComet <= 0 && comets.length < 2) { spawnComet(); nextComet = rand(2600, 5200); }
    }
    for (let i = comets.length - 1; i >= 0; i--) {
      const k = comets[i];
      k.x += k.vx * dt; k.y += k.vy * dt; k.rot += dt * .004;
      const sp = Math.hypot(k.vx, k.vy), dx = -k.vx / sp, dy = -k.vy / sp, nx = -dy, ny = dx;
      for (const d of k.dots) {
        const px = k.x + dx * d.p * k.len + nx * d.j * d.p * 26 + (Math.random() - .5) * 2;
        const py = k.y + dy * d.p * k.len + ny * d.j * d.p * 26 + (Math.random() - .5) * 2;
        sc.globalAlpha = (1 - d.p) * .85;
        sc.fillStyle = d.p < .45 ? k.c : k.c2;
        sc.fillRect(px, py, d.r, d.r);
      }
      sc.globalAlpha = 1;
      sc.save();
      sc.shadowColor = k.c; sc.shadowBlur = 24;
      sc.fillStyle = k.c;
      starPath(sc, k.x, k.y, k.r, k.rot);
      sc.fill();
      sc.restore();
      if (k.x < -400 || k.x > W + 400 || k.y > H + 400) comets.splice(i, 1);
    }
  }

  /* ---------- 탭 별 터짐 ---------- */
  const parts = [];
  function burst(x, y, n = 12) {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + rand(-.2, .2), v = rand(.12, .32);
      parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 1, r: rand(3, 6), rot: rand(0, 6), vr: rand(-.01, .01), c: PAL[(Math.random() * PAL.length) | 0] });
    }
  }
  function drawFx(dt) {
    fc.clearRect(0, 0, W, H);
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      p.x += p.vx * dt; p.y += p.vy * dt; p.vy += .0004 * dt; p.vx *= .985; p.vy *= .985;
      p.rot += p.vr * dt; p.life -= dt / 650;
      if (p.life <= 0) { parts.splice(i, 1); continue; }
      fc.globalAlpha = p.life;
      fc.fillStyle = p.c;
      starPath(fc, p.x, p.y, p.r * (.5 + p.life * .5), p.rot);
      fc.fill();
    }
    fc.globalAlpha = 1;
  }

  /* ---------- 루프 ---------- */
  let last = performance.now(), running = true;
  function loop(now) {
    const dt = Math.min(48, now - last); last = now;
    drawSky(now, reduce ? 0 : dt);
    if (parts.length) drawFx(dt); else if (fx._dirty) { fc.clearRect(0, 0, W, H); fx._dirty = false; }
    if (parts.length) fx._dirty = true;
    if (running && !reduce) requestAnimationFrame(loop);
  }
  size(); seed();
  addEventListener('resize', () => { size(); seed(); if (reduce) loop(performance.now()); });
  document.addEventListener('visibilitychange', () => {
    running = !document.hidden;
    if (running && !reduce) { last = performance.now(); requestAnimationFrame(loop); }
  });
  loop(performance.now());

  if (!reduce) {
    document.addEventListener('pointerdown', e => burst(e.clientX, e.clientY), { passive: true });

    // 마우스가 있는 기기에서는 카드가 포인터 쪽으로 살짝 기운다
    if (matchMedia('(hover: hover) and (pointer: fine)').matches) {
      let cur = null;
      document.addEventListener('pointermove', e => {
        const el = e.target.closest('.tilt');
        if (cur && cur !== el) { cur.style.removeProperty('--rx'); cur.style.removeProperty('--ry'); }
        cur = el;
        if (!el) return;
        const r = el.getBoundingClientRect();
        const px = (e.clientX - r.left) / r.width - .5, py = (e.clientY - r.top) / r.height - .5;
        el.style.setProperty('--ry', `${px * 7}deg`);
        el.style.setProperty('--rx', `${-py * 7}deg`);
      }, { passive: true });
    }
  }

  window.FX = { burst, starPath };
})();
