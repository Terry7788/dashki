import {
  Events,
  type Client,
  type Message,
  type ButtonInteraction,
  type Interaction,
} from 'discord.js';
import { DashkiClient, DashkiApiError } from './api';
import type {
  ItemState,
  MealType,
  Session,
  Unit,
} from './types';
import { findInDb } from './foodMatcher';
import { defaultMealType, todayLocalIso } from './mealType';
import {
  buildBatchMessage,
  buildPerItemMessage,
  disabledFrom,
  parseCustomId,
} from './embeds';
import {
  endSession,
  getSession,
  newSessionId,
  startSession,
} from './session';
import type { ActionRowBuilder, ButtonBuilder } from 'discord.js';

export function registerHandlers(opts: {
  client: Client;
  api: DashkiClient;
  allowedUserId: string;
}) {
  const { client, api, allowedUserId } = opts;

  client.on(Events.MessageCreate, async (msg) => {
    if (msg.author.bot) return;
    if (msg.author.id !== allowedUserId) return;

    const content = msg.content.trim();
    if (!content) return;
    if (content === '!ping') {
      await msg.reply('pong');
      return;
    }
    // Treat any other message as a food log.
    await handleLogMessage(msg, api);
  });

  client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isButton()) return;
    if (interaction.user.id !== allowedUserId) {
      await interaction.reply({ content: 'Not for you.', ephemeral: true });
      return;
    }
    await handleButton(interaction, api);
  });
}

async function handleLogMessage(msg: Message, api: DashkiClient): Promise<void> {
  let parsed;
  try {
    parsed = await api.parseFoods(msg.content);
  } catch (err) {
    await msg.reply(`Couldn't parse that. ${formatError(err)}`);
    return;
  }

  if (parsed.items.length === 0) {
    await msg.reply("Couldn't pick any foods out of that. Try `chicken 200g, rice 100g` style.");
    return;
  }

  // Resolve matches in parallel.
  const items: ItemState[] = await Promise.all(
    parsed.items.map(async (p): Promise<ItemState> => {
      try {
        const match = await findInDb(p.name, (q) => api.searchFoods(q));
        return { parsed: p, matched: match, estimate: null, decision: match ? 'logged' : null };
      } catch {
        return { parsed: p, matched: null, estimate: null, decision: null };
      }
    })
  );

  const session: Session = {
    id: newSessionId(),
    userId: msg.author.id,
    channelId: msg.channelId,
    mealType: parsed.meal_type ?? defaultMealType(),
    date: todayLocalIso(),
    items,
    pendingIndex: nextPending(items),
    perItemMessageIds: [],
    batchMessageId: null,
  };
  startSession(session);

  // Quick intake summary so the user knows what we picked up.
  const matchedCount = items.filter((i) => i.matched).length;
  const unknownCount = items.length - matchedCount;
  await msg.reply(
    `Parsed ${items.length} item${items.length === 1 ? '' : 's'} for **${session.mealType}** on ${session.date}: ` +
      `${matchedCount} matched, ${unknownCount} need confirmation.`
  );

  await advanceSession(msg, api, session);
}

// Send the next per-item card, or the batch card if all decisions are in.
// `msg.reply()` threads the bot's messages to the user's original message —
// good UX (preserves context) and dodges the messy channel-type narrowing.
async function advanceSession(
  msg: Message,
  api: DashkiClient,
  session: Session
): Promise<void> {
  const i = session.pendingIndex;
  if (i === -1) {
    await sendBatch(msg, session);
    return;
  }

  const item = session.items[i];
  try {
    item.estimate = await api.estimateNutrition(item.parsed.name, item.parsed.quantity, item.parsed.unit);
  } catch (err) {
    await msg.reply(`⚠️ Couldn't estimate "${item.parsed.name}": ${formatError(err)} — skipping.`);
    item.decision = 'cancelled';
    session.pendingIndex = nextPending(session.items);
    await advanceSession(msg, api, session);
    return;
  }

  const payload = buildPerItemMessage(session, i);
  const sent = await msg.reply(payload);
  session.perItemMessageIds.push(sent.id);
}

async function sendBatch(msg: Message, session: Session): Promise<void> {
  // If everything ended up cancelled (e.g. all estimates failed), tidy up.
  const liveItems = session.items.filter((it) => it.decision && it.decision !== 'cancelled');
  if (liveItems.length === 0) {
    await msg.reply('Nothing left to log — cancelled.');
    endSession(session.id);
    return;
  }

  const payload = buildBatchMessage(session);
  const sent = await msg.reply(payload);
  session.batchMessageId = sent.id;
}

async function handleButton(
  interaction: ButtonInteraction,
  api: DashkiClient
): Promise<void> {
  const parsed = parseCustomId(interaction.customId);
  if (!parsed) {
    await interaction.reply({ content: 'Bad button.', ephemeral: true });
    return;
  }

  const session = getSession(parsed.sessionId);
  if (!session) {
    await interaction.update({
      content: 'Session expired. Send the message again.',
      embeds: [],
      components: [],
    });
    return;
  }

  if (parsed.action === 'cx') {
    endSession(session.id);
    await interaction.update({
      content: '❌ Cancelled. Nothing was logged.',
      embeds: [],
      components: disabledFrom(
        interaction.message.components as unknown as ActionRowBuilder<ButtonBuilder>[]
      ),
    });
    return;
  }

  if (parsed.action === 'la') {
    await commitBatch(interaction, api, session);
    return;
  }

  // Per-item decision
  if (parsed.itemIndex === null) {
    await interaction.reply({ content: 'Missing item index.', ephemeral: true });
    return;
  }
  const item = session.items[parsed.itemIndex];
  if (!item) {
    await interaction.reply({ content: 'Unknown item.', ephemeral: true });
    return;
  }

  item.decision = parsed.action === 'qa' ? 'quick-add' : 'save-and-log';
  session.pendingIndex = nextPending(session.items);

  // Disable this card's buttons so the user can't click again.
  await interaction.update({
    content: parsed.action === 'qa' ? '✅ Quick-add staged.' : '💾 Save + log staged.',
    components: disabledFrom(
      interaction.message.components as unknown as ActionRowBuilder<ButtonBuilder>[]
    ),
  });

  // Move forward in the flow. interaction.followUp sends a new message in the
  // same channel as the interaction — no channel-type narrowing required.
  if (session.pendingIndex === -1) {
    const payload = buildBatchMessage(session);
    const sent = await interaction.followUp(payload);
    session.batchMessageId = sent.id;
    return;
  }

  const nextItem = session.items[session.pendingIndex];
  try {
    nextItem.estimate = await api.estimateNutrition(
      nextItem.parsed.name,
      nextItem.parsed.quantity,
      nextItem.parsed.unit
    );
  } catch (err) {
    await interaction.followUp({
      content: `⚠️ Couldn't estimate "${nextItem.parsed.name}": ${formatError(err)} — skipping.`,
    });
    nextItem.decision = 'cancelled';
    session.pendingIndex = nextPending(session.items);
    if (session.pendingIndex === -1) {
      const payload = buildBatchMessage(session);
      const sent = await interaction.followUp(payload);
      session.batchMessageId = sent.id;
    }
    return;
  }

  const payload = buildPerItemMessage(session, session.pendingIndex);
  const sent = await interaction.followUp(payload);
  session.perItemMessageIds.push(sent.id);
}

async function commitBatch(
  interaction: ButtonInteraction,
  api: DashkiClient,
  session: Session
): Promise<void> {
  await interaction.deferUpdate();

  const errors: string[] = [];
  let kcal = 0;
  let protein = 0;
  let logged = 0;

  for (const item of session.items) {
    if (!item.decision || item.decision === 'cancelled') continue;
    try {
      if (item.decision === 'logged' && item.matched) {
        const entry = await api.logFromFood({
          date: session.date,
          mealType: session.mealType,
          foodId: item.matched.id,
          foodName: item.matched.name,
          quantity: item.parsed.quantity,
          unit: item.parsed.unit,
        });
        kcal += entry.calories_snapshot ?? 0;
        protein += entry.protein_snapshot ?? 0;
        logged++;
      } else if (item.decision === 'save-and-log' && item.estimate) {
        const food = await api.createFood({
          ...item.estimate.perBase,
          name: item.parsed.name,
        });
        const entry = await api.logFromFood({
          date: session.date,
          mealType: session.mealType,
          foodId: food.id,
          foodName: food.name,
          quantity: item.parsed.quantity,
          unit: item.parsed.unit,
        });
        kcal += entry.calories_snapshot ?? 0;
        protein += entry.protein_snapshot ?? 0;
        logged++;
      } else if (item.decision === 'quick-add' && item.estimate) {
        const entry = await api.logQuickAdd({
          date: session.date,
          mealType: session.mealType,
          foodName: item.parsed.name,
          quantity: item.parsed.quantity,
          unit: item.parsed.unit,
          calories: item.estimate.calories,
          protein: item.estimate.protein,
        });
        kcal += entry.calories_snapshot ?? 0;
        protein += entry.protein_snapshot ?? 0;
        logged++;
      }
    } catch (err) {
      errors.push(`• ${item.parsed.name}: ${formatError(err)}`);
    }
  }

  endSession(session.id);

  const errBlock = errors.length ? `\n\nErrors:\n${errors.join('\n')}` : '';
  await interaction.editReply({
    content: `✅ Logged ${logged} item${logged === 1 ? '' : 's'} to **${session.mealType}** on ${session.date}.\nTotal: **${Math.round(kcal)} kcal**, **${protein.toFixed(1)} g protein**.${errBlock}`,
    embeds: [],
    components: disabledFrom(
      interaction.message.components as unknown as ActionRowBuilder<ButtonBuilder>[]
    ),
  });
}

function nextPending(items: ItemState[]): number {
  for (let i = 0; i < items.length; i++) {
    if (items[i].decision === null) return i;
  }
  return -1;
}

function formatError(err: unknown): string {
  if (err instanceof DashkiApiError) {
    try {
      const parsed = JSON.parse(err.body);
      if (parsed && typeof parsed.error === 'string') return parsed.error;
    } catch {
      /* fall through */
    }
    return `${err.status} ${err.body.slice(0, 100)}`;
  }
  if (err instanceof Error) return err.message;
  return String(err);
}
