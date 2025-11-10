import { apiResponse, apiVoid } from "../apiClient";

export type AuthorizedGuild = {
  id: string;
  name: string;
};

export type AuthUser = {
  discordUserId: string;
  username: string;
  avatarUrl: string | null;
  isAuthorized: boolean;
  authorizedGuilds: AuthorizedGuild[];
  selectedGuildId: string | null;
};

export type AuthState =
  | { status: "loading" }
  | { status: "unauthenticated" }
  | { status: "unauthorized"; user: AuthUser }
  | { status: "authorized"; user: AuthUser };

type AuthMeResponse = {
  user: AuthUser;
};

export const fetchCurrentAuthState = async (): Promise<AuthState> => {
  const response = await apiResponse("/auth/me", {
    allowedStatuses: [401],
    errorMessage: "Failed to load authentication status.",
  });

  if (response.status === 401) {
    return { status: "unauthenticated" };
  }
  const payload: AuthMeResponse = await response.json();
  if (!payload.user.isAuthorized) {
    return {
      status: "unauthorized",
      user: payload.user,
    };
  }

  return {
    status: "authorized",
    user: payload.user,
  };
};

export const logout = async (): Promise<void> => {
  await apiVoid("/auth/logout", {
    errorMessage: "Failed to log out.",
    method: "POST",
  });
};

export const selectGuild = async (guildId: string): Promise<AuthUser> => {
  const response = await apiResponse("/auth/guild/select", {
    errorMessage: "Failed to select server.",
    json: { guildId },
    method: "POST",
  });
  const payload: AuthMeResponse = await response.json();
  return payload.user;
};
