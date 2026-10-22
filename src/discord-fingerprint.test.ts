import { describe, expect, it } from "vitest";
import {
  CLIENT_BUILD_NUMBER,
  DiscordFingerprint,
} from "./discord-fingerprint.js";

describe("Discord browser fingerprint", () => {
  it("adds bounded browser headers without embedding the credential", () => {
    const token = "fixture-token-that-is-not-real";
    const headers = new DiscordFingerprint().headers(token, true);
    const properties = JSON.parse(
      Buffer.from(headers["X-Super-Properties"] ?? "", "base64").toString(
        "utf8",
      ),
    );

    expect(headers.Authorization).toBe(token);
    expect(headers["Content-Type"]).toBe("application/json");
    expect(properties.client_build_number).toBe(CLIENT_BUILD_NUMBER);
    expect(properties.browser).toBe("Chrome");
    expect(JSON.stringify(properties)).not.toContain(token);
  });

  it("bootstraps anonymous session headers without leaking cookie attributes", () => {
    const fingerprint = new DiscordFingerprint();
    expect(fingerprint.headers(undefined, false).Authorization).toBeUndefined();

    fingerprint.setAnonymousSession("fixture-fingerprint", [
      "__dcfduid=first; Path=/; Secure; HttpOnly",
      "_cfuvid=second; Path=/; Secure",
      "unrelated=ignored; Path=/",
    ]);
    const headers = fingerprint.headers("fixture-token", false);

    expect(headers["X-Fingerprint"]).toBe("fixture-fingerprint");
    expect(headers.Cookie).toBe("__dcfduid=first; _cfuvid=second");
    expect(headers.Cookie).not.toContain("Path");
    expect(headers.Cookie).not.toContain("unrelated");
  });

  it("adds browser mutation provenance only when explicitly requested", () => {
    const fingerprint = new DiscordFingerprint();
    const readHeaders = fingerprint.headers("fixture-token", false);
    const mutationHeaders = fingerprint.headers("fixture-token", true, {
      referer: "https://discord.com/channels/123/456",
      mutation: true,
    });

    expect(readHeaders.Origin).toBeUndefined();
    expect(mutationHeaders.Origin).toBe("https://discord.com");
    expect(mutationHeaders.Referer).toBe(
      "https://discord.com/channels/123/456",
    );
    expect(mutationHeaders["Sec-CH-UA-Platform"]).toBe('"Linux"');
  });
});
