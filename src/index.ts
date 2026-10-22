import { Type } from "typebox";
import { definePluginEntry } from "openclaw/plugin-sdk/plugin-entry";
import { TipBotClient } from "./client.js";
import { parseConfig } from "./config.js";
import { DiscordGateway } from "./discord-gateway.js";
import { DiscordRest } from "./discord-rest.js";
import { JsonlReceiptSink } from "./receipts.js";

function result(value: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(value) }],
    details: value,
  };
}

export default definePluginEntry({
  id: "discord-user-tipbot",
  name: "Discord User TipBot",
  description:
    "Allowlisted TipBot operations through a dedicated Discord user session",
  register(api) {
    let client: TipBotClient | undefined;

    api.registerService({
      id: "discord-user-tipbot-session",
      async start() {
        const config = parseConfig(api.pluginConfig);
        client = new TipBotClient(
          config,
          new DiscordRest(config.token),
          new DiscordGateway(),
          new JsonlReceiptSink(config.receiptPath),
        );
        await client.start();
        api.logger.info(
          "Discord User TipBot session ready for the configured account",
        );
      },
      async stop() {
        await client?.stop();
        client = undefined;
      },
    });

    const register = (name: string, create: () => unknown) =>
      api.registerTool(
        {
          contextVersion: 2,
          create: () => (client?.isReady() ? create() : null),
        } as any,
        { name },
      );

    register("tipbot_help", () => ({
      name: "tipbot_help",
      description: "Get TipBot help through the dedicated Discord user session",
      parameters: Type.Object({}, { additionalProperties: false }),
      async execute() {
        if (!client) throw new Error("TipBot service is unavailable");
        return result(await client.help());
      },
    }));

    register("tipbot_balance", () => ({
      name: "tipbot_balance",
      description: "Get one allowlisted TipBot token balance",
      parameters: Type.Object(
        { token: Type.String({ minLength: 1, maxLength: 20 }) },
        { additionalProperties: false },
      ),
      async execute(_id: string, params: { token: string }) {
        if (!client) throw new Error("TipBot service is unavailable");
        return result(await client.balance(params.token));
      },
    }));

    register("tipbot_balances", () => ({
      name: "tipbot_balances",
      description: "Get all TipBot balances",
      parameters: Type.Object({}, { additionalProperties: false }),
      async execute() {
        if (!client) throw new Error("TipBot service is unavailable");
        return result(await client.balances());
      },
    }));

    register("tipbot_tip", () => ({
      name: "tipbot_tip",
      description: "Prepare or commit one allowlisted TipBot transfer",
      executionMode: "sequential" as const,
      parameters: Type.Object(
        {
          action: Type.Union([Type.Literal("prepare"), Type.Literal("commit")]),
          amount: Type.String({ minLength: 1, maxLength: 80 }),
          token: Type.String({ minLength: 1, maxLength: 20 }),
          recipientUserId: Type.String({ pattern: "^[0-9]{17,20}$" }),
          confirmationToken: Type.Optional(
            Type.String({ minLength: 1, maxLength: 256 }),
          ),
        },
        { additionalProperties: false },
      ),
      async execute(
        _id: string,
        params: {
          action: "prepare" | "commit";
          amount: string;
          token: string;
          recipientUserId: string;
          confirmationToken?: string;
        },
      ) {
        if (!client) throw new Error("TipBot service is unavailable");
        if (params.action === "prepare")
          return result(await client.prepareTip(params));
        if (!params.confirmationToken)
          throw new Error("confirmationToken is required for commit");
        return result(
          await client.commitTip({
            ...params,
            confirmationToken: params.confirmationToken,
          }),
        );
      },
    }));
  },
});
