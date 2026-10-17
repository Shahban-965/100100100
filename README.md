# Lab Desk — `Shakeel_New_Project_Lab`

A brand-new build for **Aptech IT Lab Center**: the lab ledger that runs on one HTML folder.
Same ideas as before (lab PCs, staff systems, fault desk, store room, purchases, Excel and print
output), completely new engine, new **Paper & Clay** theme, new **Quick Scroll**, and a database
that is literally one JSON file.

* **Theme — Paper & Clay.** Ivory paper, ink type, one clay accent, serif headlines, hairline
  rules, tabular numerals for every number. No green/white admin look, no glass/blur/neon dark
  theme, no gradient cards. Press <kbd>T</kbd> for the dark side (**Graphite** — warm charcoal
  with cream ink).
* **Excel & print are black and white on purpose.** Both the `.xlsx` writer and the print sheet
  use a single black title band, a white bold header row, hairline grid and no colour, fill or
  shadow anywhere.
* **Only frontend.** No server, no build step, no dependencies to install.

---

## Run it

```bash
cd Shakeel_New_Project_Lab
python3 -m http.server 8090      # or: npx serve .
# open http://localhost:8090/index.html
```

Opening `index.html` straight from disk also works; the only thing you lose is the optional
published JSON read (browsers block `fetch` on `file://`).

Password: the same one as the previous IT Lab app (SHA-256 hash, 12 h session, 30 s lock after
5 wrong tries, changeable in **Data & Live → Settings**).

---

## Why it is fast

| Where | What was done |
| --- | --- |
| First paint | 6 KB of HTML + 2 CSS files, no fonts, no icon font — icons are CSS `mask` data-URIs |
| The ledger | **virtualised**: the DOM only ever holds the visible rows (+8 overscan). 5 000 records cost the same as 40 |
| Scrolling | one `requestAnimationFrame` per frame, recycled row nodes, `contain: layout paint style` per row |
| Cards / charts | `content-visibility: auto`, hand-rolled SVG, no chart library |
| Excel export | the app writes OOXML itself — the 425 KB SheetJS bundle is only fetched when you **import** |
| Lookups | records are indexed by id (`O(1)`), search strings are cached per record and rebuilt on write only |
| Motion | decorative loops are off; `prefers-reduced-motion` and Settings → *Motion: Reduced* kill the rest |

### Quick Scroll (the new scroll device)

On the right edge: a **minimap of the whole list**. Every 2 px bar is a real row, coloured by its
status, so you can see where the faulty PCs are and drag straight to them. Drag the thumb, click
the map, spin the wheel on it, or use the section chips (Lab 1 / Lab 2 / Lab 3). A hairline
progress bar tracks the top of the page. Keyboard: <kbd>↑</kbd><kbd>↓</kbd> walk rows,
<kbd>PageUp</kbd>/<kbd>PageDown</kbd> jump 12 rows, <kbd>Home</kbd>/<kbd>End</kbd> the extremes,
<kbd>Enter</kbd> opens the pinned row.

---

## The database (JSON, frontend only)

One document, seven tables, stored in `localStorage` under `snpl.*`:

```
{ app, format:"snpl.lab/1", exportedAt, rev, settings,
  data: { pcs, staff, faults, store, tx, purchases, logs },
  tombstones: { pcs: { "PC-0007": { deletedAt } } }, todos: [] }
```

* First run seeds from **`data/lab-data.json`** (converted from
  `samples/Aptech IT Lab Center.xlsx`), or migrates an old `itlab_*` browser copy silently.
* **Data & Live → JSON database** gives you *Download snpl.json*, *Restore* (replace) and *Merge*
  (record-by-record: newest `updatedAt` wins, deletions travel as tombstones).
* Every tab on the machine updates live: writes are broadcast (`BroadcastChannel` + `storage`), so
  a second window re-reads the changed table without a reload.

## Go live (data saves and updates while it is online)

No hosting service, no database plan — publish the JSON file next to the app:

1. **Publish the app.** `main` already ships `.github/workflows/pages.yml`. Flip the switch once:
   repository → **Settings → Pages → Build source: GitHub Actions**. Every later push to `main`
   deploys the app to `https://<user>.github.io/<repo>/Shakeel_New_Project_Lab/` (the root URL
   redirects there). If the action fails with *Pages not enabled*, that switch is the reason.
   No-Actions alternative: drag this folder onto [Netlify Drop](https://app.netlify.com/drop) or run `vercel`.
2. **Grant write access.** GitHub → Developer settings → Fine-grained token → this repository only
   → **Contents: Read and write**. Paste it in the sync tab; it stays in this browser only.
3. **Publish the data.** Data & Live → Live sync → **Create the data branch** (one click; the app
   makes the empty `lab-data` branch for you), then **Push now** → `snpl.json` lands on `lab-data`,
   away from your code history. `deploy/gh-pages.yml` is the same workflow kept inside the folder,
   in case you move the app to another repository.
4. **Other devices** type the same token and get: auto-push 4 s after the last edit, a pull every
   30 s, and a record-level merge. A 409 write conflict re-merges and pushes again.
5. **Read-only viewers** (mobile, reception) set mode **Read-only URL** to the raw file — they see
   live data and can never write.

The token is only needed for the *write* side — read-only devices just poll the raw URL.

Over plain `http://` the browser hides WebCrypto, so the login password becomes device-local
(the sign-in screen says so and the sync tab explains it). HTTPS — Pages, Netlify, Vercel or
a self-signed cert — is a secure context and everything behaves normally.

---

## Screens

| Page | Contents |
| --- | --- |
| **Dashboard** | KPIs, fleet-health ring, lab load, 6-month fault trend, top fault types, store donut + alerts, "needs you now", daily checklist, live-sync card, activity feed |
| **Lab Systems / Staff Systems** | Ledger (virtual rows), cards, per-lab tabs, filters, sorting, bulk status/delete, duplicate, password peek, *report a fault* |
| **Fault Desk** | Ledger + drag-and-drop Kanban (Pending → In Progress → Resolved → Cancelled), overdue flags, *issue a spare part* deducts store stock and posts a movement |
| **Store Room** | Stock levels, auto Low/Out-of-Stock status, Stock In / Out / Adjustment / Return with full history |
| **Movements** | Every stock transaction with before/after quantities |
| **Purchases** | Systems + accessories; *Add accessories to store* creates the stock items and Stock In movements |
| **Data & Live** | Excel & print · JSON database · Live sync · Settings · Activity log |

## Excel

* **Export** — black & white, print-ready: A4, **fit to one page wide**, `Print_Titles` so the
  header repeats on every page, frozen panes, AutoFilter, totals row, `Page x of y` footer. When a
  filter is active only the visible rows go out.
* **Workbook** — summary sheet, one sheet per module, one sheet per lab, and the last three monthly
  fault sheets.
* **Import** — SheetJS (loaded on demand). Header words are matched exactly and then by tokens, so
  `Old Part Removed` still lands in *Old Part* and `Software / Remarks` in *Software*; several
  blocks in one row (`Lab 1 | Lab 2 | Lab 3`) are read as three blocks; a block with no Lab column
  borrows the label above it; `Lab-1` / `Lab2` snap to your configured labs. Preview first, then
  *update / skip / add as new*.
* **Print** — `Print A4` renders the same document as HTML into `#print-area` and the browser prints
  it (`css/print.css` is ink-only). Wide sheets shrink to fit one page; portrait is a setting.

## Structure

```
index.html                app shell (boot skeleton + script list)
css/theme.css             Paper & Clay tokens, controls, icons, boot, login
css/shell.css             rail, top bar, ledger, cards, kanban, dashboard, palette, responsive
css/print.css             black & white A4 print sheet + on-screen print preview
js/util.js                coercion, dates, fuzzy text, rAF throttle, io
js/schema.js              one definition per module → table, forms, Excel, print
js/db.js                  JSON database: index, tombstones, merge, stock engine, broadcast
js/live.js                GitHub / URL sync of snpl.json (queue, poll, conflict retry)
js/ui.js                  toasts, modals, schema form, record drawer, SVG charts
js/virt.js                virtualised rows + Quick Scroll rail
js/excel.js               OOXML writer (B&W, print setup), print sheet, importer
js/pages/collection.js    the ledger/cards/board engine + Excel import preview
js/pages/dashboard.js     stats engine + the dashboard
js/pages/data.js          Excel & print · JSON · Live · Settings · Activity
js/auth.js                gate, 12 h session, lockout, password change
js/app.js                 router, rail, top bar, palette, shortcuts, live badge
data/lab-data.json        the published starting database
samples/                  the original workbook, kept for import tests
vendor/xlsx/              SheetJS, fetched only when you import
sw.js, manifest.webmanifest, assets/icon.svg   offline + install
```

## Roman Urdu — quick start

* Poora project `Shakeel_New_Project_Lab/` folder ke andar hai; repo mein aur koi file nahi.
* Theme: ivory paper + clay (green/white ya dark glass jaisa kuch nahi). Dark chahiye to <kbd>T</kbd>.
* Data: sab kuch `snpl.*` (localStorage) mein, aur ek hi file `snpl.json` mein export/import.
* Live karni hai to ek hi baar: repo → **Settings → Pages → Build source: GitHub Actions** (workflow
  already repo mein hai). Phir **Data & Live → Live sync** mein repo ka naam + fine-grained token daal
  kar *Create the data branch* aur *Push now* dabao. Har edit ke 4 second baad data push hota hai aur
  30 second mein doosre laptop par record-by-record merge ho jata hai.
* Print: koi bhi page <kbd>P</kbd> — A4, ek page chaudai, sirf kali-safai.
* Excel: export B&W print-ready, import mein aapki purani `Aptech IT Lab Center.xlsx` file seedha
  chali jayegi (Lab 1 | Lab 2 | Lab 3 blocks ke sath).
"# shahban" 
"# shahban" 
