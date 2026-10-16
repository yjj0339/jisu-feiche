// 无头冒烟测试（playwright + Chrome）：场景断言 + 截图
// 用法: node tools/verify.mjs [--shots]
import { chromium } from 'playwright';
import { mkdirSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BASE = 'http://127.0.0.1:8940/';
const SHOTS = resolve(ROOT, 'shots');
mkdirSync(SHOTS, { recursive: true });

const browser = await chromium.launch({ channel: 'chrome', headless: true });
let pass = 0, fail = 0;

async function newPage(w = 1280, h = 720) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h } });
  const pg = await ctx.newPage();
  pg.on('pageerror', e => { if (!pg.__errs) pg.__errs = []; pg.__errs.push(String(e)); });
  return pg;
}
const errsOf = pg => pg.__errs || [];

async function boot(pg, q = '') {
  await pg.goto(BASE + '?test=1' + (q ? '&' + q : ''), { waitUntil: 'networkidle', timeout: 30000 });
  await pg.waitForFunction(() => window.__game && window.__ctx && window.__ctx.state !== 'loading', null, { timeout: 20000 });
}

async function scenario(sc, ms, check) {
  const pg = await newPage();
  try {
    await boot(pg, 'sc=' + sc);
    await pg.waitForTimeout(ms);
    const rep = await pg.evaluate(() => window.__game.state());
    const errs = errsOf(pg);
    const ok = check(rep) && errs.length === 0;
    const perf = await pg.evaluate(() => {
      const r = window.__ctx.renderer;
      return { calls: r.info.render.calls, tris: r.info.render.triangles };
    }).catch(() => ({}));
    if (ok) { pass++; console.log(`[${sc}] ✓ perf=${JSON.stringify(perf)} player=${JSON.stringify(rep.race?.player?.progress)}`); }
    else { fail++; console.log(`[${sc}] ✗ errors=${JSON.stringify(errs)} player=${JSON.stringify(rep.race?.player)}`); }
    return { pg, rep, errs };
  } catch (e) {
    fail++; console.log(`[${sc}] ✗ 异常: ${e.message}`);
    return { pg, rep: null, errs: [e.message] };
  }
}

// ---- 逻辑场景 ----
await scenario('race', 30000, r => r.race && r.race.player && r.race.player.progress > 0.12);
await scenario('drift', 8000, r => r.race && (r.race.player.driftEarned > 0.05 || r.race.player.nitroCharge > 0.05));
await scenario('item', 9000, r => r.race && !!r.race.player.item);
await scenario('finish', 26000, r => r.race && r.race.player.finished && r.race.player.coins > 0);
await scenario('tt', 17000, r => r.race && r.race.karts.length === 1);
await scenario('tt-finish', 33000, r => r.race && !!r.race.ghostRig);

// ---- 截图 ----
if (process.argv.includes('--shots')) {
  const jobs = [
    ['menu.png', '', 1280, 720, 6000],
    ['countdown.png', 'sc=shot-countdown', 1280, 720, 2500],
    ['race-go.png', 'sc=shot-drift', 1280, 720, 8000],
    ['drift.png', 'sc=shot-drift', 1280, 720, 6800],
    ['flames.png', 'sc=shot-flames', 1280, 720, 5300],
    ['item.png', 'sc=shot-item', 1280, 720, 4200],
    ['mobile.png', 'sc=shot-flames&touch=1', 390, 780, 5300],
    ['track1.png', 'sc=shot-track1', 1280, 720, 9500],
    ['track2.png', 'sc=shot-track2', 1280, 720, 9500],
    ['track3.png', 'sc=shot-track3', 1280, 720, 9500],
    ['tt.png', 'sc=shot-tt', 1280, 720, 9000],
    ['results.png', 'sc=shot-results', 1280, 720, 26000],
  ];
  // 需要真实点击的界面截图
  const uiJobs = [
    ['tracksel.png', '#btn-speed', 3500],
    ['garage.png', '#btn-garage', 4000],
    ['garage2.png', '#btn-garage', 4200, '#garage-next', 4],
    ['help.png', '#btn-help', 1500],
  ];
  for (const [name, sel, ms, extraSel, extraN] of uiJobs) {
    const pg = await newPage();
    try {
      await boot(pg, '');
      await pg.click(sel);
      if (extraSel) for (let i = 0; i < extraN; i++) { await pg.click(extraSel); await pg.waitForTimeout(250); }
      await pg.waitForTimeout(ms);
      await pg.screenshot({ path: resolve(SHOTS, name) });
      const errs = errsOf(pg);
      console.log(`[shot] ${name} ${existsSync(resolve(SHOTS, name)) ? '✓' : '✗'} errs=${errs.length}`);
      if (errs.length) console.log('   ', JSON.stringify(errs.slice(0, 3)));
    } catch (e) { console.log(`[shot] ${name} ✗ ${e.message}`); }
    await pg.close();
  }
  for (const [name, q, w, h, ms] of jobs) {
    const pg = await newPage(w, h);
    try {
      await boot(pg, q);
      await pg.waitForTimeout(ms);
      await pg.screenshot({ path: resolve(SHOTS, name) });
      const errs = errsOf(pg);
      console.log(`[shot] ${name} ${existsSync(resolve(SHOTS, name)) ? '✓' : '✗'} errs=${errs.length}`);
      if (errs.length) console.log('   ', JSON.stringify(errs.slice(0, 3)));
    } catch (e) { console.log(`[shot] ${name} ✗ ${e.message}`); }
    await pg.close();
  }
}

await browser.close();
console.log(`\n结果: ${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
