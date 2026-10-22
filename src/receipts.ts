import { mkdir, open } from "node:fs/promises";
import path from "node:path";
import type { Receipt, ReceiptSink } from "./types.js";

export class JsonlReceiptSink implements ReceiptSink {
  constructor(private readonly filePath: string) {}

  async append(receipt: Receipt): Promise<void> {
    await mkdir(path.dirname(this.filePath), { recursive: true, mode: 0o700 });
    const handle = await open(this.filePath, "a", 0o600);
    try {
      await handle.chmod(0o600);
      await handle.appendFile(`${JSON.stringify(receipt)}\n`, "utf8");
      await handle.sync();
    } finally {
      await handle.close();
    }
  }
}

export class MemoryReceiptSink implements ReceiptSink {
  readonly receipts: Receipt[] = [];
  async append(receipt: Receipt): Promise<void> {
    this.receipts.push(structuredClone(receipt));
  }
}
