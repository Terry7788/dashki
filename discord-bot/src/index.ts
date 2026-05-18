import { Client, Events, GatewayIntentBits, Partials } from 'discord.js';
import { loadConfig } from './config';
import { isAllowedUser } from './guards';

const config = loadConfig();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.MessageContent,
  ],
  // Required so the bot receives DM events even when the channel isn't cached.
  partials: [Partials.Channel, Partials.Message],
});

client.once(Events.ClientReady, (c) => {
  console.log(`[bot] logged in as ${c.user.tag} (id: ${c.user.id})`);
  console.log(`[bot] gated to user id: ${config.allowedUserId}`);
  console.log(`[bot] dashki api: ${config.dashkiApiUrl}`);
});

client.on(Events.MessageCreate, async (message) => {
  if (message.author.bot) return;
  if (!isAllowedUser(message, config.allowedUserId)) return;

  const content = message.content.trim();
  if (content === '!ping') {
    await message.reply('pong');
    return;
  }
});

client.on(Events.Error, (err) => {
  console.error('[bot] client error', err);
});

process.on('unhandledRejection', (err) => {
  console.error('[bot] unhandled rejection', err);
});

void client.login(config.discordBotToken);
