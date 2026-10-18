#!/usr/bin/env node
// EP-023-T03: installed bb, real providers and host. No server writes or presence signals.
// node plugins/sidebar-tabs/scripts/w07-tabs-live.mjs
// BB_URL, W07_PAGE_URL, PLAYWRIGHT_CORE and W07_OUT override the local defaults.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";

const base = process.env.BB_URL ?? "http://127.0.0.1:38886";
const url = process.env.W07_PAGE_URL ?? `${base}/plugins/plan-board/plan/proj_r7rr637eng`;
const out = path.resolve(process.env.W07_OUT ?? "docs/plugins/sidebar-tabs/evidence/w07/live");
fs.mkdirSync(out, { recursive: true });
const cache = path.join(os.homedir(), ".npm/_npx");
const candidates = fs.existsSync(cache) ? fs.readdirSync(cache).map((dir) => path.join(cache, dir, "node_modules/playwright-core/index.mjs")) : [];
const modulePath = process.env.PLAYWRIGHT_CORE ?? candidates.find((file) => fs.existsSync(file));
assert(modulePath, "Set PLAYWRIGHT_CORE to the installed Playwright module");
const { chromium } = await import(modulePath);
// Explicit read allowlist: new RPC methods cannot silently acquire write permission.
const reads = {
  sessions: new Set(["sidebar_snapshot", "session_marks_get", "session_waits_get", "git_states_get", "activity_get", "usage_limits_get", "usage_visibility_get", "session_previews", "settings_get"]),
  "plan-board": new Set(["projects_list", "plan_get", "wave_sessions_list", "wave_sessions_overview", "plugin_agent_target"]),
  "document-review": new Set(["review.contexts", "review.sidebar", "review.tree"]),
};
const report = { at: new Date().toISOString(), url, cases: [], blocked: [] };
const browser = await chromium.launch();
try {
  for (const theme of ["light", "dark"]) {
    for (const touch of [false, true]) {
      const context = await browser.newContext({ viewport: { width: touch ? 390 : 1440, height: 900 },
        colorScheme: theme, hasTouch: touch, isMobile: touch, deviceScaleFactor: 2 });
      await context.route("**/api/v1/**", async (route) => {
        const request = route.request();
        const pathname = new URL(request.url()).pathname;
        if (request.method() === "GET") return route.continue();
        const rpc = pathname.match(/^\/api\/v1\/plugins\/([^/]+)\/rpc\/([^/]+)$/);
        if (rpc?.[1] === "sessions" && rpc[2] === "presence_ping") {
          return route.fulfill({ json: { ok: true, result: null } });
        }
        // These projections perform reads only, including the host's initial UI state.
        if (rpc && reads[rpc[1]]?.has(rpc[2])) return route.continue();
        report.blocked.push(`${request.method()} ${pathname}`);
        return route.fulfill({ status: 403, json: { ok: false, error: { code: "evidence_read_only", message: "Запись заблокирована сценарием W-07" } } });
      });
      const page = await context.newPage();
      page.setDefaultTimeout(10000);
      const item = { theme, touch, checks: {}, failures: [] };
      report.cases.push(item);
      try {
        await page.goto(url);
        const tabs = page.locator('[data-sidebar-tabs-host] [role="tab"]');
        await tabs.first().waitFor({ state: "attached", timeout: 30000 });
        if (touch) {
          const hit = await tabs.first().evaluate((el) => {
            const r = el.getBoundingClientRect();
            return el.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2));
          });
          if (!hit) await page.touchscreen.tap(30, 24);
        }
        await tabs.first().waitFor({ state: "visible", timeout: 10000 });
        await page.waitForFunction(() => document.querySelectorAll('[data-sidebar-tabs-host] [role="tab"]').length >= 2);
        item.checks.tabs = await tabs.evaluateAll((elements) => elements.map((el) => ({
          title: el.querySelector('.st-tab__label')?.textContent ?? el.textContent,
          icon: Boolean(el.querySelector("svg")), height: el.getBoundingClientRect().height,
          selected: el.getAttribute("aria-selected"), tabIndex: el.tabIndex,
          panelExists: Boolean(document.getElementById(el.getAttribute("aria-controls"))),
        })));
        item.checks.counts = await page.locator('[data-sidebar-tabs-host] .st-count').evaluateAll((els) => els.map((el) => ({
          text: el.textContent, height: el.getBoundingClientRect().height,
          fontSize: getComputedStyle(el).fontSize, fontWeight: getComputedStyle(el).fontWeight,
          accessibleLabel: el.nextElementSibling?.textContent,
        })));
        assert(item.checks.counts.every((count) => count.height === 16 && count.fontSize === "11px" && count.fontWeight === "600" && count.accessibleLabel), "Counter size or accessible label failed");
        assert(item.checks.tabs.every((tab) => tab.icon), "A provider has not supplied its icon in the installed bundle");
        assert(item.checks.tabs.every((tab) => tab.panelExists && tab.height >= (touch ? 40 : 24)), "Panel link or touch target failed");
        const first = tabs.nth(0), second = tabs.nth(1);
        await (touch ? first.tap() : first.click());
        await first.focus();
        await page.keyboard.press("ArrowRight");
        assert.equal(await second.getAttribute("aria-selected"), "true");
        assert.equal(await second.evaluate((el) => document.activeElement === el && el.tabIndex === 0), true);
        await page.keyboard.press("ArrowLeft");
        assert.equal(await first.getAttribute("aria-selected"), "true");
        await page.keyboard.press("Home");
        assert.equal(await first.getAttribute("aria-selected"), "true");
        await page.keyboard.press("End");
        assert.equal(await tabs.last().getAttribute("aria-selected"), "true");
        await (touch ? first.tap() : first.click());
        assert.equal(await first.getAttribute("aria-selected"), "true");
        item.checks.switching = "click/tap, ArrowRight, ArrowLeft, Home, End; selection and roving focus";
        item.checks.roving = await tabs.evaluateAll((els) => els.filter((el) => el.tabIndex === 0).length);
        assert.equal(item.checks.roving, 1);
        item.checks.dark = await page.evaluate(() => document.documentElement.classList.contains("dark"));
        assert.equal(item.checks.dark, theme === "dark");
        item.checks.coarse = await page.evaluate(() => matchMedia("(pointer: coarse)").matches);
        assert.equal(item.checks.coarse, touch);
      } catch (error) {
        item.failures.push(error.message);
      }
      const file = `tabs-${theme}${touch ? "-390" : ""}.png`;
      await page.screenshot({ path: path.join(out, file) });
      item.screenshot = path.join(out, file);
      await context.close();
    }
  }
} finally {
  await browser.close();
  fs.writeFileSync(path.join(out, "checks.json"), `${JSON.stringify(report, null, 2)}\n`);
}
console.log(JSON.stringify(report, null, 2));
if (report.cases.some((item) => item.failures.length)) process.exitCode = 1;
