// Số liệu sản xuất kinh doanh ngày của 4 nhà máy (nhập trong Quản trị → Báo cáo SXKD ngày)
const { db } = require('../db');

const PLANTS = [
  { id: 'mk', vi: 'Nhà máy Thủy điện Mường Kim', en: 'Muong Kim Hydropower Plant', mw: 13.5 },
  { id: 'mk2', vi: 'Nhà máy Thủy điện Mường Kim II', en: 'Muong Kim II Hydropower Plant', mw: 12 },
  { id: 'pl', vi: 'Nhà máy Thủy điện Phiêng Lúc', en: 'Phieng Luc Hydropower Plant', mw: 20 },
  { id: 'hb2', vi: 'Nhà máy Thủy điện Hồ Bốn 2', en: 'Ho Bon 2 Hydropower Plant', mw: 5 },
];
const PLANT_IDS = PLANTS.map((p) => p.id);

// Các ô nhập cho mỗi nhà máy mỗi ngày
const FIELDS = [
  ['output', 'Sản lượng ngày (kWh)'],
  ['revenue', 'Doanh thu ngày (triệu đồng)'],
  ['water_level', 'Mực nước hồ (m)'],
  ['inflow', 'Lưu lượng về hồ (m³/s)'],
];

db.exec(`
CREATE TABLE IF NOT EXISTS daily_ops (
  date TEXT NOT NULL, plant TEXT NOT NULL,
  output REAL, revenue REAL, water_level REAL, inflow REAL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (date, plant)
);
CREATE TABLE IF NOT EXISTS daily_plan (
  year INTEGER NOT NULL, plant TEXT NOT NULL,
  output_plan REAL, revenue_plan REAL,
  PRIMARY KEY (year, plant)
);
`);

const q = {
  latestDate: db.prepare('SELECT MAX(date) d FROM daily_ops'),
  firstDate: db.prepare('SELECT MIN(date) d FROM daily_ops'),
  prevDate: db.prepare('SELECT MAX(date) d FROM daily_ops WHERE date < ?'),
  nextDate: db.prepare('SELECT MIN(date) d FROM daily_ops WHERE date > ?'),
  day: db.prepare('SELECT * FROM daily_ops WHERE date = ?'),
  sum: db.prepare('SELECT plant, SUM(output) output, SUM(revenue) revenue FROM daily_ops WHERE date >= ? AND date <= ? GROUP BY plant'),
  plans: db.prepare('SELECT * FROM daily_plan WHERE year = ?'),
  dates: db.prepare('SELECT date, COUNT(*) n FROM daily_ops GROUP BY date ORDER BY date DESC LIMIT ?'),
  upsertDay: db.prepare(`INSERT INTO daily_ops (date, plant, output, revenue, water_level, inflow) VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(date, plant) DO UPDATE SET output = excluded.output, revenue = excluded.revenue,
    water_level = excluded.water_level, inflow = excluded.inflow, updated_at = datetime('now')`),
  deleteDay: db.prepare('DELETE FROM daily_ops WHERE date = ? AND plant = ?'),
  upsertPlan: db.prepare(`INSERT INTO daily_plan (year, plant, output_plan, revenue_plan) VALUES (?, ?, ?, ?)
    ON CONFLICT(year, plant) DO UPDATE SET output_plan = excluded.output_plan, revenue_plan = excluded.revenue_plan`),
};

const byPlant = (rows) => Object.fromEntries(rows.map((r) => [r.plant, r]));
const add = (a, b) => (a == null && b == null ? null : (a || 0) + (b || 0));

// Báo cáo của một ngày (mặc định: ngày gần nhất có số liệu); kèm ngày trước/sau có số liệu để xem lại
function report(date) {
  const latest = q.latestDate.get().d || null;
  const d = date || latest;
  if (!d) return { date: null, latest: null, rows: PLANTS.map((p) => ({ ...p })), total: { mw: PLANTS.reduce((s, p) => s + p.mw, 0) } };
  const nav = { latest, first: q.firstDate.get().d, prev: q.prevDate.get(d).d || null, next: q.nextDate.get(d).d || null };
  const year = d.slice(0, 4);
  const dayRows = q.day.all(d);
  const day = byPlant(dayRows);
  const month = byPlant(q.sum.all(d.slice(0, 7) + '-01', d));
  const ytd = byPlant(q.sum.all(year + '-01-01', d));
  const plan = byPlant(q.plans.all(Number(year)));
  const rows = PLANTS.map((p) => {
    const r = day[p.id] || {};
    const yo = ytd[p.id]?.output ?? null;
    const po = plan[p.id]?.output_plan ?? null;
    return {
      ...p, output: r.output ?? null, revenue: r.revenue ?? null, water_level: r.water_level ?? null, inflow: r.inflow ?? null,
      month_output: month[p.id]?.output ?? null, year_output: yo, year_revenue: ytd[p.id]?.revenue ?? null,
      plan_output: po, pct: yo != null && po ? (yo / po) * 100 : null,
    };
  });
  const total = rows.reduce((t, r) => ({
    mw: t.mw + r.mw, output: add(t.output, r.output), revenue: add(t.revenue, r.revenue),
    month_output: add(t.month_output, r.month_output), year_output: add(t.year_output, r.year_output),
    plan_output: add(t.plan_output, r.plan_output),
  }), { mw: 0, output: null, revenue: null, month_output: null, year_output: null, plan_output: null });
  total.pct = total.year_output != null && total.plan_output ? (total.year_output / total.plan_output) * 100 : null;
  return { date: d, hasDay: dayRows.length > 0, ...nav, rows, total };
}

module.exports = { PLANTS, PLANT_IDS, FIELDS, report, q };
