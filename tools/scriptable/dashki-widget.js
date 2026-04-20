// ─────────────────────────────────────────────────────────────────────────────
// Dashki Widget — iOS Scriptable
// ─────────────────────────────────────────────────────────────────────────────
//
// Three-ring health widget showing today's CALORIES, PROTEIN, and STEPS
// from the Dashki production API. Inspired by the Apple Health activity
// rings but in Dashki's dark Glass palette.
//
// REFRESH BEHAVIOUR — important to understand
//
//   iOS does NOT let third-party widgets push-update from a server. Apple's
//   widget framework runs scripts on its own schedule, typically 15-30 minutes
//   apart, and there is no API to trigger an immediate refresh from outside
//   the device. So "update instantly when I save a meal" is not achievable
//   purely from a widget.
//
//   This widget does the next-best things:
//
//     • Asks iOS to re-run as often as possible (60s hint). iOS often refuses
//       and uses its own 15-30 min cadence, but sometimes honours it.
//     • Tapping the widget re-runs the script in foreground and immediately
//       repaints with fresh data. Use this right after you log a meal.
//     • The script is also runnable from Shortcuts / the Action Button /
//       Home Screen for a one-tap manual refresh from anywhere.
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
// FORCE-REFRESH ON DEMAND
//   (a) Tap the widget — re-runs and repaints in 2-5 sec.
//   (b) Add a Home Screen icon: open Scriptable → tap the script → share →
//       "Add to Home Screen". Tap = instant refresh from anywhere.
//   (c) iPhone 15 Pro / 16 Pro Action Button: Settings → Action Button →
//       Shortcut → pick a Shortcut that runs the "Dashki" script.
//
// CONFIG
//   API_BASE         change if your Railway URL changes
//   OPEN_URL_ON_TAP  set to a URL to override default tap-to-refresh
//   FALLBACK_GOALS   defaults if /api/goals can't be reached
// ─────────────────────────────────────────────────────────────────────────────

const API_BASE = "https://dashki-production.up.railway.app";
const OPEN_URL_ON_TAP = "";
const FALLBACK_GOALS = { calories: 2000, protein: 150, steps: 10000 };
const REFRESH_HINT_SECONDS = 60;

// ─── Theme ────────────────────────────────────────────────────────────────────

const COLORS = {
  bg: new Color("#0b0b0b"),
  bgRgb: { r: 0x0b, g: 0x0b, b: 0x0b }, // for ring inner-cover (must match bg)
  textPrimary: new Color("#ffffff"),
  textMuted: new Color("#ffffff", 0.55),
  textDim: new Color("#ffffff", 0.32),
  ringTrack: new Color("#ffffff", 0.10), // background ring (the unfilled track)
  amber: new Color("#fbbf24"),    // calories
  emerald: new Color("#34d399"),  // protein
  sky: new Color("#38bdf8"),      // steps
};

// ─── Fetch helpers ────────────────────────────────────────────────────────────

async function fetchJSON(path) {
  const req = new Request(`${API_BASE}${path}`);
  req.timeoutInterval = 8;
  try {
    const data = await req.loadJSON();
    return { ok: true, data };
  } catch (err) {
    console.log(`Fetch failed for ${path}: ${err}`);
    return { ok: false, data: null };
  }
}

async function loadDashboard() {
  const [summary, steps, goals] = await Promise.all([
    fetchJSON("/api/journal/today-summary"),
    fetchJSON("/api/steps/today"),
    fetchJSON("/api/goals"),
  ]);

  const goalsData = goals.ok && goals.data ? goals.data : FALLBACK_GOALS;

  return {
    calories: summary.ok ? Math.round(summary.data?.calories ?? 0) : null,
    protein: summary.ok ? Math.round(summary.data?.protein ?? 0) : null,
    steps: steps.ok ? Math.round(steps.data?.steps ?? 0) : null,
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
  }).toUpperCase();
}

function pct(value, goal) {
  if (value == null || !goal) return 0;
  return Math.max(0, Math.min(1, value / goal));
}

// ─── Ring rendering (DrawContext) ─────────────────────────────────────────────

/**
 * Draws a circular progress ring with the value displayed inside.
 * Returns an Image ready to drop into a stack.
 *
 * Approach:
 *   1. Draw the full background "track" ring in muted white.
 *   2. Draw the foreground "filled" arc as a polygon-approximated pie slice
 *      in the stat's accent color.
 *   3. Cover the inner area with a circle that matches the widget bg, so the
 *      pie slice becomes a hollow ring (matches Apple Health rings visually).
 *   4. Render the value text in the center.
 */
function drawRing({
  value,
  goal,
  color,
  unit,            // optional: "g", "kcal", etc. shown beneath the value
  pixelSize = 220, // internal render size; the image is then displayed smaller
  stroke = 22,
}) {
  const ctx = new DrawContext();
  ctx.size = new Size(pixelSize, pixelSize);
  ctx.opaque = false;
  ctx.respectScreenScale = true;

  const cx = pixelSize / 2;
  const cy = pixelSize / 2;
  const outerR = pixelSize / 2;
  const innerR = outerR - stroke;
  const fraction = pct(value, goal);

  // 1. Background track ring
  drawArc(ctx, cx, cy, outerR, 0, 1, COLORS.ringTrack);
  drawCircle(ctx, cx, cy, innerR, new Color(rgbHex(COLORS.bgRgb), 1));

  // 2. Foreground filled arc
  if (fraction > 0) {
    drawArc(ctx, cx, cy, outerR, 0, fraction, color);
    drawCircle(ctx, cx, cy, innerR, new Color(rgbHex(COLORS.bgRgb), 1));
  }

  // 3. Cap dot at the start of the ring (clean look at 12 o'clock)
  if (fraction > 0) {
    const capR = stroke / 2;
    drawCircle(ctx, cx, cy - (outerR - capR), capR, color);
  }

  // 4. Cap dot at the end of the filled arc
  if (fraction > 0 && fraction < 1) {
    const angle = -Math.PI / 2 + fraction * 2 * Math.PI;
    const ringMidR = (outerR + innerR) / 2;
    const ex = cx + ringMidR * Math.cos(angle);
    const ey = cy + ringMidR * Math.sin(angle);
    drawCircle(ctx, ex, ey, stroke / 2, color);
  }

  // 5. Center text — value
  const valueText = value == null ? "—" : formatNumber(value);
  const valueFontSize = valueText.length >= 5 ? 38 : valueText.length === 4 ? 46 : 56;
  ctx.setFont(Font.boldSystemFont(valueFontSize));
  ctx.setTextColor(COLORS.textPrimary);
  ctx.setTextAlignedCenter();
  const valueRect = new Rect(
    0,
    cy - valueFontSize * 0.6,
    pixelSize,
    valueFontSize * 1.2
  );
  ctx.drawTextInRect(valueText, valueRect);

  // 6. Optional unit label below value
  if (unit) {
    ctx.setFont(Font.semiboldSystemFont(16));
    ctx.setTextColor(COLORS.textMuted);
    ctx.setTextAlignedCenter();
    ctx.drawTextInRect(
      unit,
      new Rect(0, cy + valueFontSize * 0.55, pixelSize, 22)
    );
  }

  return ctx.getImage();
}

/**
 * Draw a "pie slice" arc from startFrac to endFrac (0..1, clockwise from 12 o'clock).
 * Filled, not stroked. Combine with a smaller cover circle to get a ring.
 */
function drawArc(ctx, cx, cy, radius, startFrac, endFrac, color) {
  const startAngle = -Math.PI / 2 + startFrac * 2 * Math.PI;
  const endAngle = -Math.PI / 2 + endFrac * 2 * Math.PI;
  const sweep = endAngle - startAngle;
  const steps = Math.max(24, Math.ceil(Math.abs(endFrac - startFrac) * 180));

  const path = new Path();
  path.move(new Point(cx, cy));
  for (let i = 0; i <= steps; i++) {
    const a = startAngle + sweep * (i / steps);
    path.addLine(new Point(cx + radius * Math.cos(a), cy + radius * Math.sin(a)));
  }
  path.addLine(new Point(cx, cy));

  ctx.addPath(path);
  ctx.setFillColor(color);
  ctx.fillPath();
}

function drawCircle(ctx, cx, cy, radius, color) {
  const path = new Path();
  path.addEllipse(new Rect(cx - radius, cy - radius, radius * 2, radius * 2));
  ctx.addPath(path);
  ctx.setFillColor(color);
  ctx.fillPath();
}

function rgbHex({ r, g, b }) {
  const h = (n) => n.toString(16).padStart(2, "0");
  return `#${h(r)}${h(g)}${h(b)}`;
}

// ─── Stat tile (ring + label) ─────────────────────────────────────────────────

function addStatTile(parent, { ring, label, color, displaySize }) {
  const tile = parent.addStack();
  tile.layoutVertically();
  tile.centerAlignContent();
  tile.spacing = 6;

  const imgRow = tile.addStack();
  imgRow.addSpacer();
  const img = imgRow.addImage(ring);
  img.imageSize = new Size(displaySize, displaySize);
  img.resizable = true;
  imgRow.addSpacer();

  const labelRow = tile.addStack();
  labelRow.addSpacer();
  const labelText = labelRow.addText(label);
  labelText.font = Font.semiboldSystemFont(10);
  labelText.textColor = color;
  labelText.textOpacity = 0.85;
  labelRow.addSpacer();
}

// ─── Medium widget ────────────────────────────────────────────────────────────

function buildMediumWidget(data) {
  const widget = new ListWidget();
  widget.backgroundColor = COLORS.bg;
  widget.setPadding(14, 16, 14, 16);
  widget.url = OPEN_URL_ON_TAP
    || `scriptable:///run/${encodeURIComponent(Script.name())}?refresh=1`;

  // ── Header ────────────────────────────────────────────────────────────────
  const header = widget.addStack();
  header.centerAlignContent();

  const title = header.addText("DASHKI");
  title.font = Font.boldSystemFont(11);
  title.textColor = COLORS.textPrimary;
  title.textOpacity = 0.55;

  header.addSpacer();

  const date = header.addText(formatDate(data.fetchedAt));
  date.font = Font.semiboldSystemFont(10);
  date.textColor = COLORS.textDim;

  widget.addSpacer();

  // ── Three rings ───────────────────────────────────────────────────────────
  const RING_SIZE = 92;
  const row = widget.addStack();
  row.centerAlignContent();
  row.spacing = 0;

  row.addSpacer();
  addStatTile(row, {
    ring: drawRing({
      value: data.calories,
      goal: data.goals.calories,
      color: COLORS.amber,
      unit: "kcal",
    }),
    label: "CALORIES",
    color: COLORS.amber,
    displaySize: RING_SIZE,
  });
  row.addSpacer();
  addStatTile(row, {
    ring: drawRing({
      value: data.protein,
      goal: data.goals.protein,
      color: COLORS.emerald,
      unit: "g",
    }),
    label: "PROTEIN",
    color: COLORS.emerald,
    displaySize: RING_SIZE,
  });
  row.addSpacer();
  addStatTile(row, {
    ring: drawRing({
      value: data.steps,
      goal: data.goals.steps,
      color: COLORS.sky,
      unit: "steps",
    }),
    label: "STEPS",
    color: COLORS.sky,
    displaySize: RING_SIZE,
  });
  row.addSpacer();

  widget.addSpacer();

  // ── Footer error indicator ────────────────────────────────────────────────
  if (data.anyFetchFailed) {
    const err = widget.addText("Some data unavailable — tap to retry");
    err.font = Font.systemFont(9);
    err.textColor = COLORS.textDim;
    err.centerAlignText();
  }

  return widget;
}

// ─── Small widget — single hero ring (calories) + protein/steps below ────────

function buildSmallWidget(data) {
  const widget = new ListWidget();
  widget.backgroundColor = COLORS.bg;
  widget.setPadding(12, 12, 12, 12);
  widget.url = OPEN_URL_ON_TAP
    || `scriptable:///run/${encodeURIComponent(Script.name())}?refresh=1`;

  // Header
  const header = widget.addStack();
  header.centerAlignContent();
  const title = header.addText("DASHKI");
  title.font = Font.boldSystemFont(10);
  title.textColor = COLORS.textPrimary;
  title.textOpacity = 0.55;
  header.addSpacer();
  const date = header.addText(formatDate(data.fetchedAt));
  date.font = Font.semiboldSystemFont(8);
  date.textColor = COLORS.textDim;

  widget.addSpacer(6);

  // Body — two-column layout: hero calories ring on left, protein+steps mini rings on right
  const body = widget.addStack();
  body.centerAlignContent();
  body.spacing = 8;

  // Hero: calories ring (left)
  const heroImg = body.addImage(drawRing({
    value: data.calories,
    goal: data.goals.calories,
    color: COLORS.amber,
    unit: "kcal",
    pixelSize: 200,
    stroke: 22,
  }));
  heroImg.imageSize = new Size(80, 80);
  heroImg.resizable = true;

  // Right column: small protein + steps rings stacked
  const right = body.addStack();
  right.layoutVertically();
  right.spacing = 4;

  const proteinImg = right.addImage(drawRing({
    value: data.protein,
    goal: data.goals.protein,
    color: COLORS.emerald,
    unit: "g",
    pixelSize: 160,
    stroke: 18,
  }));
  proteinImg.imageSize = new Size(48, 48);
  proteinImg.resizable = true;

  const stepsImg = right.addImage(drawRing({
    value: data.steps,
    goal: data.goals.steps,
    color: COLORS.sky,
    pixelSize: 160,
    stroke: 18,
  }));
  stepsImg.imageSize = new Size(48, 48);
  stepsImg.resizable = true;

  return widget;
}

// ─── Entry point ──────────────────────────────────────────────────────────────

async function main() {
  const data = await loadDashboard();
  const family = config.widgetFamily;

  let widget;
  if (family === "small") {
    widget = buildSmallWidget(data);
  } else {
    widget = buildMediumWidget(data);
  }

  widget.refreshAfterDate = new Date(Date.now() + REFRESH_HINT_SECONDS * 1000);

  const launchedForRefresh = args.queryParameters
    && args.queryParameters.refresh === "1";

  if (config.runsInWidget) {
    Script.setWidget(widget);
  } else if (launchedForRefresh) {
    Script.setWidget(widget);
  } else {
    await widget.presentMedium();
  }
  Script.complete();
}

await main();
