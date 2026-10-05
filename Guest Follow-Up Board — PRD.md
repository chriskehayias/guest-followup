# Guest Follow-Up Board — PRD

Oct 2, 2026 · @Chris

## Summary

Guest Follow-Up Board is a single-page web app that turns a first-time guest CSV export into a clean, one-row-per-household follow-up list, entirely in the browser.

- **For:** church staff and volunteers who follow up with first-time guests, plus the church IT generalist who builds and runs the tool.
- **The one job:** drop in a messy export, see who's a duplicate and what's broken, download a list you can act on Sunday afternoon.
- **Why now:** it's the live demo build for "You Can Build That" at CITN26, and the starting point for the follow-on Vercel session.

The kit already in the CITN folder (`guest-followup-demo/`) holds the sample CSV, `CLAUDE.md` and the demo script this PRD is written against.

## Goals and non-goals

v1 succeeds if it can be built live in about 8 minutes and correctly reduces the 200-row sample to 192 households.

Goals:

1. Turn a guest CSV into a de-duplicated, one-row-per-household list in under 5 seconds for 2,000 rows.
2. Make every problem visible: duplicates, invalid dates and guests with no way to contact them.
3. Keep guest data on the user's device: no server, no storage, no third-party calls.
4. Stay small enough to build live and deploy as a static site on Vercel with no configuration.

Non-goals for v1:

- Writing back to a ChMS or any other system.
- Accounts, logins or saved history.
- Editing guest records in the app (fix them in the source system, then re-export).
- Fuzzy name matching ("Bob" vs "Robert"), spreadsheet formats other than CSV, mobile-first layout.

## Users and core flow

One flow serves everyone: export, drop, review, download, all in a single browser tab.

| User | What they need |
| --- | --- |
| Guest follow-up coordinator | A trustworthy list by Sunday afternoon, with each family listed once |
| Church IT generalist | A tool they can build, understand and hand off, with no server to look after |
| Pastor or staff lead | Confidence that guest data never leaves the church's devices |

&#91;embedded content: core user flow · 6 steps\]

Steps 2–6 run in the browser; step 4 is the logic that matters and gets the unit tests.

## Requirements by release

v1 is exactly what gets built on stage; v1.1 is the Vercel session; everything else waits until real users ask for it.

| ID | Release | Requirement |
| --- | --- | --- |
| R1 | v1 live demo | Load a CSV by drag-and-drop or a file picker; show the row count and file name |
| R2 | v1 live demo | Map columns by header name, ignoring case and order; warn if First Name, Last Name or Visit Date is missing |
| R3 | v1 live demo | Normalize email, phone, name and address for matching, while displaying the original values |
| R4 | v1 live demo | Group duplicates by the rules in the Data section; show a badge naming the rule that matched |
| R5 | v1 live demo | Flag invalid visit dates and guests with no email and no phone |
| R6 | v1 live demo | Summary bar: rows loaded, households, duplicate groups, rows with issues |
| R7 | v1 live demo | Download the follow-up CSV: one row per household, issues listed in a Notes column |
| R8 | v1 live demo | Unit tests for normalization, grouping and date validation, run with `npm test` |
| R9 | v1.1 Vercel | Deploy as a static site; every pull request gets a preview link |
| R10 | v1.1 Vercel | Protect the site so only staff can open it (Vercel deployment protection or a shared password) |
| R11 | v1.1 Vercel | Filter by service time, visit date and issue type; sort by any column |
| R12 | v1.1 Vercel | Assign each household to a follow-up person; printable Sunday list |
| R13 | Later | Read guests straight from a ChMS API with a read-only, sandbox-first key |
| R14 | Later | Remember follow-up status across weeks (needs storage and a privacy review first) |

## Data

Three matching keys, each normalized first, decide duplicates. Any one shared key puts two rows in the same household, and the matches chain together.

**Input columns** (from the sample export; extra columns are kept but ignored): First Name, Last Name, Email, Phone, Address, City, State, Zip, Visit Date, Service, Adults, Kids, How Heard, Interested In.

**Normalization (for matching only; the original values are what's displayed):**

| Field | Rule | Example |
| --- | --- | --- |
| Email | Trim, lowercase | `  Nancy.Taylor3@Example.com ` → `nancy.taylor3@example.com` |
| Phone | Digits only, keep the last 10 | `+1.502.555.0142` and `(502) 555-0142` → `5025550142` |
| Name | Trim, lowercase, collapse spaces | `melissa allen` = `Melissa Allen` |
| Address | Lowercase; Street→St, Avenue→Ave, Drive→Dr, Lane→Ln, Court→Ct, Road→Rd; strip periods | `4796 Willow Street` = `4796 willow st` |
| Visit Date | Must be an ISO date (`YYYY-MM-DD`) that exists on the calendar; parse without time zones | `2026-09-31` → invalid |

**Duplicate keys** (match on any one):

1. Same normalized email (blank emails never match).
2. Same normalized phone (blank phones never match).
3. Same normalized first name + last name + address.

**Flags:** `Duplicate (email | phone | name + address)`, `Invalid visit date`, `No contact info` (blank email and phone).

**Output CSV**, one row per household:

| Column | Value |
| --- | --- |
| First Name, Last Name | From the earliest visit in the group |
| Email, Phone | First non-blank value in the group, original formatting |
| Address, City, State, Zip | From the earliest visit |
| Visit Dates | Every valid date in the group, oldest first, separated by `;` |
| Service, Adults, Kids, How Heard, Interested In | From the earliest visit |
| Rows Merged | How many input rows the household came from |
| Notes | Every flag on the group, e.g. `Invalid visit date (2026-09-31)` |

File name: `follow-up-YYYY-MM-DD.csv`, using today's date.

## Technical approach and privacy

A static Vite + TypeScript site with all the logic in pure, tested functions, and no code path that sends guest data anywhere.

| Area | Decision |
| --- | --- |
| Build | Vite, `vanilla-ts` template; `npm run build` outputs `dist/` |
| CSV | Papa Parse with `header: true`, `skipEmptyLines: true`; CSV generated by hand or with `Papa.unparse` |
| Structure | `src/lib/normalize.ts`, `src/lib/group.ts`, `src/lib/dates.ts`, `src/lib/exportCsv.ts` (pure functions); `src/main.ts` (DOM only) |
| Tests | Vitest; one test file per lib module; the sample CSV used as a fixture for the end-to-end count |
| Styling | One plain stylesheet using the CITN palette (charcoal `#2D2926`, orange `#F6921E`); no CSS framework |
| Hosting (v1.1) | Vercel static deploy, zero config; preview deployments per pull request |

Privacy and security rules (summarized in `CLAUDE.md`):

- The file is read with the browser's File API and never uploaded. No `fetch`, analytics, fonts from a CDN or error-reporting service.
- Nothing is saved: no `localStorage`, cookies or IndexedDB in v1. Closing the tab clears everything.
- Only fake data in the repo, tests and demos (`example.*` emails, `555-01xx` phones).
- The deployed site is protected before anyone loads real guest data into it (R10).
- Add a Content-Security-Policy that blocks outbound connections (`connect-src 'none'`) in `vercel.json` for v1.1.

## Acceptance criteria

v1 is done when `npm test` passes and loading `guests-september-2026.csv` produces exactly these numbers.

| Check | Expected |
| --- | --- |
| Rows loaded | 200 |
| Households in the output | 192 |
| Duplicate groups | 8 (16 rows) |
| Invalid visit dates | 1: Michael Brown, `2026-09-31` |
| No contact info | 1: Rachel Mitchell |
| Load + process time, 2,000 rows | Under 5 seconds on a staff laptop |

Each planted duplicate must be caught by the rule shown:

| Guest | Variation | Caught by |
| --- | --- | --- |
| Sofia Hernandez | Email in ALL CAPS | Email |
| Patricia Hill | Email with surrounding spaces | Email |
| William Thompson | Phone as `(xxx) xxx-xxxx`, no email | Phone |
| Daniel Wright | Phone as `+1.xxx.xxx.xxxx`, no email | Phone |
| Sarah Wilson | Same name + address, different email | Name + address |
| Melissa Allen | Name in lowercase, same email | Email |
| Hannah Harris | Exact duplicate row | Email |
| Amanda Clark | "Street" vs "St", same phone | Phone |

Unit tests that must exist:

- [ ] `isValidVisitDate("2026-09-31")` is false; `"2026-02-29"` is false; `"2028-02-29"` is true
- [ ] `"2026-09-13"` displays as "Sun, Sep 13" in any time zone (no `new Date(string)` rollover or UTC shift)
- [ ] Phone normalization turns all four sample formats into the same 10 digits
- [ ] Two blank emails or two blank phones never make a match
- [ ] Grouping chains: A matches B by email, B matches C by phone → one household
- [ ] The exported CSV opens in Excel with correct columns, and commas or quotes inside values survive

## Open questions

- [ ] Should a shared last name + address (spouses with separate emails) group into one household, or stay separate people? v1 keeps them separate.
- [ ] Which ChMS export should the column mapping target first for v1.1 (MinistryPlatform, Planning Center, other)?
- [ ] Vercel deployment protection or an app-level shared password for R10, given the plan tier attendees are likely to have?
- [ ] Is a GitHub repo for attendees to clone after the session in scope, and under whose account?
