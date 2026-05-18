import type { Message } from 'discord.js';

export function isAllowedUser(message: Message, allowedUserId: string): boolean {
  return message.author.id === allowedUserId;
}

// Channel gate. DMs always pass (they're already 1:1 with the allowed user).
// In a guild, the channel id must equal `allowedChannelId`. If
// `allowedChannelId` is null, guild messages are NOT processed — bot is
// DM-only, the original behaviour.
export function isAllowedChannel(message: Message, allowedChannelId: string | null): boolean {
  if (message.channel.isDMBased()) return true;
  if (!allowedChannelId) return false;
  return message.channel.id === allowedChannelId;
}
