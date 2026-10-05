/**
 * Enregistre l'application « en direct », image par image, sur son jeu de données fictif.
 *
 * Le temps du navigateur est virtuel : requestAnimationFrame, performance.now, Date.now, setTimeout et setInterval
 * n'avancent que lorsque l'enregistreur le décide, de 1/30 s exactement entre deux captures. Les animations GSAP et
 * three.js de l'application sont donc filmées sans saccade, quelle que soit la vitesse de la machine.
 *
 *   node record/recorder.mjs [prise…]       # l'application doit tourner (python run.py) sur APP_URL
 *
 * Sortie : public/rec/<prise>.mp4 (H.264, 30 i/s), encodé avec le ffmpeg fourni par Remotion.
 */
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { TAKES } from "./takes.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
const require = createRequire(process.env.PLAYWRIGHT_REQUIRE ?? import.meta.url);
const { chromium } = require("playwright");
const APP = process.env.APP_URL ?? "http://127.0.0.1:8011";
const FPS = 30;
const DT = 1000 / FPS;
const TMP = process.env.REC_TMP ?? join(ROOT, "out", "rec-frames");
const FFMPEG = join(ROOT, "node_modules/@remotion/compositor-linux-x64-gnu/ffmpeg");

// Horloge virtuelle, injectée avant tout script de la page
const VIRTUAL_TIME = () => {
  let now = 0;
  const epoch = 1790000000000; // date fixe : rendu reproductible
  let raf = new Map(), rafId = 0;
  const timers = new Map();
  let timerId = 0;
  performance.now = () => now;
  const RealDate = Date;
  // eslint-disable-next-line no-global-assign
  Date = class extends RealDate { constructor(...a) { super(...(a.length ? a : [epoch + now])); } static now() { return epoch + now; } };
  window.requestAnimationFrame = (cb) => { raf.set(++rafId, cb); return rafId; };
  window.cancelAnimationFrame = (id) => raf.delete(id);
  window.setTimeout = (cb, ms = 0, ...args) => { timers.set(++timerId, { at: now + Math.max(0, ms), cb, args }); return timerId; };
  window.clearTimeout = (id) => timers.delete(id);
  window.setInterval = (cb, ms = 0, ...args) => { timers.set(++timerId, { at: now + Math.max(1, ms), cb, args, every: Math.max(1, ms) }); return timerId; };
  window.clearInterval = (id) => timers.delete(id);
  window.__vt = {
    step(ms) {
      now += ms;
      for (const [id, t] of [...timers]) {
        if (t.at <= now) {
          if (t.every) t.at += t.every; else timers.delete(id);
          try { typeof t.cb === "function" ? t.cb(...t.args) : null; } catch (e) { console.error(e); }
        }
      }
      const cbs = [...raf.values()];
      raf = new Map();
      for (const cb of cbs) { try { cb(now); } catch (e) { console.error(e); } }
    },
  };
  document.addEventListener("DOMContentLoaded", () => { document.documentElement.style.scrollBehavior = "auto"; });
};

async function runTake(browser, name, take) {
  const dir = join(TMP, name);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  page.on("pageerror", (e) => console.error(`[${name}] ${e}`));
  await page.addInitScript(VIRTUAL_TIME);
  await page.goto(APP + take.url, { waitUntil: "domcontentloaded" });
  // le curseur de l'application n'apparaît que sur les prises où la souris joue un rôle
  if (!take.cursor) await page.addStyleTag({ content: ".cur{display:none!important}" });
  const step = (ms = DT) => page.evaluate((m) => window.__vt.step(m), ms);
  // Préparation : le temps ne s'écoule pas tant que la page n'est pas prête (données chargées, scène 3D montée)
  for (let i = 0; i < 600; i++) {
    await step(take.warmClock ? DT : 0);
    await page.waitForTimeout(40);
    if (take.ready ? await page.evaluate(take.ready).catch(() => false) : i > 30) break;
  }
  if (take.setup) await take.setup({ page, step });
  for (let i = 0; i < (take.settle ?? 4); i++) { await step(0); await page.waitForTimeout(60); }
  const ctx = { page, step, mouse: page.mouse, keyboard: page.keyboard };
  for (let f = 0; f < take.frames; f++) {
    if (take.at) await take.at(f, ctx);
    await step();
    await page.screenshot({ path: join(dir, `${String(f).padStart(5, "0")}.jpg`), type: "jpeg", quality: 92 });
    if (f % 60 === 0) process.stdout.write(`[${name}] ${f}/${take.frames}\n`);
  }
  await page.close();
  const out = join(ROOT, "public", "rec", `${name}.mp4`);
  mkdirSync(dirname(out), { recursive: true });
  execFileSync(FFMPEG, ["-y", "-hide_banner", "-loglevel", "error", "-framerate", String(FPS), "-i", join(dir, "%05d.jpg"),
    "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "17", "-preset", "slow", "-movflags", "+faststart", out],
  { env: { ...process.env, LD_LIBRARY_PATH: dirname(FFMPEG) } });
  console.log(`[${name}] → ${out} (${readdirSync(dir).length} images)`);
  rmSync(dir, { recursive: true, force: true });
}

const wanted = process.argv.slice(2);
const browser = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--hide-scrollbars"] });
for (const [name, take] of Object.entries(TAKES)) {
  if (wanted.length && !wanted.includes(name)) continue;
  await runTake(browser, name, take);
}
await browser.close();
