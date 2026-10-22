import { describe, expect, it } from "vitest";
import { createNonce, DiscordGateway } from "./discord-gateway.js";

describe("gateway interaction correlation", () => {
  it("creates unique snowflake-shaped numeric nonces", () => {
    const first = createNonce();
    const second = createNonce();
    expect(first).toMatch(/^\d{17,20}$/u);
    expect(BigInt(second)).toBeGreaterThan(BigInt(first));
  });

  it("ignores unrelated and out-of-order events, then correlates by nonce and interaction id", async () => {
    const gateway = new DiscordGateway();
    const result = gateway.waitForInteraction("wanted", 2000);
    gateway.markTransmitted("wanted");
    gateway.acceptDispatch("INTERACTION_SUCCESS", {
      id: "999999999999999999",
      nonce: "other",
    });
    gateway.acceptDispatch("MESSAGE_CREATE", {
      id: "888888888888888888",
      interaction: { id: "777777777777777777" },
      content: "early",
    });
    gateway.acceptDispatch("INTERACTION_SUCCESS", {
      id: "777777777777777777",
      nonce: "wanted",
    });
    expect(await result).toMatchObject({
      kind: "success",
      nonce: "wanted",
      content: "early",
    });
  });

  it("uses the latest update and bounds/redacts output", async () => {
    const gateway = new DiscordGateway();
    const result = gateway.waitForInteraction("n", 2000);
    gateway.markTransmitted("n");
    gateway.acceptDispatch("INTERACTION_SUCCESS", {
      id: "777777777777777777",
      nonce: "n",
    });
    gateway.acceptDispatch("MESSAGE_CREATE", {
      id: "888888888888888888",
      interaction: { id: "777777777777777777" },
      content: "loading",
    });
    gateway.acceptDispatch("MESSAGE_UPDATE", {
      id: "888888888888888888",
      content: `done mfa.${"x".repeat(40)}${"z".repeat(5000)}`,
    });
    const final = await result;
    expect(final.content).toContain("[REDACTED]");
    expect(final.content?.length).toBeLessThanOrEqual(4110);
  });

  it("returns failure and response timeout without resubmission machinery", async () => {
    const failed = new DiscordGateway();
    const failure = failed.waitForInteraction("f", 1000);
    failed.acceptDispatch("INTERACTION_FAILURE", {
      id: "777777777777777777",
      nonce: "f",
      reason_code: 18,
    });
    expect(await failure).toMatchObject({
      kind: "failure",
      reason: "Discord reason 18",
    });
    const timed = new DiscordGateway();
    const timeout = timed.waitForInteraction("t", 20);
    timed.markTransmitted("t");
    timed.acceptDispatch("INTERACTION_SUCCESS", {
      id: "777777777777777777",
      nonce: "t",
    });
    expect(await timeout).toMatchObject({ kind: "unknown_response" });
  });
});
