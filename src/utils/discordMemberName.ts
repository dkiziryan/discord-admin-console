import type { GuildMember } from "discord.js";

export const formatDiscordName = (member: GuildMember): string => {
  const displayName = member.displayName;
  const tag = member.user.tag;

  if (displayName && displayName !== tag) {
    return `${displayName} (${tag})`;
  }

  return tag;
};
