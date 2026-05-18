import type { Message } from 'discord.js';

export function isAllowedUser(message: Message, allowedUserId: string): boolean {
  return message.author.id === allowedUserId;
}
