// Seed generator for data/db.json — LabDesk (Shakeel New Project Lab)
// Run: node tools/gen-seed.js  → writes data/db.json + js/seed.js (offline fallback)
'use strict';
const fs = require('fs');
const path = require('path');

// deterministic PRNG so the seed is stable
let s = 987654321;
const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
const pick = a => a[Math.floor(rnd() * a.length)];
const int = (a, b) => a + Math.floor(rnd() * (b - a + 1));
const date = (y0, y1) => {
  const y = int(y0, y1), m = String(int(1, 12)).padStart(2, '0'), d = String(int(1, 28)).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const STAFF = ['Ahmed Raza', 'Sara Khan', 'Bilal Hussain', 'Ayesha Malik', 'Usman Ali',
  'Fatima Noor', 'Hassan Shah', 'Zainab Ali', 'Omar Farooq', 'Hira Tariq', 'Daniyal Iqbal', 'Mahnoor Siddiq'];
const LOCS = ['Lab A', 'Lab B', 'Lab C', 'Store Room', 'Office', 'Server Room'];
const CATS = ['Desktop PCs', 'Laptops', 'Printers', 'Network', 'Software', 'Accessories', 'Furniture', 'Repairs'];
const STATUS = ['Active', 'In Use', 'In Repair', 'Fault', 'Retired'];
const STATUS_W = [0.30, 0.30, 0.14, 0.14, 0.12];
const wPick = pairs => { const r = rnd(); let acc = 0; for (const [v, w] of pairs) { acc += w; if (r <= acc) return v; } return pairs[pairs.length - 1][0]; };

const DESKS = {
  'Desktop PCs': [
    ['Dell OptiPlex 7090 Desktop', 'Dell', 95000, 24],
    ['Dell OptiPlex 7060 Desktop', 'Dell', 78000, 18],
    ['HP EliteDesk 800 G5', 'HP', 105000, 12],
    ['HP ProDesk 400 G6', 'HP', 62000, 15],
    ['Lenovo ThinkCentre M720', 'Lenovo', 88000, 10],
    ['Lenovo ThinkCentre M920', 'Lenovo', 118000, 6],
    ['Apple iMac 21.5-inch', 'Apple', 215000, 3],
    ['Asus VivoPC X200', 'Asus', 54000, 8],
  ],
  'Laptops': [
    ['Dell Latitude 5490', 'Dell', 142000, 9],
    ['Dell Latitude 7490', 'Dell', 185000, 5],
    ['HP ProBook 450 G7', 'HP', 128000, 8],
    ['Lenovo ThinkPad E14', 'Lenovo', 135000, 7],
    ['Lenovo ThinkPad T14', 'Lenovo', 198000, 4],
    ['Apple MacBook Air M1', 'Apple', 285000, 3],
    ['Asus VivoBook 15 X1502', 'Asus', 98000, 6],
  ],
  'Printers': [
    ['HP LaserJet Pro M404n', 'HP', 38500, 6],
    ['HP LaserJet Pro MFP M430', 'HP', 62000, 3],
    ['Canon PIXMA G3411', 'Canon', 18500, 7],
    ['Epson L3150 EcoTank', 'Epson', 21500, 5],
    ['Brother HL-L2350DW', 'Brother', 29500, 4],
    ['HP DeskJet 2722', 'HP', 12500, 6],
  ],
  'Network': [
    ['Cisco Catalyst 2960 Switch', 'Cisco', 85000, 3],
    ['TP-Link TL-SG108 8-Port', 'TP-Link', 6500, 14],
    ['Ubiquiti UniFi AP AC Lite', 'Ubiquiti', 24000, 8],
    ['MikroTik hAP ac² Router', 'MikroTik', 14500, 5],
    ['Cisco RV340 Dual WAN Router', 'Cisco', 56000, 2],
    ['TP-Link Archer AX21 Wi-Fi 6', 'TP-Link', 11500, 6],
  ],
  'Software': [
    ['Windows 11 Pro License', 'Microsoft', 12500, 22],
    ['MS Office 2021 Pro Plus', 'Microsoft', 24500, 15],
    ['AutoCAD 2024 License', 'Autodesk', 165000, 2],
    ['MATLAB R2023a License', 'MathWorks', 145000, 2],
    ['Adobe Creative Cloud', 'Adobe', 95000, 3],
    ['Ubuntu Linux 24.04 LTS', 'Canonical', 0, 30],
    ['Visual Studio Code', 'Microsoft', 0, 40],
  ],
  'Accessories': [
    ['Logitech MX Master 3S Mouse', 'Logitech', 16500, 12],
    ['Dell KB216 Keyboard', 'Dell', 2800, 18],
    ['Samsung 27" LC27R500 Monitor', 'Samsung', 38500, 11],
    ['Dell P2422H 24" Monitor', 'Dell', 42000, 9],
    ['Logitech C920 HD Webcam', 'Logitech', 9800, 7],
    ['APC Back-UPS 1500VA', 'APC', 28500, 5],
    ['Corsair K70 RGB Keyboard', 'Corsair', 21500, 4],
    ['Logitech H390 Headset', 'Logitech', 5200, 10],
  ],
  'Furniture': [
    ['Herman Miller Aeron Chair', 'Herman Miller', 185000, 2],
    ['Steelcase Series 1 Chair', 'Steelcase', 72000, 6],
    ['4ft Study Table with Modesty Panel', 'Local', 16500, 14],
    ['Ergonomic Revolving Chair', 'Local', 9500, 16],
    ['6ft Whiteboard with Frame', 'Local', 6800, 8],
    ['Server Rack 42U Cabinet', 'Aten', 95000, 1],
  ],
  'Repairs': [
    ['Keyboard Replacement Service', 'Service', 1500, 20],
    ['RAM Upgrade 16GB DDR4', 'Service', 4500, 12],
    ['SSD 512GB NVMe Upgrade', 'Service', 12500, 9],
    ['Screen Replacement 15.6" FHD', 'Service', 16500, 7],
    ['Motherboard Repair Service', 'Service', 8500, 5],
    ['Deep Clean + Thermal Paste', 'Service', 1200, 25],
  ],
};

const records = [];
let n = 1000;
for (const cat of CATS) {
  for (const [name, brand, price, count] of DESKS[cat]) {
    for (let i = 0; i < Math.max(1, Math.round(count / 4)); i++) {
      n++;
      records.push({
        id: 'L-' + n,
        name, brand, category: cat,
        qty: int(1, Math.max(2, Math.round(count / 3))),
        price: price + (price ? int(-1500, 1500) : 0),
        status: wPick([['Active', .32], ['In Use', .30], ['In Repair', .14], ['Fault', .14], ['Retired', .10]]),
        location: pick(LOCS),
        assignedTo: rnd() < 0.55 ? pick(STAFF) : '—',
        purchased: date(2019, 2025),
        warranty: rnd() < 0.3 ? '—' : pick([6, 12, 24, 36]) + ' mo',
        notes: rnd() < 0.25 ? pick([
          'Checked in yearly audit.', 'Serial tagged on chassis.', 'Keep away from wet floor area.',
          'Part of lab modernization batch.', 'Spare unit for quick swap.', 'Needs monthly inspection.',
          'Donated by partner program.', 'Used in CS-101 practicals.']) : '',
      });
    }
  }
}

const ISSUES = ['Won\'t power on', 'Blue screen on boot', 'Slow performance', 'No network connectivity',
  'Printer not responding', 'Flickering display', 'Keyboard keys stuck', 'Battery drains fast',
  'Overheating under load', 'Audio not working', 'USB ports dead', 'OS corruption'];
const tickets = [];
for (let i = 0; i < 16; i++) {
  const rec = records[int(0, 60)];
  tickets.push({
    id: 'T-' + (500 + i),
    system: rec.id + ' · ' + rec.name,
    issue: pick(ISSUES),
    reportedBy: pick(STAFF),
    priority: wPick([['Low', .3], ['Medium', .34], ['High', .24], ['Critical', .12]]),
    status: wPick([['Open', .3], ['In Progress', .3], ['Resolved', .25], ['Closed', .15]]),
    opened: date(2026, 2026),
    due: date(2026, 2026),
    assigned: pick(STAFF),
    notes: pick(['', 'Ordered spare part.', 'Escalated to vendor.', 'Follow-up needed after repair.', ''])
  });
}

const activity = [
  { t: date(2026, 2026) + 'T09:30:00', icon: '＋', text: 'Inventory imported from Aptech IT Lab Center', by: 'Shakeel' },
  { t: date(2026, 2026) + 'T11:05:00', icon: '⚙', text: 'Fault ticket T-503 created for Lab B', by: 'Sara Khan' },
  { t: date(2026, 2026) + 'T13:40:00', icon: '✓', text: 'Ticket T-501 resolved — network port replaced', by: 'Bilal Hussain' },
  { t: date(2026, 2026) + 'T15:12:00', icon: '＋', text: '4× Dell P2422H monitors added to Store Room', by: 'Shakeel' },
];

const db = {
  meta: { app: 'LabDesk', org: 'Shakeel New Project Lab', version: 1, created: new Date().toISOString().slice(0, 10) },
  categories: CATS,
  records, tickets, activity,
};

fs.mkdirSync(path.join(__dirname, '..', 'data'), { recursive: true });
fs.writeFileSync(path.join(__dirname, '..', 'data', 'db.json'), JSON.stringify(db, null, 1));
fs.writeFileSync(path.join(__dirname, '..', 'js', 'seed.js'),
  '/* Auto-generated offline seed mirror of data/db.json */\nwindow.SEED_DATA = ' + JSON.stringify(db) + ';\n');
console.log('records:', records.length, '| tickets:', tickets.length, '| bytes:', JSON.stringify(db).length);
