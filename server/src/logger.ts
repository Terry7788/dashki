/**
 * logger.ts — Safe logging with automatic redaction of sensitive values.
 *
 * Redacts:
 *  - API keys (OpenAI, generic sk-... patterns)
 *  - Authorization headers / Bearer tokens
 *  - Passwords / secrets / tokens in objects
 *  - Any string that looks like a key (long hex/base64 strings > 32 chars)
 */

const REDACTED = '[REDACTED]';

// Patterns that indicate a field contains sensitive data (key names)
const SENSITIVE_KEYS = /^(api[_-]?key|apikey|secret|password|passwd|token|auth|authorization|bearer|private[_-]?key|access[_-]?key|openai[_-]?key)$/i;

// Patterns that match sensitive string values regardless of key name
const SENSITIVE_VALUE_PATTERNS = [
  /sk-[A-Za-z0-9\-_]{20,}/,          // OpenAI-style keys
  /Bearer\s+[A-Za-z0-9\-_\.]+/i,     // Bearer tokens
  /^[A-Za-z0-9+/]{40,}={0,2}$/,      // Long base64 strings (≥40 chars)
  /^[a-f0-9]{32,}$/i,                 // Long hex strings (e.g. MD5/SHA hashes used as secrets)
];

/**
 * Deep-clone and redact sensitive values from an object or string.
 */
function redact(value: unknown, depth = 0): unknown {
  if (depth > 10) return value;

  if (typeof value === 'string') {
    for (const pattern of SENSITIVE_VALUE_PATTERNS) {
      if (pattern.test(value)) return REDACTED;
    }
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => redact(item, depth + 1));
  }

  if (value !== null && typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      if (SENSITIVE_KEYS.test(k)) {
        result[k] = REDACTED;
      } else {
        result[k] = redact(v, depth + 1);
      }
    }
    return result;
  }

  return value;
}

/**
 * Safely serialize a value for logging (with redaction applied).
 */
function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(redact(value));
  } catch {
    return String(value);
  }
}

const logger = {
  log(...args: unknown[]) {
    console.log(...args.map((a) => (typeof a === 'object' && a !== null ? redact(a) : a)));
  },
  info(...args: unknown[]) {
    console.info(...args.map((a) => (typeof a === 'object' && a !== null ? redact(a) : a)));
  },
  warn(...args: unknown[]) {
    console.warn(...args.map((a) => (typeof a === 'object' && a !== null ? redact(a) : a)));
  },
  error(...args: unknown[]) {
    console.error(...args.map((a) => (typeof a === 'object' && a !== null ? redact(a) : a)));
  },
  debug(label: string, value: unknown) {
    console.log(label, safeStringify(value));
  },
};

export { logger, redact, safeStringify };
