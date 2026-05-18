import 'dotenv/config';

interface Config {
  discordBotToken: string;
  allowedUserId: string;
  dashkiApiUrl: string;
  openaiApiKey: string | null;
}

function readRequired(name: string): string {
  const value = process.env[name];
  if (!value || !value.trim()) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value.trim();
}

export function loadConfig(): Config {
  const missing: string[] = [];
  const get = (name: string): string => {
    try {
      return readRequired(name);
    } catch {
      missing.push(name);
      return '';
    }
  };

  const cfg: Config = {
    discordBotToken: get('DISCORD_BOT_TOKEN'),
    allowedUserId: get('DISCORD_ALLOWED_USER_ID'),
    dashkiApiUrl: get('DASHKI_API_URL'),
    openaiApiKey: process.env.OPENAI_API_KEY?.trim() || null,
  };

  if (missing.length) {
    console.error(
      `[config] Missing required env vars: ${missing.join(', ')}\n` +
        `Copy discord-bot/.env.example to discord-bot/.env and fill them in.`
    );
    process.exit(1);
  }

  return cfg;
}
