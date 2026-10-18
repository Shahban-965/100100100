# LabDesk — Shakeel New Project Lab

A fast, offline-first **lab ledger** built as a pure frontend app. Excel-grade data grids,
fault desk, JSON database, full-page A4 printing — wrapped in a monochrome
**black & white "Claude-style" design**.

![stack](https://img.shields.io/badge/stack-vanilla%20JS-171716) ![db](https://img.shields.io/badge/database-JSON-171716) ![ui](https://img.shields.io/badge/theme-black%20%26%20white-171716)

## Features

- **Passcode gate** — default `45637189230` (changeable in Settings, SHA-256 stored)
- **Dashboard** — live clock, stat cards, inventory-mix chart, activity feed, open tickets,
  and a **Cute Moments** baby-photo wall with lightbox
- **Inventory** — Excel-grade grid: virtual fast-scroll (thousands of rows, zero lag),
  column sorting, per-column filters, global search, row selection, bulk delete,
  inline add/edit modals, CSV export, full-page print
- **Fault Desk** — the same grid engine for repair tickets (priority + status chips)
- **Data Manager** — JSON database: export / import / reset, storage meter, full activity log
- **Live** — cross-tab sync via BroadcastChannel + storage events; auto-save on every edit;
  service worker for offline use
- **Velocity rail** — new fast-scroll dock: progress ring, section dots, hold-to-turbo,
  `J`/`K` keyboard glide
- **Print** — one-click full-page A4 reports with repeating headers, in pure black & white
- **Responsive** — desktop rail collapses to a drawer; grids stay usable on phones

## Run it

It's a static site — no build step.

```bash
# option 1: just open it
open Shakeel_New_Project_Lab/index.html        # macOS
xdg-open Shakeel_New_Project_Lab/index.html    # Linux

# option 2 (recommended): serve it
cd Shakeel_New_Project_Lab
npx serve .            # or: python3 -m http.server 8080
```

## Go live (hosting)

**GitHub Pages (free):**
1. Push this folder to a GitHub repo.
2. Repo → Settings → Pages → Source: `main` branch / root → Save.
3. Live at `https://<user>.github.io/<repo>/` (paths are all relative, so sub-folders work).

**Netlify / Vercel (fastest):** drag the `Shakeel_New_Project_Lab` folder onto
[app.netlify.com/drop](https://app.netlify.com/drop) — instant HTTPS URL.

Because the database lives in the browser (localStorage) and in `data/db.json`,
each visitor gets their own private copy. To share one dataset, export JSON from
**Data Manager** and import it on the other machine.

## Keyboard shortcuts

| Key | Action |
| --- | --- |
| `/` | Search everything |
| `N` | New record |
| `P` | Print report |
| `T` | Paper ⇄ Graphite theme |
| `D` | Comfortable ⇄ Compact rows |
| `L` | Lock lab |
| `J` / `K` | Glide down / up |

## Project layout

```
Shakeel_New_Project_Lab/
├── index.html            app shell + login gate
├── css/
│   ├── theme.css         design tokens (black & white Claude-style)
│   ├── app.css           components, login, dashboard, grid, velocity rail
│   └── print.css         full-page A4 report styles
├── js/
│   ├── util.js           helpers, toasts, modals, icons
│   ├── seed.js           embedded seed mirror (works from file://)
│   ├── db.js             JSON database engine (localStorage persistence)
│   ├── auth.js           passcode gate (45637189230)
│   ├── grid.js           ExcelGrid — virtual scroll, sort, filter, CSV, print
│   ├── scroll.js         VelocityRail fast-scroll dock
│   ├── pages.js          dashboard / inventory / tickets / data / settings views
│   └── app.js            router, live sync, search palette, boot
├── data/db.json          the JSON database (seed)
├── tools/gen-seed.js     regenerate the seed (node tools/gen-seed.js)
├── assets/img/           AI-generated artwork (login portrait, bg, baby wall)
├── sw.js                 offline service worker
└── manifest.webmanifest  PWA manifest
```

## Data model

```jsonc
{
  "meta":    { "app": "LabDesk", "org": "Shakeel New Project Lab", "version": 1 },
  "categories": ["Desktop PCs", "Laptops", "Printers", "Network", "Software", "Accessories", "Furniture", "Repairs"],
  "records": [{ "id": "L-1001", "name": "…", "brand": "…", "category": "…", "qty": 1,
               "price": 95000, "status": "Active", "location": "Lab A",
               "assignedTo": "…", "purchased": "2024-05-11", "warranty": "24 mo", "notes": "…" }],
  "tickets": [{ "id": "T-501", "system": "L-1001 · …", "issue": "…", "reportedBy": "…",
               "priority": "High", "status": "Open", "opened": "2026-…", "due": "2026-…",
               "assigned": "…", "notes": "…" }],
  "activity": [{ "t": "ISO-time", "icon": "＋", "text": "…", "by": "…" }]
}
```

Default passcode: **45637189230**
