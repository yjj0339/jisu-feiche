// ===== 无头测试钩子：?test=1 与 &sc= 场景 =====
export function setupTest(ctx) {
  const q = new URLSearchParams(location.search);
  const input = ctx.input;

  const state = () => ({
    state: ctx.state, mode: ctx.mode, trackIdx: ctx.trackIdx, carIdx: ctx.carIdx,
    frozen: ctx.frozen,
    race: ctx.race ? {
      phase: ctx.race.phase, time: ctx.race.time, laps: ctx.race.laps,
      mode: ctx.race.mode, isTT: !!ctx.race.isTT,
      ghostRig: !!ctx.race.ghostRig, ghostFrames: ctx.race.ghostRec.length,
      ghostData: !!ctx.race.ghostData,
      player: (() => {
        const p = ctx.race.player;
        return p && {
          s: +p.s.toFixed(1), l: +p.l.toFixed(2), speed: +p.speed.toFixed(1), lap: p.lap,
          progress: +p.progress.toFixed(3), rank: ctx.race.rankOf(p),
          nitroCharge: +p.nitroCharge.toFixed(2), drifting: p.drifting,
          nitroTimer: +p.nitroTimer.toFixed(2), miniTimer: +p.miniTimer.toFixed(2),
          padTimer: +p.padTimer.toFixed(2), grounded: p.grounded,
          driftEarned: +(p.driftEarned || 0).toFixed(2),
          item: p.item, finished: p.finished, finishTime: +p.finishTime.toFixed(2),
          coins: ctx.save.coins,
        };
      })(),
      karts: ctx.race.karts.map(k => ({ name: k.name, progress: +k.progress.toFixed(3), speed: +k.speed.toFixed(1), finished: k.finished })),
    } : null,
    errors: window.__errs.slice(0, 10),
  });

  const report = (ok, extra = {}) => {
    const s = state();
    const out = JSON.stringify({ ok, ...extra, ...s });
    const el = document.getElementById('testout');
    if (el) el.textContent = out;
    document.title = 'T:' + (ok ? 'OK' : 'FAIL') + ' ' + out.slice(0, 300);
    console.log('TESTREPORT', out);
  };

  const game = {
    state, report,
    start(mode, track = 0, car = ctx.carIdx) {
      ctx.mode = mode; ctx.trackIdx = track; ctx.carIdx = car;
      ctx.startRacePublic && ctx.startRacePublic();
    },
    key(code, down) { input.keys[code] = down; },
    touch(name, down) { input.touch[name] = down; },
    freeze() { ctx.frozen = true; },
    teleport(ds, l) { const p = ctx.race.player; p.placeAt(ctx.race.track.wrap(p.s + ds), l); },
    placeAbs(s, l, half) {
      const p = ctx.race.player;
      p.placeAt(ctx.race.track.wrap(s), l);
      if (half) p.halfway = true;
    },
    give(item) { ctx.race.player.item = item; },
    setLaps(n) { ctx.race.laps = n; },
    nitro() { const p = ctx.race.player; p.nitroCharge = 2; p.nitroTimer = 1.8; },
    ctx,
  };
  window.__game = game;

  // ---------- 场景脚本 ----------
  const sc = q.get('sc');
  if (!sc) return;
  let t = 0;
  const done = { v: false };

  window.__testUpdate = (dt) => {
    if (done.v || !ctx.race) return;
    t += dt;
    const p = ctx.race.player;
    switch (sc) {
      case 'race': {
        input.keys['ArrowUp'] = true;
        const steer = Math.sin(t * 0.55) * 0.55;
        input.keys['ArrowLeft'] = steer > 0.15;
        input.keys['ArrowRight'] = steer < -0.15;
        if (ctx.race.phase === 'racing' && p._s0 === undefined) p._s0 = p.s;
        if (t > 26) {
          input.keys['ArrowUp'] = false;
          done.v = true;
          const moved = p._s0 !== undefined ? ctx.race.track.sDiff(p.s, p._s0) : 0;
          report(moved > 150 && window.__errs.length === 0, { note: 'race-progress', moved: +moved.toFixed(0) });
        }
        break;
      }
      case 'drift': {
        // 全程油门，1s 后持续按住漂移 + 正弦转向（必产生有效漂移）
        input.keys['ArrowUp'] = true;
        if (t > 1) input.keys['ShiftLeft'] = true;
        const steer = Math.sin(t * 0.8);
        input.keys['ArrowLeft'] = steer > 0.25;
        input.keys['ArrowRight'] = steer < -0.25;
        if (t > 9) {
          input.keys['ShiftLeft'] = false;
          done.v = true;
          report((p.driftEarned || 0) > 0.05 || p.nitroCharge > 0.05, { note: 'drift-charge', driftEarned: p.driftEarned, nitro: p.nitroCharge });
        }
        break;
      }
      case 'item': {
        if (t < 0.2) {
          const spots = ctx.race.trackScene.itemSpots;
          if (spots && spots.length) game.placeAbs(spots[0].s - 10, 0);
        }
        input.keys['ArrowUp'] = true;
        if (t > 4) {
          done.v = true;
          report(!!p.item, { note: 'item-pickup', item: p.item });
        }
        break;
      }
      case 'finish': {
        if (t < 0.2) { game.setLaps(1); game.placeAbs(ctx.race.track.startS - 45, 0, true); }
        input.keys['ArrowUp'] = true;
        if (ctx.state === 'results') {
          done.v = true;
          report(p.finished && ctx.save.coins > 0, { note: 'finish-results', coins: ctx.save.coins });
        } else if (t > 30) { done.v = true; report(false, { note: 'finish-timeout' }); }
        break;
      }
      case 'shot-drift': {
        if (t < 3) input.keys['ArrowUp'] = true;
        else if (t < 5) { input.keys['ArrowUp'] = true; input.keys['ArrowLeft'] = true; input.keys['ShiftLeft'] = true; }
        else if (t > 5.6) { game.freeze(); done.v = true; }
        break;
      }
      case 'shot-flames': {
        if (t < 3.2) input.keys['ArrowUp'] = true;
        else if (t < 3.5) { game.nitro(); }
        else if (t > 4.1) { game.freeze(); done.v = true; }
        break;
      }
      case 'shot-item': {
        if (t < 0.2) { game.teleport(30, 0); game.give('missile'); }
        input.keys['ArrowUp'] = true;
        if (t > 2.2 && t < 2.3 && ctx.race.itemSys) { ctx.race.itemSys.use(ctx.race.player); }
        if (t > 2.9) { game.freeze(); done.v = true; }
        break;
      }
      case 'shot-results': {
        if (t < 0.2) { game.setLaps(1); game.placeAbs(ctx.race.track.startS - 45, 0, true); }
        input.keys['ArrowUp'] = true;
        if (ctx.state === 'results' && t > 2.5) { game.freeze(); done.v = true; }
        else if (t > 28) { done.v = true; }
        break;
      }
      case 'tt': {
        input.keys['ArrowUp'] = true;
        const steer = Math.sin(t * 0.55) * 0.55;
        input.keys['ArrowLeft'] = steer > 0.15;
        input.keys['ArrowRight'] = steer < -0.15;
        if (ctx.race.phase === 'racing' && p._s0 === undefined) p._s0 = p.s;
        if (t > 14) {
          input.keys['ArrowUp'] = false;
          done.v = true;
          const moved = p._s0 !== undefined ? ctx.race.track.sDiff(p.s, p._s0) : 0;
          const rec = ctx.race.ghostRec.length;
          report(ctx.race.isTT && ctx.race.karts.length === 1 && moved > 100 && rec > 50,
            { note: 'tt-drive', moved: +moved.toFixed(0), recFrames: rec });
        }
        break;
      }
      case 'tt-finish': {
        if (t < 0.2) { game.setLaps(1); game.placeAbs(ctx.race.track.startS - 45, 0, true); }
        input.keys['ArrowUp'] = true;
        if (ctx.state === 'results' && !game._ttRestarted) {
          // 记录首轮后立刻再开一局，验证幽灵已存档并被加载
          game._ttRestarted = true;
          const tid = ctx.race.track.def.id;
          const g1 = ctx.save.ghosts && ctx.save.ghosts[tid];
          setTimeout(() => game.start('tt', 0, ctx.carIdx), 300);
          setTimeout(() => {
            done.v = true;
            report(!!(g1 && g1.frames && ctx.race && ctx.race.ghostRig),
              { note: 'tt-ghost-replay', frames: g1 && g1.frames.length, ghostLoaded: !!ctx.race.ghostRig });
          }, 2500);
        } else if (t > 40) { done.v = true; report(false, { note: 'tt-timeout' }); }
        break;
      }
      case 'shot-tt': {
        input.keys['ArrowUp'] = true;
        const steer = Math.sin(t * 0.5) * 0.4;
        input.keys['ArrowLeft'] = steer > 0.2;
        input.keys['ArrowRight'] = steer < -0.2;
        if (t > 6.5) { game.freeze(); done.v = true; }
        break;
      }
      case 'shot-track1': {
        input.keys['ArrowUp'] = true;
        if (t > 7) { game.freeze(); done.v = true; }
        break;
      }
      case 'shot-track2': {
        input.keys['ArrowUp'] = true;
        if (t > 7) { game.freeze(); done.v = true; }
        break;
      }
    }
  };

  // 自动启动场景
  const START_LIST = ['race', 'drift', 'item', 'finish', 'shot-drift', 'shot-flames', 'shot-item',
    'shot-countdown', 'shot-track1', 'shot-track2', 'shot-track3', 'shot-results', 'tt', 'tt-finish', 'shot-tt'];
  if (START_LIST.includes(sc)) {
    const mode = (sc === 'item' || sc === 'shot-item') ? 'item'
      : (sc === 'tt' || sc === 'tt-finish' || sc === 'shot-tt') ? 'tt' : 'speed';
    const track = sc === 'shot-track1' ? 1 : sc === 'shot-track2' ? 2 : sc === 'shot-track3' ? 3 : 0;
    setTimeout(() => {
      game.start(mode, track, ctx.carIdx);
      if (sc === 'shot-countdown') { /* 保持倒计时阶段 */ }
    }, 100);
  }
}
