// ─────────────────────────────────────────────────────────────────────────────
// Dashki Widget — iOS Scriptable
// ─────────────────────────────────────────────────────────────────────────────
//
// Two-card health widget mirroring the Dashki web app's "Today's Journal"
// dashboard card:
//
//   LEFT CARD       RIGHT CARD
//   ───────────────  ───────────
//   ⚪ Calories  ━━  ⚪ Steps
//      Protein   ━━
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

// ─── Theme (matches Dashki web Today's Journal card) ─────────────────────────

const COLORS = {
  bg: new Color("#0b0b0b"),
  bgRgb: { r: 0x0b, g: 0x0b, b: 0x0b }, // for ring inner-cover
  card: new Color("#ffffff", 0.04),     // GlassCard surface
  cardBorder: new Color("#ffffff", 0.08),
  textPrimary: new Color("#ffffff"),
  textMuted: new Color("#ffffff", 0.55),
  textDim: new Color("#ffffff", 0.32),
  ringTrack: new Color("#ffffff", 0.10),
  // Match the gradients used in web/src/app/page.tsx Today's Journal:
  //   calories ring/bar: indigo  (#6366f1 → blue #3b82f6)
  //   protein bar:       emerald (#10b981 → teal #2dd4bf)
  //   steps:             sky     (matches calendar widget)
  calories: new Color("#6366f1"),
  protein: new Color("#10b981"),
  steps: new Color("#38bdf8"),
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

function rgbHex({ r, g, b }) {
  const h = (n) => n.toString(16).padStart(2, "0");
  return `#${h(r)}${h(g)}${h(b)}`;
}

// ─── Drawing primitives ──────────────────────────────────────────────────────

/**
 * Draw a "pie slice" arc filled (not stroked). Combine with a smaller cover
 * circle to get a hollow ring.
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

/**
 * Hollow progress ring with optional center text.
 * Matches the web ProgressRing component aesthetic.
 */
function drawRing({
  value,
  goal,
  color,
  centerValue,        // text shown big in center, e.g. "655"
  centerCaption,      // smaller text under it, e.g. "kcal"
  pixelSize = 220,
  stroke = 18,
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
  const bgCover = new Color(rgbHex(COLORS.bgRgb), 1);

  // Track ring
  drawArc(ctx, cx, cy, outerR, 0, 1, COLORS.ringTrack);
  drawCircle(ctx, cx, cy, innerR, bgCover);

  // Filled arc
  if (fraction > 0) {
    drawArc(ctx, cx, cy, outerR, 0, fraction, color);
    drawCircle(ctx, cx, cy, innerR, bgCover);

    // Rounded cap at start (12 o'clock)
    const capR = stroke / 2;
    const ringMidR = (outerR + innerR) / 2;
    drawCircle(ctx, cx, cy - ringMidR, capR, color);

    // Rounded cap at end of fill (omit when fully complete to avoid overlap)
    if (fraction < 1) {
      const angle = -Math.PI / 2 + fraction * 2 * Math.PI;
      drawCircle(
        ctx,
        cx + ringMidR * Math.cos(angle),
        cy + ringMidR * Math.sin(angle),
        capR,
        color
      );
    }
  }

  // Center text
  if (centerValue) {
    // Auto-shrink if the value is many digits
    const len = String(centerValue).length;
    const valueFontSize = len >= 6 ? 32 : len >= 5 ? 38 : len >= 4 ? 46 : 54;

    ctx.setFont(Font.boldSystemFont(valueFontSize));
    ctx.setTextColor(COLORS.textPrimary);
    ctx.setTextAlignedCenter();
    ctx.drawTextInRect(
      String(centerValue),
      new Rect(0, cy - valueFontSize * 0.62, pixelSize, valueFontSize * 1.2)
    );

    if (centerCaption) {
      ctx.setFont(Font.semiboldSystemFont(15));
      ctx.setTextColor(COLORS.textMuted);
      ctx.setTextAlignedCenter();
      ctx.drawTextInRect(
        centerCaption,
        new Rect(0, cy + valueFontSize * 0.38, pixelSize, 22)
      );
    }
  }

  return ctx.getImage();
}

/**
 * Horizontal rounded progress bar.
 * width / height in pixels (internal — image is then displayed smaller).
 */
function drawProgressBar({ value, goal, color, width = 320, height = 10 }) {
  const ctx = new DrawContext();
  ctx.size = new Size(width, height);
  ctx.opaque = false;
  ctx.respectScreenScale = true;

  // Track
  const trackPath = new Path();
  trackPath.addRoundedRect(new Rect(0, 0, width, height), height / 2, height / 2);
  ctx.addPath(trackPath);
  ctx.setFillColor(COLORS.ringTrack);
  ctx.fillPath();

  // Fill
  const fraction = pct(value, goal);
  if (fraction > 0) {
    const fillW = Math.max(height, Math.round(width * fraction));
    const fillPath = new Path();
    fillPath.addRoundedRect(new Rect(0, 0, fillW, height), height / 2, height / 2);
    ctx.addPath(fillPath);
    ctx.setFillColor(color);
    ctx.fillPath();
  }

  return ctx.getImage();
}

// ─── Card primitive (Glass styling) ──────────────────────────────────────────

function makeCard(parent) {
  const card = parent.addStack();
  card.backgroundColor = COLORS.card;
  card.cornerRadius = 14;
  card.borderColor = COLORS.cardBorder;
  card.borderWidth = 1;
  card.setPadding(10, 12, 10, 12);
  return card;
}

// ─── Left card: Calories ring + Calorie/Protein bars ─────────────────────────

function buildJournalCard(parent, data) {
  const card = makeCard(parent);
  card.layoutHorizontally();
  card.centerAlignContent();
  card.spacing = 10;

  // Calorie ring on the left (matches web ProgressRing 68px / stroke 6)
  const ringImg = card.addImage(drawRing({
    value: data.calories,
    goal: data.goals.calories,
    color: COLORS.calories,
    centerValue: data.calories != null ? String(data.calories) : "—",
    centerCaption: "kcal",
    pixelSize: 220,
    stroke: 18,
  }));
  ringImg.imageSize = new Size(64, 64);
  ringImg.resizable = true;

  // Right side: stacked Calories + Protein bars
  const stats = card.addStack();
  stats.layoutVertically();
  stats.spacing = 8;
  stats.size = new Size(0, 64); // align column to ring height

  // ── Calories row ────────────────────────────────────────────────────────
  addBarRow(stats, {
    label: "Calories",
    value: data.calories,
    goal: data.goals.calories,
    unit: "",
    color: COLORS.calories,
  });

  // ── Protein row ────────────────────────────────────────────────────────
  addBarRow(stats, {
    label: "Protein",
    value: data.protein,
    goal: data.goals.protein,
    unit: "g",
    color: COLORS.protein,
  });
}

function addBarRow(parent, { label, value, goal, unit, color }) {
  const row = parent.addStack();
  row.layoutVertically();
  row.spacing = 2;

  // "Calories      655 / 2000"
  const top = row.addStack();
  top.bottomAlignContent();

  const labelText = top.addText(label);
  labelText.font = Font.systemFont(11);
  labelText.textColor = COLORS.textMuted;

  top.addSpacer();

  const valueRow = top.addStack();
  valueRow.bottomAlignContent();
  valueRow.spacing = 2;

  const valueText = valueRow.addText(value == null ? "—" : formatNumber(value));
  valueText.font = Font.boldSystemFont(11);
  valueText.textColor = COLORS.textPrimary;

  if (unit) {
    const unitText = valueRow.addText(unit);
    unitText.font = Font.boldSystemFont(11);
    unitText.textColor = COLORS.textPrimary;
  }

  if (goal != null) {
    const goalText = valueRow.addText(` / ${formatNumber(goal)}${unit}`);
    goalText.font = Font.systemFont(11);
    goalText.textColor = COLORS.textDim;
  }

  // Bar
  const barImg = row.addImage(drawProgressBar({
    value, goal, color,
    width: 320, height: 7,
  }));
  barImg.imageSize = new Size(160, 4);
  barImg.resizable = true;
}

// ─── Right card: Steps ring ──────────────────────────────────────────────────

function buildStepsCard(parent, data) {
  const card = makeCard(parent);
  card.layoutVertically();
  card.centerAlignContent();
  card.spacing = 4;

  // STEPS label at top
  const labelRow = card.addStack();
  labelRow.addSpacer();
  const label = labelRow.addText("STEPS");
  label.font = Font.semiboldSystemFont(9);
  label.textColor = COLORS.textDim;
  labelRow.addSpacer();

  card.addSpacer(2);

  // Big steps ring with value inside
  const ringRow = card.addStack();
  ringRow.addSpacer();
  const ringImg = ringRow.addImage(drawRing({
    value: data.steps,
    goal: data.goals.steps,
    color: COLORS.steps,
    centerValue: data.steps != null ? formatNumber(data.steps) : "—",
    centerCaption: `/ ${formatNumber(data.goals.steps)}`,
    pixelSize: 240,
    stroke: 20,
  }));
  ringImg.imageSize = new Size(86, 86);
  ringImg.resizable = true;
  ringRow.addSpacer();
}

// ─── Medium widget ───────────────────────────────────────────────────────────

function buildMediumWidget(data) {
  const widget = new ListWidget();
  widget.backgroundColor = COLORS.bg;
  widget.setPadding(12, 12, 12, 12);
  widget.url = OPEN_URL_ON_TAP
    || `scriptable:///run/${encodeURIComponent(Script.name())}?refresh=1`;

  // Header
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

  widget.addSpacer(8);

  // Body — two cards side by side
  const body = widget.addStack();
  body.spacing = 8;
  body.layoutHorizontally();
  body.centerAlignContent();

  // Left card takes ~60% — wider for the ring + 2 bars
  buildJournalCard(body, data);
  // Right card takes the rest — steps
  buildStepsCard(body, data);

  if (data.anyFetchFailed) {
    widget.addSpacer(4);
    const err = widget.addText("Some data unavailable — tap to retry");
    err.font = Font.systemFont(8);
    err.textColor = COLORS.textDim;
    err.centerAlignText();
  }

  return widget;
}

// ─── Small widget — single hero calories ring + protein/steps mini ──────────

function buildSmallWidget(data) {
  const widget = new ListWidget();
  widget.backgroundColor = COLORS.bg;
  widget.setPadding(12, 12, 12, 12);
  widget.url = OPEN_URL_ON_TAP
    || `scriptable:///run/${encodeURIComponent(Script.name())}?refresh=1`;

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

  const body = widget.addStack();
  body.centerAlignContent();
  body.spacing = 6;

  // Hero calories ring on the left
  const heroImg = body.addImage(drawRing({
    value: data.calories,
    goal: data.goals.calories,
    color: COLORS.calories,
    centerValue: data.calories != null ? String(data.calories) : "—",
    centerCaption: "kcal",
    pixelSize: 220,
    stroke: 22,
  }));
  heroImg.imageSize = new Size(86, 86);
  heroImg.resizable = true;

  // Protein + Steps stacked on the right
  const right = body.addStack();
  right.layoutVertically();
  right.spacing = 4;

  const proteinImg = right.addImage(drawRing({
    value: data.protein,
    goal: data.goals.protein,
    color: COLORS.protein,
    centerValue: data.protein != null ? String(data.protein) : "—",
    centerCaption: "g",
    pixelSize: 160,
    stroke: 18,
  }));
  proteinImg.imageSize = new Size(44, 44);
  proteinImg.resizable = true;

  const stepsImg = right.addImage(drawRing({
    value: data.steps,
    goal: data.goals.steps,
    color: COLORS.steps,
    centerValue: data.steps != null ? formatNumber(data.steps) : "—",
    pixelSize: 160,
    stroke: 18,
  }));
  stepsImg.imageSize = new Size(44, 44);
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
