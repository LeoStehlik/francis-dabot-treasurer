import {
  commandOptions,
  normalizeTip,
  resolveCommands,
  SchemaMismatchError,
  tipOptions,
} from "./commands.js";
import { ConfirmationStore } from "./confirmations.js";
import { createNonce } from "./discord-gateway.js";
import { sanitizeText } from "./sanitize.js";
import type {
  ApplicationCommand,
  GatewayLike,
  InvocationOption,
  InvocationResult,
  PluginConfig,
  ReceiptSink,
  RestLike,
  TipTransaction,
} from "./types.js";

export class TipBotClient {
  private commands: Record<string, ApplicationCommand> = {};
  private authenticatedUserId?: string;
  private started = false;
  private readonly confirmations: ConfirmationStore;

  constructor(
    readonly config: PluginConfig,
    private readonly rest: RestLike,
    private readonly gateway: GatewayLike,
    private readonly receipts: ReceiptSink,
  ) {
    this.confirmations = new ConfirmationStore(
      config.confirmationTtlSeconds * 1000,
    );
  }

  async start(): Promise<void> {
    const user = await this.rest.currentUser();
    if (user.id !== this.config.expectedUserId)
      throw new Error(
        "authenticated Discord account does not match expectedUserId",
      );
    if (user.bot === true)
      throw new Error("dedicated Discord identity must not be a bot account");
    const index = await this.rest.discoverCommands(this.config.guildId);
    this.commands = resolveCommands(index, this.config.tipBotApplicationId);
    await this.gateway.start(this.config.token);
    if (!this.gateway.isReady() || !this.gateway.sessionId())
      throw new Error("Discord Gateway did not become ready");
    this.authenticatedUserId = user.id;
    this.started = true;
  }

  async stop(): Promise<void> {
    this.started = false;
    await this.gateway.stop();
  }

  isReady(): boolean {
    return (
      this.started &&
      this.gateway.isReady() &&
      this.authenticatedUserId === this.config.expectedUserId
    );
  }

  async help(): Promise<InvocationResult> {
    return this.invoke("help", commandOptions("help", {}));
  }

  async balance(token: string): Promise<InvocationResult> {
    const normalized = token.toUpperCase();
    if (
      normalized === "ALL" ||
      !this.config.allowedTokenSymbols.includes(normalized)
    )
      return { status: "REJECTED", reason: "token is not allowed" };
    return this.invoke(
      "balance",
      commandOptions("balance", { coin: normalized }),
    );
  }

  async balances(): Promise<InvocationResult> {
    return this.invoke("balances", []);
  }

  async prepareTip(input: {
    amount: string;
    token: string;
    recipientUserId: string;
  }): Promise<{
    status: "PREPARED";
    normalized: TipTransaction;
    confirmationToken: string;
    expiresAt: string;
  }> {
    const normalized = normalizeTip(input, this.config);
    const prepared = this.confirmations.prepare(normalized);
    await this.receipts.append(this.receipt("prepare", normalized, "PREPARED"));
    return { status: "PREPARED", normalized, ...prepared };
  }

  async commitTip(input: {
    amount: string;
    token: string;
    recipientUserId: string;
    confirmationToken: string;
  }): Promise<InvocationResult> {
    const normalized = normalizeTip(input, this.config);
    this.confirmations.consume(input.confirmationToken, normalized);
    const result = await this.invoke("tip", tipOptions(normalized));
    await this.receipts.append(
      this.receipt("commit", normalized, result.status, {
        ...(this.commands.tip?.id ? { commandId: this.commands.tip.id } : {}),
        ...(result.nonce ? { nonce: result.nonce } : {}),
        ...(result.interactionId
          ? { interactionId: result.interactionId }
          : {}),
        ...(result.messageId ? { messageId: result.messageId } : {}),
      }),
    );
    return result;
  }

  private async invoke(
    name: string,
    options: InvocationOption[],
  ): Promise<InvocationResult> {
    if (!this.isReady())
      return {
        status: "UNAVAILABLE",
        reason: "Discord user session is not ready",
      };
    const command = this.commands[name];
    const sessionId = this.gateway.sessionId();
    if (
      !command ||
      command.application_id !== this.config.tipBotApplicationId ||
      !sessionId
    )
      return {
        status: "SCHEMA_MISMATCH",
        reason: "allowlisted command is unavailable",
      };
    const nonce = createNonce();
    const response = this.gateway.waitForInteraction(
      nonce,
      this.config.responseTimeoutMs,
    );
    const body = {
      type: 2,
      application_id: command.application_id,
      ...(this.config.interactionMode === "guild"
        ? { guild_id: this.config.guildId }
        : {}),
      channel_id: this.config.contextId,
      session_id: sessionId,
      data: {
        version: command.version,
        id: command.id,
        name: command.name,
        type: 1,
        options,
        application_command: command,
        attachments: [],
      },
      nonce,
      analytics_location: "slash_ui",
    };
    this.gateway.markTransmitted(nonce);
    const submitted = await this.rest.submitInteraction(body);
    if (submitted.status !== "accepted") {
      return {
        status: submitted.status === "rejected" ? "REJECTED" : "UNKNOWN",
        nonce,
        reason: sanitizeText(submitted.reason, this.config.token, 512),
      };
    }
    const event = await response;
    if (event.kind === "failure")
      return {
        status: "REJECTED",
        nonce,
        ...(event.interactionId ? { interactionId: event.interactionId } : {}),
        reason: sanitizeText(event.reason, this.config.token, 512),
      };
    if (event.kind === "unknown")
      return {
        status: "UNKNOWN",
        nonce,
        ...(event.reason ? { reason: event.reason } : {}),
      };
    if (event.kind === "unknown_response")
      return {
        status: "UNKNOWN_RESPONSE",
        nonce,
        ...(event.interactionId ? { interactionId: event.interactionId } : {}),
        ...(event.reason ? { reason: event.reason } : {}),
      };
    return {
      status: "OK",
      nonce,
      ...(event.interactionId ? { interactionId: event.interactionId } : {}),
      ...(event.messageId ? { messageId: event.messageId } : {}),
      content: sanitizeText(event.content, this.config.token),
    };
  }

  private receipt(
    phase: "prepare" | "commit",
    normalized: TipTransaction,
    outcome: string,
    extra: {
      commandId?: string;
      nonce?: string;
      interactionId?: string;
      messageId?: string;
    } = {},
  ) {
    return {
      timestamp: new Date().toISOString(),
      phase,
      accountId: this.config.expectedUserId,
      applicationId: this.config.tipBotApplicationId,
      commandName: "tip" as const,
      guildId: this.config.guildId,
      contextId: this.config.contextId,
      normalized,
      outcome,
      ...Object.fromEntries(
        Object.entries(extra).filter(([, value]) => value !== undefined),
      ),
    };
  }
}

export { SchemaMismatchError };
