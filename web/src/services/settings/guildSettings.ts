import type {
  GuildWorkflowSettings,
  GuildWorkflowSettingsResponse,
  UpdateGuildWorkflowSettingsRequest,
} from "../../models/types";
import { apiJson } from "../apiClient";

export const fetchGuildWorkflowSettings = async (): Promise<GuildWorkflowSettings> => {
  const payload = await apiJson<GuildWorkflowSettingsResponse>(
    "/api/guild-settings",
    {
      errorMessage: "Failed to load workflow defaults.",
    },
  );

  return payload.settings;
};

export const saveGuildWorkflowSettings = async (
  settings: UpdateGuildWorkflowSettingsRequest,
): Promise<GuildWorkflowSettings> => {
  const payload = await apiJson<GuildWorkflowSettingsResponse>(
    "/api/guild-settings",
    {
      errorMessage: "Failed to save workflow defaults.",
      method: "POST",
      json: settings,
    },
  );

  return payload.settings;
};
