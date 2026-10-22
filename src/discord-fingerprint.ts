import { randomUUID } from "node:crypto";

const CLIENT_BUILD_NUMBER = 580_004;
const CLIENT_BROWSER_VERSION = "155.0.0.0";
const USER_AGENT =
  `Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 ` +
  `(KHTML, like Gecko) Chrome/${CLIENT_BROWSER_VERSION} Safari/537.36`;
const SESSION_COOKIE_NAMES = new Set(["__dcfduid", "__sdcfduid", "_cfuvid"]);

export class DiscordFingerprint {
  private readonly superProperties: string;
  private anonymousFingerprint?: string;
  private cookieHeader: string | undefined;

  constructor() {
    this.superProperties = Buffer.from(
      JSON.stringify({
        os: "Linux",
        browser: "Chrome",
        device: "",
        system_locale: "en-US",
        browser_user_agent: USER_AGENT,
        browser_version: CLIENT_BROWSER_VERSION,
        os_version: "",
        referrer: "",
        referring_domain: "",
        referrer_current: "",
        referring_domain_current: "",
        release_channel: "stable",
        client_build_number: CLIENT_BUILD_NUMBER,
        client_event_source: null,
        has_client_mods: false,
        client_launch_id: randomUUID(),
        launch_signature: randomUUID(),
        client_app_state: "focused",
        client_heartbeat_session_id: randomUUID(),
      }),
      "utf8",
    ).toString("base64");
  }

  setAnonymousSession(
    fingerprint: string,
    setCookieHeaders: readonly string[],
  ): void {
    if (!fingerprint || fingerprint.length > 512)
      throw new Error("Discord returned an invalid anonymous fingerprint");
    this.anonymousFingerprint = fingerprint;
    const cookies = setCookieHeaders
      .map((header) => header.split(";", 1)[0]?.trim())
      .filter((cookie): cookie is string => {
        if (!cookie) return false;
        const separator = cookie.indexOf("=");
        if (separator <= 0) return false;
        return SESSION_COOKIE_NAMES.has(cookie.slice(0, separator));
      });
    this.cookieHeader = cookies.length > 0 ? cookies.join("; ") : undefined;
  }

  headers(
    token: string | undefined,
    json: boolean,
    page?: { referer: string; mutation: boolean },
  ): Record<string, string> {
    return {
      Accept: "*/*",
      "Accept-Language": "en-US,en;q=0.9",
      Referer: page?.referer ?? "https://discord.com/channels/@me",
      Priority: "u=1, i",
      "Sec-CH-UA":
        '"Not;A=Brand";v="8", "Chromium";v="155", "Google Chrome";v="155"',
      "Sec-CH-UA-Mobile": "?0",
      "Sec-CH-UA-Platform": '"Linux"',
      "Sec-Fetch-Dest": "empty",
      "Sec-Fetch-Mode": "cors",
      "Sec-Fetch-Site": "same-origin",
      "User-Agent": USER_AGENT,
      "X-Discord-Locale": "en-US",
      "X-Discord-Timezone": "Europe/Prague",
      "X-Super-Properties": this.superProperties,
      ...(token ? { Authorization: token } : {}),
      ...(this.anonymousFingerprint
        ? { "X-Fingerprint": this.anonymousFingerprint }
        : {}),
      ...(this.cookieHeader ? { Cookie: this.cookieHeader } : {}),
      ...(page?.mutation ? { Origin: "https://discord.com" } : {}),
      ...(json ? { "Content-Type": "application/json" } : {}),
    };
  }
}

export { CLIENT_BUILD_NUMBER };
