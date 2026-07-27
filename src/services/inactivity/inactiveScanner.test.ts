import test from "node:test";
import assert from "node:assert/strict";
import { scanInactiveMembers } from "./inactiveScanner";

type FakeMember = {
  id: string;
  user: { bot: boolean; tag: string };
  displayName: string;
  joinedTimestamp: number;
};

type FakeMessage = {
  id: string;
  createdTimestamp: number;
  author: { bot: boolean; id: string };
  reactions?: {
    cache: Map<
      string,
      {
        count?: number;
        users: {
          cache: Map<string, { id: string; bot: boolean }>;
          fetch: () => Promise<Map<string, { id: string; bot: boolean }>>;
        };
      }
    >;
  };
};

type FakeCategory = {
  id: string;
  name: string;
  type: number;
};

type FakeThread = {
  id: string;
  name: string;
  type: number;
  parent: FakeTextChannel | null;
  archiveTimestamp: number;
  createdTimestamp: number | null;
  ownerId: string | null;
  isTextBased: () => boolean;
  permissionsFor: () => { has: () => boolean };
  messages: {
    fetch: (options: { limit: number; before?: string }) => Promise<{
      size: number;
      values: () => IterableIterator<FakeMessage>;
    }>;
  };
};

type FakeTextChannel = {
  id: string;
  name: string;
  type: number;
  parent: FakeCategory | null;
  isTextBased: () => boolean;
  permissionsFor: () => { has: () => boolean };
  messages: {
    fetch: (options: { limit: number; before?: string }) => Promise<{
      size: number;
      values: () => IterableIterator<FakeMessage>;
    }>;
  };
  threads: {
    fetchActive: () => Promise<{ threads: Map<string, FakeThread> }>;
    fetchArchived: () => Promise<{
      threads: Map<string, FakeThread>;
      hasMore: boolean;
    }>;
  };
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

const createTextChannel = (options: {
  id: string;
  name: string;
  messages?: FakeMessage[];
  parent?: { id: string; name: string; type: number } | null;
  threads?: {
    active?: FakeThread[];
    archived?: FakeThread[];
  };
}): FakeTextChannel => {
  const channel: FakeTextChannel = {
    id: options.id,
    name: options.name,
    type: 0,
    parent: options.parent ?? null,
    isTextBased: () => true,
    permissionsFor: () => ({
      has: () => true,
    }),
    messages: {
      fetch: async ({ before }: { limit: number; before?: string }) => {
        if (before) {
          return createMessageBatch([]);
        }
        return createMessageBatch(options.messages ?? []);
      },
    },
    threads: {
      fetchActive: async () => ({
        threads: new Map(
          (options.threads?.active ?? []).map((thread) => [thread.id, thread]),
        ),
      }),
      fetchArchived: async () => ({
        threads: new Map(
          (options.threads?.archived ?? []).map((thread) => [
            thread.id,
            thread,
          ]),
        ),
        hasMore: false,
      }),
    },
  };

  return channel;
};

const createCategory = (id: string, name: string): FakeCategory => ({
  id,
  name,
  type: 4,
});

const createThread = (options: {
  id: string;
  name: string;
  messages?: FakeMessage[];
  parent?: FakeTextChannel | null;
  type?: number;
  archiveTimestamp?: number;
  createdTimestamp?: number | null;
  ownerId?: string | null;
}): FakeThread => {
  return {
    id: options.id,
    name: options.name,
    type: options.type ?? 11,
    parent: options.parent ?? null,
    archiveTimestamp: options.archiveTimestamp ?? Date.now(),
    createdTimestamp: options.createdTimestamp ?? Date.now(),
    ownerId: options.ownerId ?? null,
    isTextBased: () => true,
    permissionsFor: () => ({
      has: () => true,
    }),
    messages: {
      fetch: async ({ before }: { limit: number; before?: string }) => {
        if (before) {
          return createMessageBatch([]);
        }
        return createMessageBatch(options.messages ?? []);
      },
    },
  };
};

const createGuild = (options: {
  members: FakeMember[];
  channels: FakeTextChannel[];
  activeThreads?: FakeThread[];
  memberCount?: number;
  onMembersFetch?: () => void;
}) => {
  const me = {
    permissions: { has: () => true },
  };

  return {
    name: "Test Guild",
    memberCount: options.memberCount,
    members: {
      me,
      cache: createCollection(options.members),
      fetch: async (_id?: string) => {
        if (_id) {
          return me;
        }
        options.onMembersFetch?.();
        return options.members;
      },
    },
    channels: {
      cache: {
        values: () => options.channels.values(),
      },
      fetch: async () => undefined,
      fetchActiveThreads: async () => ({
        threads: new Map(
          (options.activeThreads ?? []).map((thread) => [thread.id, thread]),
        ),
      }),
    },
    client: {
      user: { id: "bot-user" },
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

test("scanInactiveMembers reports total eligible members checked, not remaining inactive members", async () => {
  const now = Date.now();
  const oldJoin = now - 120 * 24 * 60 * 60 * 1000;
  const cutoffRecentMessage = now - 5 * 24 * 60 * 60 * 1000;

  const guild = createGuild({
    members: [
      {
        id: "member-active",
        user: { bot: false, tag: "active#1234" },
        displayName: "Active User",
        joinedTimestamp: oldJoin,
      },
      {
        id: "member-inactive",
        user: { bot: false, tag: "inactive#1234" },
        displayName: "Inactive User",
        joinedTimestamp: oldJoin,
      },
    ],
    channels: [
      createTextChannel({
        id: "channel-1",
        name: "general",
        messages: [
          {
            id: "message-1",
            createdTimestamp: cutoffRecentMessage,
            author: { bot: false, id: "member-active" },
          },
        ],
      }),
    ],
  });

  const client = createClient(guild);

  const result = await scanInactiveMembers(client as never, {
    guildId: "123",
    discordUserId: "456",
    days: 30,
    ignoredUserIds: new Set(),
  });

  assert.equal(result.totalMembersChecked, 2);
  assert.equal(result.inactiveMembers.length, 1);
  assert.equal(result.inactiveMembers[0]?.id, "member-inactive");
});

test("scanInactiveMembers reuses complete member cache instead of refetching members", async () => {
  const now = Date.now();
  const oldJoin = now - 120 * 24 * 60 * 60 * 1000;
  let memberFetchCount = 0;

  const guild = createGuild({
    memberCount: 2,
    onMembersFetch: () => {
      memberFetchCount += 1;
    },
    members: [
      {
        id: "member-one",
        user: { bot: false, tag: "one#1234" },
        displayName: "One User",
        joinedTimestamp: oldJoin,
      },
      {
        id: "member-two",
        user: { bot: false, tag: "two#1234" },
        displayName: "Two User",
        joinedTimestamp: oldJoin,
      },
    ],
    channels: [
      createTextChannel({
        id: "channel-1",
        name: "general",
      }),
    ],
  });

  await scanInactiveMembers(createClient(guild) as never, {
    guildId: "123",
    discordUserId: "456",
    days: 30,
    ignoredUserIds: new Set(),
  });

  assert.equal(memberFetchCount, 0);
});

test("scanInactiveMembers can count reactions as activity", async () => {
  const now = Date.now();
  const oldJoin = now - 120 * 24 * 60 * 60 * 1000;
  const cutoffRecentMessage = now - 5 * 24 * 60 * 60 * 1000;

  const reaction = {
    count: 1,
    users: {
      cache: new Map<string, { id: string; bot: boolean }>(),
      fetch: async () =>
        new Map([["member-reactive", { id: "member-reactive", bot: false }]]),
    },
  };

  const guild = createGuild({
    members: [
      {
        id: "member-reactive",
        user: { bot: false, tag: "reactive#1234" },
        displayName: "Reactive User",
        joinedTimestamp: oldJoin,
      },
      {
        id: "member-inactive",
        user: { bot: false, tag: "inactive#1234" },
        displayName: "Inactive User",
        joinedTimestamp: oldJoin,
      },
    ],
    channels: [
      createTextChannel({
        id: "channel-1",
        name: "general",
        messages: [
          {
            id: "message-1",
            createdTimestamp: cutoffRecentMessage,
            author: { bot: true, id: "bot-user" },
            reactions: {
              cache: new Map([["reaction-1", reaction]]),
            },
          },
        ],
      }),
    ],
  });

  const client = createClient(guild);
  const messageProgress: number[] = [];

  const result = await scanInactiveMembers(client as never, {
    guildId: "123",
    discordUserId: "456",
    days: 30,
    countReactionsAsActivity: true,
    ignoredUserIds: new Set(),
    progressCallbacks: {
      onMessageProgress(totalMessages) {
        messageProgress.push(totalMessages);
      },
    },
  });

  assert.equal(result.inactiveMembers.length, 1);
  assert.equal(result.inactiveMembers[0]?.id, "member-inactive");
  assert.equal(result.lastActivityByMemberId.get("member-reactive"), "reaction");
  assert.deepEqual(messageProgress, [1]);
});

test("scanInactiveMembers stops each channel at maxMessagesPerChannel", async () => {
  const now = Date.now();
  const oldJoin = now - 120 * 24 * 60 * 60 * 1000;
  const newerMessage = now - 5 * 24 * 60 * 60 * 1000;
  const olderMessage = now - 10 * 24 * 60 * 60 * 1000;

  const guild = createGuild({
    members: [
      {
        id: "member-newer",
        user: { bot: false, tag: "newer#1234" },
        displayName: "Newer User",
        joinedTimestamp: oldJoin,
      },
      {
        id: "member-older",
        user: { bot: false, tag: "older#1234" },
        displayName: "Older User",
        joinedTimestamp: oldJoin,
      },
      {
        id: "member-inactive",
        user: { bot: false, tag: "inactive#1234" },
        displayName: "Inactive User",
        joinedTimestamp: oldJoin,
      },
    ],
    channels: [
      createTextChannel({
        id: "channel-1",
        name: "general",
        messages: [
          {
            id: "message-newer",
            createdTimestamp: newerMessage,
            author: { bot: false, id: "member-newer" },
          },
          {
            id: "message-older",
            createdTimestamp: olderMessage,
            author: { bot: false, id: "member-older" },
          },
        ],
      }),
    ],
  });

  const result = await scanInactiveMembers(createClient(guild) as never, {
    guildId: "123",
    discordUserId: "456",
    days: 30,
    ignoredUserIds: new Set(),
    maxMessagesPerChannel: 1,
  });

  assert.equal(result.totalMessagesScanned, 1);
  assert.equal(result.inactiveMembers.some((member) => member.id === "member-newer"), false);
  assert.equal(result.inactiveMembers.some((member) => member.id === "member-older"), true);
  assert.equal(result.inactiveMembers.some((member) => member.id === "member-inactive"), true);
});

test("scanInactiveMembers counts public thread messages as activity", async () => {
  const now = Date.now();
  const oldJoin = now - 120 * 24 * 60 * 60 * 1000;
  const recentMessage = now - 5 * 24 * 60 * 60 * 1000;

  const parentChannel = createTextChannel({
    id: "channel-market",
    name: "marketplace",
  });
  const activeThread = createThread({
    id: "thread-1",
    name: "wtb-shoes",
    parent: parentChannel,
    messages: [
      {
        id: "message-thread",
        createdTimestamp: recentMessage,
        author: { bot: false, id: "member-thread-active" },
      },
    ],
  });

  const guild = createGuild({
    members: [
      {
        id: "member-thread-active",
        user: { bot: false, tag: "thread#1234" },
        displayName: "Thread User",
        joinedTimestamp: oldJoin,
      },
      {
        id: "member-inactive",
        user: { bot: false, tag: "inactive#1234" },
        displayName: "Inactive User",
        joinedTimestamp: oldJoin,
      },
    ],
    channels: [parentChannel],
    activeThreads: [activeThread],
  });

  const result = await scanInactiveMembers(createClient(guild) as never, {
    guildId: "123",
    discordUserId: "456",
    days: 30,
    ignoredUserIds: new Set(),
  });

  assert.equal(
    result.inactiveMembers.some((member) => member.id === "member-thread-active"),
    false,
  );
  assert.equal(result.lastActivityByMemberId.get("member-thread-active"), "message");
  assert.ok(result.processedChannels.includes("thread marketplace / wtb-shoes"));
});

test("scanInactiveMembers counts recent public thread creation as activity by default", async () => {
  const now = Date.now();
  const oldJoin = now - 120 * 24 * 60 * 60 * 1000;
  const recentThreadCreation = now - 5 * 24 * 60 * 60 * 1000;

  const parentChannel = createTextChannel({
    id: "channel-market",
    name: "marketplace",
  });
  const activeThread = createThread({
    id: "thread-created",
    name: "new-listing",
    parent: parentChannel,
    createdTimestamp: recentThreadCreation,
    ownerId: "member-thread-owner",
  });

  const guild = createGuild({
    members: [
      {
        id: "member-thread-owner",
        user: { bot: false, tag: "owner#1234" },
        displayName: "Thread Owner",
        joinedTimestamp: oldJoin,
      },
      {
        id: "member-inactive",
        user: { bot: false, tag: "inactive#1234" },
        displayName: "Inactive User",
        joinedTimestamp: oldJoin,
      },
    ],
    channels: [parentChannel],
    activeThreads: [activeThread],
  });

  const result = await scanInactiveMembers(createClient(guild) as never, {
    guildId: "123",
    discordUserId: "456",
    days: 30,
    ignoredUserIds: new Set(),
  });

  assert.equal(
    result.inactiveMembers.some((member) => member.id === "member-thread-owner"),
    false,
  );
  assert.equal(result.lastActivityByMemberId.get("member-thread-owner"), "thread");
});

test("scanInactiveMembers can ignore thread creation as activity", async () => {
  const now = Date.now();
  const oldJoin = now - 120 * 24 * 60 * 60 * 1000;

  const parentChannel = createTextChannel({
    id: "channel-market",
    name: "marketplace",
  });
  const activeThread = createThread({
    id: "thread-created",
    name: "new-listing",
    parent: parentChannel,
    ownerId: "member-thread-owner",
  });

  const guild = createGuild({
    members: [
      {
        id: "member-thread-owner",
        user: { bot: false, tag: "owner#1234" },
        displayName: "Thread Owner",
        joinedTimestamp: oldJoin,
      },
    ],
    channels: [parentChannel],
    activeThreads: [activeThread],
  });

  const result = await scanInactiveMembers(createClient(guild) as never, {
    guildId: "123",
    discordUserId: "456",
    days: 30,
    countThreadCreationAsActivity: false,
    ignoredUserIds: new Set(),
  });

  assert.equal(result.inactiveMembers[0]?.id, "member-thread-owner");
  assert.equal(result.lastActivityByMemberId.has("member-thread-owner"), false);
});

test("scanInactiveMembers counts archived public thread messages as activity", async () => {
  const now = Date.now();
  const oldJoin = now - 120 * 24 * 60 * 60 * 1000;
  const recentMessage = now - 5 * 24 * 60 * 60 * 1000;

  const parentChannel = createTextChannel({
    id: "channel-market",
    name: "marketplace",
  });
  const archivedThread = createThread({
    id: "thread-archived",
    name: "archived-wtb",
    parent: parentChannel,
    messages: [
      {
        id: "message-archived-thread",
        createdTimestamp: recentMessage,
        author: { bot: false, id: "member-archived-thread-active" },
      },
    ],
  });
  parentChannel.threads.fetchArchived = async () => ({
    threads: new Map([[archivedThread.id, archivedThread]]),
    hasMore: false,
  });

  const guild = createGuild({
    members: [
      {
        id: "member-archived-thread-active",
        user: { bot: false, tag: "archived#1234" },
        displayName: "Archived Thread User",
        joinedTimestamp: oldJoin,
      },
      {
        id: "member-inactive",
        user: { bot: false, tag: "inactive#1234" },
        displayName: "Inactive User",
        joinedTimestamp: oldJoin,
      },
    ],
    channels: [parentChannel],
  });

  const result = await scanInactiveMembers(createClient(guild) as never, {
    guildId: "123",
    discordUserId: "456",
    days: 30,
    ignoredUserIds: new Set(),
  });

  assert.equal(
    result.inactiveMembers.some(
      (member) => member.id === "member-archived-thread-active",
    ),
    false,
  );
  assert.equal(
    result.lastActivityByMemberId.get("member-archived-thread-active"),
    "message",
  );
  assert.ok(result.processedChannels.includes("thread marketplace / archived-wtb"));
});

test("scanInactiveMembers stops archived thread enumeration at the inactivity cutoff", async () => {
  const now = Date.now();
  const oldJoin = now - 120 * 24 * 60 * 60 * 1000;
  const recentMessage = now - 5 * 24 * 60 * 60 * 1000;
  const olderThanCutoff = now - 45 * 24 * 60 * 60 * 1000;

  const parentChannel = createTextChannel({
    id: "channel-market",
    name: "marketplace",
  });
  const recentArchivedThread = createThread({
    id: "thread-recent-archived",
    name: "recent-archived",
    parent: parentChannel,
    archiveTimestamp: recentMessage,
    messages: [
      {
        id: "message-recent-archived-thread",
        createdTimestamp: recentMessage,
        author: { bot: false, id: "member-recent-archived-thread" },
      },
    ],
  });
  const oldArchivedThread = createThread({
    id: "thread-old-archived",
    name: "old-archived",
    parent: parentChannel,
    archiveTimestamp: olderThanCutoff,
  });
  let archivedFetchCount = 0;
  parentChannel.threads.fetchArchived = async () => {
    archivedFetchCount += 1;
    return {
      threads: new Map([
        [recentArchivedThread.id, recentArchivedThread],
        [oldArchivedThread.id, oldArchivedThread],
      ]),
      hasMore: true,
    };
  };

  const guild = createGuild({
    members: [
      {
        id: "member-recent-archived-thread",
        user: { bot: false, tag: "recent#1234" },
        displayName: "Recent Archived Thread User",
        joinedTimestamp: oldJoin,
      },
      {
        id: "member-inactive",
        user: { bot: false, tag: "inactive#1234" },
        displayName: "Inactive User",
        joinedTimestamp: oldJoin,
      },
    ],
    channels: [parentChannel],
  });

  const result = await scanInactiveMembers(createClient(guild) as never, {
    guildId: "123",
    discordUserId: "456",
    days: 30,
    ignoredUserIds: new Set(),
  });

  assert.equal(archivedFetchCount, 1);
  assert.ok(
    result.processedChannels.includes("thread marketplace / recent-archived"),
  );
  assert.equal(
    result.processedChannels.includes("thread marketplace / old-archived"),
    false,
  );
  assert.equal(
    result.inactiveMembers.some(
      (member) => member.id === "member-recent-archived-thread",
    ),
    false,
  );
});

test("scanInactiveMembers excludes public threads under excluded categories", async () => {
  const now = Date.now();
  const privateCategory = createCategory("category-private", "Private");
  const oldJoin = now - 120 * 24 * 60 * 60 * 1000;
  const recentMessage = now - 5 * 24 * 60 * 60 * 1000;

  const parentChannel = createTextChannel({
    id: "channel-private",
    name: "private-room",
    parent: privateCategory,
  });
  const eligibleChannel = createTextChannel({
    id: "channel-general",
    name: "general",
  });
  const privateCategoryThread = createThread({
    id: "thread-private-category",
    name: "private-thread",
    parent: parentChannel,
    messages: [
      {
        id: "message-private-thread",
        createdTimestamp: recentMessage,
        author: { bot: false, id: "member-private-thread" },
      },
    ],
  });

  const guild = createGuild({
    members: [
      {
        id: "member-private-thread",
        user: { bot: false, tag: "private#1234" },
        displayName: "Private Thread User",
        joinedTimestamp: oldJoin,
      },
    ],
    channels: [parentChannel, eligibleChannel],
    activeThreads: [privateCategoryThread],
  });

  const result = await scanInactiveMembers(createClient(guild) as never, {
    guildId: "123",
    discordUserId: "456",
    days: 30,
    ignoredUserIds: new Set(),
    excludedCategories: ["Private"],
  });

  assert.equal(result.inactiveMembers.length, 1);
  assert.equal(result.inactiveMembers[0]?.id, "member-private-thread");
  assert.equal(result.lastActivityByMemberId.get("member-private-thread"), undefined);
  assert.equal(
    result.processedChannels.includes("thread private-room / private-thread"),
    false,
  );
});
