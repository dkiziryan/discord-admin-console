import { getPrismaClient } from "../../utils/prismaClient";

type DiscordTokenResponse = {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token?: string;
  scope: string;
};

type DiscordUserResponse = {
  id: string;
  username: string;
  avatar: string | null;
};

type DiscordOAuthConfig = {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
};

export type DiscordAuthUser = {
  discordUserId: string;
  username: string;
  avatarUrl: string | null;
};

const DISCORD_API_BASE_URL = "https://discord.com/api/v10";

const getDiscordOAuthConfig = (): DiscordOAuthConfig => {
  const clientId = process.env.DISCORD_CLIENT_ID;
  const clientSecret = process.env.DISCORD_CLIENT_SECRET;
  const redirectUri = process.env.DISCORD_OAUTH_REDIRECT_URI;

  if (!clientId) {
    throw new Error(
      "Missing DISCORD_CLIENT_ID environment variable. Add it to your environment.",
    );
  }

  if (!clientSecret) {
    throw new Error(
      "Missing DISCORD_CLIENT_SECRET environment variable. Add it to your environment.",
    );
  }

  if (!redirectUri) {
    throw new Error(
      "Missing DISCORD_OAUTH_REDIRECT_URI environment variable. Add it to your environment.",
    );
  }

  return {
    clientId,
    clientSecret,
    redirectUri,
  };
};

export const buildDiscordLoginUrl = (state: string): string => {
  const { clientId, redirectUri } = getDiscordOAuthConfig();
  const params = new URLSearchParams({
    client_id: clientId,
    response_type: "code",
    redirect_uri: redirectUri,
    scope: "identify",
    prompt: "consent",
    state,
  });

  return `${DISCORD_API_BASE_URL}/oauth2/authorize?${params.toString()}`;
};

export const authenticateDiscordUser = async (
  code: string,
): Promise<DiscordAuthUser> => {
  const prisma = await getPrismaClient();
  const { clientId, clientSecret, redirectUri } = getDiscordOAuthConfig();
  const tokenResponse = await fetch(`${DISCORD_API_BASE_URL}/oauth2/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
    }),
  });

  if (!tokenResponse.ok) {
    throw new Error("Discord token exchange failed.");
  }

  const tokenData = (await tokenResponse.json()) as DiscordTokenResponse;
  const userResponse = await fetch(`${DISCORD_API_BASE_URL}/users/@me`, {
    headers: {
      Authorization: `Bearer ${tokenData.access_token}`,
    },
  });

  if (!userResponse.ok) {
    throw new Error("Failed to fetch Discord user profile.");
  }

  const userData = (await userResponse.json()) as DiscordUserResponse;
  const avatarUrl = buildDiscordAvatarUrl(userData);

  await prisma.user.upsert({
    where: { discordUserId: userData.id },
    update: {
      username: userData.username,
      avatarUrl,
      lastLoginAt: new Date(),
    },
    create: {
      discordUserId: userData.id,
      username: userData.username,
      avatarUrl,
      lastLoginAt: new Date(),
    },
  });

  return {
    discordUserId: userData.id,
    username: userData.username,
    avatarUrl,
  };
};

const buildDiscordAvatarUrl = (
  user: DiscordUserResponse,
): string | null => {
  if (!user.avatar) {
    return null;
  }

  return `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png`;
};
