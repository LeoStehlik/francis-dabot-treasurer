const TOKEN_PATTERNS = [
  /mfa\.[A-Za-z0-9_-]{20,}/gu,
  /[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{20,}/gu,
  /authorization\s*[:=]\s*[^\s,}]+/giu,
];

export function sanitizeText(
  value: unknown,
  token?: string,
  limit = 4096,
): string {
  let text = typeof value === "string" ? value : safeStringify(value);
  if (token) text = text.split(token).join("[REDACTED]");
  for (const pattern of TOKEN_PATTERNS)
    text = text.replace(pattern, "[REDACTED]");
  text = text.replace(/[\uD800-\uDFFF]/gu, "�");
  return text.length > limit ? `${text.slice(0, limit)}…[TRUNCATED]` : text;
}

function safeStringify(value: unknown): string {
  try {
    const rendered = JSON.stringify(value);
    return typeof rendered === "string" ? rendered : String(value);
  } catch {
    return "[UNSERIALIZABLE]";
  }
}
