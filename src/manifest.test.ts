import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("plugin manifest", () => {
  it("owns exactly four tools and declares the token as a secret input", async () => {
    const manifest = JSON.parse(
      await readFile(
        new URL("../openclaw.plugin.json", import.meta.url),
        "utf8",
      ),
    );
    expect(manifest.contracts.tools).toEqual([
      "tipbot_help",
      "tipbot_balance",
      "tipbot_balances",
      "tipbot_tip",
    ]);
    expect(manifest.configContracts.secretInputs.paths).toEqual([
      { path: "token", expected: "string", ownerKind: "capability" },
    ]);
    expect(manifest.configSchema.properties.token.type).toBe("object");
  });
});
