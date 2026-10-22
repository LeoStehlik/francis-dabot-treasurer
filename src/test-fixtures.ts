import type {
  ApplicationCommand,
  CommandIndex,
  GatewayLike,
  GatewayResult,
  RestLike,
} from "./types.js";

const id = (digit: string) => digit.repeat(18);

export const IDS = {
  user: id("1"),
  guild: id("2"),
  context: id("3"),
  application: id("4"),
  recipient: id("5"),
  help: id("6"),
  balance: id("7"),
  balances: id("8"),
  tip: id("9"),
  version: `1${"0".repeat(17)}`,
};

const option = (name: string, required: boolean, choices?: string[]) => ({
  type: 3,
  name,
  required,
  ...(choices
    ? { choices: choices.map((value) => ({ name: value, value })) }
    : {}),
});

export function commandIndex(): CommandIndex {
  const command = (
    name: string,
    commandId: string,
    options: ReturnType<typeof option>[],
  ): ApplicationCommand => ({
    id: commandId,
    application_id: IDS.application,
    version: IDS.version,
    name,
    type: 1,
    options,
  });
  return {
    application_commands: [
      command("help", IDS.help, []),
      command("balance", IDS.balance, [option("coin", true)]),
      command("balances", IDS.balances, []),
      command("tip", IDS.tip, [
        option("amount", true),
        option("coin", true),
        option("targets", true),
        option("mode", false, ["EACH", "SPLIT"]),
      ]),
    ],
  };
}

export class FakeRest implements RestLike {
  user = { id: IDS.user, bot: false };
  index = commandIndex();
  submissions: unknown[] = [];
  submission: { status: "accepted" | "rejected" | "unknown"; reason?: string } =
    { status: "accepted" };
  async currentUser() {
    return this.user;
  }
  async discoverCommands() {
    return this.index;
  }
  async submitInteraction(body: unknown) {
    this.submissions.push(structuredClone(body));
    return this.submission;
  }
}

export class FakeGateway implements GatewayLike {
  ready = true;
  session = "session-1";
  transmitted: string[] = [];
  result: Omit<GatewayResult, "nonce"> = {
    kind: "success",
    interactionId: IDS.tip,
    messageId: IDS.balance,
    content: "ok",
  };
  async start() {}
  async stop() {
    this.ready = false;
  }
  isReady() {
    return this.ready;
  }
  sessionId() {
    return this.session;
  }
  waitForInteraction(nonce: string) {
    return Promise.resolve({ nonce, ...this.result });
  }
  markTransmitted(nonce: string) {
    this.transmitted.push(nonce);
  }
}
