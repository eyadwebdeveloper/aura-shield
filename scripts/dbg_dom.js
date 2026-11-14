const { chromium } = require("playwright");
(async () => {
  const browser = await chromium.launch({ args: ["--enable-unsafe-swiftshader"] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on("pageerror", (e) => console.log("[pageerror]", String(e).slice(0, 500)));
  await page.goto("http://localhost:3000/#/body");
  await page.waitForTimeout(5000);
  const dom = await page.evaluate(() => {
    const main = document.getElementById("main") || document.body;
    const has = (sel) => !!document.querySelector(sel);
    return {
      url: location.hash,
      bodyLab: has(".body-lab-page"),
      viewport: has(".model-viewport"),
      canvas: has("canvas"),
      switch: has(".model-switch"),
      host: has(".body-scene-host"),
      mainTag: main.tagName,
      mainHTML: main.innerHTML.replace(/\s+/g, " ").slice(0, 600),
    };
  });
  console.log(JSON.stringify(dom, null, 2));
  await browser.close();
})();
