/* ===== 彩虹石 · 网格取样渲染器 (Rainbow Stone Mesh) =====
 * 思路同 Illustrator 渐变网格:每颗石头是一张 3×3 的取样网格(从实拍手串上取色),
 * 在网格间做平滑插值,再用种子让网格线轻微弯曲、颜色轻微抖动,
 * 最后叠加该石种特有的纹理(松石铁线、菩提斑点、青金金星、蜜蜡流纹、檀木木纹、雕刻凹坑…)。
 * 每颗珠子种子不同 → 每颗都不一样,不会死板。
 * 多线程:Web Worker 池 + OffscreenCanvas 并行渲染;IndexedDB 缓存纹理,再次打开秒出。不支持时自动退回主线程。
 * 按屏幕像素比 ×1.5 超采样渲染(最高 3 倍),纹理按真实像素密度生成,放大后依然清晰。
 *
 * 用法:
 *   <span class="bead" data-stone="teal"></span>                 珠子
 *   <button class="mesh-slab" data-stone="lapis" data-soft=".6"> 按钮/卡片(soft 越大越柔和)
 *   可选: data-seed="7"  data-texture="carve|print|crystal|metal|turq|veins|dots|pyrite|swirl|lines|rings|frost|none"
 *   <div data-strand="nanhong,coral,amber,..." data-spacer="4" data-size="18"></div>  自动串珠
 *   RainbowStone.paint()           扫描页面上色(加载时自动执行,窗口尺寸变化会按新尺寸重绘;异步分批渲染)
 *   RainbowStone.mesh(name, cssW, cssH, {seed,soft,texture,bead})  返回 canvas,可直接画进自己的 canvas
 *   RainbowStone.color('teal','hi'|'base'|'lo')   取单色(图表用)
 */
(function (global) {
  /* ===== 渲染内核:纯计算,不碰 DOM —— 同一份代码既在主线程跑,也被序列化进 Worker 里跑 ===== */
  function CORE() {
  const mk = () => typeof OffscreenCanvas !== "undefined" ? new OffscreenCanvas(1, 1) : document.createElement("canvas");
  // 每行从上到下,每列从左到右;光源默认在左上
  const MESH = {
    nanhong:  { g: [["#D8484A","#B82A2C","#9E1B22"],["#C13A2A","#A31E24","#861519"],["#9A1C20","#7A1218","#5E0E14"]], t: "none" },
    coral:    { g: [["#FFB978","#F79445","#E8742E"],["#F58A3A","#EC7428","#D65E1F"],["#E06A2A","#C9531E","#A8421A"]], t: "print" },
    rose:     { g: [["#EDC3BE","#E3A5A6","#D98A8E"],["#E0A0A2","#D48589","#C47277"],["#CF8084","#BC6A70","#A65A62"]], t: "frost" },
    peach:    { g: [["#F8CDB6","#F2B09A","#E9967E"],["#EFA893","#E48D7A","#D07563"],["#DA8676","#C8705F","#B05D52"]], t: "none" },
    amber:    { g: [["#FBE7A0","#F2C54A","#E6AE2E"],["#F4CE5E","#E3A21C","#D08E14"],["#E2A52C","#C98612","#A96D0C"]], t: "swirl" },
    butter:   { g: [["#FFF8D6","#FBF2C0","#F4E07A"],["#F6E68C","#F4E07A","#E8CB55"],["#F0D66A","#E3C04A","#CFA736"]], t: "swirl" },
    bone:     { g: [["#FFFBEE","#F6EEDA","#EDE3CC"],["#F3EAD2","#EADFC3","#E0D2B2"],["#E6DABD","#D9CBA7","#CDBE98"]], t: "lines" },
    bodhi:    { g: [["#EEEBC6","#DDDFA8","#C9CF8C"],["#E0E0AE","#CBD08F","#B7BF78"],["#CDD196","#B4BB76","#9CA35E"]], t: "dots" },
    mint:     { g: [["#D2F2D8","#BDEBC6","#9FE0B5"],["#B4E6C0","#9FDDB2","#86CFA2"],["#94D3A8","#7BC89C","#6DAF8E"]], t: "turq" },
    apple:    { g: [["#C2DC6E","#9CC23A","#86B832"],["#A8D050","#8CC43E","#6FA834"],["#88BC3E","#6FA02E","#557F24"]], t: "turq" },
    olive:    { g: [["#A8BE4A","#8FA636","#7F9A2A"],["#95AE3E","#7F9A2A","#6A8422"],["#77922A","#5F7A1E","#4C6418"]], t: "none" },
    teal:     { g: [["#7FD6CD","#47C0B8","#2FA79D"],["#4CB9AF","#2FA79D","#1E8A84"],["#2A968E","#1E8A84","#156A66"]], t: "turq" },
    sky:      { g: [["#C4F1F5","#87E1EA","#5ACDDB"],["#8ADDE8","#5ACDDB","#3DB0C4"],["#5CC4D6","#3DB0C4","#2A90A3"]], t: "turq" },
    oilgreen: { g: [["#6AA84A","#4C8C32","#3A7626"],["#52923A","#33701F","#285F18"],["#3A7A28","#255816","#163A0E"]], t: "turq" },   // 老油绿
    rapeseed: { g: [["#F1F4B8","#DDE68A","#CFDB6A"],["#E2EA92","#CCD968","#B8C952"],["#C6D45E","#AEBF46","#8C9C32"]], t: "turq" },   // 菜籽黄
    iceblue:  { g: [["#D4EEFF","#86C8FF","#4CA2FF"],["#74BCFF","#2F8DFF","#1C72EC"],["#3E96FF","#1A6CE6","#0C4CB8"]], t: "crystal" },   // 冰魄蓝
    hazeblue: { g: [["#9AA9C6","#6E81A6","#51658C"],["#7486AA","#4E6188","#3E5076"],["#526690","#39496E","#23304D"]], t: "turq" },   // 雾霾蓝
    lapis:    { g: [["#4A6FD8","#2E54C4","#1E3A9C"],["#3050BA","#1E3A9C","#172E84"],["#1E3A9C","#152A78","#0F1F5C"]], t: "pyrite" },
    sugilite: { g: [["#B488DC","#8C4FC0","#6A2E9C"],["#9160C6","#6A2E9C","#5A2688"],["#6E36A8","#4F2280","#3A175E"]], t: "frost" },
    onyx:     { g: [["#6B5A52","#3A2E2A","#1E1714"],["#3A2E2A","#1E1714","#140F0D"],["#1E1714","#110C0A","#060403"]], t: "none" },
    sandal:   { g: [["#E0B88E","#D2A67E","#C49870"],["#D0A37A","#B98A62","#A87A55"],["#B08058","#8E6446","#7A5439"]], t: "rings" },
    gold:     { g: [["#FFF6C4","#F6DA78","#E2B650"],["#F4D46A","#E0B24A","#C99A38"],["#DDB04C","#C89A3C","#AE8434"]], t: "metal" },  /* 暗部提亮,更自然 */
  };
  const RAINBOW = ["nanhong","coral","rose","amber","butter","bone","mint","apple","teal","sky","lapis","sugilite"];

  const hex = h => [1,3,5].map(i => parseInt(h.slice(i, i+2), 16));
  const clamp = v => v < 0 ? 0 : v > 255 ? 255 : v;
  const ss = t => t * t * (3 - 2 * t);
  function rng(seed) { let a = (seed * 2654435761) >>> 0; return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

  // 渲染倍率:按屏幕像素比再超采样,放大(双指缩放)也清晰
  const OVERSAMPLE = () => Math.min(3, Math.max(2, ((typeof devicePixelRatio !== "undefined" && devicePixelRatio) || 1) * 1.5));
  const MAX_SIDE = 1400;
  // 各石种的"云雾"强度(石头内部的明暗斑驳)
  const MOTTLE = { oilgreen: 10, rapeseed: 8, iceblue: 7, hazeblue: 9, teal: 10, sky: 9, mint: 9, apple: 10, olive: 7, lapis: 8, sugilite: 9, amber: 8, butter: 6, bone: 4, bodhi: 6, nanhong: 7, coral: 6, rose: 7, peach: 6, onyx: 5, sandal: 5, gold: 2 };

  // 平滑值噪声(多倍频),用来做石头内部的云雾斑驳
  function valueNoise(w, h, cell, R) {
    const gw = Math.ceil(w / cell) + 2, gh = Math.ceil(h / cell) + 2, g = new Float32Array(gw * gh);
    for (let i = 0; i < g.length; i++) g[i] = R() * 2 - 1;
    return (x, y) => { const fx = x / cell, fy = y / cell, i = fx | 0, j = fy | 0, u = ss(fx - i), v = ss(fy - j);
      const a = g[j*gw+i], b = g[j*gw+i+1], c = g[(j+1)*gw+i], d = g[(j+1)*gw+i+1];
      return (a*(1-u)+b*u)*(1-v) + (c*(1-u)+d*u)*v; };
  }

  // 共享噪声贴片(只生成一次)
  const tiles = {};
  function tile(kind) {
    if (tiles[kind]) return tiles[kind];
    const cv = mk(); cv.width = cv.height = 128;
    const c = cv.getContext("2d"), im = c.createImageData(128, 128), d = im.data;
    for (let i = 0; i < d.length; i += 4) {
      if (kind === "grain") { const v = 128 + (Math.random() - .5) * 70; d[i] = d[i+1] = d[i+2] = v; d[i+3] = 255; }
      else { const on = Math.random() < .2; d[i] = d[i+1] = d[i+2] = 255; d[i+3] = on ? Math.random() * 60 : 0; }
    }
    c.putImageData(im, 0, 0); return (tiles[kind] = cv);
  }

  // 柔化绘制:用 shadowBlur 代替 ctx.filter(iOS Safari 兼容)
  function soft(ctx, blur, color, draw) {
    ctx.save(); ctx.shadowColor = color; ctx.shadowBlur = blur; ctx.shadowOffsetX = 20000;
    ctx.translate(-20000, 0); ctx.fillStyle = ctx.strokeStyle = color; draw(); ctx.restore();
  }

  /* 生成一张网格插值图
   * cssW/cssH:元素 CSS 尺寸;opt.bead:是否珠子(纹理按珠子大小缩放,否则按真实像素密度铺满) */
  function mesh(name, cssW, cssH, opt = {}) {
    const def = MESH[name] || MESH.bone;
    const seed = opt.seed ?? 1, sft = opt.soft ?? 0, R = rng(seed * 131 + name.length * 97 + name.charCodeAt(0));
    let px = opt.px || OVERSAMPLE();
    px = Math.min(px, MAX_SIDE / Math.max(cssW, cssH, 1));
    const w = Math.max(8, Math.round(cssW * px)), h = Math.max(8, Math.round(cssH * px));
    // 纹理单位:珠子=整颗珠子 96 单位;块面=约 0.8 CSS px 一个单位(大面积有更多细节,不是被放大的糊纹理)
    const s = opt.bead ? Math.max(w, h) / 96 : px * .8;
    const A = (w * h) / (s * s);                   // 以纹理单位计的面积

    const jit = 10 * (1 - sft);
    let G = def.g.map(r => r.map(c => hex(c).map(v => v + (R() - .5) * jit)));
    if (sft > 0) { const m = G[1][1]; G = G.map(r => r.map(c => c.map((v, k) => v + (m[k] - v) * sft))); }
    const f1 = 1 + R() * 2.2, f2 = 1 + R() * 2.2, p1 = R() * 6.28, p2 = R() * 6.28, amp = .09 + R() * .06;

    // ① 平滑层(网格插值 + 云雾)在半分辨率计算,再高质量放大 —— 这一层本来就是平滑的,不损失清晰度
    const bw = Math.max(4, Math.ceil(w / 2)), bh = Math.max(4, Math.ceil(h / 2)), bs = s / 2;
    const base = mk(); base.width = bw; base.height = bh;
    const bctx = base.getContext("2d"), img = bctx.createImageData(bw, bh), d = img.data;
    const n1 = valueNoise(bw, bh, 26 * bs, R), n2 = valueNoise(bw, bh, 8 * bs, R), n3 = valueNoise(bw, bh, 3 * bs, R);
    const mot = (MOTTLE[name] ?? 6) * (1 - sft * .6);
    const lo = G[2][2], hi = G[0][0], tex = opt.texture || def.t;
    for (let y = 0; y < bh; y++) {
      const v0 = y / (bh - 1);
      for (let x = 0; x < bw; x++) {
        let u = x / (bw - 1), v = v0;
        u += amp * Math.sin(v * f1 * 3.14 + p1) * u * (1 - u) * 4;
        v += amp * Math.sin(u * f2 * 3.14 + p2) * v * (1 - v) * 4;
        u = Math.min(.9999, Math.max(0, u)) * 2; v = Math.min(.9999, Math.max(0, v)) * 2;
        const i = u | 0, j = v | 0, fu = ss(u - i), fv = ss(v - j);
        const a = G[j][i], b = G[j][i+1], c = G[j+1][i], e = G[j+1][i+1];
        const t = (n1(x, y) * .6 + n2(x, y) * .3 + n3(x, y) * .1) * mot / 40, at = Math.abs(t), tint = t > 0 ? hi : lo, o = (y * bw + x) * 4;
        for (let k = 0; k < 3; k++) {
          const bv = (a[k]*(1-fu) + b[k]*fu)*(1-fv) + (c[k]*(1-fu) + e[k]*fu)*fv;
          d[o+k] = clamp(bv + (tint[k] - bv) * at);
        }
        d[o+3] = 255;
      }
    }
    bctx.putImageData(img, 0, 0);
    const cv = mk(); cv.width = w; cv.height = h;
    const ctx = cv.getContext("2d");
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = "high";
    ctx.drawImage(base, 0, 0, w, h);
    // ② 全分辨率颗粒(预生成的噪声贴片,平铺叠加) —— 放大时看到的是真实的细颗粒
    ctx.save(); ctx.globalAlpha = (tex === "crystal" ? .55 : tex === "metal" ? .15 : .9) * (1 - sft * .4); ctx.globalCompositeOperation = "soft-light";
    ctx.fillStyle = ctx.createPattern(tile("grain"), "repeat"); ctx.translate(R() * 128 | 0, R() * 128 | 0); ctx.fillRect(-128, -128, w + 256, h + 256); ctx.restore();
    if (tex === "frost") { ctx.save(); ctx.globalAlpha = 1 - sft * .6; ctx.fillStyle = ctx.createPattern(tile("frost"), "repeat"); ctx.fillRect(0, 0, w, h); ctx.restore(); }
    texture(ctx, tex, w, h, s, A, R, G, sft);
    return cv;
  }

  // 一条自然的"铁线":随机游走、粗细渐变、有晕、偶尔分叉
  function vein(ctx, x, y, ang, steps, wid, s, R, col, k, depth) {
    const pts = [[x, y]];
    for (let i = 0; i < steps; i++) { ang += (R() - .5) * .9; x += Math.cos(ang) * 2.2 * s; y += Math.sin(ang) * 2.2 * s; pts.push([x, y]); }
    soft(ctx, 2.2 * s, `rgba(${col},${.16 * k})`, () => { ctx.lineWidth = wid * 2.4; ctx.beginPath(); pts.forEach((p, i) => i ? ctx.lineTo(...p) : ctx.moveTo(...p)); ctx.stroke(); });
    ctx.lineCap = "round";
    for (let i = 1; i < pts.length; i++) {
      const tp = Math.sin(Math.PI * i / pts.length);       // 两端细中间粗
      ctx.strokeStyle = `rgba(${col},${(.45 + R() * .35) * k})`; ctx.lineWidth = Math.max(.35 * s, wid * (.3 + tp * .9) * (.7 + R() * .6));
      ctx.beginPath(); ctx.moveTo(...pts[i-1]); ctx.lineTo(...pts[i]); ctx.stroke();
      if (depth < 2 && R() < .06) vein(ctx, ...pts[i], ang + (R() > .5 ? 1 : -1) * (.6 + R()), steps * .45 | 0, wid * .6, s, R, col, k, depth + 1);
    }
  }
  function speck(ctx, x, y, r, R) {       // 不规则小颗粒
    const n = 4 + (R() * 3 | 0); ctx.beginPath();
    for (let i = 0; i < n; i++) { const a = i / n * 6.283 + R() * .6, rr = r * (.6 + R() * .6); i ? ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr) : ctx.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
    ctx.closePath(); ctx.fill();
  }

  function texture(ctx, t, w, h, s, A, R, G, sft) {
    const k = 1 - sft * .65, per = A / 9216;   // per = 相当于几颗 96 单位珠子的面积
    const rgb = c => c.map(v => clamp(v) | 0).join(",");
    ctx.save();
    if (t === "veins") {
      const col = R() < .5 ? "70,52,36" : "52,40,30", n = Math.round((2 + R() * 3) * Math.max(1, per * .8));
      for (let i = 0; i < n; i++) vein(ctx, R() * w, R() * h, R() * 6.28, 16 + R() * 26 | 0, (.5 + R() * .9) * s, s, R, col, k, 0);
      for (let i = 0; i < 1 + per; i++) vein(ctx, R() * w, R() * h, R() * 6.28, 10 + R() * 14 | 0, .45 * s, s, R, "255,255,250", k * .7, 1);
      for (let i = 0; i < A / 320; i++) { ctx.fillStyle = `rgba(${col},${(.25 + R() * .4) * k})`; speck(ctx, R() * w, R() * h, (.3 + R() * .9) * s, R); }
      for (let i = 0; i < A / 500; i++) { ctx.fillStyle = `rgba(255,255,255,${.25 * k})`; speck(ctx, R() * w, R() * h, (.3 + R() * .5) * s, R); }
    } else if (t === "print") {                          // 珊瑚:极淡的指纹状同心细纹(生长纹)
      const dk = rgb(G[2][2]), lt = "255,244,232";
      const nc = Math.max(1, Math.round((1 + R() * 1.5) * Math.max(1, per * .6)));
      ctx.lineCap = "round";
      for (let ci = 0; ci < nc; ci++) {
        const cx = R() * w, cy = R() * h, sq = .65 + R() * .3, rot = R() * 3.14, ph = R() * 6.28, ph2 = R() * 6.28;
        const maxR = Math.hypot(w, h) * (.5 + R() * .3), gap = (1.15 + R() * .35) * s;
        for (let r = gap, ri = 0; r < maxR; r += gap * (.9 + R() * .2), ri++) {
          const seg = Math.max(24, Math.min(360, r / s * 1.2 | 0));
          ctx.strokeStyle = ri % 2 ? `rgba(${dk},${(.05 + R() * .04) * k})` : `rgba(${lt},${(.06 + R() * .04) * k})`;
          ctx.lineWidth = (.3 + R() * .25) * s; ctx.beginPath(); let pen = false;
          for (let i = 0; i <= seg; i++) {
            const th = i / seg * 6.2832;
            if (R() < .015) { pen = false; continue; }          // 纹线断点,像真实指纹的端点
            const rr = r * (1 + .07 * Math.sin(3 * th + ph + r / (40 * s)) + .03 * Math.sin(7 * th + ph2));
            const ex = Math.cos(th) * rr, ey = Math.sin(th) * rr * sq;
            const x = cx + ex * Math.cos(rot) - ey * Math.sin(rot), y = cy + ex * Math.sin(rot) + ey * Math.cos(rot);
            pen ? ctx.lineTo(x, y) : ctx.moveTo(x, y); pen = true;
          }
          ctx.stroke();
        }
      }
    } else if (t === "metal") {                          // 金属:高反差环境反射带 + 锐利高光线
      const lg = (x0, y0, x1, y1, stops) => { const g = ctx.createLinearGradient(x0, y0, x1, y1); stops.forEach(([o, col]) => g.addColorStop(o, col)); return g; };
      if (h > w * 1.15) {                                   // 金隔片(侧视的金属圆片):沿高度方向是圆柱面反射
        ctx.fillStyle = lg(0, 0, 0, h, [[0, "#A07A30"], [.1, "#C99C42"], [.24, "#F4D570"], [.33, "#FFF8D6"], [.38, "#FFFDF2"], [.46, "#F2CE62"], [.6, "#C79A40"], [.7, "#B8893A"], [.82, "#DDB356"], [.91, "#F8E294"], [1, "#9C7630"]]);
        ctx.fillRect(0, 0, w, h);
        ctx.globalCompositeOperation = "multiply";          // 两个侧面略暗,出厚度
        ctx.fillStyle = lg(0, 0, w, 0, [[0, "rgba(214,178,112,1)"], [.22, "rgba(255,255,255,1)"], [.78, "rgba(255,255,255,1)"], [1, "rgba(206,168,104,1)"]]); ctx.fillRect(0, 0, w, h);
        ctx.globalCompositeOperation = "screen";
        ctx.fillStyle = lg(0, 0, 0, h, [[.3, "rgba(255,255,255,0)"], [.36, `rgba(255,255,255,${.85 * k})`], [.4, "rgba(255,255,255,0)"]]); ctx.fillRect(w * .2, 0, w * .6, h);
      } else {                                              // 金珠/金色块面:天空亮、地平线暗、下方暖色反光
        const isB = Math.abs(w - h) < 2, f = isB ? 1 : .35;   // 块面(按钮/卡片)只要柔和的拉丝金属感,不要强烈地平线
        ctx.globalCompositeOperation = "overlay";
        ctx.fillStyle = lg(0, 0, 0, h, [[0, `rgba(255,250,220,${.9 * f})`], [.38, `rgba(255,240,170,${.6 * f})`], [.52, `rgba(60,35,0,${.85 * f})`], [.6, `rgba(120,80,10,${.5 * f})`], [.85, `rgba(255,220,120,${.7 * f})`], [1, `rgba(80,50,5,${.8 * f})`]]);
        ctx.fillRect(0, 0, w, h);
        ctx.globalCompositeOperation = "source-over";
        if (isB) { ctx.fillStyle = lg(0, 0, 0, h, [[.44, "rgba(255,255,255,0)"], [.48, `rgba(255,252,230,${.55 * k})`], [.5, "rgba(255,255,255,0)"]]); ctx.fillRect(0, 0, w, h); }
        else { ctx.globalCompositeOperation = "soft-light";              // 拉丝纹
          for (let y = 0; y < h; y += Math.max(1, .6 * s)) { ctx.fillStyle = `rgba(${R() < .5 ? "255,255,255" : "60,40,0"},${R() * .35})`; ctx.fillRect(0, y, w, Math.max(1, .5 * s)); } }
        if (Math.abs(w - h) < 2) { ctx.globalCompositeOperation = "multiply";
          const g = ctx.createRadialGradient(w / 2, h / 2, w * .3, w / 2, h / 2, w * .52); g.addColorStop(0, "#fff"); g.addColorStop(1, "#8A6214"); ctx.fillStyle = g; ctx.fillRect(0, 0, w, h); }
      }
      ctx.globalCompositeOperation = "source-over";
      for (let i = 0; i < A / 900; i++) { ctx.fillStyle = `rgba(255,255,240,${.6 * k})`; ctx.fillRect(R() * w, R() * h, .5 * s, .5 * s); }
    } else if (t === "crystal") {                        // 晶体:通透、边缘深、内部透光焦散、半透明冰絮
      const bead = Math.abs(w - h) < 2;
      const rg = (x, y, r0, r1, stops) => { const g = ctx.createRadialGradient(x, y, r0, x, y, r1); stops.forEach(([o, col]) => g.addColorStop(o, col)); ctx.fillStyle = g; ctx.fillRect(0, 0, w, h); };
      if (bead) {
        ctx.save(); ctx.globalCompositeOperation = "multiply";      // 边缘加深 → 有厚度的玻璃感
        rg(w * .5, h * .5, w * .28, w * .52, [[0, "rgba(255,255,255,1)"], [.7, "rgba(212,225,245,1)"], [1, "rgba(158,175,212,1)"]]);
        ctx.globalCompositeOperation = "screen";                    // 光穿过晶体,在高光对侧汇聚
        rg(w * .62, h * .7, 0, w * .4, [[0, `rgba(190,235,255,${.42 * k})`], [.45, `rgba(120,200,255,${.22 * k})`], [1, "rgba(80,160,255,0)"]]);
        soft(ctx, 3 * s, `rgba(225,246,255,${.35 * k})`, () => { ctx.lineWidth = 3.5 * s; ctx.lineCap = "round"; ctx.beginPath(); ctx.arc(w * .5, h * .5, w * .4, .35, 1.35); ctx.stroke(); });
        ctx.strokeStyle = `rgba(240,252,255,${.27 * k})`; ctx.lineWidth = .8 * s; ctx.beginPath(); ctx.arc(w * .5, h * .5, w * .42, .45, 1.2); ctx.stroke();
        ctx.restore();
      } else {
        ctx.save(); ctx.globalCompositeOperation = "screen";
        for (let i = 0; i < Math.max(2, per * .8); i++) { const x = R() * w, y = R() * h, r = (18 + R() * 30) * s;
          rg(x, y, 0, r, [[0, `rgba(170,225,255,${.22 * k})`], [1, "rgba(120,200,255,0)"]]); }
        ctx.restore();
      }
      for (let i = 0; i < Math.max(2, 2.5 * per); i++) { const x = R() * w, y = R() * h;   // 冰絮:半透明白雾
        soft(ctx, 4 * s, `rgba(235,248,255,${(.08 + R() * .07) * k})`, () => { ctx.beginPath(); ctx.ellipse(x, y, (5 + R() * 9) * s, (1.5 + R() * 3) * s, R() * 3, 0, 7); ctx.fill(); }); }
      for (let i = 0; i < A / 1500; i++) { ctx.fillStyle = `rgba(255,255,255,${.7 * k})`; ctx.beginPath(); ctx.arc(R() * w, R() * h, (.3 + R() * .35) * s, 0, 7); ctx.fill(); }
    } else if (t === "turq") {                           // 绿松石:无铁线,只有瓷感的浅色云斑和细小白点
      for (let i = 0; i < Math.max(2, 2 * per); i++) { const x = R() * w, y = R() * h;
        soft(ctx, 5 * s, `rgba(255,255,248,${.12 * k})`, () => { ctx.beginPath(); ctx.ellipse(x, y, (6 + R() * 10) * s, (3 + R() * 6) * s, R() * 3, 0, 7); ctx.fill(); }); }
      for (let i = 0; i < A / 380; i++) { ctx.fillStyle = `rgba(255,255,250,${(.18 + R() * .2) * k})`; speck(ctx, R() * w, R() * h, (.25 + R() * .45) * s, R); }
    } else if (t === "dots") {                           // 星月菩提
      for (let i = 0; i < Math.max(2, 3 * per); i++) { const x = R() * w, y = R() * h, r = (3 + R() * 4) * s;
        soft(ctx, 3 * s, `rgba(255,252,228,${.35 * k})`, () => { ctx.beginPath(); ctx.ellipse(x, y, r, r * (.7 + R() * .3), R() * 3, 0, 7); ctx.fill(); }); }
      for (let i = 0; i < A / 45; i++) { const x = R() * w, y = R() * h, r = (.35 + R() * .9) * s;
        ctx.fillStyle = `rgba(110,72,52,${.12 * k})`; ctx.beginPath(); ctx.arc(x, y, r * 1.8, 0, 7); ctx.fill();
        ctx.fillStyle = `rgba(${88 + R() * 30 | 0},${55 + R() * 18 | 0},${40 + R() * 12 | 0},${(.5 + R() * .45) * k})`; speck(ctx, x, y, r, R); }
      for (let i = 0; i < A / 30; i++) { ctx.fillStyle = `rgba(255,255,240,${.2 * k})`; ctx.fillRect(R() * w, R() * h, .5 * s, .5 * s); }
    } else if (t === "pyrite") {                         // 青金石
      for (let i = 0; i < Math.max(2, 2.5 * per); i++) { const x = R() * w, y = R() * h;
        soft(ctx, 4 * s, `rgba(215,225,250,${.22 * k})`, () => { ctx.beginPath(); ctx.ellipse(x, y, (5 + R() * 9) * s, (1.5 + R() * 3) * s, R() * 3, 0, 7); ctx.fill(); }); }
      for (let i = 0; i < A / 180; i++) { const x = R() * w, y = R() * h, r = (.3 + R() * .8) * s;
        ctx.fillStyle = `rgba(${150 + R() * 30 | 0},${115 + R() * 20 | 0},${40 + R() * 20 | 0},${.85 * k})`; speck(ctx, x, y, r, R);
        ctx.fillStyle = `rgba(255,240,170,${.9 * k})`; speck(ctx, x - r * .25, y - r * .25, r * .5, R); }
      for (let i = 0; i < A / 60; i++) { ctx.fillStyle = `rgba(160,180,255,${.18 * k})`; ctx.fillRect(R() * w, R() * h, .5 * s, .5 * s); }
    } else if (t === "swirl") {                          // 蜜蜡流纹
      const cream = "255,250,226", deep = rgb(G[2][2]);
      const band = (c, a, wd, bl) => { const p = [R() * w, R() * h, R() * w, R() * h, R() * w, R() * h, R() * w, R() * h];
        soft(ctx, bl * s, `rgba(${c},${a})`, () => { ctx.lineWidth = wd * s; ctx.lineCap = "round"; ctx.beginPath(); ctx.moveTo(p[0], p[1]); ctx.bezierCurveTo(...p.slice(2)); ctx.stroke(); });
        if (R() < .5) return; ctx.strokeStyle = `rgba(${c},${a * .22})`; ctx.lineWidth = .4 * s; ctx.beginPath(); ctx.moveTo(p[0], p[1] - wd * s * .4); ctx.bezierCurveTo(p[2], p[3] - wd * s * .4, p[4], p[5] - wd * s * .4, p[6], p[7] - wd * s * .4); ctx.stroke(); };
      for (let i = 0; i < (3 + R() * 3) * Math.max(1, per * .7); i++) band(cream, (.35 + R() * .3) * k, 3 + R() * 7, 3 + R() * 3);
      for (let i = 0; i < 1 + per * .5; i++) band(deep, .28 * k, 2 + R() * 3, 2);
      for (let i = 0; i < A / 700; i++) { ctx.fillStyle = `rgba(255,255,240,${.5 * k})`; ctx.beginPath(); ctx.arc(R() * w, R() * h, (.3 + R() * .6) * s, 0, 7); ctx.fill(); } // 小气泡
    } else if (t === "lines") {                          // 骨珠
      for (let i = 0; i < 26 * Math.max(1, Math.sqrt(per)); i++) { const x = R() * w; ctx.strokeStyle = `rgba(160,138,100,${(.08 + R() * .14) * k})`; ctx.lineWidth = (.25 + R() * .5) * s;
        ctx.beginPath(); ctx.moveTo(x, -2); ctx.bezierCurveTo(x + (R() - .5) * 8 * s, h * .33, x + (R() - .5) * 8 * s, h * .66, x + (R() - .5) * 6 * s, h + 2); ctx.stroke(); }
      for (let i = 0; i < A / 260; i++) { ctx.fillStyle = `rgba(150,125,90,${.35 * k})`; speck(ctx, R() * w, R() * h, (.2 + R() * .4) * s, R); }
    } else if (t === "rings") {                          // 老檀木
      const nL = 34 * Math.max(1, Math.sqrt(per)), ph = R() * 9;
      for (let i = 0; i < nL; i++) { const y = (i + R() * .6) / nL * h, dark = R() < .3;
        const path = () => { ctx.beginPath(); ctx.moveTo(-2, y); for (let x = 0; x <= w + 4 * s; x += 3 * s) ctx.lineTo(x, y + Math.sin(x / (14 * s) + ph + i * .15) * 2.5 * s + Math.sin(x / (5 * s) + i) * .5 * s); };
        if (dark) soft(ctx, 1.5 * s, `rgba(105,65,38,${.18 * k})`, () => { ctx.lineWidth = 2.5 * s; path(); ctx.stroke(); });
        ctx.strokeStyle = `rgba(${dark ? "95,58,34" : "120,80,50"},${(dark ? .35 : .12 + R() * .12) * k})`; ctx.lineWidth = (dark ? .7 : .35) * s; path(); ctx.stroke(); }
      for (let i = 0; i < A / 90; i++) { ctx.fillStyle = `rgba(80,50,30,${.3 * k})`; ctx.fillRect(R() * w, R() * h, (.8 + R() * 1.5) * s, .35 * s); }
    } else if (t === "carve") {                          // 雕刻珠:密集的小鼓包(左上亮、右下暗)+ 沟缝
      const dk = rgb(G[2][2].map(v => v * .55));
      for (let i = 0; i < A / 11; i++) {
        const x = R() * w, y = R() * h, r = (1.3 + R() * 1.8) * s;
        const gd = ctx.createRadialGradient(x - r * .35, y - r * .35, 0, x, y, r * 1.15);
        gd.addColorStop(0, `rgba(255,248,236,${.30 * k})`); gd.addColorStop(.45, `rgba(255,248,236,0)`);
        gd.addColorStop(.75, `rgba(${dk},0)`); gd.addColorStop(1, `rgba(${dk},${.38 * k})`);
        ctx.fillStyle = gd; ctx.beginPath(); ctx.ellipse(x, y, r * 1.15, r * (.85 + R() * .3), R() * 3, 0, 7); ctx.fill();
      }
      ctx.lineCap = "round";
      for (let i = 0; i < A / 60; i++) { let x = R() * w, y = R() * h, a = R() * 6.28;
        ctx.strokeStyle = `rgba(${dk},${(.25 + R() * .2) * k})`; ctx.lineWidth = (.35 + R() * .35) * s; ctx.beginPath(); ctx.moveTo(x, y);
        for (let j = 0; j < 3; j++) { a += (R() - .5) * 1.4; x += Math.cos(a) * 1.8 * s; y += Math.sin(a) * 1.8 * s; ctx.lineTo(x, y); } ctx.stroke(); }
    } else if (t === "frost") {                          // 磨砂
      for (let i = 0; i < A / 400; i++) { ctx.fillStyle = `rgba(255,255,255,${.35 * k})`; speck(ctx, R() * w, R() * h, (.3 + R() * .5) * s, R); }
      ctx.fillStyle = `rgba(${rgb(G[0][0])},${.1 * k})`; ctx.fillRect(0, 0, w, h);
    } else {                                              // 光面石:细微内含物,放大可见
      for (let i = 0; i < A / 600; i++) { ctx.fillStyle = `rgba(255,255,255,${.18 * k})`; speck(ctx, R() * w, R() * h, (.2 + R() * .4) * s, R); }
    }
    ctx.restore();
  }

  function color(name, which = "base") {
    const g = (MESH[name] || MESH.bone).g;
    return which === "hi" ? g[0][0] : which === "lo" ? g[2][2] : g[1][1];
  }

  return { MESH, RAINBOW, mesh, color, OVERSAMPLE };
  }

  const { MESH, RAINBOW, mesh, color, OVERSAMPLE } = CORE();
  const VERSION = "rs-" + CORE.toString().length;          // 内核代码一改,缓存自动失效

  /* ===== 多线程调度:Worker 池 ===== */
  const POOL_N = Math.max(2, Math.min(8, ((global.navigator && navigator.hardwareConcurrency) || 4) - 1));
  let pool;                                                  // undefined=未尝试, null=不可用(退回主线程)
  function makePool() {
    if (typeof Worker === "undefined" || typeof OffscreenCanvas === "undefined" || typeof Blob === "undefined") return null;
    try {
      const src = "const core=(" + CORE.toString() + ")();\n" +
        "self.onmessage=async e=>{const {key,args}=e.data;try{const cv=core.mesh(...args);const b=await cv.convertToBlob({type:'image/png'});" +
        "self.postMessage({key,url:new FileReaderSync().readAsDataURL(b)});}catch(err){self.postMessage({key,err:String(err&&err.message||err)});}};";
      const url = URL.createObjectURL(new Blob([src], { type: "text/javascript" }));
      const ws = [];
      for (let i = 0; i < POOL_N; i++) {
        const w = new Worker(url); w.job = null;
        w.onmessage = e => { const job = w.job; w.job = null;
          if (e.data.err) { failPool(e.data.err); if (job) queue.unshift(job); } else done(job, e.data.url);
          dispatch(); };
        w.onerror = ev => { ev.preventDefault && ev.preventDefault(); const job = w.job; w.job = null; if (job) queue.unshift(job); failPool("worker error"); dispatch(); };
        ws.push(w);
      }
      return ws;
    } catch (e) { return null; }
  }
  function failPool(msg) {
    if (!pool) return; console.warn("[RainbowStone] Worker 不可用,退回主线程:", msg);
    pool.forEach(w => { if (w.job) queue.unshift(w.job); w.terminate(); }); pool = null;
  }

  /* ===== 纹理缓存:内存 + IndexedDB ===== */
  const cache = new Map(), pending = new Map();
  let db = null;
  const dbReady = new Promise(res => {
    try { const rq = indexedDB.open("rainbow-stone-mesh", 1);
      rq.onupgradeneeded = () => rq.result.createObjectStore("tex");
      rq.onsuccess = () => { db = rq.result; res(); }; rq.onerror = () => res(); rq.onblocked = () => res();
    } catch (e) { res(); }
  });
  function dbGetMany(keys) {
    return dbReady.then(() => new Promise(res => {
      const out = new Map(); if (!db || !keys.length) return res(out);
      try { const st = db.transaction("tex", "readonly").objectStore("tex"); let n = keys.length;
        keys.forEach(k => { const r = st.get(VERSION + "|" + k); r.onsuccess = () => { if (r.result) out.set(k, r.result); if (!--n) res(out); }; r.onerror = () => { if (!--n) res(out); }; });
      } catch (e) { res(out); }
    }));
  }
  let putBuf = [], putT;
  function dbPut(k, v) {
    putBuf.push([k, v]); clearTimeout(putT);
    putT = setTimeout(() => { const b = putBuf; putBuf = []; if (!db) return;
      try { const st = db.transaction("tex", "readwrite").objectStore("tex"); b.forEach(([k, v]) => st.put(v, VERSION + "|" + k)); } catch (e) {} }, 400);
  }

  /* ===== 调度 ===== */
  let autoSeed = 1, queue = [], mainBusy = false;
  function apply(el, key, url) { if (el.dataset.rsKey === key) el.style.backgroundImage = `url(${url})`; }
  function done(job, url) {
    cache.set(job.key, url); dbPut(job.key, url);
    (pending.get(job.key) || []).forEach(el => apply(el, job.key, url)); pending.delete(job.key);
  }
  // 可见区域优先
  function prio(job) { const els = pending.get(job.key); if (!els || !els[0].isConnected) return 1e9;
    const r = els[0].getBoundingClientRect(), vh = global.innerHeight || 800; return r.bottom < 0 ? -r.bottom : r.top > vh ? r.top - vh : -1; }
  function dispatch() {
    if (pool === undefined) pool = makePool();
    if (pool) { for (const w of pool) { if (w.job) continue; const job = queue.shift(); if (!job) break; w.job = job; w.postMessage({ key: job.key, args: job.args }); } }
    else if (!mainBusy) mainPump();
  }
  function mainPump() {
    mainBusy = true; const t0 = performance.now();
    while (queue.length && performance.now() - t0 < 12) {
      const job = queue.shift(), cv = mesh(...job.args);
      const enc = cv.convertToBlob ? cv.convertToBlob() : new Promise(r => cv.toBlob ? cv.toBlob(r) : r(null));
      enc.then(b => b ? new Promise(r => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(b); }) : cv.toDataURL()).then(u => done(job, u));
    }
    if (queue.length) setTimeout(mainPump, 0); else mainBusy = false;
  }

  function paint(root = document) {
    root.querySelectorAll("[data-strand]").forEach(buildStrand);
    const px = OVERSAMPLE(), fresh = [];
    root.querySelectorAll("[data-stone]").forEach(el => {
      if (!el.dataset.seed) el.dataset.seed = autoSeed++;
      const name = el.dataset.stone, seed = +el.dataset.seed, bead = el.classList.contains("bead");
      const sft = +(el.dataset.soft || (bead ? 0 : .45));
      // 用布局尺寸(不受 transform 缩放/旋转影响),动画中的元素也按最终尺寸渲染
      const cw = Math.max(8, Math.round(el.offsetWidth || 40)), ch = Math.max(8, Math.round(el.offsetHeight || 40));
      const key = [name, seed, sft, cw, ch, px, el.dataset.texture].join("|");
      if (el.dataset.rsKey === key) return;
      el.dataset.rsKey = key;
      el.style.backgroundColor = color(name);
      el.style.backgroundSize = "100% 100%";
      el.classList.add("rs-" + (["bone","butter","bodhi","mint","rose","peach","sky","apple","amber","gold","rapeseed"].includes(name) ? "light" : "dark"));
      if (cache.has(key)) return apply(el, key, cache.get(key));
      if (pending.has(key)) return pending.get(key).push(el);
      pending.set(key, [el]);
      fresh.push({ key, args: [name, cw, ch, { seed, soft: sft, texture: el.dataset.texture, bead, px }] });
    });
    if (!fresh.length) return;
    dbGetMany(fresh.map(j => j.key)).then(hit => {
      fresh.forEach(j => hit.has(j.key) ? done(j, hit.get(j.key)) : queue.push(j));
      queue.sort((a, b) => prio(a) - prio(b));
      dispatch();
    });
  }

  function buildStrand(el) {
    if (el.dataset.built) return; el.dataset.built = 1;
    const list = el.dataset.strand === "rainbow" ? RAINBOW : el.dataset.strand.split(",").map(s => s.trim());
    const rep = +(el.dataset.repeat || 1), every = +(el.dataset.spacer || 0), size = el.dataset.size || 16, shape = el.dataset.shape || "";
    let n = 0;
    for (let r = 0; r < rep; r++) for (const s of list) {
      const b = document.createElement("span"); b.className = `bead ${shape}`; b.dataset.stone = s;
      b.style.setProperty("--size", /^[\d.]+$/.test(size) ? size + "px" : size); if (el.dataset.texture) b.dataset.texture = el.dataset.texture; el.appendChild(b);
      if (every && ++n % every === 0) { const g = document.createElement("span"); g.className = "bead-spacer"; g.dataset.stone = "gold"; g.dataset.soft = "0"; el.appendChild(g); }
    }
  }


  global.RainbowStone = { MESH, RAINBOW, mesh, paint, color, get threads() { return pool ? pool.length : 0; } };
  const start = () => { paint(); let tm; global.addEventListener("resize", () => { clearTimeout(tm); tm = setTimeout(() => paint(), 250); }); };
  if (document.readyState !== "loading") start(); else document.addEventListener("DOMContentLoaded", start);
})(window);
