# Guest Follow-Up Board

Single-page app: drop a first-time guest CSV, get one row per household with duplicates and problems flagged, download a follow-up CSV. Spec: `Guest Follow-Up Board — PRD.md`.

- **Stack:** Vite `vanilla-ts`, Papa Parse, Vitest; Drizzle + Neon Postgres for saved uploads. No framework, no CSS framework.
- **Structure:** pure logic in `src/lib/` (`normalize.ts`, `dates.ts`, `group.ts`, `exportCsv.ts`, `pipeline.ts`, shared `types.ts`), each with a `*.test.ts`; DOM only in `src/main.ts`; database code only in `server/`.
- **Commands:** `npm run dev`, `npm test`, `npm run build` (outputs `dist/`), `npm run db:generate` / `db:migrate`.
- **Guest data goes only to our own database** via `/api/guests`. Read files with the File API; no other `fetch`, analytics, CDN fonts or error reporting; no `localStorage`, cookies or IndexedDB.
- **Dates:** visit dates are `YYYY-MM-DD`; never `new Date(string)` — parse the parts and validate against the calendar.
- **Fake data only** in the repo, tests and demos (`example.*` emails, `555-01xx` phones).
- **Acceptance:** `guests-september-2026.csv` → 200 rows, 192 households, 8 duplicate groups, 1 invalid date, 1 no-contact.

## Data flow

`main.ts` reads the file with `file.text()` and calls `processGuestCsv(text)` in `pipeline.ts`. That function strips a BOM and runs `Papa.parse` (header mode), then `mapColumns`, `toGuestRows`, `groupHouseholds` and `summarize`. It returns a `BoardResult` with `mapping`, `rows`, `households`, `summary` and `parseErrors`. The download button calls `toFollowUpCsv(households)` and names the file with `followUpFileName(new Date())`. `main.ts` also imports `formatVisitDate` and `processGuestRecords`; it uses nothing else from `src/lib`.

Saving: after a successful render, `main.ts` POSTs `result.rows.map(r => r.original)` through `src/api.ts` (saves are queued so the newest upload lands last). On page open it GETs the latest upload and rebuilds the board with `processGuestRecords(records)`, which skips CSV parsing, so column notices and parse errors from the original file don't come back.

## Domain rules (tests lock these in; change them deliberately)

- **Input columns:** the 14 `COLUMNS` and the 3 `REQUIRED_COLUMNS` (First/Last Name, Visit Date) live in `types.ts`.
  - Headers match case- and space-insensitively, in any order, with no aliases (`E-mail` lands in `extra`).
  - A missing column becomes `''` plus a notice, never a crash. Extra columns are reported but not exported.
- **Normalization is for matching only.** `GuestRow.original` keeps raw values for display and export.
  - Email: trim and lowercase.
  - Phone: digits only, keep the last 10 (so `+1` drops).
  - Name: lowercase and collapse spaces.
  - Address: lowercase, drop `.`, then whole-word `street/avenue/drive/lane/court/road` → `st/ave/dr/ln/ct/rd`. City, State and Zip are not matched.
- **Grouping** (`group.ts`) uses union-find, so matches chain across rules.
  - Rules run in `MATCH_RULES` order: `email`, `phone`, `name + address`.
  - Blank keys never match. The name + address key needs first name, last name and address all present.
  - `matchedBy` lists only the rules that actually merged separate sets. Reordering `MATCH_RULES` changes the output text.
  - Households appear in order of first appearance. Rows inside one sort by valid visit date, then input order. `primary = rows[0]` is the earliest valid visit.
- **Flags are plain strings, in this order:**
  1. `Duplicate (email, phone)`
  2. `Invalid visit date (<raw>|blank)`, one per bad row
  3. `No contact info`, when no row in the household has an email or phone

  `summarize()` finds no-contact households by that exact string, so rename all three carefully.
- **Summary counts:** `invalidDates` counts rows. `noContact` counts households. `duplicateRows` counts every row in a group, primary included.
- **Dates** (`dates.ts`):
  - Accepted: strict `^\d{4}-\d{2}-\d{2}$`, checked against the calendar including leap years. There is no range check.
  - Display: `formatVisitDate` gives `Sun, Sep 13` using UTC only, and a test switches `TZ` to prove it doesn't depend on the time zone.
  - `followUpFileName` and the "uploaded …" note in `main.ts` are the only code that uses local time.
- **Export** (`exportCsv.ts`):
  - Columns: the 16 in `FOLLOW_UP_HEADERS`.
  - Values come from `primary`, except Email and Phone, which are the first non-blank value across the household.
  - Visit Dates are the unique valid dates joined with `'; '`. Notes are the flags joined with `'; '`. All cells are trimmed.
  - `escapeCell` guards against formula injection: it prefixes `'` to cells starting with `= @ \t \r`, and to cells starting with `+ -` unless they look like a phone number.
  - Format: UTF-8 BOM, CRLF line endings, no trailing newline. Filename: `follow-up-YYYY-MM-DD.csv`.

## Database (`server/`, `api/`, `drizzle/`)

- **Schema** (`server/schema.ts`): `uploads` (uuid id, file name, row count, `uploaded_at`) and `guests` (PK `upload_id + row_index`, the 14 columns as `text NOT NULL DEFAULT ''`, cascade delete). Values are stored verbatim; `visit_date` is text so `2026-09-31` survives. `FIELD_FOR_COLUMN` maps CSV names to fields.
- **API** (`server/guestsApi.ts`): Web `Request → Response` handlers. `GET` returns `{ upload: SavedUpload | null }`, the newest by `uploaded_at`. `POST` takes an `UploadBody`, validates it with `parseUploadBody` (1–10,000 rows, strings only, no NUL) and inserts everything in one `db.batch` (one transaction, 1,000 rows per INSERT). Every upload is kept.
- **Routing:** `api/guests.ts` re-exports the handlers for Vercel; `vite.config.ts` mounts the same handlers on `npm run dev` and `npm run preview`, and passes the URL in with `setDatabaseUrl` on every restart. Never copy it into `process.env` there: `loadEnv` prefers `process.env`, so edits to `.env.local` would be ignored until a full restart.
- **Secrets:** `DATABASE_URL` lives in `.env.local` (or `.env`; both git-ignored, `.env.local` wins; template in `.env.example`) and is read only on the server. Never give it a `VITE_` prefix. `getDb()` connects lazily, so tests and the dev server run without it (the API answers 503).
- **Errors:** Drizzle's error message includes query parameters (guest data), so the server logs only the driver's cause and returns a generic 500.
- **Migrations:** edit the schema, then `npm run db:generate` and `npm run db:migrate`. Commit `drizzle/`.

## UI (`src/main.ts`, `src/style.css`)

- **Rendering:** builds everything into `#app` with the `el()` helper and `textContent`. Never use `innerHTML`; guest data is untrusted.
- **Loading:** the latest saved upload on page open, then drag-drop or a hidden file input. A `loadSeq` counter discards results from slow, superseded loads (including the open-time fetch). `.save-note` under the status line shows save and load results.
- **Download:** `Blob`, then `URL.createObjectURL`, then a hidden `<a download>`.
- **Layout:**
  - Summary: four tiles.
  - Table columns: Name, Email, Phone, Address, Visit dates, Service, Party, Flags. Duplicate groups expand to show each original row.
  - How Heard and Interested In appear only in the export.
  - No filtering or sorting yet.
- **CSS:** variables on `:root`, flat kebab-case classes, `is-*` state classes. Light theme only. One breakpoint at 760px.

## TypeScript and tests

- **TypeScript 6 (strict by default):**
  - `verbatimModuleSyntax`: use `import type`.
  - Imports keep the `.ts` extension, except in `api/`, `server/` and `vite.config.ts`, which use `.js`. Vercel compiles each file to `.js` and runs it in plain Node, so a `.ts` import crashes the function with `ERR_MODULE_NOT_FOUND`.
  - `erasableSyntaxOnly`: no enums or namespaces. Use `as const` arrays and unions, like `MATCH_RULES`.
  - `noUnusedLocals` and `noUnusedParameters` are on.
- **Server code** (`api/`, `server/`, both config files) is type-checked by `tsconfig.server.json` (Node types, no DOM); `npm run build` runs both configs.
- **Tests are excluded from `tsconfig.json`,** so `npm run build` never type-checks them, and Vitest doesn't either.
- **`pipeline.test.ts` checks acceptance end to end:**
  - It loads the real CSV and asserts the numbers above, plus 16 duplicate rows and 2 rows with issues.
  - It also requires 2,000 rows to process in under 2 s.
- **Run one file:** `npx vitest run src/lib/group.test.ts`.

## Sample data and docs

- **Planted cases** are listed in the presenter key in `DEMO-SCRIPT.md`. Michael Brown has `2026-09-31`; Rachel Mitchell has no contact info.
- **Amanda Clark:** the docs say "Street vs St", but the CSV actually has `Cedar Ave` vs `Cedar Avenue`. She matches by phone either way.
- **David Lewis and Matthew Lee** share an address but stay separate households (different names). The PRD leaves the spouse case open.
- **`DEMO-SCRIPT.md`** is the stage script for a talk where Claude builds this app live. It starts from an empty folder holding only the briefing at the top of this file, which the script calls "five lines". Keep that briefing short. Its prompts are stage directions, not tasks for you.
- **Code that knowingly differs from the PRD,** where tests follow the code (ask before "fixing" either way):
  - `'; '` separators.
  - Exported values are trimmed.
  - Repeated dates are deduplicated.
  - Extra input columns are not exported.
  - BOM, CRLF and the formula guard were added.
  - The speed limit is 2 s, not the PRD's 5 s.
  - Uploads are stored in Neon. PRD Goal 3 says no server or storage, and R14 asks for a privacy review first.
- **Not built:** PRD v1.1 R9–R12 (Vercel deploy and CSP, staff-only access, filter/sort, assigning a follow-up person) and R13–R14 (ChMS API, status kept across weeks).
