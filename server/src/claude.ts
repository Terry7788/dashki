import Anthropic from '@anthropic-ai/sdk';

// ─── Claude ───────────────────────────────────────────────────────────────────

export const CLAUDE_MODEL = 'claude-haiku-5-5';

export const claude = process.env.ANTHROPIC_API_KEY
  ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  : null;

export const CLAUDE_NOT_CONFIGURED = 'Claude API key not configured';

type ImageMediaType = 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';
const IMAGE_MEDIA_TYPES: ImageMediaType[] = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

/** Split a data URL ("data:image/png;base64,...") or a bare base64 payload
 *  into the media type + data pair Claude's image block expects. Bare
 *  payloads are treated as JPEG, which is what the phone camera sends. */
export function parseImage(image: string): { mediaType: ImageMediaType; data: string } {
  const match = image.match(/^data:([^;,]+);base64,(.*)$/s);
  if (!match) return { mediaType: 'image/jpeg', data: image };
  const mediaType = IMAGE_MEDIA_TYPES.find((t) => t === match[1].toLowerCase());
  if (!mediaType) throw new Error(`Unsupported image type: ${match[1]}`);
  return { mediaType, data: match[2] };
}

interface AskJsonOptions {
  system: string;
  prompt: string;
  image?: { mediaType: ImageMediaType; data: string };
}

/** One-shot request that returns the JSON text of Claude's reply (markdown
 *  fences and any stray prose stripped). Callers JSON.parse and validate. */
export async function askJson({ system, prompt, image }: AskJsonOptions): Promise<string> {
  if (!claude) throw new Error(CLAUDE_NOT_CONFIGURED);

  const content: Anthropic.ContentBlockParam[] = [];
  if (image) {
    content.push({
      type: 'image',
      source: { type: 'base64', media_type: image.mediaType, data: image.data },
    });
  }
  content.push({ type: 'text', text: prompt });

  const response = await claude.messages.create({
    model: CLAUDE_MODEL,
    // Thinking counts toward max_tokens, so leave room for it on top of
    // the few hundred tokens of JSON these prompts ask for.
    max_tokens: 4000,
    output_config: { effort: 'low' },
    system,
    messages: [{ role: 'user', content }],
  });

  if (response.stop_reason === 'refusal') {
    throw new Error('Claude declined the request');
  }
  if (response.stop_reason === 'max_tokens') {
    throw new Error('Claude reply was cut off');
  }

  const text = response.content
    .map((block) => (block.type === 'text' ? block.text : ''))
    .join('')
    .trim();

  const arrayStart = text.indexOf('[');
  const objectStart = text.indexOf('{');
  const isArray = arrayStart !== -1 && (objectStart === -1 || arrayStart < objectStart);
  const start = isArray ? arrayStart : objectStart;
  const end = text.lastIndexOf(isArray ? ']' : '}');
  if (start === -1 || end <= start) throw new Error('Claude returned no JSON');
  return text.slice(start, end + 1);
}
