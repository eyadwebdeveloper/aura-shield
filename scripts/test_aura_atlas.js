/* Interactive acceptance test for the Human-Atlas models inside AURA.
 * Covers: chunk loading (all 200s), hover tooltips (raycast picking proves
 * geometry mounted), click-to-select system emphasis, the 3-model switcher,
 * and the three viewport host pages.
 *
 * Load signal: the .atlas-progress pill appears while chunks stream and
 * disappears when the mount completes. No readPixels probing — the renderer
 * does not use preserveDrawingBuffer, so buffer reads are always zero.
 */
const { chromium } = require("playwright");

const BASE = process.env.AURA_BASE || "http://localhost:3100";
const results = [];
const t0 = Date.now();
function stamp() { return `[${((Date.now() - t0) / 1000).toFixed(1)}s]`; }
function check(name, ok, detail = "") {
  results.push({ name, ok });
  console.log(`${stamp()} ${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
}

(async () => {
  const browser = await chromium.launch({ args: ["--enable-unsafe-swiftshader"] });
  const page = await browser.newPage({ viewport: { width: 680, height: 560 } });
  page.setDefaultTimeout(90000);
  await page.addInitScript(() => localStorage.setItem("second-chair-settings", JSON.stringify({ state: { animationsEnabled: false, sidebarCollapsed: false, soundEnabled: true }, version: 0 })));

  const modelReqs = [];
  page.on("response", (res) => {
    const url = res.url();
    if (url.includes("/models/")) modelReqs.push({ url: url.replace(BASE, ""), status: res.status(), size: 0 });
  });
  page.on("pageerror", (err) => check("no page error", false, String(err).slice(0, 200)));

  const pill = page.locator(".atlas-progress");

  async function waitForAtlas(label, timeout = 150000) {
    console.log(`${stamp()} … waiting for ${label}`);
    try { await pill.waitFor({ state: "visible", timeout: 10000 }); } catch { /* may have already passed */ }
    const start = Date.now();
    while (Date.now() - start < timeout) {
      if (!(await pill.isVisible().catch(() => false))) {
        const failed = await page.locator(".model-empty h3").isVisible().catch(() => false);
        if (failed) { check(`${label}: streamed`, false, "error fallback showing"); return false; }
        check(`${label}: streamed`, true, `${((Date.now() - start) / 1000).toFixed(1)}s`);
        return true;
      }
      await page.waitForTimeout(400);
    }
    check(`${label}: streamed`, false, "timeout waiting for pill to clear");
    return false;
  }

  // Hover sweep along the body midline; success = tooltip with a structure name.
  async function probeHover(label) {
    const box = await page.locator(".model-viewport canvas").boundingBox();
    if (!box) { check(`${label}: hover tooltip`, false, "no canvas"); return false; }
    const pts = [[0.51, 0.31], [0.5, 0.35], [0.52, 0.4], [0.53, 0.46], [0.52, 0.5], [0.51, 0.56], [0.53, 0.62], [0.5, 0.68], [0.55, 0.44]];
    for (const [fx, fy] of pts) {
        await page.mouse.move(box.x + box.width * fx, box.y + box.height * fy);
        await page.waitForTimeout(350);
        if (await page.locator(".atlas-hover").isVisible().catch(() => false)) {
          const text = ((await page.locator(".atlas-hover").textContent()) || "").replace(/\s+/g, " ").trim();
          check(`${label}: hover tooltip (raycast hit)`, true, text.slice(0, 50));
          return true;
        }
    }
    // Fallback: wide coarse grid (for tightly framed sets like the leg muscles).
    for (const fy of [0.32, 0.4, 0.48, 0.56, 0.64]) {
      for (const fx of [0.38, 0.44, 0.5, 0.56, 0.62]) {
        await page.mouse.move(box.x + box.width * fx, box.y + box.height * fy);
        await page.waitForTimeout(300);
        if (await page.locator(".atlas-hover").isVisible().catch(() => false)) {
          const text = ((await page.locator(".atlas-hover").textContent()) || "").replace(/\s+/g, " ").trim();
          check(`${label}: hover tooltip (raycast hit)`, true, text.slice(0, 50));
          return true;
        }
      }
    }
    check(`${label}: hover tooltip (raycast hit)`, false, "sweep found no structure");
    return false;
  }

  // Click sweep; success = a system row becomes active.
  async function probePick(label) {
    const box = await page.locator(".model-viewport canvas").boundingBox();
    if (!box) { check(`${label}: click selects system`, false, "no canvas"); return false; }
    for (const [fx, fy] of [[0.51, 0.33], [0.52, 0.38], [0.53, 0.45], [0.52, 0.55], [0.53, 0.62], [0.51, 0.3]]) {
      await page.mouse.move(box.x + box.width * fx, box.y + box.height * fy);
      await page.waitForTimeout(250);
      await page.mouse.click(box.x + box.width * fx, box.y + box.height * fy);
      await page.waitForTimeout(400);
      if ((await page.locator(".body-context-list li.active").count()) > 0) {
        const name = await page.locator(".body-context-list li.active span").first().textContent();
        check(`${label}: click selects system`, true, (name || "").trim());
        return true;
      }
    }
    check(`${label}: click selects system`, false, "no emphasis after clicks");
    return false;
  }

  // ---------- Body Lab: initial male model ----------
  console.log(`${stamp()} goto /#/body`);
  await page.goto(`${BASE}/#/body`);
  await page.waitForSelector(".model-viewport canvas", { timeout: 20000 });
  check("body lab: canvas mounted", true);
  check("webgl alive", await page.evaluate(() => {
    const c = document.querySelector(".model-viewport canvas");
    return !!(c && (c.getContext("webgl2") || c.getContext("webgl")));
  }));

  const switcher = page.locator(".model-switch button");
  check("switcher: three buttons", (await switcher.count()) === 3, `count=${await switcher.count()}`);
  const labels = await switcher.allTextContents();
  check("switcher labels", /male/i.test(labels[0]) && /female/i.test(labels[1]) && /muscle/i.test(labels[2]),
    JSON.stringify(labels.map((l) => l.replace(/\s+/g, " ").trim())));

  await waitForAtlas("male model");
  await probeHover("male model");
  await probePick("male model");

  const bad1 = modelReqs.filter((r) => r.status !== 200);
  check("model files: all 200", bad1.length === 0, bad1.map((r) => `${r.url}→${r.status}`).join(",") || `${modelReqs.length} reqs`);

  // ---------- Switch to female ----------
  await page.locator(".model-switch button").filter({ hasText: "Female" }).click();
  await waitForAtlas("female model");
  const badF = modelReqs.filter((r) => r.url.includes("female-") && r.status !== 200);
  check("female chunks: all 200", badF.length === 0, badF.map((r) => `${r.url}→${r.status}`).join(",") || "ok");
  await probeHover("female model");
  const credit = (await page.locator(".model-credit-license").textContent()) || "";
  check("female model: per-model credit", /Browne|Human Reference Atlas/i.test(credit), credit.trim().slice(0, 60));

  // ---------- Switch to leg muscles ----------
  await page.locator(".model-switch button").filter({ hasText: "muscle" }).click();
  await waitForAtlas("leg-muscle model");
  await probeHover("leg-muscle model");

  // ---------- Switch back to male (chunk-cache eviction path) ----------
  await page.locator(".model-switch button").filter({ hasText: "Male" }).first().click();
  await waitForAtlas("male model (2nd load)");
  await probeHover("male model (2nd load)");

  // ---------- Dashboard body tab ----------
  console.log(`${stamp()} goto /#/dashboard`);
  await page.goto(`${BASE}/#/dashboard`);
  await page.waitForTimeout(1000);
  const tabs = page.locator('[role="tab"]');
  const n = await tabs.count();
  let opened = false;
  if (n) {
    for (let i = 0; i < n; i++) {
      const txt = ((await tabs.nth(i).textContent()) || "").toLowerCase();
      if (/body|atlas/.test(txt)) { await tabs.nth(i).click(); await page.waitForTimeout(800); opened = true; break; }
    }
  }
  if (!opened) { // maybe tabs are plain buttons
    const btns = page.locator("main button");
    const m = await btns.count();
    for (let i = 0; i < Math.min(m, 20); i++) {
      const txt = ((await btns.nth(i).textContent()) || "").toLowerCase();
      if (/body/.test(txt) && !/every|anyone/.test(txt)) { await btns.nth(i).click(); await page.waitForTimeout(800); opened = true; break; }
    }
  }
  if (opened && (await page.locator(".model-viewport canvas").count())) {
    await waitForAtlas("dashboard body tab");
    const note = (await page.locator(".model-asset-note").textContent()) || "";
    check("dashboard: attribution note", /BodyParts3D/.test(note), note.replace(/\s+/g, " ").trim().slice(0, 80));
  } else {
    check("dashboard: body tab with viewport", false, `tabs=${n} opened=${opened}`);
  }

  // ---------- System detail page ----------
  console.log(`${stamp()} goto /#/system/cardiovascular`);
  await page.goto(`${BASE}/#/system/cardiovascular`);
  await page.waitForSelector(".model-viewport canvas", { timeout: 20000 });
  await waitForAtlas("system detail (cardiovascular)");
  const note2 = (await page.locator(".model-asset-note").textContent()) || "";
  check("system detail: attribution note", /BodyParts3D/.test(note2), note2.replace(/\s+/g, " ").trim().slice(0, 80));

  // ---------- WebGL blocked: quiet fallback ----------
  const page2 = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await page2.addInitScript(() => {
    const orig = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, ...rest) {
      if (type === "webgl" || type === "webgl2") return null;
      return orig.call(this, type, ...rest);
    };
  });
  await page2.goto(`${BASE}/#/body`);
  await page2.waitForTimeout(2500);
  check("webgl blocked: quiet fallback", await page2.locator(".model-empty h3").filter({ hasText: "3D view unavailable" }).isVisible().catch(() => false));
  const links = await page2.locator(".model-system-links a").count();
  check("webgl blocked: system links offered", links >= 4, `links=${links}`);
  await page2.close();

  // ---------- Summary ----------
  console.log(`\n${stamp()} ${results.filter((r) => r.ok).length}/${results.length} passed`);
  console.log(`unique model files requested: ${new Set(modelReqs.map((r) => r.url)).size}`);
  await browser.close();
  const failed = results.filter((r) => !r.ok);
  process.exit(failed.length ? 1 : 0);
})().catch((e) => {
  console.error("HARNESS ERROR", e);
  process.exit(2);
});
