export type Snowflake = string;

export interface PluginConfig {
  token: string;
  expectedUserId: Snowflake;
  guildId: Snowflake;
  contextId: Snowflake;
  interactionMode: "guild" | "dm";
  tipBotApplicationId: Snowflake;
  allowedRecipientIds: Snowflake[];
  allowedTokenSymbols: string[];
  tipEnabled: boolean;
  maxPerTip: Record<string, string>;
  receiptPath: string;
  confirmationTtlSeconds: number;
  responseTimeoutMs: number;
}

export interface DiscordUser {
  id: Snowflake;
  bot?: boolean;
  username?: string;
}

export interface CommandOption {
  type: number;
  name: string;
  required?: boolean;
  choices?: Array<{ name: string; value: unknown }>;
}

export interface ApplicationCommand {
  id: Snowflake;
  application_id: Snowflake;
  version: Snowflake;
  name: string;
  type?: number;
  options?: CommandOption[];
  [key: string]: unknown;
}

export interface CommandIndex {
  application_commands?: ApplicationCommand[];
}

export interface InvocationOption {
  type: number;
  name: string;
  value: string;
}

export interface InvocationRequest {
  command: ApplicationCommand;
  options: InvocationOption[];
  nonce: string;
}

export type InvocationStatus =
  | "OK"
  | "UNAVAILABLE"
  | "SCHEMA_MISMATCH"
  | "REJECTED"
  | "UNKNOWN"
  | "UNKNOWN_RESPONSE";

export interface InvocationResult {
  status: InvocationStatus;
  nonce?: string;
  interactionId?: Snowflake;
  messageId?: Snowflake;
  content?: string;
  reason?: string;
}

export interface GatewayResult {
  kind: "success" | "failure" | "unknown_response" | "unknown";
  nonce: string;
  interactionId?: Snowflake;
  messageId?: Snowflake;
  content?: string;
  reason?: string;
}

export interface TipTransaction {
  amount: string;
  token: string;
  recipientUserId: Snowflake;
  split: "EACH";
  ping: "NO";
}

export interface Receipt {
  timestamp: string;
  phase: "prepare" | "commit";
  accountId: Snowflake;
  applicationId: Snowflake;
  commandId?: Snowflake;
  commandName: "tip";
  guildId: Snowflake;
  contextId: Snowflake;
  normalized: TipTransaction;
  nonce?: string;
  outcome: string;
  interactionId?: Snowflake;
  messageId?: Snowflake;
}

export interface RestLike {
  currentUser(): Promise<DiscordUser>;
  discoverCommands(guildId: Snowflake): Promise<CommandIndex>;
  submitInteraction(
    body: unknown,
  ): Promise<{ status: "accepted" | "rejected" | "unknown"; reason?: string }>;
}

export interface GatewayLike {
  start(token: string): Promise<void>;
  stop(): Promise<void>;
  isReady(): boolean;
  sessionId(): string | undefined;
  waitForInteraction(nonce: string, timeoutMs: number): Promise<GatewayResult>;
  markTransmitted(nonce: string): void;
}

export interface ReceiptSink {
  append(receipt: Receipt): Promise<void>;
}
