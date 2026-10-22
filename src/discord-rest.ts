import { fetch } from "undici";
import { DiscordFingerprint } from "./discord-fingerprint.js";
import { sanitizeText } from "./sanitize.js";
import type {
  CommandIndex,
  DiscordUser,
  RestLike,
  Snowflake,
} from "./types.js";

const API = "https://discord.com/api/v9";
const MAX_BODY = 512 * 1024;

export class DiscordRest implements RestLike {
  private readonly fingerprint = new DiscordFingerprint();
  private bootstrapPromise?: Promise<void>;

  constructor(private readonly token: string) {}

  async currentUser(): Promise<DiscordUser> {
    await this.ensureBootstrap();
    return this.readJson<DiscordUser>(`${API}/users/@me`);
  }

  async discoverCommands(guildId: Snowflake): Promise<CommandIndex> {
    await this.ensureBootstrap();
    return this.readJson<CommandIndex>(
      `${API}/guilds/${guildId}/application-command-index`,
    );
  }

  async submitInteraction(
    body: unknown,
  ): Promise<{ status: "accepted" | "rejected" | "unknown"; reason?: string }> {
    try {
      await this.ensureBootstrap();
      const response = await fetch(`${API}/interactions`, {
        method: "POST",
        headers: this.fingerprint.headers(this.token, true, {
          referer: interactionReferer(body),
          mutation: true,
        }),
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(15_000),
      });
      if (response.status >= 200 && response.status < 300)
        return { status: "accepted" };
      const reason = sanitizeText(await readBounded(response), this.token, 512);
      if (response.status >= 500) return { status: "unknown", reason };
      return { status: "rejected", reason };
    } catch (error) {
      return {
        status: "unknown",
        reason: sanitizeText(error, this.token, 512),
      };
    }
  }

  private async readJson<T>(url: string): Promise<T> {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const response = await fetch(url, {
        headers: this.headers(false),
        signal: AbortSignal.timeout(15_000),
      });
      if (response.status === 429 && attempt < 2) {
        const delay = retryDelay(response.headers.get("retry-after"));
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }
      const body = await readBounded(response);
      if (!response.ok)
        throw new Error(
          `Discord read ${response.status}: ${sanitizeText(body, this.token, 512)}`,
        );
      try {
        return JSON.parse(body) as T;
      } catch {
        throw new Error("Discord returned invalid JSON");
      }
    }
    throw new Error("Discord read rate limit exhausted");
  }

  private headers(json: boolean): Record<string, string> {
    return this.fingerprint.headers(this.token, json);
  }

  private ensureBootstrap(): Promise<void> {
    this.bootstrapPromise ??= this.bootstrapAnonymousSession();
    return this.bootstrapPromise;
  }

  private async bootstrapAnonymousSession(): Promise<void> {
    const response = await fetch(
      `${API}/experiments?with_guild_experiments=true`,
      {
        headers: this.fingerprint.headers(undefined, false),
        signal: AbortSignal.timeout(15_000),
      },
    );
    const body = await readBounded(response);
    if (!response.ok)
      throw new Error(`Discord session bootstrap failed: ${response.status}`);
    let fingerprint: unknown;
    try {
      fingerprint = (JSON.parse(body) as { fingerprint?: unknown }).fingerprint;
    } catch {
      throw new Error("Discord session bootstrap returned invalid JSON");
    }
    if (typeof fingerprint !== "string")
      throw new Error("Discord session bootstrap omitted its fingerprint");
    this.fingerprint.setAnonymousSession(
      fingerprint,
      response.headers.getSetCookie(),
    );
  }
}

function interactionReferer(body: unknown): string {
  const value =
    body && typeof body === "object"
      ? (body as { guild_id?: unknown; channel_id?: unknown })
      : {};
  if (
    typeof value.guild_id !== "string" ||
    typeof value.channel_id !== "string" ||
    !/^\d{17,20}$/u.test(value.guild_id) ||
    !/^\d{17,20}$/u.test(value.channel_id)
  )
    return "https://discord.com/channels/@me";
  return `https://discord.com/channels/${value.guild_id}/${value.channel_id}`;
}

function retryDelay(raw: string | null): number {
  const seconds = Number(raw);
  return Number.isFinite(seconds)
    ? Math.min(Math.max(seconds * 1000, 50), 5000)
    : 1000;
}

async function readBounded(response: {
  headers: { get(name: string): string | null };
  body: AsyncIterable<Uint8Array> | null;
}): Promise<string> {
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_BODY)
    throw new Error("Discord response exceeded size limit");
  if (!response.body) return "";
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of response.body) {
    size += chunk.byteLength;
    if (size > MAX_BODY)
      throw new Error("Discord response exceeded size limit");
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8");
}
