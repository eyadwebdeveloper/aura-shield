# Astro-Shield (AURA training game)

A short browser game (Next.js + TypeScript) where a crew member completes tasks while the game records reaction time, accuracy and stress signals. After each run, an AI coach reads the session and explains the result in plain language.

## Run locally
```bash
npm install
npm run dev     # http://localhost:3000
```

## AI backend
The results screen calls `POST /api/game/assess` on the AURA backend:

- Source: https://github.com/eyadwebdeveloper/backend
- Default URL: https://eyad1ashraff.pythonanywhere.com
- Override with `NEXT_PUBLIC_AURA_API` (e.g. `NEXT_PUBLIC_AURA_API=http://127.0.0.1:8000` for a local backend).

If the backend is unreachable the game keeps working with its on-device rules engine (`src/components/astro/assessment.ts`) and shows "AI coach is offline".

## Notes
All data is simulated. This is a demo, not a medical tool; the AI is advisory only.
