import test from "node:test";
import assert from "node:assert/strict";
import { archiveInactiveChannels } from "./archiveChannels";

type FakeTextChannel = {
  id: string;
  name: string;
  type: number;
  parent?: { name?: string } | null;
  createdTimestamp?: number;
  viewable: boolean;
  messages: {
    fetch: (options: {
      limit: number;
    }) => Promise<{ first: () => { createdTimestamp: number } | undefined }>;
  };
};

const createCache = (channels: FakeTextChannel[]) => {
  return {
    values: () => channels.values(),
    find: (predicate: (channel: FakeTextChannel) => boolean) =>
      channels.find(predicate),
  };
};

const createGuild = (channels: FakeTextChannel[]) => {
  return {
    channels: {
      cache: createCache(channels),
      fetch: async () => undefined,
      create: async () => {
        throw new Error("not implemented in tests");
      },
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

const createTextChannel = (options: {
  id: string;
  name: string;
  lastMessageAt?: number | null;
  throwsOnFetch?: boolean;
  createdTimestamp?: number;
  viewable?: boolean;
}) => {
  const {
    id,
    name,
    lastMessageAt = null,
    throwsOnFetch = false,
    createdTimestamp = Date.now(),
    viewable = true,
  } = options;

  return {
    id,
    name,
    type: 0,
    parent: null,
    createdTimestamp,
    viewable,
    messages: {
      fetch: async () => {
        if (throwsOnFetch) {
          throw new Error("Missing access");
        }

        return {
          first: () =>
            lastMessageAt === null
              ? undefined
              : { createdTimestamp: lastMessageAt },
        };
      },
    },
  };
};

test("archiveInactiveChannels includes readable inactive channels in dry-run mode", async () => {
  const oldTimestamp = Date.now() - 120 * 24 * 60 * 60 * 1000;
  const guild = createGuild([
    createTextChannel({
      id: "channel-1",
      name: "quiet-room",
      lastMessageAt: oldTimestamp,
      createdTimestamp: oldTimestamp,
    }),
  ]);
  const client = createClient(guild);

  const result = await archiveInactiveChannels(client as never, {
    guildId: "guild-1",
    days: 90,
    dryRun: true,
  });

  assert.equal(result.inactiveChannels.length, 1);
  assert.equal(result.inactiveChannels[0]?.id, "channel-1");
  assert.equal(result.inactiveChannels[0]?.name, "quiet-room");
});

test("archiveInactiveChannels skips unreadable channels in dry-run mode", async () => {
  const oldTimestamp = Date.now() - 120 * 24 * 60 * 60 * 1000;
  const guild = createGuild([
    createTextChannel({
      id: "channel-2",
      name: "staff-only",
      throwsOnFetch: true,
      createdTimestamp: oldTimestamp,
    }),
  ]);
  const client = createClient(guild);

  const result = await archiveInactiveChannels(client as never, {
    guildId: "guild-1",
    days: 90,
    dryRun: true,
  });

  assert.deepEqual(result.inactiveChannels, []);
});
