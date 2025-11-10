const DEFAULT_BOT_INVITE_URL =
  "https://discord.com/oauth2/authorize?client_id=1436087765489160394&permissions=268504082&scope=bot";

export const BOT_INVITE_URL =
  import.meta.env.VITE_BOT_INVITE_URL ?? DEFAULT_BOT_INVITE_URL;
