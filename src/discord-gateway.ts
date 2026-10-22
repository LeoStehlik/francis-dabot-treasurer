import WebSocket from "ws";
import { CLIENT_BUILD_NUMBER } from "./discord-fingerprint.js";
import { sanitizeText } from "./sanitize.js";
import type { GatewayLike, GatewayResult, Snowflake } from "./types.js";

interface Pending {
  nonce: string;
  transmitted: boolean;
  interactionId?: Snowflake;
  messageId?: Snowflake;
  content?: string;
  resolve: (result: GatewayResult) => void;
  timeout: NodeJS.Timeout;
  settle?: NodeJS.Timeout;
}

export class DiscordGateway implements GatewayLike {
  private socket?: WebSocket;
  private token = "";
  private ready = false;
  private stopped = false;
  private currentSessionId: string | undefined;
  private sequence: number | null = null;
  private heartbeat?: NodeJS.Timeout;
  private reconnects = 0;
  private readonly pending = new Map<string, Pending>();
  private readonly messages = new Map<
    string,
    { id: Snowflake; content: string }
  >();

  async start(token: string): Promise<void> {
    this.token = token;
    this.stopped = false;
    await this.connectAndWait();
  }

  async stop(): Promise<void> {
    this.stopped = true;
    this.ready = false;
    if (this.heartbeat) clearInterval(this.heartbeat);
    this.socket?.close(1000, "plugin stop");
    for (const pending of this.pending.values())
      this.finish(pending, {
        kind: "unknown",
        nonce: pending.nonce,
        reason: "gateway stopped",
      });
  }

  isReady(): boolean {
    return this.ready && this.socket?.readyState === WebSocket.OPEN;
  }

  sessionId(): string | undefined {
    return this.currentSessionId;
  }

  waitForInteraction(nonce: string, timeoutMs: number): Promise<GatewayResult> {
    if (this.pending.has(nonce))
      return Promise.reject(new Error("duplicate nonce"));
    return new Promise((resolve) => {
      const pending: Pending = {
        nonce,
        transmitted: false,
        resolve,
        timeout: setTimeout(() => {
          this.finish(pending, {
            kind: pending.interactionId ? "unknown_response" : "unknown",
            nonce,
            ...(pending.interactionId
              ? { interactionId: pending.interactionId }
              : {}),
            reason: "interaction timeout",
          });
        }, timeoutMs),
      };
      this.pending.set(nonce, pending);
    });
  }

  markTransmitted(nonce: string): void {
    const pending = this.pending.get(nonce);
    if (pending) pending.transmitted = true;
  }

  private async connectAndWait(): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      const socket = new WebSocket(
        "wss://gateway.discord.gg/?v=9&encoding=json",
      );
      this.socket = socket;
      const timer = setTimeout(
        () => reject(new Error("gateway ready timeout")),
        15_000,
      );
      socket.on("message", (data) => {
        try {
          const payload = JSON.parse(data.toString()) as {
            op: number;
            t?: string;
            s?: number;
            d?: any;
          };
          if (typeof payload.s === "number") this.sequence = payload.s;
          if (payload.op === 10) {
            this.beginHeartbeat(
              Number(payload.d?.heartbeat_interval ?? 45_000),
            );
            this.sendIdentifyOrResume();
          } else if (payload.op === 0) {
            this.acceptDispatch(payload.t ?? "", payload.d);
            if (
              (payload.t === "READY" || payload.t === "RESUMED") &&
              !this.ready
            ) {
              this.ready = true;
              this.reconnects = 0;
              clearTimeout(timer);
              resolve();
            }
          } else if (payload.op === 7) {
            socket.close(4000, "reconnect requested");
          } else if (payload.op === 9) {
            this.currentSessionId = undefined;
            this.sequence = null;
            socket.close(4000, "invalid session");
          } else if (payload.op === 1) {
            this.send({ op: 1, d: this.sequence });
          }
        } catch {
          // Invalid gateway data is ignored and cannot enter tool output.
        }
      });
      socket.on("error", () => undefined);
      socket.on("close", () => {
        clearTimeout(timer);
        this.ready = false;
        if (this.heartbeat) clearInterval(this.heartbeat);
        for (const pending of [...this.pending.values()]) {
          if (pending.transmitted)
            this.finish(pending, {
              kind: "unknown",
              nonce: pending.nonce,
              reason: "gateway disconnected after transmission",
            });
        }
        if (!this.stopped && this.reconnects < 3) {
          this.reconnects += 1;
          setTimeout(
            () => void this.connectAndWait().catch(() => undefined),
            Math.min(1000 * this.reconnects, 3000),
          );
        } else if (!this.ready)
          reject(new Error("gateway closed before ready"));
      });
    });
  }

  private sendIdentifyOrResume(): void {
    if (this.currentSessionId && this.sequence !== null) {
      this.send({
        op: 6,
        d: {
          token: this.token,
          session_id: this.currentSessionId,
          seq: this.sequence,
        },
      });
      return;
    }
    this.send({
      op: 2,
      d: {
        token: this.token,
        capabilities: 4093,
        properties: {
          os: "linux",
          browser: "chrome",
          device: "",
          system_locale: "en-US",
          browser_user_agent: "DiscordUserTipBot/0.1",
          browser_version: "1",
          os_version: "linux",
          referrer: "",
          referring_domain: "",
          referrer_current: "",
          referring_domain_current: "",
          release_channel: "stable",
          client_build_number: CLIENT_BUILD_NUMBER,
          client_event_source: null,
        },
        presence: { status: "invisible", since: 0, activities: [], afk: false },
        compress: false,
        client_state: { guild_versions: {} },
      },
    });
  }

  acceptDispatch(type: string, data: any): void {
    if (type === "READY" && typeof data?.session_id === "string")
      this.currentSessionId = data.session_id;
    if (type === "INTERACTION_SUCCESS" && data?.nonce !== undefined) {
      const pending = this.pending.get(String(data.nonce));
      if (!pending) return;
      pending.interactionId = String(data.id);
      const message = this.messages.get(pending.interactionId);
      if (message) this.applyMessage(pending, message.id, message.content);
      return;
    }
    if (type === "INTERACTION_FAILURE" && data?.nonce !== undefined) {
      const pending = this.pending.get(String(data.nonce));
      if (pending)
        this.finish(pending, {
          kind: "failure",
          nonce: pending.nonce,
          interactionId: String(data.id),
          reason: `Discord reason ${String(data.reason_code ?? "unknown")}`,
        });
      return;
    }
    if (type === "MESSAGE_CREATE" || type === "MESSAGE_UPDATE")
      this.captureMessage(data);
  }

  private captureMessage(data: any): void {
    const interactionId =
      data?.interaction?.id ?? data?.interaction_metadata?.id;
    const messageId = typeof data?.id === "string" ? data.id : undefined;
    const content = extractContent(data);
    if (interactionId && messageId)
      this.messages.set(String(interactionId), { id: messageId, content });
    for (const pending of this.pending.values()) {
      if (
        (interactionId && pending.interactionId === String(interactionId)) ||
        (messageId && pending.messageId === messageId)
      ) {
        this.applyMessage(pending, messageId, content);
      }
    }
  }

  private applyMessage(
    pending: Pending,
    messageId: Snowflake,
    content: string,
  ): void {
    pending.messageId = messageId;
    pending.content = content;
    if (pending.settle) clearTimeout(pending.settle);
    pending.settle = setTimeout(
      () =>
        this.finish(pending, {
          kind: "success",
          nonce: pending.nonce,
          ...(pending.interactionId
            ? { interactionId: pending.interactionId }
            : {}),
          messageId,
          content,
        }),
      500,
    );
  }

  private finish(pending: Pending, result: GatewayResult): void {
    if (!this.pending.delete(pending.nonce)) return;
    clearTimeout(pending.timeout);
    if (pending.settle) clearTimeout(pending.settle);
    pending.resolve(result);
  }

  private beginHeartbeat(interval: number): void {
    if (this.heartbeat) clearInterval(this.heartbeat);
    this.heartbeat = setInterval(
      () => this.send({ op: 1, d: this.sequence }),
      interval,
    );
  }

  private send(payload: unknown): void {
    if (this.socket?.readyState === WebSocket.OPEN)
      this.socket.send(JSON.stringify(payload));
  }
}

function extractContent(data: any): string {
  const pieces: string[] = [];
  if (typeof data?.content === "string") pieces.push(data.content);
  for (const embed of Array.isArray(data?.embeds) ? data.embeds : []) {
    if (typeof embed?.title === "string") pieces.push(embed.title);
    if (typeof embed?.description === "string") pieces.push(embed.description);
    for (const field of Array.isArray(embed?.fields) ? embed.fields : []) {
      if (typeof field?.name === "string") pieces.push(field.name);
      if (typeof field?.value === "string") pieces.push(field.value);
    }
  }
  return sanitizeText(pieces.join("\n"), undefined, 4096);
}

export function createNonce(): string {
  const discordEpochMs = 1_420_070_400_000n;
  const timeCandidate = (BigInt(Date.now()) - discordEpochMs) << 22n;
  lastNonce = timeCandidate > lastNonce ? timeCandidate : lastNonce + 1n;
  return lastNonce.toString();
}

let lastNonce = 0n;
