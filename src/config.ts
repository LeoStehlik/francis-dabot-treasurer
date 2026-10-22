import path from "node:path";
import type { PluginConfig, Snowflake } from "./types.js";

const SNOWFLAKE = /^\d{17,20}$/u;
const SYMBOL = /^[A-Z0-9_-]{1,20}$/u;

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("plugin config must be an object");
  return value as Record<string, unknown>;
}

function stringField(raw: Record<string, unknown>, name: string): string {
  const value = raw[name];
  if (typeof value !== "string" || !value) throw new Error(`missing ${name}`);
  return value;
}

function snowflake(raw: Record<string, unknown>, name: string): Snowflake {
  const value = stringField(raw, name);
  if (!SNOWFLAKE.test(value)) throw new Error(`invalid ${name}`);
  return value;
}

function snowflakeList(
  raw: Record<string, unknown>,
  name: string,
): Snowflake[] {
  const value = raw[name];
  if (
    !Array.isArray(value) ||
    value.some((item) => typeof item !== "string" || !SNOWFLAKE.test(item))
  ) {
    throw new Error(`invalid ${name}`);
  }
  return [...new Set(value as string[])];
}

export function parseConfig(value: unknown): PluginConfig {
  const raw = object(value);
  const token = stringField(raw, "token");
  const symbolsRaw = raw.allowedTokenSymbols;
  if (!Array.isArray(symbolsRaw) || symbolsRaw.length === 0)
    throw new Error("invalid allowedTokenSymbols");
  const allowedTokenSymbols = [
    ...new Set(symbolsRaw.map((item) => String(item).toUpperCase())),
  ];
  if (allowedTokenSymbols.some((item) => !SYMBOL.test(item)))
    throw new Error("invalid allowedTokenSymbols");
  const maxRaw = raw.maxPerTip === undefined ? {} : object(raw.maxPerTip);
  const maxPerTip: Record<string, string> = {};
  for (const [key, entry] of Object.entries(maxRaw)) {
    if (typeof entry !== "string") throw new Error("invalid maxPerTip");
    maxPerTip[key.toUpperCase()] = entry;
  }
  const receiptPath = stringField(raw, "receiptPath");
  if (!path.isAbsolute(receiptPath))
    throw new Error("receiptPath must be absolute");
  const tipEnabled = raw.tipEnabled === true;
  const interactionMode = raw.interactionMode;
  if (interactionMode !== "guild" && interactionMode !== "dm")
    throw new Error("interactionMode must be guild or dm");
  if (
    tipEnabled &&
    allowedTokenSymbols.some((symbol) => maxPerTip[symbol] === undefined)
  ) {
    throw new Error("tipEnabled requires maxPerTip for every allowed token");
  }
  return {
    token,
    expectedUserId: snowflake(raw, "expectedUserId"),
    guildId: snowflake(raw, "guildId"),
    contextId: snowflake(raw, "contextId"),
    interactionMode,
    tipBotApplicationId: snowflake(raw, "tipBotApplicationId"),
    allowedRecipientIds: snowflakeList(raw, "allowedRecipientIds"),
    allowedTokenSymbols,
    tipEnabled,
    maxPerTip,
    receiptPath,
    confirmationTtlSeconds: integer(raw.confirmationTtlSeconds, 120, 30, 900),
    responseTimeoutMs: integer(raw.responseTimeoutMs, 12_000, 1_000, 30_000),
  };
}

function integer(
  value: unknown,
  fallback: number,
  min: number,
  max: number,
): number {
  if (value === undefined) return fallback;
  if (!Number.isInteger(value) || Number(value) < min || Number(value) > max)
    throw new Error("invalid bounded integer");
  return Number(value);
}
