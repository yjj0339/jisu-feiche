// ===== 音频：WebAudio 合成 SFX + BGM =====
export class AudioMan {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.enabled = true;
    this.bgmGain = null;
    this.bgmTimer = null;
    this.bgmKind = null;
    this.engineOsc = null;
    this.engineGain = null;
    this.driftSrc = null;
    this.driftGain = null;
    this.vol = 0.6;
  }

  unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.vol;
    this.master.connect(this.ctx.destination);
  }

  setVolume(v) {
    this.vol = v;
    if (this.master) this.master.gain.value = v;
  }

  now() { return this.ctx ? this.ctx.currentTime : 0; }

  // ---------- SFX ----------
  tone(freq, dur, type = 'square', gain = 0.2, slide = 0, delay = 0) {
    if (!this.ctx || !this.enabled) return;
    const t0 = this.now() + delay;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t0 + dur);
    g.gain.setValueAtTime(gain, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    o.connect(g); g.connect(this.master);
    o.start(t0); o.stop(t0 + dur + 0.05);
  }

  noise(dur, gain = 0.2, filterFreq = 1200, sweep = 0, delay = 0) {
    if (!this.ctx || !this.enabled) return;
    const t0 = this.now() + delay;
    const len = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const f = this.ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.setValueAtTime(filterFreq, t0);
    if (sweep) f.frequency.exponentialRampToValueAtTime(Math.max(60, filterFreq + sweep), t0 + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(t0); src.stop(t0 + dur + 0.05);
  }

  sfx(name) {
    if (!this.ctx || !this.enabled) return;
    switch (name) {
      case 'count': this.tone(660, 0.14, 'square', 0.28); break;
      case 'go': this.tone(880, 0.4, 'square', 0.3); this.tone(1320, 0.5, 'square', 0.2, 0, 0.05); break;
      case 'perfect': [660, 880, 1100, 1320].forEach((f, i) => this.tone(f, 0.12, 'square', 0.22, 0, i * 0.06)); break;
      case 'driftstart': this.noise(0.18, 0.12, 900, -300); break;
      case 'miniboost': this.tone(300, 0.22, 'sawtooth', 0.16, 500); this.noise(0.2, 0.1, 1600, 1200); break;
      case 'landboost': this.tone(240, 0.25, 'sawtooth', 0.16, 420); break;
      case 'nitro': this.noise(0.65, 0.26, 500, 2600); this.tone(180, 0.6, 'sawtooth', 0.14, 340); break;
      case 'pad': this.tone(520, 0.16, 'square', 0.18, 300); break;
      case 'ramp': this.noise(0.3, 0.14, 700, 900); break;
      case 'land': this.noise(0.16, 0.16, 300, -100); break;
      case 'wall': this.noise(0.12, 0.2, 500, -200); break;
      case 'bump': this.noise(0.1, 0.14, 350, -120); break;
      case 'lap': [880, 1100].forEach((f, i) => this.tone(f, 0.13, 'square', 0.2, 0, i * 0.09)); break;
      case 'final': [660, 660, 990].forEach((f, i) => this.tone(f, 0.14, 'square', 0.22, 0, i * 0.1)); break;
      case 'finish': [523, 659, 784, 1047, 784, 1047].forEach((f, i) => this.tone(f, 0.22, 'square', 0.2, 0, i * 0.11)); break;
      case 'item': [740, 990, 1240].forEach((f, i) => this.tone(f, 0.1, 'triangle', 0.2, 0, i * 0.05)); break;
      case 'missile': this.tone(220, 0.5, 'sawtooth', 0.16, 660); this.noise(0.4, 0.12, 2000, -1200); break;
      case 'explode': this.noise(0.5, 0.3, 220, -140); this.tone(90, 0.4, 'sawtooth', 0.2, -40); break;
      case 'splash': this.noise(0.45, 0.24, 1400, -900); break;
      case 'magnet': this.tone(320, 0.3, 'triangle', 0.18, 240); this.tone(560, 0.3, 'triangle', 0.14, 240, 0.1); break;
      case 'angel': [880, 1174, 1568].forEach((f, i) => this.tone(f, 0.3, 'sine', 0.2, 0, i * 0.12)); break;
      case 'spin': this.tone(400, 0.5, 'sawtooth', 0.16, -260); break;
      case 'shieldblock': this.tone(980, 0.2, 'sine', 0.24, 120); break;
      case 'respawn': this.tone(300, 0.3, 'sine', 0.2, 300); break;
      case 'click': this.tone(700, 0.07, 'square', 0.16); break;
      case 'buy': [660, 880, 1320].forEach((f, i) => this.tone(f, 0.14, 'square', 0.2, 0, i * 0.08)); break;
      case 'deny': this.tone(220, 0.2, 'square', 0.2, -60); break;
      case 'coin': this.tone(1200, 0.1, 'square', 0.18); this.tone(1600, 0.14, 'square', 0.16, 0, 0.07); break;
    }
  }

  // ---------- 引擎持续音 ----------
  startEngine() {
    if (!this.ctx || this.engineOsc) return;
    const o = this.ctx.createOscillator();
    o.type = 'sawtooth';
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = 700;
    const g = this.ctx.createGain(); g.gain.value = 0;
    o.connect(f); f.connect(g); g.connect(this.master);
    o.start();
    this.engineOsc = o; this.engineGain = g;
    // 漂移噪声环
    const len = this.ctx.sampleRate;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const src = this.ctx.createBufferSource(); src.buffer = buf; src.loop = true;
    const bf = this.ctx.createBiquadFilter(); bf.type = 'bandpass'; bf.frequency.value = 1100; bf.Q.value = 0.8;
    const dg = this.ctx.createGain(); dg.gain.value = 0;
    src.connect(bf); bf.connect(dg); dg.connect(this.master);
    src.start();
    this.driftSrc = src; this.driftGain = dg;
  }
  stopEngine() {
    if (this.engineOsc) { try { this.engineOsc.stop(); } catch (e) {} this.engineOsc = null; this.engineGain = null; }
    if (this.driftSrc) { try { this.driftSrc.stop(); } catch (e) {} this.driftSrc = null; this.driftGain = null; }
  }
  updateEngine(speed01, boosting, drifting) {
    if (!this.ctx || !this.engineGain) return;
    const f = 55 + speed01 * 190 + (boosting ? 40 : 0);
    this.engineOsc.frequency.setTargetAtTime(f, this.now(), 0.05);
    this.engineGain.gain.setTargetAtTime(0.028 + speed01 * 0.05, this.now(), 0.1);
    if (this.driftGain) this.driftGain.gain.setTargetAtTime(drifting ? 0.07 : 0, this.now(), 0.06);
  }

  // ---------- BGM（16 步循环合成） ----------
  startBGM(kind) {
    if (!this.ctx || this.bgmTimer) this.stopBGM();
    if (!this.ctx) return;
    this.bgmKind = kind;
    this.bgmGain = this.ctx.createGain();
    this.bgmGain.gain.value = kind === 'menu' ? 0.16 : 0.13;
    this.bgmGain.connect(this.master);
    const bpm = kind === 'menu' ? 104 : 132;
    const stepDur = 60 / bpm / 2;   // 八分音符
    let step = 0;
    // 和弦进行：C - G - Am - F
    const CH = [
      [261.6, 329.6, 392.0], [196.0, 246.9, 293.7],
      [220.0, 261.6, 329.6], [174.6, 220.0, 261.6],
    ];
    const MEL = [
      523.3, 0, 659.3, 587.3, 523.3, 0, 392.0, 0, 440.0, 0, 523.3, 493.9, 440.0, 0, 392.0, 0,
      523.3, 0, 659.3, 784.0, 659.3, 0, 587.3, 0, 523.3, 587.3, 659.3, 0, 784.0, 659.3, 587.3, 0,
    ];
    const tickFn = () => {
      if (!this.enabled || !this.bgmGain) return;
      const bar = Math.floor(step / 16) % 4;
      const chord = CH[bar];
      const s = step % 16;
      // 低音（每拍）
      if (s % 4 === 0) this.play(0, chord[0] / 2, stepDur * 1.8, 'triangle', 0.5);
      // 和弦垫
      if (s === 0) chord.forEach(f => this.play(0, f, stepDur * 7, 'sine', 0.10));
      // 主旋律
      const mel = MEL[(step % 32)];
      if (mel) this.play(0, mel, stepDur * 0.92, 'square', 0.16);
      // 鼓
      if (s % 4 === 0) this.drum(0, 'kick');
      if (s % 4 === 2) this.drum(0, 'snare');
      if (s % 2 === 1) this.drum(0, 'hat');
      step++;
    };
    this.bgmTimer = setInterval(tickFn, stepDur * 1000);
  }
  play(delay, freq, dur, type, gain) {
    const t0 = this.now();
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(gain, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    o.connect(g); g.connect(this.bgmGain);
    o.start(t0); o.stop(t0 + dur + 0.02);
  }
  drum(delay, kind) {
    if (kind === 'kick') {
      const o = this.ctx.createOscillator(), g = this.ctx.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(150, this.now());
      o.frequency.exponentialRampToValueAtTime(45, this.now() + 0.1);
      g.gain.setValueAtTime(0.5, this.now());
      g.gain.exponentialRampToValueAtTime(0.001, this.now() + 0.12);
      o.connect(g); g.connect(this.bgmGain);
      o.start(); o.stop(this.now() + 0.14);
    } else {
      const len = kind === 'snare' ? 0.09 : 0.04;
      const buf = this.ctx.createBuffer(1, this.ctx.sampleRate * len, this.ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
      const src = this.ctx.createBufferSource(); src.buffer = buf;
      const g = this.ctx.createGain(); g.gain.value = kind === 'snare' ? 0.22 : 0.08;
      src.connect(g); g.connect(this.bgmGain);
      src.start();
    }
  }
  stopBGM() {
    if (this.bgmTimer) { clearInterval(this.bgmTimer); this.bgmTimer = null; }
    if (this.bgmGain) { try { this.bgmGain.disconnect(); } catch (e) {} this.bgmGain = null; }
    this.bgmKind = null;
  }
}
