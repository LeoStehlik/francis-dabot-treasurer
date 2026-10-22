import { describe, expect, it } from "vitest";
import {
  decimalCompare,
  normalizeTip,
  resolveCommands,
  SchemaMismatchError,
} from "./commands.js";
import { parseConfig } from "./config.js";
import { commandIndex, IDS } from "./test-fixtures.js";

const config = () =>
  parseConfig({
    token: "resolved-at-runtime",
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
  });

describe("command schema", () => {
  it("discovers ids instead of hardcoding them", () => {
    const commands = resolveCommands(commandIndex(), IDS.application);
    expect(commands.tip?.id).toBe(IDS.tip);
  });

  it.each([
    [
      "changed application",
      (index: any) => {
        index.application_commands[0].application_id = IDS.user;
      },
    ],
    [
      "renamed command",
      (index: any) => {
        index.application_commands[0].name = "assist";
      },
    ],
    [
      "missing option",
      (index: any) => {
        index.application_commands[3].options.pop();
      },
    ],
    [
      "changed option type",
      (index: any) => {
        index.application_commands[1].options[0].type = 6;
      },
    ],
    [
      "unexpected option",
      (index: any) => {
        index.application_commands[2].options.push({ name: "evil", type: 3 });
      },
    ],
  ])("rejects %s", (_label, mutate) => {
    const index = commandIndex();
    mutate(index);
    expect(() => resolveCommands(index, IDS.application)).toThrow(
      SchemaMismatchError,
    );
  });
});

describe("tip policy", () => {
  it("normalizes one allowed transaction", () => {
    expect(
      normalizeTip(
        { amount: "42.000", token: "mshl", recipientUserId: IDS.recipient },
        config(),
      ),
    ).toEqual({
      amount: "42",
      token: "MSHL",
      recipientUserId: IDS.recipient,
      split: "EACH",
      ping: "NO",
    });
  });

  it.each(["ALL", "1e3", "1,000", "-1", "0", " 1", "1.2.3"])(
    "rejects unsafe amount/token %s",
    (value) => {
      const input =
        value === "ALL"
          ? { amount: "1", token: value, recipientUserId: IDS.recipient }
          : { amount: value, token: "MSHL", recipientUserId: IDS.recipient };
      expect(() => normalizeTip(input, config())).toThrow();
    },
  );

  it("rejects role-shaped, multiple, unknown recipients and amounts above cap", () => {
    for (const recipientUserId of [
      `<@&${IDS.recipient}>`,
      `${IDS.recipient},${IDS.user}`,
      IDS.user,
    ]) {
      expect(() =>
        normalizeTip({ amount: "1", token: "MSHL", recipientUserId }, config()),
      ).toThrow();
    }
    expect(() =>
      normalizeTip(
        { amount: "42.01", token: "MSHL", recipientUserId: IDS.recipient },
        config(),
      ),
    ).toThrow();
    expect(
      decimalCompare("100000000000000000000", "99999999999999999999"),
    ).toBe(1);
  });
});
