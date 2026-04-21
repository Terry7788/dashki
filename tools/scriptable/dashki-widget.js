// ─────────────────────────────────────────────────────────────────────────────
// Dashki Widget — iOS Scriptable
// ─────────────────────────────────────────────────────────────────────────────
//
// Five layouts in one script — Scriptable picks the right one based on which
// widget size you choose:
//
//   HOME SCREEN
//     - small    : hero calorie ring + mini protein/steps rings stacked
//     - medium   : two-card layout (calories+protein bars / steps ring)
//
//   LOCK SCREEN  (iOS 16+, requires the "Lock Screen" widget gallery)
//     - accessoryCircular     : single calorie ring with the value inside
//     - accessoryRectangular  : 3 compact lines for cal/protein/steps
//     - accessoryInline       : one tiny line near the time, e.g.
//                               "🔥 655/2000 · 🚶 5,267"
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
// SETUP — HOME SCREEN
//   1. Install "Scriptable" from the App Store.
//   2. In Scriptable, tap "+" to create a new script.
//   3. Paste this entire file in. Save.
//   4. Rename the script to "Dashki" (top of the screen).
//   5. Long-press an empty home-screen spot → "+" → search for Scriptable.
//      Pick small or medium and add it.
//   6. Long-press the new widget → Edit Widget → choose script "Dashki".
//
// SETUP — LOCK SCREEN (iOS 16+)
//   1. Long-press the lock screen → tap "Customize" → tap "Lock Screen".
//   2. Tap one of the widget slots (above the clock = inline; below = circular
//      or rectangular).
//   3. Find "Scriptable" in the gallery. Pick the size you want.
//   4. Tap the placed widget → choose script "Dashki".
//   5. Done. Lock the screen to see it live.
//
//   iOS lock-screen widgets are tinted automatically — colours are mostly
//   ignored and everything is rendered in monochrome that matches the
//   wallpaper / Lock Screen style. The widget uses opacity/coverage rather
//   than colour for visual hierarchy in those modes.
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
  //   over-goal:         red     (when calories exceed goal)
  calories: new Color("#6366f1"),
  protein: new Color("#10b981"),
  steps: new Color("#38bdf8"),
  over: new Color("#ef4444"),
  overSoft: new Color("#f87171"),
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
 * Draw a true hollow donut wedge (no inner cover — works on transparent
 * backgrounds). Path: outer arc forwards + inner arc backwards, closed.
 * Used by the lock-screen accessory widgets where there's no solid
 * background colour to paint over.
 */
function drawDonutWedge(ctx, cx, cy, outerR, innerR, startFrac, endFrac, color) {
  const startAngle = -Math.PI / 2 + startFrac * 2 * Math.PI;
  const endAngle = -Math.PI / 2 + endFrac * 2 * Math.PI;
  const sweep = endAngle - startAngle;
  if (Math.abs(sweep) < 1e-6) return;
  const steps = Math.max(20, Math.ceil(Math.abs(sweep) * 90));

  const path = new Path();
  // Outer arc, start → end
  for (let i = 0; i <= steps; i++) {
    const a = startAngle + sweep * (i / steps);
    const p = new Point(cx + outerR * Math.cos(a), cy + outerR * Math.sin(a));
    if (i === 0) path.move(p);
    else path.addLine(p);
  }
  // Inner arc, end → start
  for (let i = steps; i >= 0; i--) {
    const a = startAngle + sweep * (i / steps);
    const p = new Point(cx + innerR * Math.cos(a), cy + innerR * Math.sin(a));
    path.addLine(p);
  }
  // Close back to first point
  const a0 = startAngle;
  path.addLine(new Point(cx + outerR * Math.cos(a0), cy + outerR * Math.sin(a0)));

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
  card.setPadding(8, 10, 8, 10);
  return card;
}

// ─── Left card: Calories ring + Calorie/Protein bars ─────────────────────────

const LEFT_CARD_WIDTH = 195;
const LEFT_CARD_HEIGHT = 96;
const RING_SIZE_LEFT = 60;
const BAR_DISPLAY_WIDTH = 102;

function buildJournalCard(parent, data) {
  const card = makeCard(parent);
  card.layoutHorizontally();
  card.centerAlignContent();
  card.spacing = 10;
  card.size = new Size(LEFT_CARD_WIDTH, LEFT_CARD_HEIGHT);

  // When calories exceed the goal, swap the calorie accent from indigo to red.
  const caloriesOver =
    data.calories != null && data.calories > data.goals.calories;
  const caloriesColor = caloriesOver ? COLORS.over : COLORS.calories;

  // Calorie ring on the left
  const ringImg = card.addImage(drawRing({
    value: data.calories,
    goal: data.goals.calories,
    color: caloriesColor,
    centerValue: data.calories != null ? String(data.calories) : "—",
    centerCaption: "kcal",
    pixelSize: 240,
    stroke: 22,
  }));
  ringImg.imageSize = new Size(RING_SIZE_LEFT, RING_SIZE_LEFT);
  ringImg.resizable = true;

  // Right side: stacked Calories + Protein bars
  const stats = card.addStack();
  stats.layoutVertically();
  stats.spacing = 8;

  addBarRow(stats, {
    label: "Calories",
    value: data.calories,
    goal: data.goals.calories,
    unit: "",
    color: caloriesColor,
    symbolName: "flame.fill",
    overIndicator: caloriesOver
      ? `+${formatNumber(data.calories - data.goals.calories)} over`
      : null,
  });

  addBarRow(stats, {
    label: "Protein",
    value: data.protein,
    goal: data.goals.protein,
    unit: "g",
    color: COLORS.protein,
    symbolName: "leaf.fill",
  });
}

function addBarRow(parent, { label, value, goal, unit, color, symbolName, overIndicator }) {
  const row = parent.addStack();
  row.layoutVertically();
  row.spacing = 3;

  // Header row: [icon] Label                  X / Y  (+N over)
  const top = row.addStack();
  top.centerAlignContent();
  top.size = new Size(BAR_DISPLAY_WIDTH, 0);
  top.spacing = 4;

  // Color-tinted icon
  if (symbolName) {
    const icon = SFSymbol.named(symbolName);
    if (icon) {
      const iconImg = top.addImage(icon.image);
      iconImg.imageSize = new Size(9, 9);
      iconImg.tintColor = color;
    }
  }

  const labelText = top.addText(label);
  labelText.font = Font.semiboldSystemFont(10);
  labelText.textColor = COLORS.textPrimary;
  labelText.textOpacity = 0.85;
  labelText.lineLimit = 1;
  labelText.minimumScaleFactor = 0.7;

  top.addSpacer();

  // If there's an over-indicator, show only it on the top row so the alert
  // isn't hidden beside a long "X / Y" string. Otherwise show the standard
  // "X / Y" goal comparison.
  if (overIndicator) {
    const overText = top.addText(overIndicator);
    overText.font = Font.semiboldSystemFont(9);
    overText.textColor = COLORS.overSoft;
    overText.lineLimit = 1;
    overText.minimumScaleFactor = 0.6;
  } else {
    const valueText = top.addText(
      value == null
        ? "—"
        : `${formatNumber(value)}${unit}${goal != null ? ` / ${formatNumber(goal)}${unit}` : ""}`
    );
    valueText.font = Font.systemFont(9);
    valueText.textColor = COLORS.textDim;
    valueText.lineLimit = 1;
    valueText.minimumScaleFactor = 0.6;
  }

  // Bar — always fills to the actual progress (capped at 100% visually via
  // drawProgressBar) and uses the passed-in `color`, so red-when-over is
  // controlled by the caller.
  const barImg = row.addImage(drawProgressBar({
    value, goal, color,
    width: 320, height: 10,
  }));
  barImg.imageSize = new Size(BAR_DISPLAY_WIDTH, 5);
  barImg.resizable = true;
}

// ─── Right card: Steps ring ──────────────────────────────────────────────────

const RIGHT_CARD_WIDTH = 110;
const RIGHT_CARD_HEIGHT = LEFT_CARD_HEIGHT; // match for visual balance
const STEPS_RING_SIZE = 62;

function buildStepsCard(parent, data) {
  const card = makeCard(parent);
  card.layoutVertically();
  card.centerAlignContent();
  card.spacing = 4;
  card.size = new Size(RIGHT_CARD_WIDTH, RIGHT_CARD_HEIGHT);

  // STEPS header row: [icon] STEPS
  const labelRow = card.addStack();
  labelRow.centerAlignContent();
  labelRow.spacing = 4;
  labelRow.addSpacer();

  const stepsIcon = SFSymbol.named("figure.walk");
  if (stepsIcon) {
    const iconImg = labelRow.addImage(stepsIcon.image);
    iconImg.imageSize = new Size(10, 10);
    iconImg.tintColor = COLORS.steps;
  }

  const label = labelRow.addText("STEPS");
  label.font = Font.semiboldSystemFont(10);
  label.textColor = COLORS.steps;
  label.textOpacity = 0.95;

  labelRow.addSpacer();

  // Big steps ring with value inside (no caption — value alone is the focus)
  const ringRow = card.addStack();
  ringRow.addSpacer();
  const ringImg = ringRow.addImage(drawRing({
    value: data.steps,
    goal: data.goals.steps,
    color: COLORS.steps,
    centerValue: data.steps != null ? formatNumber(data.steps) : "—",
    pixelSize: 240,
    stroke: 22,
  }));
  ringImg.imageSize = new Size(STEPS_RING_SIZE, STEPS_RING_SIZE);
  ringImg.resizable = true;
  ringRow.addSpacer();

  // Footer: "X% of 10,000"
  const footerRow = card.addStack();
  footerRow.centerAlignContent();
  footerRow.addSpacer();

  const percent = data.steps != null && data.goals.steps
    ? Math.round((data.steps / data.goals.steps) * 100)
    : null;
  const goalStr = formatNumber(data.goals.steps);
  const footerText = footerRow.addText(
    percent != null ? `${percent}% of ${goalStr}` : `of ${goalStr}`
  );
  footerText.font = Font.semiboldSystemFont(8);
  footerText.textColor = COLORS.textDim;
  footerText.lineLimit = 1;
  footerText.minimumScaleFactor = 0.7;

  footerRow.addSpacer();
}

// ─── Medium widget ───────────────────────────────────────────────────────────

function buildMediumWidget(data) {
  const widget = new ListWidget();
  widget.backgroundColor = COLORS.bg;
  widget.setPadding(10, 10, 10, 10);
  widget.url = OPEN_URL_ON_TAP
    || `scriptable:///run/${encodeURIComponent(Script.name())}?refresh=1`;

  // Header — small accent dot + "DASHKI"
  const header = widget.addStack();
  header.centerAlignContent();
  header.spacing = 5;

  const dot = header.addText("●");
  dot.font = Font.systemFont(8);
  dot.textColor = COLORS.calories;

  const title = header.addText("DASHKI");
  title.font = Font.boldSystemFont(10);
  title.textColor = COLORS.textPrimary;
  title.textOpacity = 0.6;
  title.lineLimit = 1;

  widget.addSpacer(8);

  // Body — two cards side by side. The flexible spacer between them absorbs
  // any width difference between phone models (medium widget is wider on
  // Plus/Pro Max than on standard iPhones), so the cards always sit at the
  // outer edges and the gap grows or shrinks to fit.
  const body = widget.addStack();
  body.layoutHorizontally();
  body.centerAlignContent();

  buildJournalCard(body, data);
  body.addSpacer();
  buildStepsCard(body, data);

  if (data.anyFetchFailed) {
    widget.addSpacer(2);
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
  header.spacing = 4;
  const dot = header.addText("●");
  dot.font = Font.systemFont(7);
  dot.textColor = COLORS.calories;
  const title = header.addText("DASHKI");
  title.font = Font.boldSystemFont(10);
  title.textColor = COLORS.textPrimary;
  title.textOpacity = 0.6;
  title.lineLimit = 1;

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

// ─── Lock-screen accessory widgets (iOS 16+) ─────────────────────────────────
//
// Lock-screen widgets are tinted by iOS to match the lock-screen style,
// so colour is mostly cosmetic — opacity and coverage are what render
// distinctly. All three sizes use the standard accessory backdrop so
// they look native against any wallpaper.

function applyAccessoryBackground(widget) {
  // addAccessoryWidgetBackground was added in Scriptable 1.7. Guard for
  // older versions.
  if ('addAccessoryWidgetBackground' in widget) {
    widget.addAccessoryWidgetBackground = true;
  }
}

function applyTapToRefresh(widget) {
  widget.url = OPEN_URL_ON_TAP
    || `scriptable:///run/${encodeURIComponent(Script.name())}?refresh=1`;
}

/**
 * accessoryCircular — tiny circular widget below the clock.
 * Shows the calorie ring with the value inside.
 */
function buildAccessoryCircular(data) {
  const widget = new ListWidget();
  applyAccessoryBackground(widget);
  applyTapToRefresh(widget);
  widget.setPadding(2, 2, 2, 2);

  // Outer container that vertically centres the ring
  const stack = widget.addStack();
  stack.layoutVertically();
  stack.centerAlignContent();

  // The ring image, with the calorie value drawn into the centre via
  // overlay text inside a relative positioning trick: Scriptable doesn't
  // support absolute positioning, so we draw the value INTO the ring image.
  const ring = drawAccessoryCircularRing(data);
  const img = stack.addImage(ring);
  img.imageSize = new Size(58, 58);
  img.resizable = true;
  img.centerAlignImage();

  return widget;
}

function drawAccessoryCircularRing(data) {
  const pixelSize = 220;
  const stroke = 26;
  const ctx = new DrawContext();
  ctx.size = new Size(pixelSize, pixelSize);
  ctx.opaque = false;
  ctx.respectScreenScale = true;

  const cx = pixelSize / 2;
  const cy = pixelSize / 2;
  const outerR = pixelSize / 2;
  const innerR = outerR - stroke;
  const fraction = pct(data.calories, data.goals.calories);

  // Track + progress
  drawDonutWedge(ctx, cx, cy, outerR, innerR, 0, 1, new Color('#ffffff', 0.25));
  if (fraction > 0) {
    drawDonutWedge(ctx, cx, cy, outerR, innerR, 0, fraction, new Color('#ffffff', 1));
  }

  // Calorie value in the centre. If 4+ digits, use a smaller font so it fits.
  if (data.calories != null) {
    const txt = formatNumber(data.calories);
    const fontSize = txt.length >= 5 ? 50 : txt.length >= 4 ? 60 : 70;
    ctx.setFont(Font.boldSystemFont(fontSize));
    ctx.setTextColor(new Color('#ffffff', 1));
    ctx.setTextAlignedCenter();
    ctx.drawTextInRect(
      txt,
      new Rect(0, cy - fontSize * 0.6, pixelSize, fontSize * 1.2)
    );
  } else {
    ctx.setFont(Font.boldSystemFont(60));
    ctx.setTextColor(new Color('#ffffff', 0.6));
    ctx.setTextAlignedCenter();
    ctx.drawTextInRect('—', new Rect(0, cy - 40, pixelSize, 80));
  }

  return ctx.getImage();
}

/**
 * accessoryRectangular — small horizontal widget below the clock.
 * Three compact lines: calories, protein, steps. Each with an SF Symbol
 * icon and the goal in dim text.
 */
function buildAccessoryRectangular(data) {
  const widget = new ListWidget();
  applyAccessoryBackground(widget);
  applyTapToRefresh(widget);
  widget.setPadding(4, 8, 4, 8);

  addAccessoryRow(widget, {
    symbolName: 'flame.fill',
    value: data.calories,
    goal: data.goals.calories,
    suffix: '',
  });
  widget.addSpacer(2);
  addAccessoryRow(widget, {
    symbolName: 'leaf.fill',
    value: data.protein,
    goal: data.goals.protein,
    suffix: 'g',
  });
  widget.addSpacer(2);
  addAccessoryRow(widget, {
    symbolName: 'figure.walk',
    value: data.steps,
    goal: data.goals.steps,
    suffix: '',
  });

  return widget;
}

function addAccessoryRow(parent, { symbolName, value, goal, suffix }) {
  const row = parent.addStack();
  row.centerAlignContent();
  row.spacing = 5;

  const icon = SFSymbol.named(symbolName);
  if (icon) {
    const img = row.addImage(icon.image);
    img.imageSize = new Size(11, 11);
    img.tintColor = new Color('#ffffff', 1);
  }

  const valueText = row.addText(
    value == null ? '—' : `${formatNumber(value)}${suffix}`
  );
  valueText.font = Font.semiboldSystemFont(12);
  valueText.textColor = new Color('#ffffff', 1);
  valueText.lineLimit = 1;
  valueText.minimumScaleFactor = 0.7;

  if (value != null && goal != null) {
    const goalText = row.addText(`/ ${formatNumber(goal)}${suffix}`);
    goalText.font = Font.systemFont(10);
    goalText.textColor = new Color('#ffffff', 0.5);
    goalText.lineLimit = 1;
    goalText.minimumScaleFactor = 0.6;
  }
}

/**
 * accessoryInline — single tiny line of text near the clock.
 * Most-condensed view: today's calories vs goal + step count.
 */
function buildAccessoryInline(data) {
  const widget = new ListWidget();
  applyTapToRefresh(widget);

  const cal = data.calories != null
    ? `🔥 ${formatNumber(data.calories)}/${formatNumber(data.goals.calories)}`
    : '🔥 —';
  const steps = data.steps != null
    ? `🚶 ${formatNumber(data.steps)}`
    : '🚶 —';

  const text = widget.addText(`${cal} · ${steps}`);
  text.font = Font.systemFont(12);
  text.textColor = new Color('#ffffff', 1);
  text.lineLimit = 1;

  return widget;
}

// ─── Entry point ──────────────────────────────────────────────────────────────

async function main() {
  const data = await loadDashboard();
  const family = config.widgetFamily;

  let widget;
  if (family === 'accessoryCircular') {
    widget = buildAccessoryCircular(data);
  } else if (family === 'accessoryRectangular') {
    widget = buildAccessoryRectangular(data);
  } else if (family === 'accessoryInline') {
    widget = buildAccessoryInline(data);
  } else if (family === 'small') {
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
