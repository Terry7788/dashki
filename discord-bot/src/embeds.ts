import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
} from 'discord.js';
import type { Session, ItemState } from './types';

// CustomId format: <sessionId>:<action>[:<itemIndex>]
//   <sid>:qa:<i>  — quick-add for item i
//   <sid>:sd:<i>  — save-to-db + log for item i
//   <sid>:cx      — cancel (whole session)
//   <sid>:la      — log all (final batch confirm)
export const CID = {
  quickAdd: (sid: string, i: number) => `${sid}:qa:${i}`,
  saveAndLog: (sid: string, i: number) => `${sid}:sd:${i}`,
  cancel: (sid: string) => `${sid}:cx`,
  logAll: (sid: string) => `${sid}:la`,
};

export function parseCustomId(customId: string): {
  sessionId: string;
  action: 'qa' | 'sd' | 'cx' | 'la';
  itemIndex: number | null;
} | null {
  const parts = customId.split(':');
  if (parts.length < 2 || parts.length > 3) return null;
  const [sessionId, action, idxStr] = parts;
  if (!['qa', 'sd', 'cx', 'la'].includes(action)) return null;
  const itemIndex = idxStr !== undefined ? Number(idxStr) : null;
  if (idxStr !== undefined && (!Number.isInteger(itemIndex) || (itemIndex as number) < 0)) {
    return null;
  }
  return { sessionId, action: action as 'qa' | 'sd' | 'cx' | 'la', itemIndex };
}

function fmtQty(q: number): string {
  return Number.isInteger(q) ? String(q) : q.toFixed(1);
}

export function buildPerItemMessage(session: Session, itemIndex: number) {
  const item = session.items[itemIndex];
  if (!item.estimate) {
    throw new Error('buildPerItemMessage called for an item without an estimate');
  }
  const e = item.estimate;

  const embed = new EmbedBuilder()
    .setTitle(`Item ${itemIndex + 1} of ${session.items.length}: ${item.parsed.name}`)
    .setDescription(
      `Not in your food database. Estimated nutrition for **${fmtQty(item.parsed.quantity)}${item.parsed.unit === 'serving' ? ' serving' : item.parsed.unit}**:`
    )
    .addFields(
      { name: 'Calories', value: `${e.calories} kcal`, inline: true },
      { name: 'Protein', value: `${e.protein.toFixed(1)} g`, inline: true },
      { name: 'Carbs', value: `${e.carbs.toFixed(1)} g`, inline: true },
      { name: 'Fat', value: `${e.fat.toFixed(1)} g`, inline: true }
    )
    .setFooter({
      text: 'Carbs/fat are shown for context but only kcal + protein are stored per journal entry.',
    })
    .setColor(0xfacc15);

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(CID.quickAdd(session.id, itemIndex))
      .setLabel('Confirm (quick-add)')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(CID.saveAndLog(session.id, itemIndex))
      .setLabel('Confirm + Save to DB')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(CID.cancel(session.id))
      .setLabel('Cancel')
      .setStyle(ButtonStyle.Secondary)
  );

  return { embeds: [embed], components: [row] };
}

export function buildBatchMessage(session: Session) {
  const lines: string[] = [];
  let totalKcal = 0;
  let totalProtein = 0;

  for (let i = 0; i < session.items.length; i++) {
    const item = session.items[i];
    const summary = itemSummary(item);
    lines.push(`${i + 1}. ${summary.line}`);
    totalKcal += summary.kcal;
    totalProtein += summary.protein;
  }

  const embed = new EmbedBuilder()
    .setTitle(`Ready to log — ${session.mealType}`)
    .setDescription(lines.join('\n'))
    .addFields(
      { name: 'Total calories', value: `${Math.round(totalKcal)} kcal`, inline: true },
      { name: 'Total protein', value: `${totalProtein.toFixed(1)} g`, inline: true },
      { name: 'Date', value: session.date, inline: true }
    )
    .setColor(0x10b981);

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(CID.logAll(session.id))
      .setLabel('Log all to today')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(CID.cancel(session.id))
      .setLabel('Cancel')
      .setStyle(ButtonStyle.Secondary)
  );

  return { embeds: [embed], components: [row] };
}

interface ItemSummary {
  line: string;
  kcal: number;
  protein: number;
}

function itemSummary(item: ItemState): ItemSummary {
  const qtyStr = `${fmtQty(item.parsed.quantity)}${item.parsed.unit === 'serving' ? ' serving' : item.parsed.unit}`;

  if (item.matched) {
    // For matched items, we don't have the computed kcal/P client-side here.
    // Show the food name + qty and leave the per-row macro display blank —
    // the server will compute snapshots when we POST. To keep totals on the
    // batch embed honest, use the food's base macros scaled by quantity.
    const { kcal, protein } = scaleMatchedItem(item);
    return {
      line: `**${item.matched.name}** — ${qtyStr} · ~${Math.round(kcal)} kcal · ${protein.toFixed(1)}g P · _from DB_`,
      kcal,
      protein,
    };
  }

  if (item.decision === 'save-and-log' && item.estimate) {
    const e = item.estimate;
    return {
      line: `**${item.parsed.name}** — ${qtyStr} · ${e.calories} kcal · ${e.protein.toFixed(1)}g P · _new DB entry_`,
      kcal: e.calories,
      protein: e.protein,
    };
  }

  if (item.decision === 'quick-add' && item.estimate) {
    const e = item.estimate;
    return {
      line: `**${item.parsed.name}** — ${qtyStr} · ${e.calories} kcal · ${e.protein.toFixed(1)}g P · _quick-add_`,
      kcal: e.calories,
      protein: e.protein,
    };
  }

  // Shouldn't happen — defensive.
  return {
    line: `**${item.parsed.name}** — ${qtyStr} · _pending_`,
    kcal: 0,
    protein: 0,
  };
}

// Cheap client-side estimate for matched items so the batch totals make sense
// before we hit the server. Server is the source of truth on POST.
function scaleMatchedItem(item: ItemState): { kcal: number; protein: number } {
  const food = item.matched!;
  const qty = item.parsed.quantity;
  const unit = item.parsed.unit;

  // Same convention as server/src/nutrition.ts: ratio = how many "base_amount
  // of base_unit" the user ate. Approximation here — the server recomputes
  // exactly when we POST.
  let ratio = 0;
  if (unit === food.base_unit) {
    ratio = qty / food.base_amount;
  } else if (unit === 'g' && food.base_unit === 'serving' && food.serving_size_g) {
    ratio = qty / food.serving_size_g;
  } else if (unit === 'serving' && food.base_unit === 'g') {
    const serving = food.serving_size_g ?? food.base_amount;
    ratio = (qty * serving) / food.base_amount;
  } else {
    ratio = qty / food.base_amount;
  }

  return {
    kcal: (food.calories ?? 0) * ratio,
    protein: (food.protein ?? 0) * ratio,
  };
}

// Used when a decision lands or session is cancelled — strips the buttons off
// the message so the user can't click stale ones.
export function disabledFrom(components: ActionRowBuilder<ButtonBuilder>[]) {
  return components.map((row) => {
    const clone = new ActionRowBuilder<ButtonBuilder>();
    for (const c of row.components) {
      clone.addComponents(ButtonBuilder.from(c).setDisabled(true));
    }
    return clone;
  });
}
