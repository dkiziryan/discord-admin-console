import { useEffect, useState } from "react";

import {
  fetchCurrentAuthState,
  logout,
  selectGuild,
  type AuthState,
} from "../services/auth/auth";

export const useAuthState = () => {
  const [authState, setAuthState] = useState<AuthState>({ status: "loading" });
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    const loadAuthState = async () => {
      try {
        const nextAuthState = await fetchCurrentAuthState();
        if (isMounted) {
          setAuthState(nextAuthState);
          setAuthError(null);
        }
      } catch (error) {
        if (isMounted) {
          setAuthState({ status: "unauthenticated" });
          setAuthError((error as Error).message);
        }
      }
    };

    void loadAuthState();

    return () => {
      isMounted = false;
    };
  }, []);

  const handleLogout = async () => {
    try {
      await logout();
      setAuthState({ status: "unauthenticated" });
      setAuthError(null);
      return true;
    } catch (error) {
      setAuthError((error as Error).message);
      return false;
    }
  };

  const handleSelectGuild = async (guildId: string) => {
    try {
      const user = await selectGuild(guildId);
      setAuthState({
        status: user.isAuthorized ? "authorized" : "unauthorized",
        user,
      });
      setAuthError(null);
    } catch (error) {
      setAuthError((error as Error).message);
    }
  };

  return {
    authError,
    authState,
    logout: handleLogout,
    selectGuild: handleSelectGuild,
  };
};
