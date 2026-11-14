# Downloads

## astro-shield-web.zip — FINAL web build (latest version)

The complete Next.js web app with the **Astro-Shield: Rover & Debris Run** 3D game
(default app) plus the **CORPUS** 3D anatomy explorer, including all model data.

**To run it:**

```bash
unzip astro-shield-web.zip -d astro-shield-web
cd astro-shield-web
npm install        # or: bun install
npm run dev        # or: bun dev  →  http://localhost:3000
```

Production build: `npm run build && npm start` (standalone output).

**What's inside:**
- `src/components/astro/` — the game (Three.js engine, Mars canyon world, procedural
  rover, HUD, stealth PVT/POMS assessment, results cards) — 4,700+ lines
- `src/components/anatomy/` — the Atlas 3D anatomy viewer
- `public/models/` — atlas manifests + 30 gzipped mesh chunks (~69 MB)
- Full source, configs, lockfile and README with controls & deploy notes

**Game controls:** ←→/AD steer · ↑↓/WS altitude · Space shield/radar · P pause ·
mouse/tap = shield · on-screen joystick + shield button on touch devices.

---

## aura-app-with-atlas.zip — older build (superseded)

The earlier Vite version of the Aura app. Superseded by `astro-shield-web.zip`.
