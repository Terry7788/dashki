import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';
import type { Session, ItemState } from './types';

// CustomId format: <sessionId>:<action>[:<itemIndex>]
//   <sid>:qa:<i>   — quick-add for item i
//   <sid>:sd:<i>   — open save-to-DB modal for item i
//   <sid>:sdm:<i>  — save-modal submit for item i
//   <sid>:ed:<i>   — open edit modal for item i
//   <sid>:edm:<i>  — edit-modal submit for item i
//   <sid>:cx       — cancel (whole session)
//   <sid>:lb       — log all to breakfast
//   <sid>:ll       — log all to lunch
//   <sid>:ld       — log all to dinner
//   <sid>:ls       — log all to snack
export type ActionCode = 'qa' | 'sd' | 'sdm' | 'ed' | 'edm' | 'cx' | 'lb' | 'll' | 'ld' | 'ls';

import type { MealType } from './types';

export const LOG_ACTION_TO_MEAL: Record<'lb' | 'll' | 'ld' | 'ls', MealType> = {
  lb: 'breakfast',
  ll: 'lunch',
  ld: 'dinner',
  ls: 'snack',
};

export const CID = {
  quickAdd: (sid: string, i: number) => `${sid}:qa:${i}`,
  saveAndLog: (sid: string, i: number) => `${sid}:sd:${i}`,
  saveModal: (sid: string, i: number) => `${sid}:sdm:${i}`,
  edit: (sid: string, i: number) => `${sid}:ed:${i}`,
  editModal: (sid: string, i: number) => `${sid}:edm:${i}`,
  cancel: (sid: string) => `${sid}:cx`,
  logBreakfast: (sid: string) => `${sid}:lb`,
  logLunch: (sid: string) => `${sid}:ll`,
  logDinner: (sid: string) => `${sid}:ld`,
  logSnack: (sid: string) => `${sid}:ls`,
};

const ALL_ACTIONS: readonly ActionCode[] = ['qa', 'sd', 'sdm', 'ed', 'edm', 'cx', 'lb', 'll', 'ld', 'ls'] as const;

export function parseCustomId(customId: string): {
  sessionId: string;
  action: ActionCode;
  itemIndex: number | null;
} | null {
  const parts = customId.split(':');
  if (parts.length < 2 || parts.length > 3) return null;
  const [sessionId, action, idxStr] = parts;
  if (!ALL_ACTIONS.includes(action as ActionCode)) return null;
  const itemIndex = idxStr !== undefined ? Number(idxStr) : null;
  if (idxStr !== undefined && (!Number.isInteger(itemIndex) || (itemIndex as number) < 0)) {
    return null;
  }
  return { sessionId, action: action as ActionCode, itemIndex };
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
      .setCustomId(CID.edit(session.id, itemIndex))
      .setLabel('Edit')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(CID.cancel(session.id))
      .setLabel('Cancel')
      .setStyle(ButtonStyle.Secondary)
  );

  return { embeds: [embed], components: [row] };
}

// Modal field IDs. Used both to populate prefilled values and to read back
// submitted values on ModalSubmit.
export const MODAL_FIELDS = {
  name: 'name',
  quantity: 'quantity',
  unit: 'unit',
  servingSize: 'servingSize',
} as const;

export function buildEditModal(session: Session, itemIndex: number): ModalBuilder {
  const item = session.items[itemIndex];

  const nameInput = new TextInputBuilder()
    .setCustomId(MODAL_FIELDS.name)
    .setLabel('Food name')
    .setStyle(TextInputStyle.Short)
    .setValue(item.parsed.name)
    .setMaxLength(100)
    .setRequired(true);

  const quantityInput = new TextInputBuilder()
    .setCustomId(MODAL_FIELDS.quantity)
    .setLabel('Quantity (number)')
    .setStyle(TextInputStyle.Short)
    .setValue(fmtQty(item.parsed.quantity))
    .setMaxLength(10)
    .setRequired(true);

  const unitInput = new TextInputBuilder()
    .setCustomId(MODAL_FIELDS.unit)
    .setLabel('Unit (g / ml / serving)')
    .setStyle(TextInputStyle.Short)
    .setValue(item.parsed.unit)
    .setMaxLength(10)
    .setRequired(true);

  return new ModalBuilder()
    .setCustomId(CID.editModal(session.id, itemIndex))
    .setTitle(`Edit item ${itemIndex + 1}`)
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(nameInput),
      new ActionRowBuilder<TextInputBuilder>().addComponents(quantityInput),
      new ActionRowBuilder<TextInputBuilder>().addComponents(unitInput)
    );
}

export function buildSaveModal(session: Session, itemIndex: number): ModalBuilder {
  const item = session.items[itemIndex];
  if (!item.estimate) {
    throw new Error('buildSaveModal called for an item without an estimate');
  }

  // Label hint matches the food's native unit. ml-base foods store the
  // ml-per-serving value in the serving_size_g column too (legacy schema
  // quirk in foods.ts deriveUnits — same column, different unit meaning).
  const baseUnit = item.estimate.perBase.base_unit;
  const labelSuffix = baseUnit === 'ml' ? '(ml per serving)' : '(g per serving)';

  const prefill = item.estimate.perBase.serving_size_g != null
    ? String(item.estimate.perBase.serving_size_g)
    : '';

  const servingInput = new TextInputBuilder()
    .setCustomId(MODAL_FIELDS.servingSize)
    .setLabel(`Serving size ${labelSuffix}`)
    .setStyle(TextInputStyle.Short)
    .setValue(prefill)
    .setPlaceholder('Optional — leave blank to skip')
    .setMaxLength(10)
    .setRequired(false);

  // Truncate the food name in the title since Discord caps modal titles at 45 chars.
  const titleName = item.parsed.name.length > 25 ? item.parsed.name.slice(0, 22) + '…' : item.parsed.name;

  return new ModalBuilder()
    .setCustomId(CID.saveModal(session.id, itemIndex))
    .setTitle(`Save "${titleName}" to DB`)
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(servingInput)
    );
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
    .setTitle('Ready to log — pick a meal')
    .setDescription(lines.join('\n'))
    .addFields(
      { name: 'Total calories', value: `${Math.round(totalKcal)} kcal`, inline: true },
      { name: 'Total protein', value: `${totalProtein.toFixed(1)} g`, inline: true },
      { name: 'Date', value: session.date, inline: true }
    )
    .setColor(0x10b981);

  // Time-of-day default gets ButtonStyle.Success; the others are Secondary.
  // Click any meal-type button to commit the batch under that meal.
  const styleFor = (m: MealType) =>
    session.mealType === m ? ButtonStyle.Success : ButtonStyle.Secondary;

  const mealRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(CID.logBreakfast(session.id))
      .setLabel('Breakfast')
      .setStyle(styleFor('breakfast')),
    new ButtonBuilder()
      .setCustomId(CID.logLunch(session.id))
      .setLabel('Lunch')
      .setStyle(styleFor('lunch')),
    new ButtonBuilder()
      .setCustomId(CID.logDinner(session.id))
      .setLabel('Dinner')
      .setStyle(styleFor('dinner')),
    new ButtonBuilder()
      .setCustomId(CID.logSnack(session.id))
      .setLabel('Snack')
      .setStyle(styleFor('snack'))
  );

  const cancelRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(CID.cancel(session.id))
      .setLabel('Cancel')
      .setStyle(ButtonStyle.Danger)
  );

  return { embeds: [embed], components: [mealRow, cancelRow] };
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
