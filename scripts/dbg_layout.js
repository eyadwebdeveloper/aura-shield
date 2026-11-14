const { chromium } = require("playwright");
(async () => {
  const browser = await chromium.launch({ args: ["--enable-unsafe-swiftshader"] });
  const issues = [];
  for (const [name, vp] of [["desktop", { width: 1440, height: 900 }], ["laptop", { width: 1100, height: 800 }], ["mobile", { width: 390, height: 844 }]]) {
    const page = await browser.newPage({ viewport: vp });
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e).slice(0, 120)));
    page.on("console", (m) => { if (m.type() === "error") errors.push(m.text().slice(0, 120)); });
    await page.goto("http://localhost:3100/#/body");
    const pill = page.locator(".atlas-progress");
    await pill.waitFor({ state: "visible", timeout: 8000 }).catch(() => {});
    while (await pill.isVisible().catch(() => false)) await page.waitForTimeout(400);
    await page.waitForTimeout(500);
    const layout = await page.evaluate(() => {
      const out = {};
      const doc = document.documentElement;
      out.hScroll = doc.scrollWidth > doc.clientWidth + 1;
      const sw = document.querySelector(".model-switch");
      const vpEl = document.querySelector(".model-viewport");
      const aside = document.querySelector(".body-context");
      if (sw) { const b = sw.getBoundingClientRect(); out.switch = { w: Math.round(b.width), visible: b.width > 50 && b.height > 10 }; }
      if (vpEl) { const b = vpEl.getBoundingClientRect(); out.viewport = { w: Math.round(b.width), h: Math.round(b.height), inViewport: b.bottom > 0 && b.top < innerHeight }; }
      if (aside) { const b = aside.getBoundingClientRect(); out.aside = { h: Math.round(b.height) }; }
      out.credit = !!document.querySelector(".model-credit-license");
      out.note = !!document.querySelector(".model-asset-note");
      return out;
    });
    console.log(name, JSON.stringify(layout), "errors:", errors.length ? errors.slice(0, 3) : "none");
    if (layout.hScroll) issues.push(`${name}: horizontal scroll`);
    if (!layout.credit) issues.push(`${name}: credit block missing`);
    if (!layout.note) issues.push(`${name}: asset note missing`);
    if (errors.length) issues.push(`${name}: ${errors.length} console/page errors`);
    // system detail + dashboard quick check
    await page.goto("http://localhost:3100/#/system/immune");
    await page.waitForTimeout(400);
    const ok = await page.locator(".model-viewport canvas").count();
    if (!ok) issues.push(`${name}: system page has no canvas`);
    await page.close();
  }
  console.log(issues.length ? "ISSUES:\n" + issues.map((i) => " - " + i).join("\n") : "LAYOUT CLEAN");
  await browser.close();
  process.exit(issues.length ? 1 : 0);
})();
