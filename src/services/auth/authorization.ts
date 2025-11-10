import { PermissionsBitField } from "discord.js";
import type { Client } from "discord.js";

export type AuthorizedGuild = {
  id: string;
  name: string;
};

export type AuthorizationResult = {
  isAuthorized: boolean;
  reason: "guild_manager" | "missing_required_permission" | "not_in_guild";
};

const REQUIRED_TOOL_PERMISSIONS = [
  PermissionsBitField.Flags.Administrator,
  PermissionsBitField.Flags.ManageGuild,
  PermissionsBitField.Flags.ManageRoles,
  PermissionsBitField.Flags.ManageChannels,
  PermissionsBitField.Flags.KickMembers,
];

const hasRequiredToolPermission = (permissions: PermissionsBitField): boolean =>
  REQUIRED_TOOL_PERMISSIONS.some((permission) =>
    permissions.has(permission),
  );

export const authorizeDiscordUser = async (
  client: Client,
  guildId: string,
  discordUserId: string,
): Promise<AuthorizationResult> => {
  const guild = await client.guilds.fetch(guildId);
  const member = await guild.members.fetch(discordUserId).catch(() => null);

  if (!member) {
    return {
      isAuthorized: false,
      reason: "not_in_guild",
    };
  }

  if (hasRequiredToolPermission(member.permissions)) {
    return {
      isAuthorized: true,
      reason: "guild_manager",
    };
  }

  return {
    isAuthorized: false,
    reason: "missing_required_permission",
  };
};

export const listAuthorizedGuilds = async (
  client: Client,
  discordUserId: string,
): Promise<AuthorizedGuild[]> => {
  const authorizedGuilds: AuthorizedGuild[] = [];
  const guilds = await client.guilds.fetch();

  for (const oauthGuild of guilds.values()) {
    const guild = await oauthGuild.fetch();
    const member = await guild.members.fetch(discordUserId).catch(() => null);

    if (!member) {
      continue;
    }

    if (hasRequiredToolPermission(member.permissions)) {
      authorizedGuilds.push({
        id: guild.id,
        name: guild.name,
      });
    }
  }

  return authorizedGuilds.sort((a, b) => a.name.localeCompare(b.name));
};
