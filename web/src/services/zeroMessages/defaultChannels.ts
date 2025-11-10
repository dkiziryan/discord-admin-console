import type { DefaultChannelsResponse } from "../../models/types";
import { apiJson } from "../apiClient";

export const fetchDefaultChannels = async (): Promise<string[]> => {
  const payload = await apiJson<DefaultChannelsResponse>(
    "/api/default-channels",
    {
      errorMessage: "Failed to load default channels.",
    },
  );
  return payload.channels;
};
