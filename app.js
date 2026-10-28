'use strict';
/* =====================================================================
   Quiz Video Studio — everything runs in the browser.
   Rendering: <canvas>. Audio: WebAudio. Voice: speechSynthesis.
   Export: canvas.captureStream + MediaRecorder.
   ===================================================================== */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const sleep = ms => new Promise(r => setTimeout(r, ms));

/* ---------------------------------------------------------------- state */
const THEMES = {
  midnight: { bg1: '#1b1f4b', bg2: '#0b0d26', accent: '#ffb703', text: '#ffffff', correct: '#22c55e' },
  ocean:    { bg1: '#0e7490', bg2: '#082f49', accent: '#fde047', text: '#ffffff', correct: '#4ade80' },
  sunset:   { bg1: '#be185d', bg2: '#4c1d95', accent: '#fbbf24', text: '#ffffff', correct: '#34d399' },
  forest:   { bg1: '#166534', bg2: '#052e16', accent: '#fcd34d', text: '#ffffff', correct: '#86efac' },
  royal:    { bg1: '#7c3aed', bg2: '#1e1b4b', accent: '#f472b6', text: '#ffffff', correct: '#4ade80' },
  paper:    { bg1: '#fef3c7', bg2: '#fde68a', accent: '#b45309', text: '#1f2937', correct: '#16a34a' }
};
const DEFAULTS = {
  ratio: '16:9', textScale: 1, safeZone: true, theme: 'midnight', font: 'Noto Sans Devanagari',
  ...THEMES.midnight, cardAlpha: 0.12, overlay: 0.45,
  qLabel: 'Question', revealLabel: 'Correct answer', letters: 'latin', nepDigits: false,
  titleOn: true, title: 'Quiz Time', subtitle: 'Test your knowledge', titleSec: 3,
  outroOn: true, outro: 'Thanks for watching!', outroSub: 'Like • Share • Subscribe', outroSec: 3,
  watermark: '',
  introSec: 1.8, defaultTimer: 10, revealSec: 4, buffer: 3,
  startSound: true, tickOn: true, tickFrom: 5, sfxVol: 0.6, revealSound: 'chime', musicVol: 0.15, qAudioVol: 0.6,
  summaryOn: false, summaryTitle: 'Comment your score!', summarySub: 'How many did you get right?', summaryKey: true, summaryTiers: false, summarySec: 6, timerStyle: 'ring',
  urgentOn: true, urgentSec: 3, urgentVisual: true, urgentVol: 0.8, vidVol: 1, vidMax: 0, titleAnim: 'rise', exportMethod: 'fast',
  ttsOn: true, voiceEn: '', voiceNe: '', rate: 1, pitch: 1, ttsVol: 1,
  readLabel: true, readOptions: true, readReveal: true, readExp: false, readTitle: true, measureAudible: false,
  rangeFrom: 1, rangeTo: 0, exportRes: 720, fps: 30, bitrate: 6, exportMime: '', exportAudio: 'sfx'
};
let S = { ...DEFAULTS };
let Q = [];
const assets = { bgImg: null, logo: null, music: null, reveal: null, qAudio: null, urgent: null, introVid: null, outroVid: null, musicName: '', revealName: '', qAudioName: '', urgentName: '' };
const imgCache = new Map();

const mkQ = (q = '', o = ['', '', '', ''], ans = 0, exp = '', time = null, img = null) =>
  ({ q, o: [0, 1, 2, 3].map(i => String(o[i] ?? '')), ans: clamp(ans | 0, 0, 3), exp: exp || '', time: time > 0 ? Number(time) : null, ttsMs: null, revMs: null, img: img || null });
const fixQ = q => mkQ(q.q, q.o || [], q.ans, q.exp, q.time, q.img);

function sampleQuestions() {
  return [
    mkQ('What is the capital city of Nepal?', ['Pokhara', 'Kathmandu', 'Lalitpur', 'Biratnagar'], 1, 'Kathmandu is the capital and largest city of Nepal.'),
    mkQ('नेपालको सबैभन्दा अग्लो हिमाल कुन हो?', ['सगरमाथा', 'कञ्चनजङ्घा', 'मकालु', 'धौलागिरी'], 0, 'सगरमाथाको उचाइ ८,८४८.८६ मिटर हो।'),
    mkQ('Which planet is known as the Red Planet?', ['Venus', 'Jupiter', 'Mars', 'Mercury'], 2)
  ];
}

/* --------------------------------------------------------- persistence */
const KEY = 'quizVideoStudio.v1';
function save() {
  clearTimeout(save.t);
  save.t = setTimeout(() => {
    try { localStorage.setItem(KEY, JSON.stringify({ S, Q })); }
    catch (e) { try { localStorage.setItem(KEY, JSON.stringify({ S, Q: Q.map(q => ({ ...q, img: null })) })); } catch { /* ignore */ } }
  }, 400);
}
function loadSaved() {
  try {
    const d = JSON.parse(localStorage.getItem(KEY));
    if (d && Array.isArray(d.Q)) { Object.assign(S, d.S || {}); Q = d.Q.map(fixQ); return true; }
  } catch { /* ignore */ }
  return false;
}

/* ------------------------------------------------------------- helpers */
function toast(msg, ms = 3200) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('show'), ms);
}
const NEP = '०१२३४५६७८९';
const num = n => S.nepDigits ? String(n).replace(/\d/g, d => NEP[d]) : String(n);
const LET = () => S.letters === 'nepali' ? ['क', 'ख', 'ग', 'घ'] : ['A', 'B', 'C', 'D'];
const hex2rgb = h => { h = h.replace('#', ''); if (h.length === 3) h = h.split('').map(c => c + c).join(''); const n = parseInt(h, 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const rgba = (h, a) => { const [r, g, b] = hex2rgb(h); return `rgba(${r},${g},${b},${a})`; };
const contrast = h => { const [r, g, b] = hex2rgb(h); return (0.299 * r + 0.587 * g + 0.114 * b) > 150 ? '#111827' : '#ffffff'; };
const fmtT = s => { s = Math.max(0, Math.round(s)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
const hasDev = t => /[\u0900-\u097F]/.test(t);
function saveBlob(blob, name) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}
const fontStack = () => `"${S.font}","Noto Sans Devanagari","Mukta","Inter","Segoe UI",system-ui,sans-serif`;
async function ensureFonts() {
  const F = fontStack();
  try {
    await Promise.all([400, 600, 700, 800].map(w => document.fonts.load(`${w} 32px ${F}`, 'Aअक')));
    await document.fonts.ready;
  } catch { /* ignore */ }
}

/* ===================================================================
   AUDIO ENGINE (sound effects + music) – WebAudio
   =================================================================== */
/* ---- sound builders: work on the live context AND on an OfflineAudioContext (fast export) ---- */
function toneOn(c, dest, t, freq, dur, { type = 'sine', vol = 0.5, slide = 0 } = {}) {
  const o = c.createOscillator(), g = c.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(freq * slide, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol * S.sfxVol), t + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(dest); o.start(t); o.stop(t + dur + 0.05);
}
function bufOn(c, dest, t, buf, vol, { loop = false, until = 0 } = {}) {
  const s = c.createBufferSource(), g = c.createGain();
  s.buffer = buf; s.loop = loop; g.gain.value = vol; s.connect(g); g.connect(dest);
  s.start(t); if (until > t) s.stop(until);
  return { s, g };
}
const SFX = {
  tick(c, d, t, high) { toneOn(c, d, t, high ? 1600 : 1000, 0.07, { type: 'square', vol: 0.16 }); },
  start(c, d, t) { toneOn(c, d, t, 420, 0.28, { vol: 0.35, slide: 2.2 }); toneOn(c, d, t + 0.1, 840, 0.2, { vol: 0.2 }); },
  reveal(c, d, t) {
    if (assets.reveal) { bufOn(c, d, t, assets.reveal, S.sfxVol); return; }
    switch (S.revealSound) {
      case 'chime': [880, 1175, 1568].forEach((f, i) => toneOn(c, d, t + i * 0.12, f, 0.7, { vol: 0.35 })); break;
      case 'fanfare': [523, 659, 784, 1047].forEach((f, i) => toneOn(c, d, t + i * 0.18, f, i === 3 ? 0.9 : 0.22, { type: 'triangle', vol: 0.4 })); break;
      case 'pop': toneOn(c, d, t, 300, 0.18, { vol: 0.5, slide: 3 }); break;
      default: break;
    }
  },
  riser(c, d, t, dur) { // rising "time is almost up" sweep
    const o = c.createOscillator(), g = c.createGain();
    o.type = 'sawtooth'; o.frequency.setValueAtTime(220, t); o.frequency.exponentialRampToValueAtTime(1100, t + dur);
    g.gain.setValueAtTime(0.02 * S.sfxVol, t);
    g.gain.linearRampToValueAtTime(0.3 * S.sfxVol, t + dur * 0.92);
    g.gain.linearRampToValueAtTime(0, t + dur + 0.06);
    o.connect(g); g.connect(d); o.start(t); o.stop(t + dur + 0.1);
    return o;
  }
};
const AE = {
  ctx: null, master: null, rec: null, musicSrc: null, musicGain: null, qSrc: null, qGain: null, uSrc: null,
  init() {
    if (this.ctx) return;
    const C = window.AudioContext || window.webkitAudioContext;
    this.ctx = new C();
    this.master = this.ctx.createGain();
    this.master.connect(this.ctx.destination);
    this.rec = this.ctx.createMediaStreamDestination();
  },
  async resume() { this.init(); if (this.ctx.state !== 'running') await this.ctx.resume(); },
  route(toRec) {
    this.init();
    try { this.master.disconnect(this.rec); } catch { /* not connected */ }
    if (toRec) this.master.connect(this.rec);
  },
  tone(freq, dur, o = {}) { if (this.ctx) toneOn(this.ctx, this.master, this.ctx.currentTime + (o.when || 0), freq, dur, o); },
  tick(high) { if (this.ctx) SFX.tick(this.ctx, this.master, this.ctx.currentTime, high); },
  start() { if (this.ctx) SFX.start(this.ctx, this.master, this.ctx.currentTime); },
  reveal() { if (this.ctx) SFX.reveal(this.ctx, this.master, this.ctx.currentTime); },
  urgent(rem) { // "last seconds" cue: custom file or synth riser, and the Audio 1 bed ducks / fades out
    this.stopUrgent();
    if (!this.ctx) return;
    const c = this.ctx, t = c.currentTime;
    this.uSrc = assets.urgent ? bufOn(c, this.master, t, assets.urgent, S.urgentVol).s : SFX.riser(c, this.master, t, Math.max(0.5, rem));
    if (this.qGain) this.qGain.gain.setTargetAtTime(assets.urgent ? 0 : S.qAudioVol * 0.35, t, 0.08);
  },
  stopUrgent() { try { this.uSrc && this.uSrc.stop(); } catch { /* ignore */ } this.uSrc = null; },
  startMusic() {
    this.stopMusic();
    if (!this.ctx || !assets.music || S.musicVol <= 0) return;
    const r = bufOn(this.ctx, this.master, this.ctx.currentTime, assets.music, S.musicVol, { loop: true });
    this.musicSrc = r.s; this.musicGain = r.g;
  },
  stopMusic() { try { this.musicSrc && this.musicSrc.stop(); } catch { /* ignore */ } this.musicSrc = null; this.musicGain = null; },
  startQAudio() {
    this.stopQAudio();
    if (!this.ctx || !assets.qAudio || S.qAudioVol <= 0) return;
    const r = bufOn(this.ctx, this.master, this.ctx.currentTime, assets.qAudio, S.qAudioVol, { loop: true });
    this.qSrc = r.s; this.qGain = r.g;
  },
  stopQAudio() { try { this.qSrc && this.qSrc.stop(); } catch { /* ignore */ } this.qSrc = null; this.qGain = null; this.stopUrgent(); },
  setQVol() { if (this.qGain) this.qGain.gain.value = S.qAudioVol; },
  setMusicVol() { if (this.musicGain) this.musicGain.gain.value = S.musicVol; },
  attachVideo(el) { // route a <video>'s sound through the master bus so it is recorded too
    this.init();
    const src = this.ctx.createMediaElementSource(el), g = this.ctx.createGain();
    g.gain.value = S.vidVol; src.connect(g); g.connect(this.master); el._gain = g;
  },
  async decode(file) { this.init(); return this.ctx.decodeAudioData(await file.arrayBuffer()); }
};

/* ===================================================================
   TEXT-TO-SPEECH (browser speechSynthesis)
   =================================================================== */
const TTS = {
  voices: [],
  ok: 'speechSynthesis' in window,
  byLang(p) { return this.voices.find(v => v.lang.toLowerCase().replace('_', '-').startsWith(p)); },
  find(kind) {
    const uri = kind === 'ne' ? S.voiceNe : S.voiceEn;
    const chosen = this.voices.find(v => v.voiceURI === uri);
    if (chosen) return chosen;
    if (kind === 'ne') return this.byLang('ne') || this.byLang('hi') || this.byLang('mr') || null;
    return this.byLang('en') || this.voices.find(v => v.default) || null;
  },
  utter(text, vol) {
    const dev = hasDev(text), u = new SpeechSynthesisUtterance(text), v = this.find(dev ? 'ne' : 'en');
    if (v) { u.voice = v; u.lang = v.lang; } else u.lang = dev ? 'ne-NP' : 'en-US';
    u.rate = S.rate; u.pitch = S.pitch; u.volume = vol;
    return u;
  },
  speak(text) {
    if (!this.ok || !text) return;
    speechSynthesis.cancel();
    speechSynthesis.speak(this.utter(text, S.ttsVol));
  },
  stop() { if (this.ok) speechSynthesis.cancel(); }
};
const estimateMs = t => 350 + (String(t).length * 68) / Math.max(0.4, S.rate);
function measureSpeech(text) {
  return new Promise(res => {
    if (!TTS.ok || !text) return res({ ms: estimateMs(text || ''), est: true });
    const u = TTS.utter(text, S.measureAudible ? S.ttsVol : 0);
    let start = performance.now(), done = false, to;
    const fin = ok => {
      if (done) return; done = true; clearTimeout(to);
      const ms = performance.now() - start;
      // Some engines finish instantly when muted; treat that as "unreliable" and estimate.
      res(ok && ms > Math.min(500, text.length * 12) ? { ms, est: false } : { ms: estimateMs(text), est: true });
    };
    u.onstart = () => { start = performance.now(); };
    u.onend = () => fin(true);
    u.onerror = () => fin(false);
    to = setTimeout(() => { speechSynthesis.cancel(); fin(false); }, 90000);
    speechSynthesis.cancel();
    speechSynthesis.speak(u);
  });
}
const askText = q => [q.q, S.readOptions ? q.o.map((o, k) => `${LET()[k]}. ${o}`).join('. ') : ''].filter(Boolean).join('. ');
const revealText = q => `${S.revealLabel}. ${LET()[q.ans]}. ${q.o[q.ans]}.` + (S.readExp && q.exp ? ' ' + q.exp : '');

let measuring = false, measureCancel = false;
async function measureAll() {
  if (measuring) return;
  if (!Q.length) return toast('Add questions first');
  if (!TTS.ok) return toast('This browser has no text-to-speech.');
  pause(); measuring = true; measureCancel = false;
  const info = $$('.js-measureInfo'), setInfo = t => info.forEach(e => (e.textContent = t));
  $$('.js-measure').forEach(b => (b.disabled = true));
  let estCount = 0;
  for (let i = 0; i < Q.length; i++) {
    if (measureCancel) break;
    setInfo(`Measuring ${i + 1} / ${Q.length} …`);
    const a = await measureSpeech(askText(Q[i]));
    if (measureCancel) break;
    const r = await measureSpeech(revealText(Q[i]));
    if (a.est || r.est) estCount++;
    Q[i].ttsMs = a.ms; Q[i].revMs = r.ms;
    Q[i].time = Math.max(3, Math.ceil(a.ms / 1000 + S.buffer));
    renderTable(); rebuild();
  }
  TTS.stop(); measuring = false;
  $$('.js-measure').forEach(b => (b.disabled = false));
  setInfo(measureCancel ? 'Stopped.' : `Done. Timers updated for ${Q.length} questions.` + (estCount ? ` (${estCount} used a length-based estimate because the voice did not report timing — try “Play audibly while measuring”.)` : ''));
  save();
}

/* ===================================================================
   TIMELINE
   =================================================================== */
const qTime = q => (q.time > 0 ? q.time : S.defaultTimer);
const revDur = q => Math.max(S.revealSec, q.revMs ? q.revMs / 1000 + 0.8 : 0);
const P = { t: 0, playing: false, last: 0, tl: [], total: 0, seg: -2, tick: -1, exporting: false, expMode: 'sfx', cancelled: false };

function buildTimeline(from = 1, to = Q.length) {
  const tl = []; let t = 0;
  const add = (type, i, dur, extra) => { tl.push({ type, i, start: t, dur, ...extra }); t += dur; };
  const vdur = v => Math.min(v.dur, S.vidMax > 0 ? S.vidMax : Infinity);
  if (assets.introVid) add('vid', -1, vdur(assets.introVid), { v: assets.introVid });
  if (S.titleOn) add('title', -1, S.titleSec);
  for (let i = from - 1; i < to && i < Q.length; i++) {
    if (S.introSec > 0) add('intro', i, S.introSec);
    add('ask', i, qTime(Q[i]));
    add('reveal', i, revDur(Q[i]));
  }
  if (S.summaryOn && to >= from) add('summary', -1, S.summarySec, { from, to: Math.min(to, Q.length) });
  if (S.outroOn) add('outro', -1, S.outroSec);
  if (assets.outroVid) add('vid', -1, vdur(assets.outroVid), { v: assets.outroVid });
  return { tl, total: t };
}
function rebuild() {
  if (P.exporting) return;
  const { tl, total } = buildTimeline();
  P.tl = tl; P.total = total; P.t = Math.min(P.t, total); P.seg = -2;
  const info = $('#lenInfo');
  if (info) {
    const f = Math.max(1, S.rangeFrom | 0), t = S.rangeTo > 0 ? Math.min(Q.length, S.rangeTo | 0) : Q.length;
    info.textContent = `Video length ≈ ${fmtT(buildTimeline(f, t).total)}`;
  }
}
const segAt = t => { for (let i = P.tl.length - 1; i >= 0; i--) if (t >= P.tl[i].start) return i; return 0; };

/* ===================================================================
   RENDERER (canvas)
   =================================================================== */
const cv = $('#cv'), ctx = cv.getContext('2d');
let CW = 1280, CH = 720, K = 1;
function sizeCanvas(k = 1) {
  const r = S.ratio;
  [CW, CH] = r === '9:16' ? [720, 1280] : r === '1:1' ? [900, 900] : [1280, 720];
  K = k; cv.width = Math.round(CW * K); cv.height = Math.round(CH * K);
}
function rr(c, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
}
function wrap(c, text, maxW) {
  const lines = [];
  for (const para of String(text).split('\n')) {
    let line = '';
    for (const word of para.split(/\s+/).filter(Boolean)) {
      const t = line ? line + ' ' + word : word;
      if (c.measureText(t).width <= maxW) { line = t; continue; }
      if (line) { lines.push(line); line = ''; }
      if (c.measureText(word).width <= maxW) { line = word; continue; }
      let part = '';
      for (const ch of [...word]) { if (c.measureText(part + ch).width > maxW && part) { lines.push(part); part = ch; } else part += ch; }
      line = part;
    }
    lines.push(line);
  }
  return lines;
}
function fit(c, text, maxW, maxH, maxPx, minPx, weight, lh = 1.35) {
  let px = Math.round(maxPx), lines;
  for (;;) {
    c.font = `${weight} ${px}px ${fontStack()}`;
    lines = wrap(c, text, maxW);
    if (lines.length * px * lh <= maxH || px <= minPx) break;
    px -= 2;
  }
  return { lines, px, lh };
}
function drawLines(c, f, x, y, w, h, align = 'center') {
  c.font = c.font.replace(/\d+px/, f.px + 'px');
  const total = f.lines.length * f.px * f.lh;
  let cy = y + (h - total) / 2 + (f.px * f.lh) / 2;
  c.textAlign = align; c.textBaseline = 'middle';
  const tx = align === 'center' ? x + w / 2 : align === 'right' ? x + w : x;
  for (const l of f.lines) { c.fillText(l, tx, cy); cy += f.px * f.lh; }
}
function getImg(src) {
  if (!src) return null;
  let e = imgCache.get(src);
  if (!e) { const im = new Image(); e = { im, ok: false }; im.onload = () => { e.ok = true; }; im.src = src; imgCache.set(src, e); }
  return e.ok ? e.im : null;
}
let TS = 1; // text-size multiplier (user slider x portrait boost), set per frame in render()
function layout(W, H, hasExp) {
  const u = Math.min(W, H) / 720, portrait = H / W > 1.3, grid = W / H > 0.9;
  const P0 = (portrait ? 36 : 44) * u;
  // Shorts/Reels/TikTok cover roughly the top 6% and bottom 14% — keep content clear of them
  const safeT = portrait && S.safeZone ? 70 * u : 0, safeB = portrait && S.safeZone ? 120 * u : 0;
  const topY = 24 * u + safeT, hdr = (portrait ? 72 : 64) * u, qY = topY + hdr + 16 * u;
  const qH = H * (grid ? 0.27 : portrait ? 0.21 : 0.21);
  const footer = 34 * u, bH = (hasExp ? (portrait ? 150 : 124) : (portrait ? 104 : 86)) * u;
  const bY = H - footer - bH - 8 * u - safeB, oY = qY + qH + 18 * u;
  return { u, portrait, P: P0, grid, topY, hdr, qY, qH, bY, bH, safeB, opt: { x: P0, y: oY, w: W - 2 * P0, h: bY - oY - 14 * u }, W, H };
}
function optRects(L) {
  const { x, y, w, h } = L.opt, g = 16 * L.u;
  if (L.grid) {
    const cw = (w - g) / 2, ch = Math.min(180 * L.u, (h - g) / 2), tot = 2 * ch + g, y0 = y + (h - tot) / 2;
    return [0, 1, 2, 3].map(k => ({ x: x + (k % 2) * (cw + g), y: y0 + Math.floor(k / 2) * (ch + g), w: cw, h: ch }));
  }
  const rh = Math.min((L.portrait ? 200 : 150) * L.u, (h - 3 * g) / 4), tot = 4 * rh + 3 * g, y0 = y + (h - tot) / 2;
  return [0, 1, 2, 3].map(k => ({ x, y: y0 + k * (rh + g), w, h: rh }));
}
const ease = t => 1 - Math.pow(1 - clamp(t, 0, 1), 3);
const easeBack = t => { t = clamp(t, 0, 1); const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };

function drawBG(c, W, H) {
  const g = c.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, S.bg1); g.addColorStop(1, S.bg2);
  c.fillStyle = g; c.fillRect(0, 0, W, H);
  const im = assets.bgImg;
  if (im) {
    const s = Math.max(W / im.width, H / im.height), w = im.width * s, h = im.height * s;
    c.drawImage(im, (W - w) / 2, (H - h) / 2, w, h);
    c.fillStyle = rgba(S.bg2, S.overlay); c.fillRect(0, 0, W, H);
  } else {
    for (const [cx, cy, r, col] of [[0.1, 0.1, 0.5, S.accent], [0.95, 0.95, 0.55, S.correct]]) {
      const rg = c.createRadialGradient(W * cx, H * cy, 0, W * cx, H * cy, Math.max(W, H) * r);
      rg.addColorStop(0, rgba(col, 0.16)); rg.addColorStop(1, rgba(col, 0));
      c.fillStyle = rg; c.fillRect(0, 0, W, H);
    }
  }
}
function drawFooter(c, W, H, u) {
  const P0 = 44 * u, prog = P.total ? P.t / P.total : 0;
  c.fillStyle = rgba(S.text, 0.15); rr(c, P0, H - 14 * u, W - 2 * P0, 6 * u, 3 * u); c.fill();
  c.fillStyle = S.accent; rr(c, P0, H - 14 * u, Math.max(6 * u, (W - 2 * P0) * clamp(prog, 0, 1)), 6 * u, 3 * u); c.fill();
  if (S.watermark) {
    c.font = `600 ${18 * u}px ${fontStack()}`; c.fillStyle = rgba(S.text, 0.6);
    c.textAlign = 'right'; c.textBaseline = 'middle'; c.fillText(S.watermark, W - P0, H - 30 * u - (H / W > 1.3 && S.safeZone ? 96 * u : 0));
  }
}
function graphemes(str) {
  try { return Array.from(new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(str), x => x.segment); } catch { return [...str]; }
}
function drawTyped(c, f, x, y, w, h, prog) { // typewriter reveal; counts grapheme clusters so Devanagari never breaks mid-letter
  c.font = c.font.replace(/\d+px/, f.px + 'px');
  const lines = f.lines.map(graphemes), total = lines.reduce((n, l) => n + l.length, 0);
  let left = Math.round(total * clamp(prog, 0, 1));
  let cy = y + (h - f.lines.length * f.px * f.lh) / 2 + (f.px * f.lh) / 2;
  c.textAlign = 'left'; c.textBaseline = 'middle';
  lines.forEach((g, i) => {
    const sx = x + w / 2 - c.measureText(f.lines[i]).width / 2, take = Math.min(g.length, left);
    left -= take; if (take) c.fillText(g.slice(0, take).join(''), sx, cy);
    cy += f.px * f.lh;
  });
}
function drawTitleSlide(c, W, H, seg, lt) {
  const u = Math.min(W, H) / 720, anim = S.titleAnim || 'rise', a = ease(lt / 0.6);
  const title = seg.type === 'title' ? S.title : S.outro, sub = seg.type === 'title' ? S.subtitle : S.outroSub;
  const typed = anim === 'typewriter';
  c.save();
  if (anim === 'zoom') { const sc = 0.55 + 0.45 * easeBack(lt / 0.8); c.globalAlpha = a; c.translate(W / 2, H / 2); c.scale(sc, sc); c.translate(-W / 2, -H / 2); }
  else if (anim === 'slide') { c.globalAlpha = a; c.translate(-(1 - ease(lt / 0.7)) * W * 0.35, 0); }
  else if (!typed) { c.globalAlpha = a; c.translate(0, (1 - a) * 30 * u); }
  c.fillStyle = S.text;
  const bw = W - 2 * 70 * u, t = fit(c, title, bw, H * 0.34, 100 * u, 34 * u, 800);
  if (typed) drawTyped(c, t, 70 * u, H * 0.26, bw, H * 0.34, lt / Math.min(1.6, seg.dur * 0.45));
  else drawLines(c, t, 70 * u, H * 0.26, bw, H * 0.34);
  const bar = typed ? ease((lt - 0.5) / 0.5) : 1;
  c.fillStyle = S.accent; rr(c, W / 2 - 60 * u * bar, H * 0.6 + 6 * u, 120 * u * bar, 8 * u, 4 * u); c.fill();
  if (typed) c.globalAlpha = ease((lt - 0.9) / 0.5);
  c.fillStyle = rgba(S.text, 0.85);
  const s = fit(c, sub, bw, H * 0.18, 42 * u, 20 * u, 600);
  drawLines(c, s, 70 * u, H * 0.65, bw, H * 0.18);
  c.restore();
}
function drawSummary(c, W, H, seg, lt) { // end card: "comment your score" + answer key + score tiers
  const u = Math.min(W, H) / 720, portrait = H / W > 1.3, safe = portrait && S.safeZone, ne = S.letters === 'nepali';
  const qs = Q.slice(seg.from - 1, seg.to), n = qs.length, a = ease(lt / 0.5), P0 = 56 * u;
  const top = safe ? 90 * u : 36 * u, bottom = H - (safe ? 150 * u : 56 * u), avail = bottom - top, bw = W - 2 * P0;
  c.save(); c.globalAlpha = a; c.translate(0, (1 - a) * 24 * u);
  c.fillStyle = S.text;
  drawLines(c, fit(c, S.summaryTitle, bw, avail * 0.17, 66 * u * TS, 26 * u, 800), P0, top, bw, avail * 0.17);
  c.fillStyle = rgba(S.text, 0.85);
  drawLines(c, fit(c, S.summarySub, bw, avail * 0.09, 34 * u * TS, 18 * u, 600), P0, top + avail * 0.17, bw, avail * 0.09);
  c.fillStyle = S.accent; c.font = `700 ${24 * u}px ${fontStack()}`; c.textAlign = 'center'; c.textBaseline = 'middle';
  c.fillText(`${num(n)} ${ne ? 'प्रश्न' : n === 1 ? 'question' : 'questions'}`, W / 2, top + avail * 0.29);
  let y = top + avail * 0.34, h = avail * 0.66;
  if (S.summaryTiers && n > 0) { // four score bands
    const hi = n, g = Math.ceil(n * 0.7), ok = Math.ceil(n * 0.4);
    const rows = [[`${num(hi)}`, ne ? 'प्रतिभाशाली' : 'Genius'], [g < hi ? `${num(g)}–${num(hi - 1)}` : '', ne ? 'धेरै राम्रो' : 'Great'], [ok < g ? `${num(ok)}–${num(g - 1)}` : '', ne ? 'राम्रो' : 'Good'], [ok > 0 ? `${num(0)}–${num(ok - 1)}` : '', ne ? 'अझै अभ्यास गरौँ' : 'Keep practising']].filter(r => r[0]);
    const th = Math.min(h * (S.summaryKey ? 0.34 : 0.8), rows.length * 58 * u), rh = th / rows.length;
    rows.forEach((r, i) => {
      const ry = y + i * rh;
      c.fillStyle = rgba(S.text, S.cardAlpha); rr(c, P0, ry + 3 * u, bw, rh - 6 * u, 14 * u); c.fill();
      c.fillStyle = S.accent; c.font = `800 ${Math.min(rh * 0.5, 30 * u)}px ${fontStack()}`; c.textAlign = 'left'; c.fillText(r[0], P0 + 22 * u, ry + rh / 2 + 1 * u);
      c.fillStyle = S.text; c.textAlign = 'right'; c.fillText(r[1], P0 + bw - 22 * u, ry + rh / 2 + 1 * u);
    });
    y += th + 12 * u; h -= th + 12 * u;
  }
  if (S.summaryKey && n > 0) { // answer key grid: "1 B", "2 A" …
    c.fillStyle = rgba(S.text, 0.7); c.font = `700 ${20 * u}px ${fontStack()}`; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText(ne ? 'उत्तर कुञ्जी' : 'Answer key', W / 2, y + 12 * u); y += 28 * u; h -= 28 * u;
    let best = null;
    for (let cols = 1; cols <= Math.min(n, 12); cols++) { // pick the column count that gives the largest cells
      const rowsN = Math.ceil(n / cols), cell = Math.min(bw / cols, h / rowsN);
      if (!best || cell > best.cell) best = { cols, rowsN, cell };
    }
    const cw = bw / best.cols, ch = Math.min(best.cell * 0.9, 64 * u, h / best.rowsN), gx = (W - cw * best.cols) / 2;
    qs.forEach((q, i) => {
      const cx = gx + (i % best.cols) * cw, cy = y + Math.floor(i / best.cols) * ch;
      c.fillStyle = rgba(S.correct, 0.2); rr(c, cx + 3 * u, cy + 3 * u, cw - 6 * u, ch - 6 * u, Math.min(10 * u, ch / 4)); c.fill();
      c.strokeStyle = S.correct; c.lineWidth = 2 * u; rr(c, cx + 3 * u, cy + 3 * u, cw - 6 * u, ch - 6 * u, Math.min(10 * u, ch / 4)); c.stroke();
      c.fillStyle = S.text; c.font = `700 ${Math.min(ch * 0.46, 28 * u)}px ${fontStack()}`; c.textAlign = 'center';
      c.fillText(`${num(seg.from + i)}  ${LET()[q.ans]}`, cx + cw / 2, cy + ch / 2 + 1 * u);
    });
  }
  c.restore();
}
function drawVid(c, W, H, seg) { // intro/outro video, cover-fit
  const v = seg.v && seg.v.el;
  if (!v || v.readyState < 2 || !v.videoWidth) return;
  const s = Math.max(W / v.videoWidth, H / v.videoHeight), w = v.videoWidth * s, h = v.videoHeight * s;
  c.drawImage(v, (W - w) / 2, (H - h) / 2, w, h);
}
function drawUrgent(c, W, H, seg, lt) { // pulsing red edge glow during the last seconds
  if (!S.urgentVisual || seg.type !== 'ask' || seg.dur <= S.urgentSec + 0.5) return;
  const rem = seg.dur - lt; if (rem > S.urgentSec) return;
  const k = 1 - rem / S.urgentSec, pulse = 0.6 + 0.4 * Math.sin(lt * 10);
  const g = c.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.32, W / 2, H / 2, Math.max(W, H) * 0.78);
  g.addColorStop(0, 'rgba(239,68,68,0)'); g.addColorStop(1, `rgba(239,68,68,${0.12 + 0.36 * k * pulse})`);
  c.fillStyle = g; c.fillRect(0, 0, W, H);
}
function drawOpt(c, r, k, text, st, a, u, pulse) {
  c.save(); c.globalAlpha = a * (st === 'dim' ? 0.28 : 1);
  const rad = 18 * u;
  if (st === 'correct') { c.shadowColor = S.correct; c.shadowBlur = 34 * u * pulse; c.fillStyle = S.correct; }
  else c.fillStyle = rgba(S.text, S.cardAlpha);
  rr(c, r.x, r.y, r.w, r.h, rad); c.fill(); c.shadowBlur = 0;
  c.lineWidth = (st === 'correct' ? 4 : 2) * u; c.strokeStyle = st === 'correct' ? '#ffffff' : rgba(S.text, 0.25);
  rr(c, r.x, r.y, r.w, r.h, rad); c.stroke();
  const cr = Math.min(r.h * 0.32, 30 * u), cx = r.x + 18 * u + cr, cy = r.y + r.h / 2;
  c.fillStyle = st === 'correct' ? '#ffffff' : S.accent; c.beginPath(); c.arc(cx, cy, cr, 0, Math.PI * 2); c.fill();
  c.fillStyle = st === 'correct' ? contrast('#ffffff') : contrast(S.accent);
  c.font = `800 ${cr * 1.05}px ${fontStack()}`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(LET()[k], cx, cy + 1 * u);
  const tx = cx + cr + 16 * u, rightPad = st === 'correct' ? 56 * u : 20 * u, tw = r.x + r.w - tx - rightPad;
  c.fillStyle = st === 'correct' ? contrast(S.correct) : S.text;
  const f = fit(c, text, tw, r.h - 14 * u, 34 * u * TS, 15 * u, 700);
  drawLines(c, f, tx, r.y, tw, r.h, 'left');
  if (st === 'correct') { // check mark
    const mx = r.x + r.w - 34 * u, my = cy;
    c.strokeStyle = contrast(S.correct); c.lineWidth = 6 * u; c.lineCap = 'round'; c.lineJoin = 'round';
    c.beginPath(); c.moveTo(mx - 12 * u, my); c.lineTo(mx - 3 * u, my + 10 * u); c.lineTo(mx + 14 * u, my - 10 * u); c.stroke();
  }
  c.restore();
}
function drawQuestion(c, W, H, seg, lt) {
  const q = Q[seg.i]; if (!q) return;
  const L = layout(W, H, !!q.exp), u = L.u, F = fontStack();
  const intro = seg.type === 'intro', reveal = seg.type === 'reveal';
  const label = `${S.qLabel} ${num(seg.i + 1)}`;

  /* ---- intro: big "Question N" ---- */
  if (intro) {
    const a = ease(lt / 0.25) * (1 - clamp((lt - (seg.dur - 0.3)) / 0.3, 0, 1));
    const sc = 0.8 + 0.2 * easeBack(lt / 0.5);
    c.save(); c.globalAlpha = a; c.translate(W / 2, H / 2); c.scale(sc, sc);
    const f = fit(c, label, W * 0.86, 200 * u, 130 * u, 40 * u, 800);
    c.fillStyle = S.accent; c.shadowColor = rgba(S.accent, 0.6); c.shadowBlur = 40 * u;
    drawLines(c, f, -W * 0.43, -100 * u, W * 0.86, 200 * u);
    c.shadowBlur = 0; c.fillStyle = rgba(S.text, 0.7); c.font = `600 ${28 * u}px ${F}`;
    c.textAlign = 'center'; c.fillText(`${num(seg.i + 1)} / ${num(Q.length)}`, 0, 110 * u);
    c.restore();
    return;
  }

  /* ---- header: pill, counter, logo, timer ---- */
  c.font = `800 ${(L.portrait ? 34 : 30) * u}px ${F}`;
  const tw = c.measureText(label).width, pw = tw + 44 * u;
  c.fillStyle = S.accent; rr(c, L.P, L.topY, pw, L.hdr, L.hdr / 2); c.fill();
  c.fillStyle = contrast(S.accent); c.textAlign = 'center'; c.textBaseline = 'middle';
  c.fillText(label, L.P + pw / 2, L.topY + L.hdr / 2 + 1 * u);
  c.font = `600 ${24 * u}px ${F}`; c.fillStyle = rgba(S.text, 0.65); c.textAlign = 'left';
  c.fillText(`${num(seg.i + 1)} / ${num(Q.length)}`, L.P + pw + 18 * u, L.topY + L.hdr / 2 + 1 * u);

  const tcx = W - L.P - 32 * u, tcy = L.topY + L.hdr / 2, tr = 30 * u;
  const logo = assets.logo;
  if (logo) { const lh = 48 * u, lw = logo.width * (lh / logo.height); c.drawImage(logo, tcx - tr - 16 * u - lw, tcy - lh / 2, lw, lh); }
  c.lineWidth = 7 * u; c.lineCap = 'round';
  if (reveal) {
    c.fillStyle = S.correct; c.beginPath(); c.arc(tcx, tcy, tr, 0, Math.PI * 2); c.fill();
    c.strokeStyle = contrast(S.correct); c.lineWidth = 6 * u; c.lineJoin = 'round';
    c.beginPath(); c.moveTo(tcx - 12 * u, tcy); c.lineTo(tcx - 3 * u, tcy + 10 * u); c.lineTo(tcx + 14 * u, tcy - 10 * u); c.stroke();
  } else {
    const rem = Math.max(0, seg.dur - lt), frac = rem / seg.dur, col = rem <= 3 ? '#ef4444' : S.accent, style = S.timerStyle || 'ring';
    if (style === 'ring') {
      c.strokeStyle = rgba(S.text, 0.2); c.beginPath(); c.arc(tcx, tcy, tr, 0, Math.PI * 2); c.stroke();
      c.strokeStyle = col; c.beginPath(); c.arc(tcx, tcy, tr, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * frac); c.stroke();
      c.fillStyle = col; c.font = `800 ${26 * u}px ${F}`; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText(num(Math.ceil(rem)), tcx, tcy + 1 * u);
    } else {
      // big number (pulses in the last 3 seconds) — with an optional bar
      const big = style === 'number', pulse = rem <= 3 ? 1 + 0.12 * Math.abs(Math.sin(lt * Math.PI)) : 1;
      c.save(); c.translate(tcx, tcy); c.scale(pulse, pulse);
      c.fillStyle = col; c.font = `800 ${(big ? 64 : 44) * u}px ${F}`; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText(num(Math.ceil(rem)), 0, 2 * u); c.restore();
      if (style === 'bar' || style === 'top') {
        const bh = (style === 'bar' ? 10 : 12) * u, bx = style === 'bar' ? L.P : 0, bw = style === 'bar' ? W - 2 * L.P : W;
        const by = style === 'bar' ? L.topY + L.hdr + 3 * u : Math.max(0, L.topY - 18 * u);
        c.fillStyle = rgba(S.text, 0.18); rr(c, bx, by, bw, bh, style === 'bar' ? bh / 2 : 0); c.fill();
        c.fillStyle = col; rr(c, bx, by, Math.max(style === 'bar' ? bh : 0, bw * frac), bh, style === 'bar' ? bh / 2 : 0); c.fill();
      }
    }
  }

  /* ---- question card ---- */
  const qa = reveal ? 1 : ease(lt / 0.45);
  c.save(); c.globalAlpha = qa; c.translate(0, (1 - qa) * 18 * u);
  const qw = W - 2 * L.P;
  c.fillStyle = rgba(S.text, S.cardAlpha); rr(c, L.P, L.qY, qw, L.qH, 22 * u); c.fill();
  c.fillStyle = S.accent; rr(c, L.P, L.qY + 18 * u, 8 * u, L.qH - 36 * u, 4 * u); c.fill();
  const img = getImg(q.img), imgW = img ? Math.min(qw * 0.32, (L.qH - 28 * u) * 1.5) : 0;
  const textW = qw - 40 * u - (img ? imgW + 24 * u : 0);
  c.fillStyle = S.text;
  const qf = fit(c, q.q || '…', textW, L.qH - 28 * u, 52 * u * TS, 20 * u, 700);
  drawLines(c, qf, L.P + 30 * u, L.qY, textW, L.qH, 'center');
  if (img) {
    const bx = L.P + qw - imgW - 16 * u, by = L.qY + 14 * u, bh = L.qH - 28 * u, s = Math.min(imgW / img.width, bh / img.height);
    const iw = img.width * s, ih = img.height * s;
    c.save(); rr(c, bx + (imgW - iw) / 2, by + (bh - ih) / 2, iw, ih, 12 * u); c.clip();
    c.drawImage(img, bx + (imgW - iw) / 2, by + (bh - ih) / 2, iw, ih); c.restore();
  }
  c.restore();

  /* ---- options ---- */
  const rects = optRects(L), pulse = 0.65 + 0.35 * Math.sin(lt * 5);
  rects.forEach((r, k) => {
    const a = reveal ? 1 : ease((lt - 0.25 - k * 0.14) / 0.35);
    const st = reveal ? (k === q.ans ? 'correct' : 'dim') : 'normal';
    const rr2 = { ...r, y: r.y + (1 - a) * 22 * u };
    const grow = st === 'correct' ? 1 + 0.015 * easeBack(lt / 0.5) : 1;
    if (grow !== 1) { c.save(); c.translate(r.x + r.w / 2, r.y + r.h / 2); c.scale(grow, grow); c.translate(-(r.x + r.w / 2), -(r.y + r.h / 2)); }
    drawOpt(c, rr2, k, q.o[k] || '', st, a, u, pulse);
    if (grow !== 1) c.restore();
  });

  /* ---- reveal banner: "Correct answer" + answer ---- */
  if (reveal) {
    const a = ease((lt - 0.2) / 0.4);
    c.save(); c.globalAlpha = a; c.translate(0, (1 - a) * 24 * u);
    c.fillStyle = rgba(S.correct, 0.2); rr(c, L.P, L.bY, W - 2 * L.P, L.bH, 20 * u); c.fill();
    c.strokeStyle = S.correct; c.lineWidth = 3 * u; rr(c, L.P, L.bY, W - 2 * L.P, L.bH, 20 * u); c.stroke();
    c.fillStyle = S.correct; c.font = `800 ${24 * u}px ${F}`; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText(S.revealLabel, W / 2, L.bY + 24 * u);
    c.fillStyle = S.text;
    const ansH = q.exp ? 44 * u : L.bH - 52 * u, aw = W - 2 * L.P - 40 * u;
    const af = fit(c, `${LET()[q.ans]}.  ${q.o[q.ans]}`, aw, ansH, 40 * u * TS, 18 * u, 800);
    drawLines(c, af, L.P + 20 * u, L.bY + 40 * u, aw, ansH);
    if (q.exp) {
      c.fillStyle = rgba(S.text, 0.8);
      const ef = fit(c, q.exp, aw, L.bH - 40 * u - ansH - 12 * u, 22 * u * TS, 13 * u, 400, 1.3);
      drawLines(c, ef, L.P + 20 * u, L.bY + 40 * u + ansH, aw, L.bH - 40 * u - ansH - 8 * u);
    }
    c.restore();
  }
}
function render(c, W, H, k, seg, lt) {
  TS = clamp(S.textScale || 1, 0.6, 1.6) * (H / W > 1.3 ? 1.3 : 1);
  c.setTransform(k, 0, 0, k, 0, 0); c.clearRect(0, 0, W, H);
  drawBG(c, W, H);
  const u = Math.min(W, H) / 720;
  if (!seg) {
    c.fillStyle = S.text; c.font = `700 ${40 * u}px ${fontStack()}`; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText('Add questions to begin', W / 2, H / 2);
  } else if (seg.type === 'title' || seg.type === 'outro') drawTitleSlide(c, W, H, seg, lt);
  else if (seg.type === 'vid') drawVid(c, W, H, seg);
  else if (seg.type === 'summary') drawSummary(c, W, H, seg, lt);
  else { drawQuestion(c, W, H, seg, lt); drawUrgent(c, W, H, seg, lt); }
  drawFooter(c, W, H, u);
}

/* ===================================================================
   PLAYBACK
   =================================================================== */
function speak(text) {
  if (!S.ttsOn || !text) return;
  if (P.exporting && P.expMode !== 'tab') return; // TTS can only be captured through screen/tab share
  TTS.speak(text);
}
function speakSeg(seg, delay = 0) {
  const idx = P.seg;
  const go = () => {
    if (!P.playing || P.seg !== idx) return;
    if (seg.type === 'intro') { if (S.readLabel) speak(`${S.qLabel} ${num(seg.i + 1)}`); }
    else if (seg.type === 'ask') speak(askText(Q[seg.i]));
    else if (seg.type === 'reveal') { if (S.readReveal) speak(revealText(Q[seg.i])); }
    else if (seg.type === 'title') { if (S.readTitle) speak(`${S.title}. ${S.subtitle}`); }
    else if (seg.type === 'outro') { if (S.readTitle) speak(`${S.outro}. ${S.outroSub}`); }
    else if (seg.type === 'summary') { if (S.readTitle) speak(`${S.summaryTitle}. ${S.summarySub}`); }
  };
  delay ? setTimeout(go, delay) : go();
}
function enterSeg(seg) {
  TTS.stop(); P.tick = -1; P.urgent = false; AE.stopQAudio();
  if (seg.type === 'ask') AE.startQAudio();
  if ((seg.type === 'intro' || seg.type === 'summary') && S.startSound) AE.start();
  if (seg.type === 'reveal') AE.reveal();
  speakSeg(seg, seg.type === 'reveal' && S.revealSound !== 'none' ? 700 : 0);
}
async function play() {
  if (!P.tl.length) return;
  await AE.resume();
  if (P.t >= P.total) { P.t = 0; P.seg = -2; }
  const resume = P.t > 0 && P.seg >= 0;
  P.playing = true; P.last = performance.now();
  if (!AE.musicSrc) AE.startMusic();
  if (resume) speakSeg(P.tl[P.seg]);
  updatePlayBtn();
}
function pause() {
  if (!P.playing) return;
  P.playing = false; TTS.stop();
  if (AE.ctx && !P.exporting) AE.ctx.suspend();
  updatePlayBtn();
}
function stopAll() { P.playing = false; TTS.stop(); AE.stopMusic(); AE.stopQAudio(); updatePlayBtn(); }
function endPlayback() {
  P.playing = false; P.seg = -2; TTS.stop(); AE.stopMusic(); AE.stopQAudio(); updatePlayBtn();
  if (P.exporting) finishExport();
}
function seek(t) { P.t = clamp(t, 0, P.total); P.seg = -2; TTS.stop(); AE.stopQAudio(); }
function jumpQ(d) {
  const starts = P.tl.filter(s => s.type === 'intro' || (s.type === 'ask' && S.introSec <= 0)).map(s => s.start);
  if (!starts.length) return;
  const cur = P.t - 0.5;
  let target;
  if (d > 0) target = starts.find(s => s > P.t + 0.01) ?? starts[starts.length - 1];
  else target = [...starts].reverse().find(s => s < cur) ?? 0;
  seek(target);
}
function revealNow() {
  const idx = segAt(P.t), s = P.tl[idx];
  if (!s || s.i < 0) return;
  const r = P.tl.find(x => x.type === 'reveal' && x.i === s.i);
  if (r) seek(r.start);
}
function updatePlayBtn() { $('#btnPlay').textContent = P.playing ? '❚❚ Pause' : '▶ Play'; }

let dragging = false;
function syncVideos(seg, lt) { // keep intro/outro <video> elements in step with the timeline
  for (const k of ['introVid', 'outroVid']) {
    const o = assets[k]; if (!o) continue;
    const v = o.el, active = seg && seg.type === 'vid' && seg.v === o;
    if (active && P.playing) { if (v.paused) v.play().catch(() => {}); if (Math.abs(v.currentTime - lt) > 0.35) v.currentTime = lt; }
    else { if (!v.paused) v.pause(); if (active && Math.abs(v.currentTime - lt) > 0.05) v.currentTime = lt; }
  }
}
function loop(now) {
  requestAnimationFrame(loop);
  if (P.fast) return; // fast export drives rendering itself
  const dt = Math.min(0.2, (now - P.last) / 1000 || 0); P.last = now;
  if (P.playing && !dragging) { P.t += dt; if (P.t >= P.total) { P.t = P.total; endPlayback(); } }
  const idx = P.tl.length ? segAt(P.t) : -1, seg = idx >= 0 ? P.tl[idx] : null;
  if (P.playing && seg && !dragging) {
    if (idx !== P.seg) { P.seg = idx; enterSeg(seg); }
    if (seg.type === 'ask') {
      const rem = seg.dur - (P.t - seg.start), sec = Math.ceil(rem - 0.001);
      if (S.tickOn && sec !== P.tick && sec >= 1 && sec <= S.tickFrom) AE.tick(sec <= 3);
      P.tick = sec;
      if (S.urgentOn && !P.urgent && seg.dur > S.urgentSec + 0.5 && rem <= S.urgentSec) { P.urgent = true; AE.urgent(rem); }
    }
  }
  const lt = seg ? clamp(P.t - seg.start, 0, seg.dur) : 0;
  syncVideos(seg, lt);
  render(ctx, CW, CH, K, seg, lt);
  $('#timeLbl').textContent = `${fmtT(P.t)} / ${fmtT(P.total)}`;
  if (!dragging && P.total) $('#seek').value = Math.round((P.t / P.total) * 1000);
  if (P.exporting) {
    $('#expBar').style.width = (P.total ? (P.t / P.total) * 100 : 0) + '%';
    $('#expInfo').textContent = `${fmtT(P.t)} / ${fmtT(P.total)} — keep this tab visible`;
  }
  const cq = seg && seg.i >= 0 ? seg.i : -1;
  if (cq !== loop.cq) { loop.cq = cq; $$('#qt tbody tr').forEach((tr, i) => tr.children[0].classList.toggle('cur', i === cq)); }
}

/* ===================================================================
   EXPORT (canvas.captureStream + MediaRecorder)
   =================================================================== */
const MIME_CANDIDATES = [
  ['video/mp4;codecs=avc1.640028,mp4a.40.2', 'MP4 (H.264 + AAC)'], ['video/mp4;codecs=avc1,mp4a', 'MP4 (H.264)'], ['video/mp4', 'MP4'],
  ['video/webm;codecs=vp9,opus', 'WebM (VP9 + Opus)'], ['video/webm;codecs=vp8,opus', 'WebM (VP8 + Opus)'], ['video/webm', 'WebM']
];
function fillMimes() {
  const sel = $('#mimeSel'), list = (typeof MediaRecorder !== 'undefined' ? MIME_CANDIDATES.filter(([m]) => MediaRecorder.isTypeSupported(m)) : []);
  sel.innerHTML = list.length ? list.map(([m, n]) => `<option value="${esc(m)}">${n}</option>`).join('') : '<option value="">Not supported in this browser</option>';
  if (!list.some(([m]) => m === S.exportMime)) S.exportMime = list[0] ? list[0][0] : '';
  sel.value = S.exportMime;
}
let recorder = null, recChunks = [], dispStream = null;
async function startExport() {
  if (P.exporting) return;
  if (!Q.length) return toast('Add questions first');
  stopAll(); measureCancel = true;
  const mode = S.exportAudio;
  const from = Math.max(1, S.rangeFrom | 0), to = S.rangeTo > 0 ? Math.min(Q.length, S.rangeTo | 0) : Q.length;
  if (from > to) return toast('“From” must not be greater than “To”.');
  if (S.exportMethod === 'fast' && FAST_OK() && mode !== 'tab') return fastExport(from, to);
  if (S.exportMethod === 'fast' && mode === 'tab') toast('Capturing the voice needs Live recording — switching to it for this export.', 5000);
  if (typeof MediaRecorder === 'undefined') return toast('This browser cannot record video. Use Chrome, Edge or Safari 14.1+.');
  await ensureFonts();
  await AE.resume(); AE.route(mode === 'sfx');

  let aTrack = null; dispStream = null;
  if (mode === 'tab') {
    try {
      dispStream = await navigator.mediaDevices.getDisplayMedia({
        video: true, audio: { suppressLocalAudioPlayback: false, echoCancellation: false, noiseSuppression: false, autoGainControl: false },
        preferCurrentTab: false, selfBrowserSurface: 'include', systemAudio: 'include'
      });
      aTrack = dispStream.getAudioTracks()[0];
      if (!aTrack) { dispStream.getTracks().forEach(t => t.stop()); dispStream = null; AE.route(false); return toast('No audio was shared. Choose “Entire screen” and tick “Share system audio”.', 6000); }
    } catch (e) { AE.route(false); return toast('Screen/tab share was cancelled.'); }
  } else if (mode === 'sfx') aTrack = AE.rec.stream.getAudioTracks()[0];

  const tlb = buildTimeline(from, to);
  P.tl = tlb.tl; P.total = tlb.total; P.t = 0; P.seg = -2; P.exporting = true; P.expMode = mode; P.cancelled = false;
  sizeCanvas(S.exportRes / 720);
  document.body.classList.add('exporting'); $('#expOverlay').hidden = false; $('#expTitle').textContent = 'Recording…'; $('#result').hidden = true;

  const stream = cv.captureStream(S.fps), tracks = [...stream.getVideoTracks()];
  if (aTrack) tracks.push(aTrack);
  const opts = { videoBitsPerSecond: Math.round(S.bitrate * 1e6) };
  if (S.exportMime) opts.mimeType = S.exportMime;
  try { recorder = new MediaRecorder(new MediaStream(tracks), opts); }
  catch (e) { cleanupExport(); return toast('Recorder error: ' + e.message); }
  recChunks = [];
  recorder.ondataavailable = e => { if (e.data && e.data.size) recChunks.push(e.data); };
  recorder.onstop = () => {
    const cancelled = P.cancelled, type = recorder.mimeType || S.exportMime || 'video/webm';
    cleanupExport();
    if (cancelled) return toast('Export cancelled.');
    showResult(new Blob(recChunks, { type }), /mp4/.test(type) ? 'mp4' : 'webm');
    toast('Video ready — preview and download below.');
  };
  recorder.start(1000);
  if (mode === 'tab') await sleep(1200); // let the share banner settle
  P.last = performance.now(); P.playing = true; AE.startMusic(); updatePlayBtn();
}
function finishExport() {
  setTimeout(() => { if (recorder && recorder.state !== 'inactive') recorder.stop(); }, 700);
}
function cancelExport() {
  if (!P.exporting) return;
  if (P.fast) { P.cancelled = true; return; }
  P.cancelled = true; stopAll();
  if (recorder && recorder.state !== 'inactive') recorder.stop(); else cleanupExport();
}
function cleanupExport() {
  P.exporting = false; P.fast = false; P.playing = false; AE.stopMusic(); AE.stopQAudio(); AE.route(false);
  if (dispStream) { dispStream.getTracks().forEach(t => t.stop()); dispStream = null; }
  document.body.classList.remove('exporting'); $('#expOverlay').hidden = true;
  sizeCanvas(1); rebuild(); P.t = 0; updatePlayBtn();
}

/* ===================================================================
   FAST EXPORT — offline rendering with WebCodecs + mp4-muxer.
   Frames are drawn one by one (not in real time), audio is mixed offline,
   so it finishes much faster than the video length and needs no screen share.
   =================================================================== */
const FAST_OK = () => typeof VideoEncoder !== 'undefined' && typeof AudioEncoder !== 'undefined' && typeof VideoFrame !== 'undefined' && typeof AudioData !== 'undefined' && typeof Mp4Muxer !== 'undefined';
const yieldNow = () => new Promise(r => { const ch = new MessageChannel(); ch.port1.onmessage = () => r(); ch.port2.postMessage(0); }); // not throttled in background tabs
function showResult(blob, ext) {
  const url = URL.createObjectURL(blob);
  $('#resVideo').src = url; const a = $('#resLink'); a.href = url; a.download = `quiz-video.${ext}`;
  $('#result').hidden = false; $('#result').scrollIntoView({ behavior: 'smooth' });
}
function seekVid(v, t) {
  return new Promise(res => {
    t = clamp(t, 0, Math.max(0, (v.duration || 0) - 0.02));
    if (Math.abs(v.currentTime - t) < 0.001 && v.readyState >= 2) return res();
    const done = () => { v.removeEventListener('seeked', done); clearTimeout(to); res(); };
    const to = setTimeout(done, 1500);
    v.addEventListener('seeked', done); v.currentTime = t;
  });
}
async function preloadImages() {
  await Promise.all(Q.filter(q => q.img).map(q => new Promise(res => {
    getImg(q.img); const e = imgCache.get(q.img);
    if (e.ok) return res();
    e.im.addEventListener('load', res); e.im.addEventListener('error', res); setTimeout(res, 3000);
  })));
}
async function pickVideoCodec(w, h, fps, bitrate) {
  const list = [['avc', 'avc1.64002A'], ['avc', 'avc1.4D002A'], ['avc', 'avc1.42002A'], ['vp9', 'vp09.00.50.08'], ['av1', 'av01.0.12M.08']];
  for (const [mux, codec] of list) {
    try { const r = await VideoEncoder.isConfigSupported({ codec, width: w, height: h, bitrate, framerate: fps }); if (r.supported) return { mux, codec }; } catch { /* try next */ }
  }
  return null;
}
async function pickAudioCodec() {
  for (const [mux, codec] of [['aac', 'mp4a.40.2'], ['opus', 'opus']]) {
    try { const r = await AudioEncoder.isConfigSupported({ codec, sampleRate: 48000, numberOfChannels: 2, bitrate: 128000 }); if (r.supported) return { mux, codec }; } catch { /* try next */ }
  }
  return null;
}
async function renderMix(tlb) { // deterministic offline mix of every sound the live player would make (voice excluded)
  const SR = 48000, oc = new OfflineAudioContext(2, Math.max(1, Math.ceil(tlb.total * SR)), SR);
  const master = oc.createGain(); master.connect(oc.destination);
  if (assets.music && S.musicVol > 0) bufOn(oc, master, 0, assets.music, S.musicVol, { loop: true });
  for (const s of tlb.tl) {
    const end = s.start + s.dur;
    if (s.type === 'vid' && s.v.buf && S.vidVol > 0) bufOn(oc, master, s.start, s.v.buf, S.vidVol, { until: end });
    if ((s.type === 'intro' || s.type === 'summary') && S.startSound) SFX.start(oc, master, s.start);
    if (s.type === 'reveal') SFX.reveal(oc, master, s.start);
    if (s.type === 'ask') {
      const urgentT = S.urgentOn && s.dur > S.urgentSec + 0.5 ? end - S.urgentSec : 0;
      if (assets.qAudio && S.qAudioVol > 0) {
        const r = bufOn(oc, master, s.start, assets.qAudio, S.qAudioVol, { loop: true, until: end });
        if (urgentT) { r.g.gain.setValueAtTime(S.qAudioVol, urgentT); r.g.gain.setTargetAtTime(assets.urgent ? 0 : S.qAudioVol * 0.35, urgentT, 0.08); }
      }
      if (S.tickOn) for (let sec = Math.min(S.tickFrom, Math.floor(s.dur)); sec >= 1; sec--) SFX.tick(oc, master, end - sec, sec <= 3);
      if (urgentT) { if (assets.urgent) bufOn(oc, master, urgentT, assets.urgent, S.urgentVol); else SFX.riser(oc, master, urgentT, S.urgentSec); }
    }
  }
  return oc.startRendering();
}
async function fastExport(from, to) {
  let wl = null, venc = null, aenc = null, failed = null;
  try {
    await ensureFonts(); await preloadImages();
    const tlb = buildTimeline(from, to);
    P.tl = tlb.tl; P.total = tlb.total; P.t = 0; P.seg = -2; P.exporting = true; P.fast = true; P.playing = false; P.cancelled = false;
    sizeCanvas(S.exportRes / 720);
    document.body.classList.add('exporting'); $('#expOverlay').hidden = false; $('#result').hidden = true;
    $('#expTitle').textContent = 'Rendering (fast mode)…'; $('#expBar').style.width = '0%'; $('#expInfo').textContent = 'Preparing…';
    try { wl = await navigator.wakeLock.request('screen'); } catch { /* optional */ }

    const W = cv.width, H = cv.height, fps = S.fps, bitrate = Math.round(S.bitrate * 1e6), total = Math.ceil(tlb.total * fps);
    const vc = await pickVideoCodec(W, H, fps, bitrate);
    if (!vc) throw new Error('This browser has no usable video encoder. Switch “Export method” to Live recording.');
    const mixAudio = S.exportAudio !== 'silent';
    const ac = mixAudio ? await pickAudioCodec() : null;
    let pcm = null;
    if (ac) { $('#expInfo').textContent = 'Mixing audio…'; pcm = await renderMix(tlb); }
    const muxer = new Mp4Muxer.Muxer({
      target: new Mp4Muxer.ArrayBufferTarget(), fastStart: 'in-memory',
      video: { codec: vc.mux, width: W, height: H, frameRate: fps },
      ...(ac ? { audio: { codec: ac.mux, numberOfChannels: 2, sampleRate: 48000 } } : {})
    });
    venc = new VideoEncoder({ output: (ch, meta) => muxer.addVideoChunk(ch, meta), error: e => { failed = e; } });
    venc.configure({ codec: vc.codec, width: W, height: H, bitrate, framerate: fps });
    if (ac) {
      aenc = new AudioEncoder({ output: (ch, meta) => muxer.addAudioChunk(ch, meta), error: e => { failed = e; } });
      aenc.configure({ codec: ac.codec, sampleRate: 48000, numberOfChannels: 2, bitrate: 128000 });
    }
    let aPos = 0;
    const pushAudio = upToSec => {
      if (!pcm) return;
      const end = Math.min(pcm.length, Math.round(upToSec * 48000));
      while (aPos < end) {
        const n = Math.min(48000 / 2, end - aPos), data = new Float32Array(n * 2);
        data.set(pcm.getChannelData(0).subarray(aPos, aPos + n), 0); data.set(pcm.getChannelData(1).subarray(aPos, aPos + n), n);
        const ad = new AudioData({ format: 'f32-planar', sampleRate: 48000, numberOfFrames: n, numberOfChannels: 2, timestamp: Math.round(aPos / 48000 * 1e6), data });
        aenc.encode(ad); ad.close(); aPos += n;
      }
    };
    const t0 = performance.now();
    for (let n = 0; n < total; n++) {
      if (P.cancelled || failed) break;
      P.t = Math.min(n / fps, tlb.total);
      const seg = P.tl[segAt(P.t)], lt = clamp(P.t - seg.start, 0, seg.dur);
      if (seg.type === 'vid') await seekVid(seg.v.el, lt);
      render(ctx, CW, CH, K, seg, lt);
      const frame = new VideoFrame(cv, { timestamp: Math.round(n * 1e6 / fps), duration: Math.round(1e6 / fps) });
      venc.encode(frame, { keyFrame: n % (fps * 2) === 0 }); frame.close();
      if (n % fps === 0) pushAudio(n / fps + 1);
      while (venc.encodeQueueSize > 6 && !failed) await new Promise(r => venc.addEventListener('dequeue', r, { once: true }));
      if (n % 8 === 0) {
        const done = n / total, el = (performance.now() - t0) / 1000;
        $('#expBar').style.width = (done * 100).toFixed(1) + '%';
        $('#expInfo').textContent = `${Math.round(done * 100)}% · ${fmtT(P.t)} of ${fmtT(tlb.total)} · about ${el > 1 && done > 0.02 ? fmtT(el / done - el) : '…'} left — you can switch tabs`;
        await yieldNow();
      }
    }
    if (failed) throw failed;
    if (P.cancelled) { venc.close(); aenc && aenc.close(); venc = aenc = null; cleanupExport(); toast('Export cancelled.'); return; }
    $('#expInfo').textContent = 'Finishing file…';
    pushAudio(tlb.total + 1);
    await venc.flush(); if (aenc) await aenc.flush();
    if (failed) throw failed;
    muxer.finalize();
    const blob = new Blob([muxer.target.buffer], { type: 'video/mp4' });
    venc.close(); aenc && aenc.close(); venc = aenc = null;
    cleanupExport(); showResult(blob, 'mp4');
    toast(`Video ready in ${Math.round((performance.now() - t0) / 1000)}s (${vc.mux === 'avc' ? 'H.264' : vc.mux.toUpperCase()}${ac ? ' + ' + ac.mux.toUpperCase() : ', no audio'}).`, 5000);
  } catch (e) {
    try { venc && venc.state !== 'closed' && venc.close(); aenc && aenc.state !== 'closed' && aenc.close(); } catch { /* ignore */ }
    cleanupExport(); toast('Fast export failed: ' + (e && e.message || e), 8000);
  } finally { try { wl && wl.release(); } catch { /* ignore */ } }
}
function initExportMethod() {
  if (FAST_OK()) return;
  S.exportMethod = 'live';
  const o = $('#exportMethod option[value="fast"]'); if (o) { o.disabled = true; o.textContent += ' — not supported in this browser'; }
}

/* ===================================================================
   IMPORT / TEMPLATES
   =================================================================== */
const nk = k => String(k).toLowerCase().replace(/[^a-z0-9\u0900-\u097f]/g, '');
function parseAns(v, o) {
  if (typeof v === 'number') { if (v >= 1 && v <= 4) return v - 1; if (v === 0) return 0; }
  const s0 = String(v ?? '').trim(); if (!s0) return -1;
  const s = s0.replace(/[०-९]/g, d => NEP.indexOf(d));
  const m = s.match(/^(?:option|opt|ans|answer)?\s*[(\[]?([a-d]|[1-4]|[कखगघ])[)\].:]?$/i);
  if (m) { const ch = m[1].toLowerCase(); if ('abcd'.includes(ch)) return 'abcd'.indexOf(ch); if ('1234'.includes(ch)) return +ch - 1; return 'कखगघ'.indexOf(ch); }
  return o.findIndex(x => String(x).trim().toLowerCase() === s0.toLowerCase());
}
function rowToQ(r, warn) {
  const m = {};
  for (const k in r) m[nk(k)] = r[k];
  const opts = Array.isArray(r.options) ? r.options : Array.isArray(r.choices) ? r.choices : null;
  const pick = (...names) => { for (const n of names) if (m[n] !== undefined && String(m[n]).trim() !== '') return String(m[n]).trim(); return ''; };
  const q = pick('question', 'questions', 'q', 'ques', 'title', 'प्रश्न');
  const o = opts ? opts.map(String) : [pick('optiona', 'a', 'opta', 'option1', 'opt1', 'विकल्पa'), pick('optionb', 'b', 'optb', 'option2', 'opt2'), pick('optionc', 'c', 'optc', 'option3', 'opt3'), pick('optiond', 'd', 'optd', 'option4', 'opt4')];
  if (!q) return null;
  let ans = parseAns(m.correctanswer ?? m.answer ?? m.correct ?? m.ans ?? m.correctoption ?? m['सहीउत्तर'] ?? m['उत्तर'] ?? '', o);
  if (ans < 0) { ans = 0; warn.n++; }
  return mkQ(q, o, ans, pick('explanation', 'exp', 'explain', 'solution'), Number(pick('timer', 'time', 'seconds', 'sec')) || null, pick('image', 'img', 'imageurl'));
}
function addImported(qs, label) {
  if (!qs.length) return toast('No questions found in that file.');
  let replace = true;
  if (Q.length) replace = confirm(`Found ${qs.length} questions in ${label}.\n\nOK = replace the current ${Q.length} questions\nCancel = add them at the end`);
  Q = replace ? qs : Q.concat(qs);
  renderTable(); rebuild(); save();
}
async function importFile(file) {
  const name = file.name.toLowerCase(), warn = { n: 0 };
  try {
    let qs = [];
    if (name.endsWith('.json')) {
      const data = JSON.parse(await file.text());
      if (data && data.settings && Array.isArray(data.questions)) { // project file
        Object.assign(S, data.settings); Q = data.questions.map(fixQ); syncUI(); applyAll(); toast('Project loaded.'); return;
      }
      const arr = Array.isArray(data) ? data : data.questions || data.quiz || [];
      qs = arr.map(r => rowToQ(r, warn)).filter(Boolean);
    } else if (/\.(xlsx|xls|csv|ods)$/.test(name)) {
      const wb = name.endsWith('.csv') ? XLSX.read(await file.text(), { type: 'string' }) : XLSX.read(await file.arrayBuffer(), { type: 'array' });
      const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '', raw: false });
      qs = rows.map(r => rowToQ(r, warn)).filter(Boolean);
    } else return toast('Please choose a .xlsx, .xls, .csv or .json file.');
    addImported(qs, file.name);
    if (warn.n) toast(`${warn.n} question(s) had an unreadable “Correct Answer” — set to A. Please check.`, 6000);
  } catch (e) { toast('Import failed: ' + e.message, 6000); }
}
function downloadExcelTemplate() {
  const rows = [
    ['S.N', 'Question', 'Option A', 'Option B', 'Option C', 'Option D', 'Correct Answer', 'Explanation', 'Timer'],
    [1, 'What is the capital city of Nepal?', 'Pokhara', 'Kathmandu', 'Lalitpur', 'Biratnagar', 'B', 'Kathmandu is the capital of Nepal.', ''],
    [2, 'नेपालको सबैभन्दा अग्लो हिमाल कुन हो?', 'सगरमाथा', 'कञ्चनजङ्घा', 'मकालु', 'धौलागिरी', 'A', '', ''],
    [3, '2 + 2 = ?', '3', '4', '5', '6', 'B', '', '']
  ];
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [6, 50, 20, 20, 20, 20, 16, 40, 8].map(w => ({ wch: w }));
  const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Quiz');
  XLSX.writeFile(wb, 'quiz-template.xlsx');
}
function downloadJsonTemplate() {
  const data = [
    { question: 'What is the capital city of Nepal?', options: ['Pokhara', 'Kathmandu', 'Lalitpur', 'Biratnagar'], answer: 'B', explanation: 'Kathmandu is the capital of Nepal.' },
    { question: 'नेपालको सबैभन्दा अग्लो हिमाल कुन हो?', options: ['सगरमाथा', 'कञ्चनजङ्घा', 'मकालु', 'धौलागिरी'], answer: 'A', timer: 12 }
  ];
  saveBlob(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }), 'quiz-template.json');
}

/* ===================================================================
   QUESTION TABLE
   =================================================================== */
function renderTable() {
  const tb = $('#qt tbody');
  tb.innerHTML = Q.map((q, i) => `<tr data-i="${i}">
    <td class="n">${i + 1}</td>
    <td><textarea data-f="q" rows="2">${esc(q.q)}</textarea></td>
    ${[0, 1, 2, 3].map(k => `<td><input data-f="o${k}" value="${esc(q.o[k])}"></td>`).join('')}
    <td><select data-f="ans">${['A', 'B', 'C', 'D'].map((l, k) => `<option value="${k}"${q.ans === k ? ' selected' : ''}>${l}</option>`).join('')}</select></td>
    <td><input data-f="time" type="number" min="0" step="1" placeholder="auto" value="${q.time ?? ''}"><small>${q.ttsMs ? 'TTS ' + (q.ttsMs / 1000).toFixed(1) + 's' : ''}</small></td>
    <td><textarea data-f="exp" rows="2" placeholder="optional">${esc(q.exp)}</textarea></td>
    <td><div class="acts">
      <button data-act="play" title="Preview this question">▶</button><button data-act="up" title="Move up">↑</button><button data-act="down" title="Move down">↓</button>
      <button data-act="dup" title="Duplicate">⧉</button><button data-act="img" title="Add / replace picture">${q.img ? '🖼✓' : '🖼'}</button><button data-act="del" class="danger" title="Delete">✕</button>
    </div></td></tr>`).join('');
  loop.cq = -2;
}
let imgTarget = -1;
function bindTable() {
  const tb = $('#qt tbody');
  tb.addEventListener('input', e => {
    const el = e.target, f = el.dataset.f; if (!f) return;
    const i = +el.closest('tr').dataset.i, q = Q[i];
    if (f === 'q') { q.q = el.value; q.ttsMs = null; }
    else if (/^o\d$/.test(f)) { q.o[+f[1]] = el.value; q.ttsMs = null; }
    else if (f === 'ans') { q.ans = +el.value; q.revMs = null; }
    else if (f === 'time') q.time = el.value === '' ? null : Math.max(1, Number(el.value));
    else if (f === 'exp') q.exp = el.value;
    rebuild(); save();
  });
  tb.addEventListener('click', e => {
    const b = e.target.closest('button[data-act]'); if (!b) return;
    const i = +b.closest('tr').dataset.i, act = b.dataset.act;
    if (act === 'play') { const s = P.tl.find(x => x.type === (S.introSec > 0 ? 'intro' : 'ask') && x.i === i); if (s) { seek(s.start); play(); } return; }
    if (act === 'img') { imgTarget = i; if (Q[i].img && confirm('Remove the current picture?\n(Cancel to choose a new one)')) { Q[i].img = null; renderTable(); save(); } else $('#imgIn').click(); return; }
    if (act === 'up' && i > 0) [Q[i - 1], Q[i]] = [Q[i], Q[i - 1]];
    else if (act === 'down' && i < Q.length - 1) [Q[i + 1], Q[i]] = [Q[i], Q[i + 1]];
    else if (act === 'dup') Q.splice(i + 1, 0, fixQ(JSON.parse(JSON.stringify(Q[i]))));
    else if (act === 'del') Q.splice(i, 1);
    renderTable(); rebuild(); save();
  });
  $('#imgIn').addEventListener('change', e => {
    const f = e.target.files[0]; e.target.value = ''; if (!f || imgTarget < 0) return;
    const r = new FileReader(); r.onload = () => { Q[imgTarget].img = r.result; renderTable(); save(); }; r.readAsDataURL(f);
  });
}
function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

/* ===================================================================
   SETTINGS UI
   =================================================================== */
function syncUI() {
  $$('[data-s]').forEach(el => {
    const v = S[el.dataset.s];
    if (v === undefined) return;
    if (el.type === 'checkbox') el.checked = !!v; else el.value = v;
  });
}
function bindSettings() {
  $$('[data-s]').forEach(el => {
    const h = () => {
      const key = el.dataset.s;
      S[key] = el.type === 'checkbox' ? el.checked : (el.type === 'number' || el.type === 'range') ? (el.value === '' ? 0 : Number(el.value)) : el.value;
      onSetting(key);
    };
    el.addEventListener('input', h); el.addEventListener('change', h);
  });
}
function onSetting(key) {
  if (key === 'theme') { Object.assign(S, THEMES[S.theme]); syncUI(); }
  if (key === 'ratio') sizeCanvas(1);
  if (key === 'font') ensureFonts();
  if (key === 'musicVol') AE.setMusicVol();
  if (key === 'qAudioVol') AE.setQVol();
  if (key === 'vidVol') ['introVid', 'outroVid'].forEach(k => { if (assets[k] && assets[k].el._gain) assets[k].el._gain.gain.value = S.vidVol; });
  if (['rate', 'voiceEn', 'voiceNe'].includes(key)) Q.forEach(q => { q.ttsMs = null; });
  rebuild(); save();
}
function applyAll() { sizeCanvas(1); ensureFonts(); renderTable(); rebuild(); save(); fillVoices(); }

function fillVoices() {
  if (!TTS.ok) { $('#voiceInfo').className = 'note bad'; $('#voiceInfo').textContent = 'This browser does not support text-to-speech.'; return; }
  TTS.voices = speechSynthesis.getVoices();
  const mk = (sel, cur, prefer) => {
    const vs = [...TTS.voices].sort((a, b) => {
      const pa = prefer.some(p => a.lang.toLowerCase().startsWith(p)) ? 0 : 1, pb = prefer.some(p => b.lang.toLowerCase().startsWith(p)) ? 0 : 1;
      return pa - pb || a.name.localeCompare(b.name);
    });
    sel.innerHTML = '<option value="">Auto</option>' + vs.map(v => `<option value="${esc(v.voiceURI)}">${esc(v.name)} (${esc(v.lang)})</option>`).join('');
    sel.value = cur || '';
  };
  mk($('#voiceEn'), S.voiceEn, ['en']); mk($('#voiceNe'), S.voiceNe, ['ne', 'hi', 'mr']);
  const ne = TTS.find('ne'), en = TTS.find('en'), info = $('#voiceInfo');
  if (!TTS.voices.length) { info.className = 'note'; info.textContent = 'Voices are still loading… (some browsers need a moment or one click on the page).'; return; }
  if (ne && /^(ne|hi|mr)/i.test(ne.lang)) { info.className = 'note ok'; info.textContent = `Devanagari text will be read with: ${ne.name} (${ne.lang}).` + (/^ne/i.test(ne.lang) ? '' : ' (No Nepali voice found, so a Hindi/Marathi voice is used — it reads Devanagari reasonably well.)'); }
  else { info.className = 'note bad'; info.textContent = 'No Nepali / Hindi / Marathi voice was found on this device, so Nepali text may be read badly. Microsoft Edge usually includes natural Nepali voices; on other systems install a Nepali or Hindi voice in the OS language settings.'; }
  if (!en) info.textContent += ' No English voice found.';
}

/* ===================================================================
   WIRING
   =================================================================== */
async function loadImageFile(file) {
  return new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = URL.createObjectURL(file); });
}
async function loadVideoAsset(file, key) {
  const url = URL.createObjectURL(file), el = document.createElement('video');
  el.preload = 'auto'; el.playsInline = true; el.src = url;
  try {
    await new Promise((res, rej) => { el.onloadedmetadata = res; el.onerror = () => rej(new Error('this browser cannot play that file (try MP4 or WebM)')); });
    if (!isFinite(el.duration) || el.duration <= 0) throw new Error('the file has no readable length');
  } catch (e) { URL.revokeObjectURL(url); throw e; }
  const v = { el, url, dur: el.duration, name: file.name, buf: null };
  clearVideoAsset(key);
  AE.init(); AE.attachVideo(el);
  try { v.buf = await AE.ctx.decodeAudioData(await file.arrayBuffer()); } catch { v.buf = null; } // sound track for fast export
  assets[key] = v; P.t = 0; P.seg = -2; rebuild();
}
function clearVideoAsset(key) {
  const o = assets[key]; if (!o) return;
  o.el.pause(); try { o.el._gain && o.el._gain.disconnect(); } catch { /* ignore */ } URL.revokeObjectURL(o.url); assets[key] = null; rebuild();
}
function setup() {
  /* tabs */
  $('#tabs').addEventListener('click', e => {
    const b = e.target.closest('button[data-tab]'); if (!b) return;
    $$('#tabs button').forEach(x => x.classList.toggle('on', x === b));
    $$('.pane').forEach(p => p.classList.toggle('on', p.id === b.dataset.tab));
  });
  /* transport */
  $('#btnPlay').onclick = () => (P.playing ? pause() : play());
  $('#btnPrev').onclick = () => jumpQ(-1);
  $('#btnNext').onclick = () => jumpQ(1);
  $('#btnReveal').onclick = revealNow;
  $('#btnFull').onclick = () => { const w = $('#canvasWrap'); document.fullscreenElement ? document.exitFullscreen() : w.requestFullscreen && w.requestFullscreen(); };
  const sk = $('#seek');
  // Hold the playhead still while the slider is held, so playback never fights the drag
  sk.addEventListener('pointerdown', () => { dragging = true; });
  ['pointerup', 'pointercancel'].forEach(ev => window.addEventListener(ev, () => { dragging = false; }));
  sk.addEventListener('blur', () => { dragging = false; });
  sk.addEventListener('input', () => seek((sk.value / 1000) * P.total));
  document.addEventListener('keydown', e => {
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName) || P.exporting) return;
    if (e.code === 'Space') { e.preventDefault(); P.playing ? pause() : play(); }
    else if (e.key === 'ArrowRight') jumpQ(1); else if (e.key === 'ArrowLeft') jumpQ(-1);
    else if (e.key === 'r' || e.key === 'R') revealNow(); else if (e.key === 'f' || e.key === 'F') $('#btnFull').click();
  });
  /* project */
  $('#btnSaveProj').onclick = () => saveBlob(new Blob([JSON.stringify({ v: 1, settings: S, questions: Q.map(q => ({ ...q })) }, null, 1)], { type: 'application/json' }), 'quiz-project.json');
  $('#btnLoadProj').onclick = () => $('#projIn').click();
  $('#projIn').onchange = e => { const f = e.target.files[0]; e.target.value = ''; if (f) importFile(f); };
  $('#btnReset').onclick = () => { if (confirm('Start a new project? Unsaved work will be lost.')) { localStorage.removeItem(KEY); location.reload(); } };
  /* import */
  const drop = $('#drop');
  $('#btnUpload').onclick = () => $('#fileIn').click();
  $('#fileIn').onchange = e => { const f = e.target.files[0]; e.target.value = ''; if (f) importFile(f); };
  ['dragenter', 'dragover'].forEach(ev => document.addEventListener(ev, e => { e.preventDefault(); drop.classList.add('over'); }));
  ['dragleave', 'drop'].forEach(ev => document.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove('over'); }));
  document.addEventListener('drop', e => { const f = e.dataTransfer && e.dataTransfer.files[0]; if (f) importFile(f); });
  $('#btnTplX').onclick = downloadExcelTemplate; $('#btnTplJ').onclick = downloadJsonTemplate;
  $('#btnAdd').onclick = () => { Q.push(mkQ('', ['', '', '', ''], 0)); renderTable(); rebuild(); save(); const t = $$('#qt tbody tr').pop(); t && t.querySelector('textarea').focus(); };
  $('#btnShufQ').onclick = () => { shuffle(Q); renderTable(); rebuild(); save(); };
  $('#btnShufO').onclick = () => {
    Q.forEach(q => { const idx = shuffle([0, 1, 2, 3]); const o = idx.map(i => q.o[i]); q.ans = idx.indexOf(q.ans); q.o = o; q.ttsMs = null; });
    renderTable(); rebuild(); save();
  };
  $('#btnClear').onclick = () => { if (confirm('Delete all questions?')) { Q = []; renderTable(); rebuild(); save(); } };
  bindTable();
  /* style */
  $('#presetEn').onclick = () => { Object.assign(S, { qLabel: 'Question', revealLabel: 'Correct answer', letters: 'latin', nepDigits: false, title: 'Quiz Time', subtitle: 'Test your knowledge', outro: 'Thanks for watching!', outroSub: 'Like • Share • Subscribe', summaryTitle: 'Comment your score!', summarySub: 'How many did you get right?' }); syncUI(); rebuild(); save(); };
  $('#presetNe').onclick = () => { Object.assign(S, { qLabel: 'प्रश्न नं.', revealLabel: 'सही उत्तर', letters: 'nepali', nepDigits: true, title: 'क्विज समय', subtitle: 'आफ्नो ज्ञान जाँचौँ', outro: 'हेर्नुभएकोमा धन्यवाद!', outroSub: 'लाइक • सेयर • सब्सक्राइब', summaryTitle: 'तपाईंको स्कोर कमेन्ट गर्नुहोस्!', summarySub: 'तपाईंले कतिवटा सही गर्नुभयो?' }); syncUI(); rebuild(); save(); };
  $('#bgIn').onchange = async e => { const f = e.target.files[0]; e.target.value = ''; if (f) { try { assets.bgImg = await loadImageFile(f); } catch { toast('Could not read that image.'); } } };
  $('#bgClear').onclick = () => { assets.bgImg = null; };
  $('#logoIn').onchange = async e => { const f = e.target.files[0]; e.target.value = ''; if (f) { try { assets.logo = await loadImageFile(f); } catch { toast('Could not read that image.'); } } };
  $('#logoClear').onclick = () => { assets.logo = null; };
  /* sound */
  const audioInfo = () => { $('#audioInfo').textContent = [assets.qAudioName && `Audio 1: ${assets.qAudioName}`, assets.musicName && `Music: ${assets.musicName}`, assets.revealName && `Reveal sound: ${assets.revealName}`, assets.urgentName && `Last-seconds audio: ${assets.urgentName}`].filter(Boolean).join(' · ') + (assets.musicName || assets.revealName || assets.qAudioName || assets.urgentName ? '  (audio files are not saved with the project — re-add after reload)' : ''); };
  $('#musIn').onchange = async e => { const f = e.target.files[0]; e.target.value = ''; if (!f) return; try { assets.music = await AE.decode(f); assets.musicName = f.name; audioInfo(); toast('Music added.'); } catch { toast('Could not decode that audio file.'); } };
  $('#musClear').onclick = () => { assets.music = null; assets.musicName = ''; AE.stopMusic(); audioInfo(); };
  $('#qaIn').onchange = async e => { const f = e.target.files[0]; e.target.value = ''; if (!f) return; try { assets.qAudio = await AE.decode(f); assets.qAudioName = f.name; audioInfo(); toast('Audio 1 added.'); } catch { toast('Could not decode that audio file.'); } };
  $('#qaClear').onclick = () => { assets.qAudio = null; assets.qAudioName = ''; AE.stopQAudio(); audioInfo(); };
  $('#revIn').onchange = async e => { const f = e.target.files[0]; e.target.value = ''; if (!f) return; try { assets.reveal = await AE.decode(f); assets.revealName = f.name; audioInfo(); toast('Reveal sound added.'); } catch { toast('Could not decode that audio file.'); } };
  $('#revClear').onclick = () => { assets.reveal = null; assets.revealName = ''; audioInfo(); };
  $('#btnApplyTimer').onclick = () => { Q.forEach(q => { q.time = null; }); renderTable(); rebuild(); save(); toast('All questions now use the default timer.'); };
  $('#uaIn').onchange = async e => { const f = e.target.files[0]; e.target.value = ''; if (!f) return; try { assets.urgent = await AE.decode(f); assets.urgentName = f.name; audioInfo(); toast('Last-seconds audio added.'); } catch { toast('Could not decode that audio file.'); } };
  $('#uaClear').onclick = () => { assets.urgent = null; assets.urgentName = ''; AE.stopUrgent(); audioInfo(); };
  const vidInfo = () => { $('#vidInfo').textContent = [['introVid', 'Intro'], ['outroVid', 'Outro']].filter(([k]) => assets[k]).map(([k, n]) => `${n}: ${assets[k].name} (${assets[k].dur.toFixed(1)}s)`).join(' · ') + (assets.introVid || assets.outroVid ? '  (videos are not saved with the project — re-add after reload)' : ''); };
  const vidLoad = key => async e => {
    const f = e.target.files[0]; e.target.value = ''; if (!f) return;
    try { await loadVideoAsset(f, key); vidInfo(); toast('Video added.'); } catch (err) { toast('Could not use that video: ' + err.message, 6000); }
  };
  $('#ivIn').onchange = vidLoad('introVid'); $('#ovIn').onchange = vidLoad('outroVid');
  $('#ivClear').onclick = () => { clearVideoAsset('introVid'); vidInfo(); }; $('#ovClear').onclick = () => { clearVideoAsset('outroVid'); vidInfo(); };
  /* voice */
  $$('.js-measure').forEach(b => (b.onclick = measureAll));
  $('#btnMeasureStop').onclick = () => { measureCancel = true; TTS.stop(); };
  $('#testEn').onclick = () => TTS.speak('Question one. What is the capital city of Nepal? Correct answer. Kathmandu.');
  $('#testNe').onclick = () => TTS.speak('प्रश्न नम्बर एक। नेपालको राजधानी कुन हो? सही उत्तर। काठमाडौँ।');
  $('#testStop').onclick = () => TTS.stop();
  if (TTS.ok) { speechSynthesis.onvoiceschanged = fillVoices; }
  /* export */
  $('#btnExport').onclick = startExport;
  $('#btnExpCancel').onclick = cancelExport;
  window.addEventListener('beforeunload', e => { if (P.exporting) { e.preventDefault(); e.returnValue = ''; } });
}

/* ---------------------------------------------------------------- boot */
(async function boot() {
  if (!loadSaved()) Q = sampleQuestions();
  setup(); bindSettings(); fillMimes(); initExportMethod(); syncUI();
  sizeCanvas(1); renderTable(); rebuild(); fillVoices();
  await ensureFonts();
  requestAnimationFrame(t => { P.last = t; loop(t); });
  setTimeout(fillVoices, 800); setTimeout(fillVoices, 2500);
})();
