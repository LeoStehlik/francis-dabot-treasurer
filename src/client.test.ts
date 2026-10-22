import { describe, expect, it } from "vitest";
import { TipBotClient } from "./client.js";
import { parseConfig } from "./config.js";
import { MemoryReceiptSink } from "./receipts.js";
import { FakeGateway, FakeRest, IDS } from "./test-fixtures.js";

function harness(overrides: Record<string, unknown> = {}) {
  const config = parseConfig({
    token: "fixture-redaction-sentinel",
    expectedUserId: IDS.user,
    guildId: IDS.guild,
    contextId: IDS.context,
    interactionMode: "dm",
    tipBotApplicationId: IDS.application,
    allowedRecipientIds: [IDS.recipient],
    allowedTokenSymbols: ["MSHL"],
    tipEnabled: true,
    maxPerTip: { MSHL: "42" },
    receiptPath: "/tmp/francis-dabot-test.jsonl",
    ...overrides,
  });
  const rest = new FakeRest();
  const gateway = new FakeGateway();
  const receipts = new MemoryReceiptSink();
  return {
    client: new TipBotClient(config, rest, gateway, receipts),
    rest,
    gateway,
    receipts,
  };
}

describe("identity and lifecycle", () => {
  it("fails closed for a wrong account", async () => {
    const h = harness();
    h.rest.user = { id: IDS.recipient, bot: false };
    await expect(h.client.start()).rejects.toThrow("expectedUserId");
    expect(h.client.isReady()).toBe(false);
  });

  it("fails closed for a bot account", async () => {
    const h = harness();
    h.rest.user = { id: IDS.user, bot: true };
    await expect(h.client.start()).rejects.toThrow("must not be a bot");
  });

  it("starts only after identity, schema and gateway checks", async () => {
    const h = harness();
    await h.client.start();
    expect(h.client.isReady()).toBe(true);
  });
});

describe("read-only tools", () => {
  it("submits exactly once and returns the correlated response", async () => {
    const h = harness();
    await h.client.start();
    const result = await h.client.balance("mshl");
    expect(result.status).toBe("OK");
    expect(h.rest.submissions).toHaveLength(1);
    expect(h.rest.submissions[0]).not.toHaveProperty("guild_id");
    expect((h.rest.submissions[0] as any).data.options).toEqual([
      { type: 3, name: "coin", value: "MSHL" },
    ]);
  });

  it("includes the guild only in explicit guild interaction mode", async () => {
    const h = harness({ interactionMode: "guild" });
    await h.client.start();
    expect((await h.client.help()).status).toBe("OK");
    expect(h.rest.submissions[0]).toMatchObject({ guild_id: IDS.guild });
  });

  it("does not submit when unavailable or token is disallowed", async () => {
    const h = harness();
    expect((await h.client.balances()).status).toBe("UNAVAILABLE");
    await h.client.start();
    expect((await h.client.balance("ALL")).status).toBe("REJECTED");
    expect(h.rest.submissions).toHaveLength(0);
  });

  it.each(["rejected", "unknown"] as const)(
    "maps %s submission without retry",
    async (status) => {
      const h = harness();
      h.rest.submission = {
        status,
        reason: "failed fixture-redaction-sentinel",
      };
      await h.client.start();
      const result = await h.client.help();
      expect(result.status).toBe(
        status === "rejected" ? "REJECTED" : "UNKNOWN",
      );
      expect(result.reason).not.toContain("fixture-redaction-sentinel");
      expect(h.rest.submissions).toHaveLength(1);
    },
  );
});

describe("prepare and at-most-once commit", () => {
  it("does zero network work during prepare and exactly one POST during commit", async () => {
    const h = harness();
    await h.client.start();
    const input = {
      amount: "42",
      token: "MSHL",
      recipientUserId: IDS.recipient,
    };
    const prepared = await h.client.prepareTip(input);
    expect(h.rest.submissions).toHaveLength(0);
    const result = await h.client.commitTip({
      ...input,
      confirmationToken: prepared.confirmationToken,
    });
    expect(result.status).toBe("OK");
    expect(h.rest.submissions).toHaveLength(1);
    expect((h.rest.submissions[0] as any).data.options).toEqual([
      { type: 3, name: "amount", value: "42" },
      { type: 3, name: "coin", value: "MSHL" },
      { type: 3, name: "targets", value: `<@${IDS.recipient}>` },
      { type: 3, name: "mode", value: "EACH" },
    ]);
    expect(h.receipts.receipts.map((receipt) => receipt.phase)).toEqual([
      "prepare",
      "commit",
    ]);
    expect(JSON.stringify(h.receipts.receipts)).not.toContain(
      "fixture-redaction-sentinel",
    );
  });

  it("consumes the token before an uncertain submission and rejects reuse without I/O", async () => {
    const h = harness();
    h.rest.submission = { status: "unknown" };
    await h.client.start();
    const input = {
      amount: "1",
      token: "MSHL",
      recipientUserId: IDS.recipient,
    };
    const prepared = await h.client.prepareTip(input);
    expect(
      (
        await h.client.commitTip({
          ...input,
          confirmationToken: prepared.confirmationToken,
        })
      ).status,
    ).toBe("UNKNOWN");
    await expect(
      h.client.commitTip({
        ...input,
        confirmationToken: prepared.confirmationToken,
      }),
    ).rejects.toThrow("already used");
    expect(h.rest.submissions).toHaveLength(1);
  });

  it("rejects changed inputs and bad tokens before network I/O", async () => {
    const h = harness();
    await h.client.start();
    const prepared = await h.client.prepareTip({
      amount: "1",
      token: "MSHL",
      recipientUserId: IDS.recipient,
    });
    await expect(
      h.client.commitTip({
        amount: "2",
        token: "MSHL",
        recipientUserId: IDS.recipient,
        confirmationToken: prepared.confirmationToken,
      }),
    ).rejects.toThrow("inputs changed");
    await expect(
      h.client.commitTip({
        amount: "1",
        token: "MSHL",
        recipientUserId: IDS.recipient,
        confirmationToken: "bad",
      }),
    ).rejects.toThrow();
    expect(h.rest.submissions).toHaveLength(0);
  });
});
