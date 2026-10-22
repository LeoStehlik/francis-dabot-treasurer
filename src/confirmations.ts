import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { TipTransaction } from "./types.js";

interface Pending {
  transaction: TipTransaction;
  expiresAt: number;
}

export class ConfirmationStore {
  private readonly key = randomBytes(32);
  private readonly pending = new Map<string, Pending>();

  constructor(
    private readonly ttlMs: number,
    private readonly now: () => number = Date.now,
  ) {}

  prepare(transaction: TipTransaction): {
    confirmationToken: string;
    expiresAt: string;
  } {
    const id = randomBytes(16).toString("base64url");
    const expiresAt = this.now() + this.ttlMs;
    this.pending.set(id, {
      transaction: structuredClone(transaction),
      expiresAt,
    });
    return {
      confirmationToken: `confirm_${id}.${this.mac(id)}`,
      expiresAt: new Date(expiresAt).toISOString(),
    };
  }

  consume(token: string, transaction: TipTransaction): void {
    const match = /^confirm_([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)$/u.exec(token);
    if (!match?.[1] || !match[2]) throw new Error("invalid confirmation token");
    const expected = Buffer.from(this.mac(match[1]));
    const actual = Buffer.from(match[2]);
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected))
      throw new Error("invalid confirmation token");
    const record = this.pending.get(match[1]);
    if (!record) throw new Error("confirmation token already used or unknown");
    this.pending.delete(match[1]);
    if (record.expiresAt < this.now())
      throw new Error("confirmation token expired");
    if (JSON.stringify(record.transaction) !== JSON.stringify(transaction))
      throw new Error("confirmation inputs changed");
  }

  private mac(id: string): string {
    return createHmac("sha256", this.key).update(id).digest("base64url");
  }
}
