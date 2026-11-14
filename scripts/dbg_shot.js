/* Screenshot the atlas canvas and print an ASCII density map + extents.
 * Body pixels = chromatic (channel spread > 18) or dark (< 205).
 * Stage floor is near-white (low spread, high value) and excluded.
 */
const { chromium } = require("playwright");
const zlib = require("zlib");

function decodePng(buf) {
  let p = 8;
  let w = 0, h = 0, bitDepth = 0, colorType = 0;
  const idat = [];
  while (p < buf.length) {
    const len = buf.readUInt32BE(p); p += 4;
    const type = buf.toString("ascii", p, p + 4); p += 4;
    const data = buf.subarray(p, p + len); p += len; p += 4;
    if (type === "IHDR") { w = data.readUInt32BE(0); h = data.readUInt32BE(4); bitDepth = data[8]; colorType = data[9]; }
    if (type === "IDAT") idat.push(data);
    if (type === "IEND") break;
  }
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const ch = colorType === 6 ? 4 : colorType === 2 ? 3 : 0;
  if (!ch || bitDepth !== 8) throw new Error(`unsupported png color=${colorType} depth=${bitDepth}`);
  const stride = w * ch;
  const out = Buffer.alloc(w * h * ch);
  let pos = 0;
  for (let y = 0; y < h; y++) {
    const filter = raw[pos++];
    const row = raw.subarray(pos, pos + stride); pos += stride;
    const prev = y ? out.subarray((y - 1) * stride, y * stride) : null;
    const cur = out.subarray(y * stride, (y + 1) * stride);
    for (let x = 0; x < stride; x++) {
      const a = x >= ch ? cur[x - ch] : 0, b = prev ? prev[x] : 0, c = x >= ch && prev ? prev[x - ch] : 0;
      let v = row[x];
      if (filter === 1) v += a; else if (filter === 2) v += b;
      else if (filter === 3) v += Math.floor((a + b) / 2);
      else if (filter === 4) { const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      cur[x] = v & 255;
    }
  }
  return { w, h, ch, data: out };
}

(async () => {
  const browser = await chromium.launch({ args: ["--enable-unsafe-swiftshader"] });
  const page = await browser.newPage({ viewport: { width: 680, height: 560 } });
  await page.addInitScript(() => localStorage.setItem("second-chair-settings", JSON.stringify({ state: { animationsEnabled: false }, version: 0 })));
  await page.goto("http://localhost:3100/#/body");
  const pill = page.locator(".atlas-progress");
  await pill.waitFor({ state: "visible", timeout: 10000 }).catch(() => {});
  while (await pill.isVisible().catch(() => false)) await page.waitForTimeout(400);
  await page.waitForTimeout(800);
  const shot = await page.locator(".model-viewport canvas").screenshot();
  require("fs").writeFileSync("/tmp/render/aura-canvas.png", shot);
  const { w, h, ch, data } = decodePng(shot);
  console.log(`canvas png ${w}x${h}`);

  const isBody = (i) => {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const spread = Math.max(r, g, b) - Math.min(r, g, b);
    return Math.max(r, g, b) < 205 || spread > 18;
  };

  // 62x24 ASCII map
  const CW = 62, CH = 24;
  for (let cy = 0; cy < CH; cy++) {
    let line = "";
    for (let cx = 0; cx < CW; cx++) {
      const y0 = Math.floor(h * cy / CH), y1 = Math.floor(h * (cy + 1) / CH);
      const x0 = Math.floor(w * cx / CW), x1 = Math.floor(w * (cx + 1) / CW);
      let n = 0, tot = 0;
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { tot++; if (isBody((y * w + x) * ch)) n++; }
      const f = n / Math.max(1, tot);
      line += f > 0.3 ? "#" : f > 0.06 ? "." : " ";
    }
    console.log(`${String(Math.round((cy + 0.5) * 100 / CH)).padStart(2)}% ${line}`);
  }

  // vertical + horizontal extents of body-like pixels
  let top = -1, bottom = -1, left = -1, right = -1;
  for (let k = 0; k < 100; k++) {
    const from = Math.floor(h * k / 100), to = Math.floor(h * (k + 1) / 100);
    let n = 0;
    for (let y = from; y < to; y++) for (let x = 0; x < w; x++) if (isBody((y * w + x) * ch)) n++;
    if (n > (to - from) * w * 0.05) { if (top < 0) top = k; bottom = k; }
  }
  for (let k = 0; k < 100; k++) {
    const from = Math.floor(w * k / 100), to = Math.floor(w * (k + 1) / 100);
    let n = 0;
    for (let x = from; x < to; x++) for (let y = 0; y < h; y++) if (isBody((y * w + x) * ch)) n++;
    if (n > (to - from) * h * 0.05) { if (left < 0) left = k; right = k; }
  }
  console.log(`body extent: vertical ${top}%..${bottom}%, horizontal ${left}%..${right}%`);
  await browser.close();
})();
