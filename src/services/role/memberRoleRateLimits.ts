import type { RateLimitData } from "@discordjs/rest";
import type { Client } from "discord.js";

export const observeMemberRoleRateLimits = (
  client: Client, guildId: string, onWait: (until: string) => void,
): (() => void) => {
  const listener = (limit: RateLimitData) => {
    if (!limit.global && !limit.url.includes(`/guilds/${guildId}/members`)) return;
    const waitMs = Math.max(limit.retryAfter, limit.timeToReset, limit.sublimitTimeout);
    if (Number.isFinite(waitMs) && waitMs > 0) onWait(new Date(Date.now() + waitMs).toISOString());
  };
  client.rest.on("rateLimited", listener);
  return () => { client.rest.off("rateLimited", listener); };
};
