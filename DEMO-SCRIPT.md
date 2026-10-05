# Live Demo Script — Guest Follow-Up Board

**Slot:** 10:00–20:00 of "You Can Build That" (target 8 minutes of building, 2 minutes of slack)
**Goal:** show the daily loop — ask → plan → review → run → commit — on a real church task, including one thing going wrong and getting caught.

**Deck cue slides (v3):** slide 7 introduces the task · slide 8 = beats 1–3 (plan and build) · slide 9 = beat 4 (make it prove it) · slide 10 = beat 5 (commit and reset) · slide 19 = bonus demo "Shrink it live" during Pick a project. Each cue slide shows the exact prompt, so you can read it off the screen if your sticky note goes missing.

---

## Before you walk on stage

- [ ] Empty folder named `guest-followup` containing only `CLAUDE.md` and `guests-september-2026.csv`
- [ ] `git init && git add -A && git commit -m "Start: context + sample data"` already done
- [ ] Node 20+ installed; run `npm create vite@latest scratch -- --template vanilla-ts` once beforehand so the npm cache is warm, then delete `scratch`
- [ ] Claude Code signed in, open in that folder; terminal font 20pt+, light theme, notifications off
- [ ] Browser tab ready at `http://localhost:5173` (it will 404 until the dev server starts — that's fine)
- [ ] Backup recording cued in another tab
- [ ] This page printed or on a second screen

---

## Presenter key: what's hidden in the sample file

200 rows → **192 unique households**, **8 duplicate groups**, **1 bad date**, **1 guest with no contact info**. Every name, email (`example.com/.org/.net`) and phone (`555-01xx`) is fake.

| # | Planted duplicate | Guest |
|---|---|---|
| 1 | Email in ALL CAPS | Sofia Hernandez |
| 2 | Email with leading/trailing spaces | Patricia Hill |
| 3 | Phone written `(xxx) xxx-xxxx`, no email | William Thompson |
| 4 | Phone written `+1.xxx.xxx.xxxx`, no email | Daniel Wright |
| 5 | Same name + address, different email | Sarah Wilson |
| 6 | Name typed in lowercase, same email | Melissa Allen |
| 7 | Exact duplicate row (form submitted twice) | Hannah Harris |
| 8 | "Street" vs "St" in address, same phone | Amanda Clark |

| Other issue | Where |
|---|---|
| Visit date `2026-09-31` (September has 30 days) | Michael Brown, spreadsheet row 136 |
| No email and no phone | Rachel Mitchell, spreadsheet row 71 |

**Why the date is the perfect bug:** JavaScript's `new Date("2026-09-31")` doesn't fail — it silently rolls over to October 1 (UTC), and in a US time zone it *displays* as September 30. Naive code also shows every other Sunday visit as the Saturday before. Wrong data, no error. That's the "make it prove it" habit in one example.

---

## The beats

### Beat 1 — Context (0:00–0:45)

Show the folder. Open `CLAUDE.md` and read two lines aloud: the stack and "all data stays in the browser."

> **Say:** "Five lines. This is the whole briefing. It reads this every time, so I never re-explain my setup."

### Beat 2 — Plan first (0:45–2:30)

Switch to plan mode (Shift+Tab until it says plan mode), then type:

```
Build the Guest Follow-Up Board described in CLAUDE.md. I drop guests-september-2026.csv on the page; it shows a table of guests, groups duplicates (same email, same phone, or same name + address after normalizing case, spaces, phone formats and street abbreviations), flags rows with an invalid visit date or no contact info, and has a button to download the cleaned follow-up list as CSV — one row per household. Give me a plan first.
```

Read the plan out loud. **Push back on one item** — pick whichever applies:

- If it proposes React or a framework: *"No framework — vanilla TS, per CLAUDE.md."*
- If it proposes a server or storage: *"Nothing leaves the browser."*
- Otherwise: *"Skip styling polish for now; one plain table is fine."*

> **Say:** "This is habit one. Thirty seconds of reading saves thirty minutes of the wrong thing."

Approve the plan.

### Beat 3 — Build and review (2:30–5:00)

Let it scaffold and write code. When the first permission prompt appears (usually `npm install`), stop and read it aloud.

> **Say:** "It's asking to run a command. I can see exactly what. I say yes to installs in this folder; I'd say no to anything touching files outside it."

When it finishes, start the app (or approve it running `npm run dev`). Drag the CSV onto the page.

**Expected:** a table, duplicate badges, a count near "192 households." Point at one planted pair (Sofia Hernandez is easy to find — the ALL-CAPS email).

### Beat 4 — Make it prove it (5:00–7:00)

Scroll to Michael Brown. Whatever it shows, type:

```
Write unit tests for the date handling: "2026-09-31" must be flagged invalid, and "2026-09-13" must display as Sunday, Sep 13 no matter what time zone the browser is in. Run them, and fix the code if they fail.
```

**Most likely:** a test fails (rollover or the time-zone shift), Claude fixes the parser, tests go green. Refresh the page — Michael Brown now shows a red "invalid date" flag.

**If both tests pass first time:**

> **Say:** "It got it right — and now I *know* it got it right, and it stays right. That's the habit."

Then ask: `How many duplicate groups did you find, and which rule caught each one?` and check the answer against the presenter key (8 groups).

### Beat 5 — Commit and reset (7:00–8:00)

```
Review the diff with me in two sentences, then commit with a clear message.
```

Then type `/clear`.

> **Say:** "Commit, clear, next task. Small steps. About eight minutes for something that would have cost me a Saturday of searching."

**Transition line:** "That went well because the task was right-sized. Here's when it doesn't."

---

## Bonus demo — Shrink it live (slide 19, about 38:00–40:00)

After the pair exercise, take one volunteer's project idea. In plan mode, in any empty folder, type:

```
A church IT person wants to build: [volunteer's idea]. Ask me up to three questions, then propose the smallest version that could be built and checked in one afternoon, and list what to leave for later. Don't write any code.
```

Answer its questions with the volunteer. **Land it:** "That's habit one, live. Plan first, then shrink it." **If no one volunteers:** use "a volunteer scheduling app for the kids ministry."

---

## Recovery plays

| If this happens | Do this |
|---|---|
| `npm install` is slow or the network drops | Switch to the backup recording at the same beat; say "conference wifi" and keep narrating |
| It goes in circles on a bug for more than 60 seconds | Use it: "This is habit five." Type `/clear`, restate the request in one sentence, continue |
| It builds something much bigger than asked | Use it: "Here's why we plan first." Ask it to remove the extras, or jump to the recording |
| The page is blank after starting | Ask: `The page is blank — check the browser console error and fix it.` |
| You run past 8:00 | Skip Beat 5's diff review; just commit and move on |

---

## After the session (setup for the Vercel talk)

Keep the folder. Next session starts from this commit: push to GitHub, import into Vercel, show a preview deployment per pull request, then add the follow-on features in the PRD.
