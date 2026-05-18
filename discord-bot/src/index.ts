import { Client, Events, GatewayIntentBits, Partials } from 'discord.js';
import { loadConfig } from './config';
import { DashkiClient } from './api';
import { registerHandlers } from './handler';

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

const api = new DashkiClient(config.dashkiApiUrl);

registerHandlers({
  client,
  api,
  allowedUserId: config.allowedUserId,
  allowedChannelId: config.allowedChannelId,
});

client.once(Events.ClientReady, (c) => {
  console.log(`[bot] logged in as ${c.user.tag} (id: ${c.user.id})`);
  console.log(`[bot] gated to user id: ${config.allowedUserId}`);
  console.log(
    `[bot] gated to channel: ${config.allowedChannelId ?? 'DMs only'}`
  );
  console.log(`[bot] dashki api: ${config.dashkiApiUrl}`);
});

client.on(Events.Error, (err) => {
  console.error('[bot] client error', err);
});

process.on('unhandledRejection', (err) => {
  console.error('[bot] unhandled rejection', err);
});

void client.login(config.discordBotToken);
