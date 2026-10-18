#!/usr/bin/env node
// Плитки разделов (sidebar-tabs 0.3.0) в живом bb: снимки обеих тем и 390 px, перестановка мышью и Alt+стрелками
// (порядок пишет bb — sidebar.pluginPanelOrder), перетаскивание за край сайдбара в рабочую зону (выбор места bb),
// «Настроить панель», контраст и reduced motion. Записи bb, кроме настроек интерфейса, отклоняются; исходный порядок
// разделов возвращается в конце (bb settings ui set).
//   node plugins/sidebar-tabs/scripts/tiles-evidence.mjs [--out docs/plugins/sidebar-tabs/evidence/tiles]
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const args = Object.fromEntries(process.argv.slice(2).reduce((out, value, index, all) => {
  if (value.startsWith("--")) out.push([value.slice(2), all[index + 1] && !all[index + 1].startsWith("--") ? all[index + 1] : true]);
  return out;
}, []));
const BB = process.env.BB_URL ?? "http://127.0.0.1:38886";
const PAGE = `${BB}/plugins/plan-board/plan/proj_r7rr637eng`;
const OUT = path.resolve(args.out ?? "docs/plugins/sidebar-tabs/evidence/tiles");
fs.mkdirSync(OUT, { recursive: true });
const npx = path.join(os.homedir(), ".npm/_npx"); let pw;
for (const dir of fs.existsSync(npx) ? fs.readdirSync(npx) : []) { const c = path.join(npx, dir, "node_modules/playwright-core/index.mjs"); if (fs.existsSync(c)) { pw = c; break; } }
const { chromium } = await import(process.env.PLAYWRIGHT_CORE ?? pw);

const ORDER_KEY = "sidebar.pluginPanelOrder";
const readOrder = () => JSON.parse(execFileSync("bb", ["settings", "ui", "get", ORDER_KEY], { encoding: "utf8" }));
const originalOrder = readOrder();
const report = { at: new Date().toISOString(), bb: BB, originalOrder, shots: [], themes: {}, narrow: null, reducedMotion: null };
const fail = (message) => ({ status: 500, contentType: "application/json", body: JSON.stringify({ ok: false, error: { code: "internal_error", message } }) });
const browser = await chromium.launch();

async function open({ theme = "light", width = 1440, height = 900, touch = false, reducedMotion = "no-preference" } = {}) {
  const context = await browser.newContext({ viewport: { width, height }, colorScheme: theme, reducedMotion, deviceScaleFactor: 2,
    ...(touch ? { hasTouch: true, isMobile: true } : {}) });
  await context.route("**/api/v1/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (/presence_ping$/.test(url.pathname)) return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, result: null }) });
    if (request.method() === "GET" || /^\/api\/v1\/plugins\/[^/]+\/rpc\//.test(url.pathname) || /^\/api\/v1\/preferences\/ui\//.test(url.pathname)) return route.fallback();
    return route.fulfill(fail("Запись bb заблокирована сценарием"));
  });
  return { context, page: await context.newPage() };
}
async function ready(page, url = PAGE) {
  await page.goto(url, { waitUntil: "load" });
  await page.waitForSelector("[data-sidebar-tiles] .st-tile", { timeout: 90_000 });
  await page.waitForTimeout(2000);
}
async function shot(page, name, clip) {
  const file = path.join(OUT, `${name}.png`);
  await page.screenshot({ path: file, ...(clip ? { clip } : {}) });
  report.shots.push(path.relative(process.cwd(), file));
  console.log(path.relative(process.cwd(), file));
}
const topClip = (page) => page.evaluate(() => {
  const nav = document.querySelector("[data-sidebar-tiles]")?.getBoundingClientRect();
  const side = document.querySelector('[data-sidebar="sidebar"]')?.getBoundingClientRect();
  return nav ? { x: 0, y: 0, width: Math.ceil((side ?? nav).right) + 2, height: Math.min(innerHeight, Math.ceil(nav.bottom) + 120) } : null;
});
const tiles = (page) => page.evaluate(() => Array.from(document.querySelectorAll("[data-sidebar-tiles] [data-tile-id]"), (cell) => {
  const button = cell.querySelector(".st-tile"); const r = button.getBoundingClientRect();
  return { id: cell.getAttribute("data-tile-id"), label: button.getAttribute("aria-label"), current: button.getAttribute("aria-current"),
    x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2), w: Math.round(r.width), h: Math.round(r.height), top: Math.round(r.top) };
}));
const contrast = (page, selector, property = "color") => page.evaluate(({ selector, property }) => {
  const el = document.querySelector(selector);
  if (!el) return null;
  const canvas = document.createElement("canvas"); canvas.width = canvas.height = 1;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  const rgba = (css) => { ctx.clearRect(0, 0, 1, 1); ctx.fillStyle = "#000"; ctx.fillStyle = css; ctx.fillRect(0, 0, 1, 1); const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data; return [r, g, b, a / 255]; };
  const over = (top, bottom) => [0, 1, 2].map((i) => top[i] * top[3] + bottom[i] * (1 - top[3])).concat(1);
  const layers = [];
  for (let node = el; node; node = node.parentElement) { const bg = rgba(getComputedStyle(node).backgroundColor); if (bg[3] > 0) { layers.push(bg); if (bg[3] >= 1) break; } }
  let bg = [255, 255, 255, 1];
  for (const layer of layers.reverse()) bg = over(layer, bg);
  const fg = over(rgba(getComputedStyle(el)[property]), bg);
  const lum = (c) => { const [r, g, b] = c.slice(0, 3).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
  const [a, b] = [lum(fg), lum(bg)].sort((x, y) => y - x);
  return Math.round(((a + 0.05) / (b + 0.05)) * 100) / 100;
}, { selector, property });
const waitOrder = async (predicate, ms = 5000) => {
  const until = Date.now() + ms;
  while (Date.now() < until) { const order = readOrder(); if (predicate(order)) return order; await new Promise((resolve) => setTimeout(resolve, 250)); }
  return readOrder();
};
const visibleOf = (order, ids) => order.filter((id) => ids.includes(id));

try {
  for (const theme of ["light", "dark"]) {
    const { context, page } = await open({ theme });
    await ready(page);
    const result = { tiles: await tiles(page) };
    const clip = await topClip(page);
    await shot(page, `${theme}-1-rest`, clip);
    result.contrast = {
      icon: await contrast(page, "[data-sidebar-tiles] .st-tile:not([aria-current]):not(.st-tile--settings)"),
      iconActive: await contrast(page, '[data-sidebar-tiles] .st-tile[aria-current="page"]'),
      settings: await contrast(page, "[data-sidebar-tiles] .st-tile--settings"),
      settingsBorder: await contrast(page, "[data-sidebar-tiles] .st-tile--settings", "borderTopColor"),
    };
    const first = result.tiles[0];
    await page.mouse.move(first.x, first.y);
    await page.waitForTimeout(300);
    await shot(page, `${theme}-2-hover`, clip);
    if (theme === "light") {
      const ids = result.tiles.map((tile) => tile.id);
      // Mouse: drag the first tile onto the third slot, inside the sidebar.
      const third = result.tiles[2];
      await page.mouse.down();
      await page.mouse.move(first.x + 10, first.y, { steps: 3 });
      await page.mouse.move(third.x, third.y, { steps: 8 });
      await page.waitForTimeout(150);
      result.duringDrag = await tiles(page);
      await shot(page, "light-3-dragging", clip);
      await page.mouse.up();
      await page.waitForTimeout(400);
      result.afterDrag = (await tiles(page)).map((tile) => tile.id);
      result.savedAfterDrag = visibleOf(await waitOrder((order) => visibleOf(order, ids)[2] === ids[0]), ids);
      result.urlAfterDrag = page.url();
      // Keyboard: focus the moved tile, Alt+Left puts it back one place; the plain arrows only move focus.
      await page.focus(`[data-sidebar-tiles] [data-tile-id="${ids[0]}"] .st-tile`);
      await page.keyboard.press("Alt+ArrowLeft");
      await page.waitForTimeout(400);
      result.afterAltLeft = (await tiles(page)).map((tile) => tile.id);
      result.focusAfterAltLeft = await page.evaluate(() => document.activeElement?.closest("[data-tile-id]")?.getAttribute("data-tile-id"));
      result.announcement = await page.evaluate(() => document.querySelector("[data-sidebar-tiles] [role=status]")?.textContent);
      await page.keyboard.press("ArrowRight");
      result.focusAfterArrow = await page.evaluate(() => document.activeElement?.closest("[data-tile-id]")?.getAttribute("data-tile-id") ?? document.activeElement?.getAttribute("aria-label"));
      result.savedAfterKeys = visibleOf(await waitOrder((order) => visibleOf(order, ids)[1] === ids[0]), ids);
      await shot(page, "light-4-keyboard", clip);
      // Drag to the workspace: past the sidebar's right edge bb takes over and shows where the page will open.
      const before = await page.evaluate(() => document.querySelectorAll("[data-split-pane-id]").length);
      const tile = (await tiles(page)).find((item) => item.id === "deploy-ops/projects") ?? (await tiles(page))[0];
      await page.mouse.move(tile.x, tile.y);
      await page.mouse.down();
      await page.mouse.move(tile.x + 20, tile.y, { steps: 4 });
      await page.mouse.move(1380, 450, { steps: 25 });
      await page.waitForTimeout(400);
      await shot(page, "light-5-dock-preview");
      await page.mouse.up();
      await page.waitForTimeout(1500);
      result.dock = { tile: tile.id, panesBefore: before, panesAfter: await page.evaluate(() => document.querySelectorAll("[data-split-pane-id]").length),
        orderUnchanged: JSON.stringify(visibleOf(readOrder(), ids)) === JSON.stringify(result.savedAfterKeys), url: page.url() };
      await shot(page, "light-6-docked");
      // «Настроить панель» opens bb's editor in place of the tiles.
      await page.click("[data-sidebar-tiles] .st-tile--settings");
      await page.waitForTimeout(800);
      result.customizeOpen = await page.evaluate(() => !document.querySelector("[data-sidebar-tiles]") || /Customize|Настро/i.test(document.querySelector('[data-sidebar="sidebar"]')?.textContent ?? ""));
      await shot(page, "light-7-customize", await page.evaluate(() => { const r = document.querySelector('[data-sidebar="sidebar"]')?.getBoundingClientRect(); return r ? { x: 0, y: 0, width: Math.ceil(r.right), height: Math.min(innerHeight, 700) } : null; }));
    }
    report.themes[theme] = result;
    await context.close();
  }

  {
    const { context, page } = await open({ reducedMotion: "reduce" });
    await ready(page);
    report.reducedMotion = await page.evaluate(() => getComputedStyle(document.querySelector(".st-tile")).transitionProperty);
    await context.close();
  }

  {
    const { context, page } = await open({ width: 390, height: 844, touch: true });
    await page.goto(`${BB}/`, { waitUntil: "load" });
    await page.waitForTimeout(2500);
    const shown = () => page.evaluate(() => { const el = document.querySelector("[data-sidebar-tiles] .st-tile"); if (!el) return false; const r = el.getBoundingClientRect(); return r.width > 0 && r.left >= 0 && r.left < innerWidth; });
    if (!(await shown())) { await page.touchscreen.tap(30, 24); await page.waitForTimeout(1500); }
    report.narrow = { shown: await shown(), tiles: await tiles(page) };
    await shot(page, "390-1-rest");
    await context.close();
  }
} finally {
  await browser.close();
  execFileSync("bb", ["settings", "ui", "set", ORDER_KEY, JSON.stringify(originalOrder)]);
  report.restoredOrder = readOrder();
  fs.writeFileSync(path.join(OUT, "report.json"), JSON.stringify(report, null, 1));
  console.log(JSON.stringify(report, null, 1));
}
