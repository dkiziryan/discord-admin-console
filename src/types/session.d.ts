import "express-session";

declare module "express-session" {
  interface SessionData {
    authUser?: {
      discordUserId: string;
      username: string;
      avatarUrl: string | null;
      isAuthorized: boolean;
      authorizedGuilds: {
        id: string;
        name: string;
      }[];
      selectedGuildId: string | null;
    };
    oauthState?: string;
  }
}
