import { Client, Events, GatewayIntentBits, Message } from "discord.js";
import dotenv from "dotenv";

import { startHttpServer } from "./server";
import { cleanupEmptyRoles } from "./services/role/roleCleanup";
import { isRoleCleanupConfirmation } from "./services/role/roleCleanupConfirmation";

dotenv.config();

const ADMIN_CHAT_COMMANDS = {
  healthCheck: "?testing",
  cleanupRoles: "?cleanuproles",
} as const;

type BotContext = {
  client: Client;
  guildId: string;
  logger?: Pick<Console, "log">;
};

export const handleMessageCreate = (message: Message, context: BotContext) => {
  if (message.author.bot) {
    return;
  }

  const content = message.content.trim().toLowerCase();

  if (content === ADMIN_CHAT_COMMANDS.healthCheck) {
    context.logger?.log(
      `[${new Date().toISOString()}] Admin chat health check received`,
    );
    void message.reply("Testing command received. Bot is online.");
    return;
  }

  if (content === ADMIN_CHAT_COMMANDS.cleanupRoles) {
    void handleCleanupRolesCommand(message, context);
  }
};

const ROLE_CLEANUP_CONFIRMATION_TIMEOUT_MS = 30_000;

const handleCleanupRolesCommand = async (
  message: Message,
  context: BotContext,
) => {
  const { client, guildId } = context;

  if (!message.inGuild()) {
    await message.reply("This command can only be used inside a server.");
    return;
  }

  if (message.guildId !== guildId) {
    await message.reply("This command is disabled for this server.");
    return;
  }

  try {
    const preview = await cleanupEmptyRoles(client, { guildId, dryRun: true });

    if (preview.deletableRoleCount === 0) {
      await message.reply("No empty roles were found to remove.");
      return;
    }

    const previewList =
      preview.previewNames.length > 0
        ? `${preview.previewNames.join(", ")}${preview.moreCount > 0 ? ` ...and ${preview.moreCount} more` : ""}`
        : "(role names unavailable)";

    const prompt = await message.reply(
      `Found ${preview.deletableRoleCount} empty role(s): ${previewList}. ` +
        `Reply directly to this message with "yes" to delete them or "no" to cancel within 30 seconds.`,
    );

    const responses = await message.channel.awaitMessages({
      filter: (response) =>
        isRoleCleanupConfirmation({
          responseAuthorId: response.author.id,
          expectedAuthorId: message.author.id,
          responseContent: response.content,
          responseReferenceMessageId: response.reference?.messageId ?? null,
          promptMessageId: prompt.id,
        }),
      max: 1,
      time: ROLE_CLEANUP_CONFIRMATION_TIMEOUT_MS,
    });

    const confirmation = responses.first();
    if (!confirmation) {
      await message.channel.send(
        "Role removal timed out without confirmation.",
      );
      return;
    }

    const normalized = confirmation.content.trim().toLowerCase();
    if (!["yes", "y"].includes(normalized)) {
      await message.channel.send("Role removal cancelled.");
      return;
    }

    const result = await cleanupEmptyRoles(client, { guildId, dryRun: false });
    const summary =
      result.deletedRoleCount > 0
        ? `Deleted ${result.deletedRoleCount} empty role(s).`
        : "No roles were deleted.";
    const failureNote =
      result.failures.length > 0
        ? ` Issues encountered: ${result.failures.join("; ")}`
        : "";

    await message.channel.send(`${summary}${failureNote}`);
  } catch (error) {
    await message.channel.send(
      `Failed to remove roles: ${(error as Error).message}`,
    );
  }
};

const createClient = (): Client =>
  new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMembers,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
    ],
  });

export const verifyDatabaseConnection = async (): Promise<void> => {
  const { prisma } = require("./lib/prisma");
  await prisma.$queryRaw`SELECT 1`;
};

const verifyGuildSettings = async (guildId: string): Promise<void> => {
  const { ensureGuildSettings } = require("./services/guildSettings");
  await ensureGuildSettings(guildId);
};

const main = async () => {
  const token = process.env.DISCORD_TOKEN;
  const guildId = process.env.DISCORD_GUILD_ID;
  const httpPort = Number.parseInt(process.env.HTTP_PORT ?? "3001", 10);

  if (!token) {
    throw new Error(
      "Missing DISCORD_TOKEN environment variable. Check your .env file.",
    );
  }

  if (!guildId) {
    throw new Error(
      "Missing DISCORD_GUILD_ID environment variable. Add it to your .env file.",
    );
  }

  await verifyDatabaseConnection();
  console.log(`[${new Date().toISOString()}] Database connection verified`);
  await verifyGuildSettings(guildId);
  console.log(`[${new Date().toISOString()}] Guild settings verified`);

  const client = createClient();
  const context = { client, guildId, logger: console };

  client.once(Events.ClientReady, (readyClient) => {
    console.log(
      `[${new Date().toISOString()}] Logged in as ${readyClient.user.tag}`,
    );
  });

  client.on(Events.MessageCreate, (message) => {
    handleMessageCreate(message, context);
  });

  startHttpServer(client, { port: httpPort, guildId });

  void client.login(token);
};

if (require.main === module) {
  void main();
}
