import assert from "node:assert/strict";
import test from "node:test";
import { ChannelType, Collection } from "discord.js";

import { removeThreadsByTag } from "./removeThreadsByTag";

type FakeParent = {
  id: string;
  name: string;
  type: ChannelType.GuildForum;
  availableTags: Array<{ id: string; name: string }>;
  archivedThreads: FakeThread[];
  threads: {
    fetchArchived: () => Promise<{
      hasMore: boolean;
      threads: Collection<string, FakeThread>;
    }>;
  };
};

type FakeThread = {
  id: string;
  name: string;
  type: ChannelType.PublicThread;
  guildId: string;
  parentId: string;
  parent: FakeParent;
  appliedTags: string[];
  archived: boolean;
  archiveTimestamp: number | null;
  setArchived: () => Promise<void>;
  delete: () => Promise<void>;
};

const createParent = (options: {
  id: string;
  name: string;
  tagId: string;
  tagName: string;
}): FakeParent => {
  const archivedThreads: FakeThread[] = [];
  return {
    id: options.id,
    name: options.name,
    type: ChannelType.GuildForum,
    availableTags: [{ id: options.tagId, name: options.tagName }],
    archivedThreads,
    threads: {
      fetchArchived: async () => ({
        hasMore: false,
        threads: new Collection(
          archivedThreads.map((thread) => [thread.id, thread]),
        ),
      }),
    },
  };
};

const createThread = (options: {
  id: string;
  name: string;
  parent: FakeParent;
  appliedTags: string[];
  archived?: boolean;
  onArchive?: () => void;
  onDelete?: () => void;
}): FakeThread => ({
  id: options.id,
  name: options.name,
  type: ChannelType.PublicThread,
  guildId: "guild-1",
  parentId: options.parent.id,
  parent: options.parent,
  appliedTags: options.appliedTags,
  archived: options.archived ?? false,
  archiveTimestamp: options.archived ? Date.now() : null,
  setArchived: async () => {
    options.onArchive?.();
  },
  delete: async () => {
    options.onDelete?.();
  },
});

const createClient = (options: {
  parents: FakeParent[];
  activeThreads?: FakeThread[];
  fetchedThreads?: FakeThread[];
}) => {
  const activeThreads = options.activeThreads ?? [];
  const fetchedThreads = options.fetchedThreads ?? [
    ...activeThreads,
    ...options.parents.flatMap((parent) => parent.archivedThreads),
  ];
  const parentCache = new Collection(
    options.parents.map((parent) => [parent.id, parent]),
  );
  const channelById = new Map(
    [...options.parents, ...fetchedThreads].map((channel) => [
      channel.id,
      channel,
    ]),
  );
  const guild = {
    id: "guild-1",
    channels: {
      cache: parentCache,
      fetch: async (channelId?: string) =>
        channelId ? (channelById.get(channelId) ?? null) : parentCache,
      fetchActiveThreads: async () => ({
        threads: new Collection(
          activeThreads.map((thread) => [thread.id, thread]),
        ),
      }),
    },
  };

  return {
    guilds: {
      fetch: async () => guild,
    },
  };
};

test("removeThreadsByTag matches applied tag IDs case-insensitively and caps the preview batch", async () => {
  const firstParent = createParent({
    id: "forum-1",
    name: "market-a",
    tagId: "wtb-a",
    tagName: "WTB",
  });
  const secondParent = createParent({
    id: "forum-2",
    name: "market-b",
    tagId: "wtb-b",
    tagName: "wtb",
  });
  const activeMatch = createThread({
    id: "thread-1",
    name: "Looking for boots",
    parent: firstParent,
    appliedTags: ["wtb-a"],
  });
  const titleOnlyMatch = createThread({
    id: "thread-2",
    name: "WTB but tagged WTS",
    parent: firstParent,
    appliedTags: ["wts-a"],
  });
  const archivedMatch = createThread({
    id: "thread-3",
    name: "Archived wanted post",
    parent: secondParent,
    appliedTags: ["wtb-b"],
    archived: true,
  });
  secondParent.archivedThreads.push(archivedMatch);
  const client = createClient({
    parents: [firstParent, secondParent],
    activeThreads: [activeMatch, titleOnlyMatch],
  });

  const result = await removeThreadsByTag(client as never, {
    guildId: "guild-1",
    tag: " WtB ",
    limit: 1,
    dryRun: true,
  });

  assert.equal(result.totalMatchingCount, 2);
  assert.equal(result.matchingThreads.length, 1);
  assert.equal(result.matchingThreads[0]?.id, "thread-1");
  assert.equal(result.moreCount, 1);
});

test("removeThreadsByTag revalidates tags before archiving the previewed threads", async () => {
  const parent = createParent({
    id: "forum-1",
    name: "market",
    tagId: "wtb-tag",
    tagName: "WTB",
  });
  let archivedCalls = 0;
  const activeMatch = createThread({
    id: "thread-1",
    name: "Active match",
    parent,
    appliedTags: ["wtb-tag"],
    onArchive: () => {
      archivedCalls += 1;
    },
  });
  const archivedMatch = createThread({
    id: "thread-2",
    name: "Archived match",
    parent,
    appliedTags: ["wtb-tag"],
    archived: true,
  });
  const staleMatch = createThread({
    id: "thread-3",
    name: "Tag was removed",
    parent,
    appliedTags: ["wts-tag"],
  });
  const client = createClient({
    parents: [parent],
    fetchedThreads: [activeMatch, archivedMatch, staleMatch],
  });

  const result = await removeThreadsByTag(client as never, {
    action: "archive",
    dryRun: false,
    guildId: "guild-1",
    limit: 3,
    tag: "wtb",
    threadIds: ["thread-1", "thread-2", "thread-3"],
  });

  assert.equal(archivedCalls, 1);
  assert.equal(result.processedCount, 1);
  assert.equal(result.alreadyArchivedCount, 1);
  assert.equal(result.failures.length, 1);
  assert.match(result.failures[0] ?? "", /no longer has the requested tag/);
});

test("removeThreadsByTag deletes a revalidated tagged thread", async () => {
  const parent = createParent({
    id: "forum-1",
    name: "market",
    tagId: "wtb-tag",
    tagName: "WTB",
  });
  let deleteCalls = 0;
  const thread = createThread({
    id: "thread-1",
    name: "Delete me",
    parent,
    appliedTags: ["wtb-tag"],
    onDelete: () => {
      deleteCalls += 1;
    },
  });
  const client = createClient({ parents: [parent], fetchedThreads: [thread] });

  const result = await removeThreadsByTag(client as never, {
    action: "delete",
    dryRun: false,
    guildId: "guild-1",
    limit: 1,
    tag: "WTB",
    threadIds: ["thread-1"],
  });

  assert.equal(deleteCalls, 1);
  assert.equal(result.processedCount, 1);
  assert.deepEqual(result.failures, []);
});

test("removeThreadsByTag rejects an execution batch larger than its preview limit", async () => {
  await assert.rejects(
    removeThreadsByTag({} as never, {
      action: "delete",
      dryRun: false,
      guildId: "guild-1",
      limit: 1,
      tag: "WTB",
      threadIds: ["thread-1", "thread-2"],
    }),
    /exceeds the preview limit/,
  );
});
