const { chromium } = require("playwright");
(async () => {
  const browser = await chromium.launch({
    args: ["--enable-unsafe-swiftshader"],
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on("console", (m) => console.log("[console." + m.type() + "]", m.text().slice(0, 300)));
  page.on("pageerror", (e) => console.log("[pageerror]", String(e).slice(0, 400)));
  page.on("response", (r) => { if (r.url().includes("/models/") || r.url().includes("AtlasBodyScene")) console.log("[net]", r.status(), r.url().slice(-60)); });
  await page.goto("http://localhost:3000/#/body");
  await page.waitForTimeout(6000);
  const html = await page.evaluate(() => {
    const vp = document.querySelector(".model-viewport");
    return {
      hasViewport: !!vp,
      hasCanvas: !!document.querySelector(".model-viewport canvas"),
      text: vp ? vp.textContent.replace(/\s+/g, " ").slice(0, 200) : "no viewport",
      childCount: vp ? vp.querySelectorAll("*").length : 0,
    };
  });
  console.log("[state]", JSON.stringify(html));
  await page.screenshot({ path: "/tmp/dbg-body.png" });
  await browser.close();
})();
