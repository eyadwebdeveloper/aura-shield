const { chromium } = require("playwright");
(async () => {
  const browser = await chromium.launch({ args: ["--enable-unsafe-swiftshader"] });
  const page = await browser.newPage({ viewport: { width: 680, height: 560 } });
  await page.addInitScript(() => localStorage.setItem("second-chair-settings", JSON.stringify({ state: { animationsEnabled: false }, version: 0 })));
  await page.goto("http://localhost:3100/#/body");
  const pill = page.locator(".atlas-progress");
  await pill.waitFor({ state: "visible", timeout: 10000 }).catch(() => {});
  while (await pill.isVisible().catch(() => false)) await page.waitForTimeout(400);
  console.log("stream done at", ((performance.now()) / 1000).toFixed(1));
  const box = await page.locator(".model-viewport canvas").boundingBox();
  console.log("canvas box:", JSON.stringify(box));
  // sample grid, log engine cursor + tooltip presence each step
  let hits = 0, tooltips = 0;
  for (const fy of [0.3, 0.36, 0.42, 0.48, 0.54, 0.6]) {
    for (const fx of [0.4, 0.45, 0.5, 0.55, 0.6]) {
      await page.mouse.move(box.x + box.width * fx, box.y + box.height * fy, { steps: 4 });
      await page.waitForTimeout(320);
      const st = await page.evaluate(() => ({
        cursor: document.querySelector(".body-scene-host canvas")?.style.cursor,
        tip: !!document.querySelector(".atlas-hover"),
        tipText: document.querySelector(".atlas-hover")?.textContent?.replace(/\s+/g, " ").slice(0, 40),
        pill: !!document.querySelector(".atlas-progress"),
      }));
      if (st.cursor === "pointer") hits++;
      if (st.tip) tooltips++;
      console.log(`fx=${fx} fy=${fy} cursor=${st.cursor} tip=${st.tip} "${st.tipText || ""}" pill=${st.pill}`);
    }
  }
  console.log(`pointerCursors=${hits} tooltips=${tooltips}/35`);
  await browser.close();
})();
