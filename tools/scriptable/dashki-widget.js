// ─────────────────────────────────────────────────────────────────────────────
// Dashki Widget — iOS Scriptable
// ─────────────────────────────────────────────────────────────────────────────
//
// Shows your Dashki health data (calories, protein, steps, weight) on the
// iOS home screen. Refreshes whenever iOS decides to (typically 15-30 min).
//
// SETUP
//   1. Install "Scriptable" from the App Store.
//   2. In Scriptable, tap "+" to create a new script.
//   3. Paste this entire file in. Save.
//   4. Rename the script to "Dashki" (top of the screen).
//   5. Long-press an empty home-screen spot → "+" → search for Scriptable.
//      Pick the MEDIUM widget size and add it.
//   6. Long-press the new widget → Edit Widget → choose script "Dashki".
//
// CONFIG
//   Just the API base. Change if your Railway URL changes.
// ─────────────────────────────────────────────────────────────────────────────

const API_BASE = "https://dashki-production.up.railway.app";

// Tap the widget to open this URL in Safari. Set to your deployed web app, or
// leave as "" to disable the tap action.
const OPEN_URL_ON_TAP = "";

// Default goals if the goals endpoint can't be reached.
const FALLBACK_GOALS = { calories: 2000, protein: 150, steps: 10000 };

// ─── Theme (matches Dashki's dark Glass design) ───────────────────────────────

const COLORS = {
  bg: new Color("#0e0e0e"),
  card: new Color("#1a1a1a"),
  border: new Color("#ffffff14"),
  textPrimary: new Color("#ffffff"),
  textMuted: new Color("#ffffff66"),
  textDim: new Color("#ffffff40"),
  amber: new Color("#fbbf24"),       // calories
  emerald: new Color("#34d399"),     // protein
  sky: new Color("#38bdf8"),         // steps
  purple: new Color("#a78bfa"),      // weight
  goalBg: new Color("#ffffff10"),
};

// ─── Fetch helpers ────────────────────────────────────────────────────────────

async function fetchJSON(path) {
  const req = new Request(`${API_BASE}${path}`);
  req.timeoutInterval = 8;
  try {
    const res = await req.loadJSON();
    return { ok: true, data: res };
  } catch (err) {
    console.log(`Fetch failed for ${path}: ${err}`);
    return { ok: false, data: null };
  }
}

async function loadDashboard() {
  const [summary, steps, weight, goals] = await Promise.all([
    fetchJSON("/api/journal/today-summary"),
    fetchJSON("/api/steps/today"),
    fetchJSON("/api/weight/latest"),
    fetchJSON("/api/goals"),
  ]);

  const goalsData = goals.ok && goals.data ? goals.data : FALLBACK_GOALS;

  return {
    calories: summary.ok ? Math.round(summary.data?.calories ?? 0) : null,
    protein: summary.ok ? Math.round(summary.data?.protein ?? 0) : null,
    steps: steps.ok ? Math.round(steps.data?.steps ?? 0) : null,
    weight: weight.ok && weight.data?.weight_kg != null
      ? Number(weight.data.weight_kg)
      : null,
    weightDate: weight.ok ? weight.data?.date ?? null : null,
    goals: {
      calories: Number(goalsData.calories) || FALLBACK_GOALS.calories,
      protein: Number(goalsData.protein) || FALLBACK_GOALS.protein,
      steps: Number(goalsData.steps) || FALLBACK_GOALS.steps,
    },
    fetchedAt: new Date(),
    anyFetchFailed: !summary.ok || !steps.ok,
  };
}

// ─── Formatting ───────────────────────────────────────────────────────────────

function formatNumber(n) {
  if (n == null) return "—";
  return n.toLocaleString("en-US");
}

function formatDate(d) {
  return d.toLocaleDateString("en-AU", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

function pct(value, goal) {
  if (value == null || !goal) return 0;
  return Math.max(0, Math.min(1, value / goal));
}

// ─── UI building blocks ───────────────────────────────────────────────────────

/**
 * Adds a stat tile to a parent stack. Layout:
 *
 *   [icon]  CALORIES
 *           655 / 2000
 *           ━━━━━━━━━━━━━━ (progress bar; omitted if no goal)
 */
function addStatTile(parent, { label, value, unit, goal, color, symbolName }) {
  const tile = parent.addStack();
  tile.layoutVertically();
  tile.spacing = 2;

  // Header row: icon + label
  const header = tile.addStack();
  header.centerAlignContent();
  header.spacing = 4;

  const icon = SFSymbol.named(symbolName);
  if (icon) {
    const img = header.addImage(icon.image);
    img.imageSize = new Size(11, 11);
    img.tintColor = color;
  }
  const labelText = header.addText(label);
  labelText.font = Font.semiboldSystemFont(9);
  labelText.textColor = COLORS.textDim;

  // Value row
  const valueRow = tile.addStack();
  valueRow.centerAlignContent();
  valueRow.spacing = 3;

  const valueText = valueRow.addText(value == null ? "—" : formatNumber(value));
  valueText.font = Font.boldSystemFont(20);
  valueText.textColor = COLORS.textPrimary;
  valueText.minimumScaleFactor = 0.5;
  valueText.lineLimit = 1;

  if (goal != null && value != null) {
    const goalText = valueRow.addText(`/ ${formatNumber(goal)}`);
    goalText.font = Font.systemFont(11);
    goalText.textColor = COLORS.textDim;
    goalText.lineLimit = 1;
  } else if (unit) {
    const unitText = valueRow.addText(unit);
    unitText.font = Font.systemFont(11);
    unitText.textColor = COLORS.textDim;
    unitText.lineLimit = 1;
  }

  // Progress bar (only when there's a goal)
  if (goal != null && value != null) {
    const bar = drawProgressBar(pct(value, goal), color);
    const img = tile.addImage(bar);
    img.imageSize = new Size(120, 4);
    img.resizable = true;
  }
}

/**
 * Draws a tiny rounded progress bar to a Drawing context.
 * Returns an Image.
 */
function drawProgressBar(fraction, color) {
  const W = 240; // 2x for retina
  const H = 8;
  const ctx = new DrawContext();
  ctx.size = new Size(W, H);
  ctx.opaque = false;
  ctx.respectScreenScale = true;

  // Background
  const bgPath = new Path();
  bgPath.addRoundedRect(new Rect(0, 0, W, H), H / 2, H / 2);
  ctx.addPath(bgPath);
  ctx.setFillColor(COLORS.goalBg);
  ctx.fillPath();

  // Fill
  const fillW = Math.max(H, Math.round(W * fraction));
  if (fraction > 0) {
    const fillPath = new Path();
    fillPath.addRoundedRect(new Rect(0, 0, fillW, H), H / 2, H / 2);
    ctx.addPath(fillPath);
    ctx.setFillColor(color);
    ctx.fillPath();
  }

  return ctx.getImage();
}

// ─── Widget render ────────────────────────────────────────────────────────────

function buildWidget(data) {
  const widget = new ListWidget();
  widget.backgroundColor = COLORS.bg;
  widget.setPadding(14, 14, 14, 14);

  if (OPEN_URL_ON_TAP) widget.url = OPEN_URL_ON_TAP;

  // ── Header: "DASHKI" + today's date ───────────────────────────────────────
  const header = widget.addStack();
  header.centerAlignContent();

  const title = header.addText("DASHKI");
  title.font = Font.boldSystemFont(11);
  title.textColor = COLORS.textPrimary;
  title.textOpacity = 0.5;

  header.addSpacer();

  const date = header.addText(formatDate(data.fetchedAt));
  date.font = Font.semiboldSystemFont(10);
  date.textColor = COLORS.textMuted;

  widget.addSpacer(10);

  // ── 2x2 grid of stat tiles ─────────────────────────────────────────────────
  const grid = widget.addStack();
  grid.layoutVertically();
  grid.spacing = 12;

  const row1 = grid.addStack();
  row1.spacing = 14;
  addStatTile(row1, {
    label: "CALORIES",
    value: data.calories,
    goal: data.goals.calories,
    color: COLORS.amber,
    symbolName: "flame.fill",
  });
  row1.addSpacer();
  addStatTile(row1, {
    label: "PROTEIN",
    value: data.protein,
    unit: "g",
    goal: data.goals.protein,
    color: COLORS.emerald,
    symbolName: "leaf.fill",
  });

  const row2 = grid.addStack();
  row2.spacing = 14;
  addStatTile(row2, {
    label: "STEPS",
    value: data.steps,
    goal: data.goals.steps,
    color: COLORS.sky,
    symbolName: "figure.walk",
  });
  row2.addSpacer();
  addStatTile(row2, {
    label: data.weightDate ? `WEIGHT · ${shortDate(data.weightDate)}` : "WEIGHT",
    value: data.weight != null ? data.weight.toFixed(1) : null,
    unit: "kg",
    color: COLORS.purple,
    symbolName: "scalemass.fill",
  });

  // ── Footer / error indicator ───────────────────────────────────────────────
  if (data.anyFetchFailed) {
    widget.addSpacer(6);
    const err = widget.addText("Some data unavailable — tap to retry");
    err.font = Font.systemFont(9);
    err.textColor = COLORS.textDim;
    err.centerAlignText();
  }

  return widget;
}

function shortDate(isoDate) {
  // "2026-04-20" → "20 Apr"
  try {
    const [y, m, d] = isoDate.split("-").map(Number);
    const dt = new Date(y, m - 1, d);
    return dt.toLocaleDateString("en-AU", { day: "numeric", month: "short" });
  } catch {
    return isoDate;
  }
}

// ─── Small-widget fallback (compact 2-stat layout) ────────────────────────────

function buildSmallWidget(data) {
  const widget = new ListWidget();
  widget.backgroundColor = COLORS.bg;
  widget.setPadding(12, 12, 12, 12);
  if (OPEN_URL_ON_TAP) widget.url = OPEN_URL_ON_TAP;

  const title = widget.addText("DASHKI");
  title.font = Font.boldSystemFont(10);
  title.textColor = COLORS.textPrimary;
  title.textOpacity = 0.5;

  widget.addSpacer(8);

  // Two rows of stats, no progress bars (too cramped at 169pt)
  const stack = widget.addStack();
  stack.layoutVertically();
  stack.spacing = 8;

  addCompactRow(stack, "flame.fill", COLORS.amber,
    data.calories != null ? `${formatNumber(data.calories)} kcal` : "—");
  addCompactRow(stack, "leaf.fill", COLORS.emerald,
    data.protein != null ? `${formatNumber(data.protein)} g` : "—");
  addCompactRow(stack, "figure.walk", COLORS.sky,
    data.steps != null ? `${formatNumber(data.steps)}` : "—");
  addCompactRow(stack, "scalemass.fill", COLORS.purple,
    data.weight != null ? `${data.weight.toFixed(1)} kg` : "—");

  return widget;
}

function addCompactRow(parent, symbolName, color, value) {
  const row = parent.addStack();
  row.centerAlignContent();
  row.spacing = 6;

  const icon = SFSymbol.named(symbolName);
  if (icon) {
    const img = row.addImage(icon.image);
    img.imageSize = new Size(13, 13);
    img.tintColor = color;
  }
  const text = row.addText(value);
  text.font = Font.semiboldSystemFont(13);
  text.textColor = COLORS.textPrimary;
  text.lineLimit = 1;
  text.minimumScaleFactor = 0.7;
}

// ─── Entry point ──────────────────────────────────────────────────────────────

async function main() {
  const data = await loadDashboard();
  const family = config.widgetFamily; // "small" | "medium" | "large" | undefined when run in-app

  let widget;
  if (family === "small") {
    widget = buildSmallWidget(data);
  } else {
    // Medium/large/in-app preview all use the spacious layout.
    widget = buildWidget(data);
  }

  // Refresh hint to iOS — try every 15 min. iOS ultimately decides.
  widget.refreshAfterDate = new Date(Date.now() + 15 * 60 * 1000);

  if (config.runsInWidget) {
    Script.setWidget(widget);
  } else {
    // When you tap Run inside the Scriptable app, preview the medium layout.
    await widget.presentMedium();
  }
  Script.complete();
}

await main();
