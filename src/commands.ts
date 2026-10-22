import type {
  ApplicationCommand,
  CommandIndex,
  CommandOption,
  InvocationOption,
  PluginConfig,
  TipTransaction,
} from "./types.js";

const EXPECTED: Record<
  string,
  Array<{ name: string; type: number; required: boolean; choices?: string[] }>
> = {
  help: [],
  balance: [{ name: "coin", type: 3, required: true }],
  balances: [],
  tip: [
    { name: "amount", type: 3, required: true },
    { name: "coin", type: 3, required: true },
    { name: "targets", type: 3, required: true },
    { name: "mode", type: 3, required: false, choices: ["EACH", "SPLIT"] },
  ],
};

export class SchemaMismatchError extends Error {}

export function resolveCommands(
  index: CommandIndex,
  applicationId: string,
): Record<string, ApplicationCommand> {
  const all = index.application_commands;
  if (!Array.isArray(all))
    throw new SchemaMismatchError("application command index missing");
  const resolved: Record<string, ApplicationCommand> = {};
  for (const name of Object.keys(EXPECTED)) {
    const matches = all.filter(
      (command) =>
        command.application_id === applicationId && command.name === name,
    );
    if (matches.length !== 1)
      throw new SchemaMismatchError(`expected one ${name} command`);
    const command = matches[0];
    if (!command) throw new SchemaMismatchError(`missing ${name}`);
    validateCommand(command, EXPECTED[name] ?? []);
    resolved[name] = command;
  }
  return resolved;
}

function validateCommand(
  command: ApplicationCommand,
  expected: Array<{
    name: string;
    type: number;
    required: boolean;
    choices?: string[];
  }>,
): void {
  if (!/^\d{17,20}$/u.test(command.id) || !/^\d{17,20}$/u.test(command.version))
    throw new SchemaMismatchError(`${command.name} has invalid ids`);
  const options = command.options ?? [];
  if (options.length !== expected.length)
    throw new SchemaMismatchError(`${command.name} option count changed`);
  for (let index = 0; index < expected.length; index += 1) {
    const actual = options[index];
    const wanted = expected[index];
    if (
      !actual ||
      !wanted ||
      actual.name !== wanted.name ||
      actual.type !== wanted.type ||
      Boolean(actual.required) !== wanted.required
    ) {
      throw new SchemaMismatchError(`${command.name} option schema changed`);
    }
    if (wanted.choices && !sameChoices(actual, wanted.choices))
      throw new SchemaMismatchError(
        `${command.name}.${wanted.name} choices changed`,
      );
  }
}

function sameChoices(option: CommandOption, expected: string[]): boolean {
  const values = (option.choices ?? []).map((choice) => choice.value);
  return (
    values.length === expected.length &&
    expected.every((value) => values.includes(value))
  );
}

export function commandOptions(
  name: string,
  input: Record<string, string | undefined>,
): InvocationOption[] {
  const schema = EXPECTED[name];
  if (!schema) throw new SchemaMismatchError("command is not allowlisted");
  return schema.flatMap((option) => {
    const value = input[option.name];
    if (value === undefined) {
      if (option.required) throw new Error(`missing ${option.name}`);
      return [];
    }
    return [{ type: option.type, name: option.name, value }];
  });
}

const DECIMAL = /^(0|[1-9]\d*)(\.\d+)?$/u;

export function normalizeTip(
  input: { amount: string; token: string; recipientUserId: string },
  config: PluginConfig,
): TipTransaction {
  if (!config.tipEnabled) throw new Error("tip is disabled");
  if (!DECIMAL.test(input.amount) || decimalCompare(input.amount, "0") <= 0)
    throw new Error("invalid amount");
  const amount = normalizeDecimal(input.amount);
  const token = input.token.toUpperCase();
  if (token === "ALL" || !config.allowedTokenSymbols.includes(token))
    throw new Error("token is not allowed");
  if (
    !/^\d{17,20}$/u.test(input.recipientUserId) ||
    !config.allowedRecipientIds.includes(input.recipientUserId)
  ) {
    throw new Error("recipient is not allowed");
  }
  const maximum = config.maxPerTip[token];
  if (!maximum || !DECIMAL.test(maximum) || decimalCompare(amount, maximum) > 0)
    throw new Error("amount exceeds configured limit");
  return {
    amount,
    token,
    recipientUserId: input.recipientUserId,
    split: "EACH",
    ping: "NO",
  };
}

export function tipOptions(transaction: TipTransaction): InvocationOption[] {
  return commandOptions("tip", {
    amount: transaction.amount,
    coin: transaction.token,
    targets: `<@${transaction.recipientUserId}>`,
    mode: transaction.split,
  });
}

export function normalizeDecimal(value: string): string {
  const [whole = "0", fraction = ""] = value.split(".");
  const normalizedWhole = whole.replace(/^0+(?=\d)/u, "");
  const normalizedFraction = fraction.replace(/0+$/u, "");
  return normalizedFraction
    ? `${normalizedWhole}.${normalizedFraction}`
    : normalizedWhole;
}

export function decimalCompare(left: string, right: string): number {
  const [lw = "0", lf = ""] = normalizeDecimal(left).split(".");
  const [rw = "0", rf = ""] = normalizeDecimal(right).split(".");
  if (lw.length !== rw.length) return lw.length > rw.length ? 1 : -1;
  if (lw !== rw) return lw > rw ? 1 : -1;
  const width = Math.max(lf.length, rf.length);
  const lp = lf.padEnd(width, "0");
  const rp = rf.padEnd(width, "0");
  return lp === rp ? 0 : lp > rp ? 1 : -1;
}
