# Guest Follow-Up Board

Single-page app: drop a first-time guest CSV, get one row per household with duplicates and problems flagged, download a follow-up CSV. Spec: `Guest Follow-Up Board — PRD.md`.

- **Stack:** Vite `vanilla-ts`, Papa Parse, Vitest. No framework, no CSS framework.
- **Structure:** pure logic in `src/lib/` (`normalize.ts`, `dates.ts`, `group.ts`, `exportCsv.ts`, shared `types.ts`), each with a `*.test.ts`; DOM only in `src/main.ts`.
- **Commands:** `npm run dev`, `npm test`, `npm run build` (outputs `dist/`).
- **All data stays in the browser.** Read files with the File API; no `fetch`, analytics, CDN fonts or error reporting; no `localStorage`, cookies or IndexedDB.
- **Dates:** visit dates are `YYYY-MM-DD`; never `new Date(string)` — parse the parts and validate against the calendar.
- **Fake data only** in the repo, tests and demos (`example.*` emails, `555-01xx` phones).
- **Acceptance:** `guests-september-2026.csv` → 200 rows, 192 households, 8 duplicate groups, 1 invalid date, 1 no-contact.
