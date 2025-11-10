import test from "node:test";
import assert from "node:assert/strict";
import type { Client, Message } from "discord.js";
import { handleMessageCreate } from "..";

test("?testing replies in channel for non-bot messages", async () => {
  const replies: string[] = [];
  const message = {
    author: { bot: false },
    content: " ?testing ",
    reply: async (content: string) => {
      replies.push(content);
    },
  } as unknown as Message;

  handleMessageCreate(message, {
    client: {} as Client,
    guildId: "guild-123",
  });

  await new Promise<void>((resolve) => setImmediate(resolve));

  assert.deepEqual(replies, ["Testing command received. Bot is online."]);
});

test("bot-authored messages are ignored", async () => {
  const replies: string[] = [];
  const message = {
    author: { bot: true },
    content: "?testing",
    reply: async (content: string) => {
      replies.push(content);
    },
  } as unknown as Message;

  handleMessageCreate(message, {
    client: {} as Client,
    guildId: "guild-123",
  });

  await new Promise<void>((resolve) => setImmediate(resolve));

  assert.deepEqual(replies, []);
});
