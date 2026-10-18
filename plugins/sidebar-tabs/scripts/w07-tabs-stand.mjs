#!/usr/bin/env node
// Стенд вкладок хозяина (EP-023-T03, W-07): полоса вкладок из tabs.css плагина и иконок lucide-react на теме bb по
// умолчанию (токены и шрифт — из демошита «Документов»), без живого bb. Снимки светлой и тёмной темы и 390 px с касанием,
// замеры размеров, контраста по вычисленным цветам, фокуса и reduced motion.
//   node --experimental-strip-types plugins/sidebar-tabs/scripts/w07-tabs-stand.mjs [--out docs/plugins/sidebar-tabs/evidence/w07]
// Разметка повторяет TabsHost (host.tsx): .st-strip > [role=tablist].st-seg > button.st-tab (иконка, подпись, счётчик).
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createElement as h, Fragment } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import * as lucide from "lucide-react";
import { badgeLabel, badgeText, tabIcon } from "../tabs-model.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, "../../..");
const outArg = process.argv.indexOf("--out");
const OUT = path.resolve(repo, outArg > 0 ? process.argv[outArg + 1] : "docs/plugins/sidebar-tabs/evidence/w07");
fs.mkdirSync(OUT, { recursive: true });

// Тема bb 0.45 по умолчанию и Inter — из демошита (значения хоста живут только там, в плагине — только имена).
const demo = fs.readFileSync(path.join(repo, "docs/plugins/document-review/design/demo.html"), "utf8");
const theme = demo.slice(demo.indexOf("<style>") + "<style>".length, demo.indexOf("/* ── Слой «Документов»"));
const tabsCss = fs.readFileSync(path.join(here, "../tabs.css"), "utf8");

/** One tab exactly as TabsHost renders it. */
function Tab({ title, icon, badge, selected, n }) {
  const name = tabIcon(icon);
  const Artwork = name ? lucide[name] : null;
  return h("button", { type: "button", role: "tab", "aria-selected": selected, tabIndex: selected ? 0 : -1, className: "st-tab", id: `tab-${n}` },
    Artwork && h(Artwork, { width: 14, height: 14, strokeWidth: 1.75, "aria-hidden": "true", focusable: "false" }),
    h("span", { className: "st-tab__label" }, title),
    badge !== null && h(Fragment, null,
      h("span", { className: "st-count st-count--waiting", "aria-hidden": "true" }, badgeText(badge)),
      h("span", { className: "st-sr" }, `, ${badgeLabel(badge)}`)));
}
const strip = (tabs, note) => h("section", { className: "case" },
  h("p", { className: "note" }, note),
  h("div", { className: "sidebar" },
    h("div", { "data-sidebar-tabs-host": "" },
      h("div", { className: "st-strip" },
        h("div", { role: "tablist", "aria-label": "Представления сайдбара", className: "st-seg" }, tabs.map((tab, index) => h(Tab, { key: index, n: `${note.length}-${index}`, ...tab })))),
      h("div", { className: "rows" }, ["Спроектировать плагин для работы", "Извлечь транскрипт из аудиофайла", "W-07 · Вкладки хозяина"].map((row) => h("div", { key: row, className: "row" }, row))))));

const cases = [
  strip([{ title: "Сессии", icon: "History", badge: 2, selected: true }, { title: "Документы", icon: "FileText", badge: null, selected: false }],
    "«Сессии» выбраны, 2 ждут вас; «Документы» без счётчика"),
  strip([{ title: "Сессии", icon: "History", badge: null, selected: false }, { title: "Документы", icon: "FileText", badge: 1, selected: true }],
    "«Документы» выбраны, 1 ждёт вас (как в демошите)"),
  strip([{ title: "Сессии", icon: "History", badge: 12, selected: true }, { title: "Документы", icon: "file-text", badge: 3, selected: false },
    { title: "Проба", icon: "NoSuchIcon", badge: null, selected: false }],
    "Три вида: иконка kebab-case, неизвестное имя — без иконки, счётчик 12"),
  strip([{ title: "Сессии", icon: undefined, badge: 1, selected: true }, { title: "Очень длинное название представления поставщика", icon: "Layers3", badge: 7, selected: false }],
    "Поставщик без иконки; длинная подпись обрезается"),
];

const page = (scheme) => `<!doctype html><html lang="ru" class="${scheme}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<style>@layer base, components;
${theme}
@layer base {
  *, *::before, *::after { box-sizing: border-box; }
  body { margin: 0; padding: 16px; font: 13px/1.4 var(--font-sans); background: var(--background); color: var(--foreground); }
  button { font: inherit; }
  .case { margin: 0 0 16px; }
  .note { max-width: 300px; margin: 0 0 6px; font-size: 12px; color: var(--muted-foreground); }
  .sidebar { width: 300px; max-width: 100%; border: 1px solid var(--border-seam); background: var(--sidebar); }
  .rows { padding: 4px 0; }
  .row { height: 28px; padding: 0 12px; display: flex; align-items: center; color: var(--foreground); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
}
${tabsCss}
</style></head><body>${renderToStaticMarkup(h(Fragment, null, ...cases))}</body></html>`;

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "st-w07-"));
const files = Object.fromEntries(["light", "dark"].map((scheme) => { const file = path.join(tmp, `${scheme}.html`); fs.writeFileSync(file, page(scheme)); return [scheme, file]; }));

const npx = path.join(os.homedir(), ".npm/_npx"); let pw;
for (const dir of fs.existsSync(npx) ? fs.readdirSync(npx) : []) { const c = path.join(npx, dir, "node_modules/playwright-core/index.mjs"); if (fs.existsSync(c)) { pw = c; break; } }
const { chromium } = await import(process.env.PLAYWRIGHT_CORE ?? pw);

/** Sizes, fonts and WCAG contrast of the strip by computed colours (canvas → sRGB, composited over the opaque layers). */
const measure = (page) => page.evaluate(() => {
  const ctx = Object.assign(document.createElement("canvas"), { width: 1, height: 1 }).getContext("2d", { willReadFrequently: true });
  const paint = (css) => { ctx.clearRect(0, 0, 1, 1); ctx.fillStyle = css; ctx.fillRect(0, 0, 1, 1); const d = ctx.getImageData(0, 0, 1, 1).data; return [d[0], d[1], d[2], d[3] / 255]; };
  const over = (top, base) => top.slice(0, 3).map((value, index) => Math.round(value * top[3] + base[index] * (1 - top[3])));
  const lum = ([r, g, b]) => { const f = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
  const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return +((x + 0.05) / (y + 0.05)).toFixed(2); };
  const style = (el) => getComputedStyle(el);
  const token = (name, base) => { const probe = document.createElement("i"); probe.style.color = `var(${name})`; document.querySelector("[data-sidebar-tabs-host]").append(probe);
    const value = over(paint(getComputedStyle(probe).color), base); probe.remove(); return value; };
  const page = over(paint(style(document.body).backgroundColor), [255, 255, 255]);
  const sidebar = over(paint(style(document.querySelector(".sidebar")).backgroundColor), page);
  const strip = over(paint(style(document.querySelector(".st-strip")).backgroundColor), sidebar);
  const track = over(paint(style(document.querySelector(".st-seg")).backgroundColor), strip);
  const on = document.querySelector('.st-tab[aria-selected="true"]');
  const off = document.querySelector('.st-tab[aria-selected="false"]');
  const onBg = over(paint(style(on).backgroundColor), track);
  const count = document.querySelector(".st-count");
  const countBg = over(paint(style(count).backgroundColor), onBg);
  const icon = on.querySelector("svg");
  const tabs = [...document.querySelectorAll(".st-tab")].map((tab) => tab.getBoundingClientRect());
  return {
    sizes: {
      tabHeightMin: Math.min(...tabs.map((r) => r.height)), tabWidthMin: Math.round(Math.min(...tabs.map((r) => r.width))),
      icon: `${icon.getBoundingClientRect().width}×${icon.getBoundingClientRect().height}`, iconStroke: icon.getAttribute("stroke-width"),
      count: `${count.getBoundingClientRect().height}px; ${style(count).fontSize} / ${style(count).fontWeight}; ${style(count).fontVariantNumeric}; radius ${style(count).borderRadius}`,
      label: `${style(on).fontSize} / ${style(on).fontWeight}`,
      unknownIconTabHasSvg: [...document.querySelectorAll(".st-tab")].filter((tab) => tab.textContent.startsWith("Проба")).map((tab) => Boolean(tab.querySelector("svg"))),
      noIconTabHasSvg: Boolean([...document.querySelectorAll(".st-tab")].find((tab) => tab.textContent.startsWith("Сессии") && !tab.querySelector("svg"))),
    },
    contrast: {
      "выбранная: подпись (foreground / background)": ratio(over(paint(style(on).color), onBg), onBg),
      "выбранная: иконка (foreground / background)": ratio(over(paint(style(icon).color), onBg), onBg),
      "невыбранная: подпись и иконка (muted-foreground / дорожка muted)": ratio(over(paint(style(off).color), track), track),
      "счётчик «ждёт вас»: число (background / pr-merged)": ratio(over(paint(style(count).color), countBg), countBg),
      "счётчик «ждёт вас»: заливка к выбранной вкладке (pr-merged / background), нетекст": ratio(countBg, onBg),
      "фокус (ring / дорожка muted), нетекст": ratio(token("--st-focus", track), track),
    },
  };
});

/** Open the stand with touch: pointer: coarse must hold (touch emulation can land after the first load — then reload). */
async function openTouch(page, file) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
  await page.goto(`file://${file}`);
  for (let attempt = 0; attempt < 3 && !(await page.evaluate(() => matchMedia("(pointer: coarse)").matches)); attempt++) await page.reload();
  await page.evaluate(() => document.fonts.ready);
}

const report = { at: new Date().toISOString(), shots: [], checks: {} };
const browser = await chromium.launch();
try {
  for (const scheme of ["light", "dark"]) {
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, colorScheme: scheme, deviceScaleFactor: 2 });
    const page = await context.newPage();
    await page.goto(`file://${files[scheme]}`);
    await page.evaluate(() => document.fonts.ready);
    const shot = path.join(OUT, `w07-ui-tabs-${scheme}.png`);
    await page.screenshot({ path: shot, clip: { x: 0, y: 0, width: 340, height: (await page.evaluate(() => document.body.scrollHeight)) } });
    report.shots.push(path.relative(repo, shot));
    report.checks[`${scheme}: размеры и контраст`] = await measure(page);
    // Клавиатура: Tab входит в группу на выбранную вкладку (roving tabindex), контур фокуса виден.
    await page.keyboard.press("Tab");
    const focused = await page.evaluate(() => { const el = document.activeElement; const s = getComputedStyle(el); return { label: el.textContent, selected: el.getAttribute("aria-selected"), outline: `${s.outlineStyle} ${s.outlineWidth}`, offset: s.outlineOffset }; });
    report.checks[`${scheme}: Tab → выбранная вкладка, :focus-visible`] = focused;
    const focusShot = path.join(OUT, `w07-ui-tabs-focus-${scheme}.png`);
    await page.screenshot({ path: focusShot, clip: { x: 0, y: 0, width: 340, height: 110 } });
    report.shots.push(path.relative(repo, focusShot));
    await context.close();
  }
  // 390 px, касание (pointer: coarse): цели ≥ 40 px.
  const touch = await browser.newContext({ viewport: { width: 390, height: 900 }, colorScheme: "light", hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  const tp = await touch.newPage();
  await openTouch(tp, files.light);
  // Без fullPage: снимок всей страницы пересчитывает метрики устройства и снимает эмуляцию касания (pointer: coarse).
  report.checks["390 px, pointer: coarse"] = await tp.evaluate(() => ({
    coarse: matchMedia("(pointer: coarse)").matches,
    tabHeights: [...new Set([...document.querySelectorAll(".st-tab")].map((tab) => tab.getBoundingClientRect().height))],
    horizontalScroll: document.documentElement.scrollWidth > innerWidth,
    fitsViewport: document.documentElement.scrollHeight <= innerHeight,
  }));
  const narrow = path.join(OUT, "w07-ui-tabs-390-light.png");
  await tp.screenshot({ path: narrow });
  report.shots.push(path.relative(repo, narrow));
  await touch.close();
  // Тёмная на 390 px — для полноты снимков.
  const touchDark = await browser.newContext({ viewport: { width: 390, height: 900 }, colorScheme: "dark", hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  const tdp = await touchDark.newPage();
  await openTouch(tdp, files.dark);
  const narrowDark = path.join(OUT, "w07-ui-tabs-390-dark.png");
  await tdp.screenshot({ path: narrowDark });
  report.shots.push(path.relative(repo, narrowDark));
  await touchDark.close();
  // prefers-reduced-motion: переходы вкладки — только цвет и фон.
  const still = await browser.newContext({ viewport: { width: 800, height: 600 }, reducedMotion: "reduce" });
  const sp = await still.newPage();
  await sp.goto(`file://${files.light}`);
  report.checks["prefers-reduced-motion: reduce"] = await sp.evaluate(() => ({ transitionProperty: getComputedStyle(document.querySelector(".st-tab")).transitionProperty }));
  await still.close();
} finally {
  await browser.close();
  fs.rmSync(tmp, { recursive: true, force: true });
}
fs.writeFileSync(path.join(OUT, "w07-tabs-stand.json"), `${JSON.stringify(report, null, 1)}\n`);
console.log(JSON.stringify(report, null, 1));
