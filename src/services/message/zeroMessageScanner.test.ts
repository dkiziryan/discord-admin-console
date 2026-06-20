import test from "node:test";
import assert from "node:assert/strict";
import { ChannelType } from "discord.js";

import { scanZeroMessageUsers } from "./zeroMessageScanner";

type FakeMember = {
  id: string;
  user: { bot: boolean; tag: string };
  displayName: string;
};

type FakeMessage = {
  id: string;
  createdTimestamp: number;
  author: { bot: boolean; id: string };
};

const createCollection = <T extends { id: string }>(items: T[]) => {
  const map = new Map(items.map((item) => [item.id, item]));

  return {
    get size() {
      return map.size;
    },
    get(id: string) {
      return map.get(id);
    },
    keys() {
      return map.keys();
    },
    values() {
      return map.values();
    },
    filter(predicate: (value: T) => boolean) {
      return createCollection(Array.from(map.values()).filter(predicate));
    },
  };
};

const createMessageBatch = (messages: FakeMessage[]) => {
  return {
    get size() {
      return messages.length;
    },
    values: () => messages.values(),
  };
};

const createCategory = (name: string) => ({
  id: `category-${name}`,
  name,
  type: ChannelType.GuildCategory,
});

const createTextChannel = (options: {
  id: string;
  name: string;
  messages: FakeMessage[];
  canRead?: boolean;
  parent?: ReturnType<typeof createCategory> | null;
}) => {
  return {
    id: options.id,
    name: options.name,
    type: ChannelType.GuildText,
    parent: options.parent ?? null,
    permissionsFor: () => ({
      has: () => options.canRead ?? true,
    }),
    messages: {
      fetch: async ({ before }: { limit: number; before?: string }) => {
        if (before) {
          return createMessageBatch([]);
        }
        return createMessageBatch(options.messages);
      },
    },
  };
};

const createGuild = (options: {
  members: FakeMember[];
  channels: ReturnType<typeof createTextChannel>[];
}) => {
  return {
    name: "Test Guild",
    members: {
      me: { id: "bot-member" },
      cache: createCollection(options.members),
      fetch: async () => undefined,
    },
    channels: {
      cache: {
        values: () => options.channels.values(),
      },
      fetch: async () => undefined,
    },
  };
};

const createClient = (guild: ReturnType<typeof createGuild>) => {
  return {
    guilds: {
      fetch: async () => guild,
    },
  };
};

test("scanZeroMessageUsers scans all eligible channels when no target names are provided", async () => {
  const guild = createGuild({
    members: [
      {
        id: "member-general",
        user: { bot: false, tag: "general#1234" },
        displayName: "General User",
      },
      {
        id: "member-deals",
        user: { bot: false, tag: "deals#1234" },
        displayName: "Deals User",
      },
      {
        id: "member-zero",
        user: { bot: false, tag: "zero#1234" },
        displayName: "Zero User",
      },
    ],
    channels: [
      createTextChannel({
        id: "channel-general",
        name: "general",
        messages: [
          {
            id: "message-general",
            createdTimestamp: 100,
            author: { bot: false, id: "member-general" },
          },
        ],
      }),
      createTextChannel({
        id: "channel-deals",
        name: "deals",
        messages: [
          {
            id: "message-deals",
            createdTimestamp: 100,
            author: { bot: false, id: "member-deals" },
          },
        ],
      }),
    ],
  });

  const result = await scanZeroMessageUsers(createClient(guild) as never, {
    guildId: "123456789012345678",
    discordUserId: "234567890123456789",
    targetChannelNames: [],
    ignoredUserIds: new Set(),
  });

  assert.deepEqual(result.processedChannels, ["general", "deals"]);
  assert.deepEqual(
    result.zeroMessageUsers.map((member) => member.id),
    ["member-zero"],
  );
  assert.equal(result.scanMode, "exact");
});

test("scanZeroMessageUsers excludes configured categories", async () => {
  const privateCategory = createCategory("Private");
  const guild = createGuild({
    members: [
      {
        id: "member-public",
        user: { bot: false, tag: "public#1234" },
        displayName: "Public User",
      },
      {
        id: "member-private-only",
        user: { bot: false, tag: "private#1234" },
        displayName: "Private User",
      },
    ],
    channels: [
      createTextChannel({
        id: "channel-general",
        name: "general",
        messages: [
          {
            id: "message-public",
            createdTimestamp: 100,
            author: { bot: false, id: "member-public" },
          },
        ],
      }),
      createTextChannel({
        id: "channel-welcome",
        name: "private",
        parent: privateCategory,
        messages: [
          {
            id: "message-private",
            createdTimestamp: 100,
            author: { bot: false, id: "member-private-only" },
          },
        ],
      }),
    ],
  });

  const result = await scanZeroMessageUsers(createClient(guild) as never, {
    guildId: "123456789012345678",
    discordUserId: "234567890123456789",
    targetChannelNames: [],
    excludedCategories: ["Private"],
    ignoredUserIds: new Set(),
  });

  assert.deepEqual(result.processedChannels, ["general"]);
  assert.deepEqual(result.skippedChannels, [
    "private (excluded category: Private)",
  ]);
  assert.deepEqual(result.excludedCategories, ["Private"]);
  assert.deepEqual(
    result.zeroMessageUsers.map((member) => member.id),
    ["member-private-only"],
  );
});

test("scanZeroMessageUsers counts Welcome posts as messages", async () => {
  const welcomeCategory = createCategory("Welcome");
  const guild = createGuild({
    members: [
      {
        id: "member-welcome-only",
        user: { bot: false, tag: "welcome#1234" },
        displayName: "Welcome User",
      },
    ],
    channels: [
      createTextChannel({
        id: "channel-welcome",
        name: "welcome",
        parent: welcomeCategory,
        messages: [
          {
            id: "message-welcome",
            createdTimestamp: 100,
            author: { bot: false, id: "member-welcome-only" },
          },
        ],
      }),
    ],
  });

  const result = await scanZeroMessageUsers(createClient(guild) as never, {
    guildId: "123456789012345678",
    discordUserId: "234567890123456789",
    targetChannelNames: [],
    excludedCategories: ["Affiliate Vendors", "Private"],
    ignoredUserIds: new Set(),
  });

  assert.deepEqual(result.processedChannels, ["welcome"]);
  assert.equal(result.zeroMessageUsers.length, 0);
});

test("scanZeroMessageUsers counts posts in in-between as messages", async () => {
  const guild = createGuild({
    members: [
      {
        id: "1288920720654467084",
        user: { bot: false, tag: "inteantonio#1234" },
        displayName: "inteantonio",
      },
    ],
    channels: [
      createTextChannel({
        id: "channel-in-between",
        name: "in-between",
        messages: [
          {
            id: "message-in-between",
            createdTimestamp: new Date("2026-05-29T12:00:00.000Z").getTime(),
            author: { bot: false, id: "1288920720654467084" },
          },
        ],
      }),
    ],
  });

  const result = await scanZeroMessageUsers(createClient(guild) as never, {
    guildId: "123456789012345678",
    discordUserId: "234567890123456789",
    targetChannelNames: [],
    excludedCategories: ["Affiliate Vendors", "Private"],
    ignoredUserIds: new Set(),
  });

  assert.deepEqual(result.processedChannels, ["in-between"]);
  assert.equal(result.zeroMessageUsers.length, 0);
  assert.equal(
    result.channelCoverage[0]?.oldestMessageAt,
    "2026-05-29T12:00:00.000Z",
  );
});

test("scanZeroMessageUsers reports unreadable channels as skipped", async () => {
  const guild = createGuild({
    members: [
      {
        id: "member-zero",
        user: { bot: false, tag: "zero#1234" },
        displayName: "Zero User",
      },
    ],
    channels: [
      createTextChannel({
        id: "channel-general",
        name: "general",
        messages: [],
      }),
      createTextChannel({
        id: "channel-in-between",
        name: "in-between",
        canRead: false,
        messages: [],
      }),
    ],
  });

  const result = await scanZeroMessageUsers(createClient(guild) as never, {
    guildId: "123456789012345678",
    discordUserId: "234567890123456789",
    targetChannelNames: [],
    ignoredUserIds: new Set(),
  });

  assert.deepEqual(result.skippedChannels, [
    "in-between (missing history permission)",
  ]);
});

test("scanZeroMessageUsers marks capped scans as fast", async () => {
  const guild = createGuild({
    members: [
      {
        id: "member-zero",
        user: { bot: false, tag: "zero#1234" },
        displayName: "Zero User",
      },
    ],
    channels: [
      createTextChannel({
        id: "channel-general",
        name: "general",
        messages: [
          {
            id: "message-one",
            createdTimestamp: 100,
            author: { bot: true, id: "bot-user" },
          },
          {
            id: "message-two",
            createdTimestamp: 200,
            author: { bot: true, id: "bot-user" },
          },
        ],
      }),
    ],
  });

  const result = await scanZeroMessageUsers(createClient(guild) as never, {
    guildId: "123456789012345678",
    discordUserId: "234567890123456789",
    targetChannelNames: [],
    ignoredUserIds: new Set(),
    maxMessagesPerChannel: 1,
  });

  assert.equal(result.scanMode, "fast");
  assert.equal(result.channelCoverage[0]?.reachedMessageLimit, true);
  assert.match(result.coverageWarning ?? "", /general/);
});
