import { useEffect, useRef, useState } from "react";
import type { DragEvent, FormEvent } from "react";

import styles from "./ServerSettingsPanel.module.css";
import type { IgnoredUser } from "../../models/types";
import {
  addIgnoredUser,
  fetchIgnoredUsers,
  ignoredUsersExportUrl,
  importIgnoredUsers,
  removeIgnoredUser,
} from "../../services/settings/ignoredUsers";
import {
  fetchGuildWorkflowSettings,
  saveGuildWorkflowSettings,
} from "../../services/settings/guildSettings";

const DISCORD_USER_ID_PATTERN = /^\d{5,25}$/;
const USER_LIST_PAGE_SIZE = 10;

const formatSettingsList = (values: string[]): string => values.join("\n");

const parseSettingsList = (value: string): string[] =>
  value
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter((item, index, items) => {
      if (!item) {
        return false;
      }

      const key = item.toLowerCase();
      return items.findIndex((candidate) => candidate.toLowerCase() === key) === index;
    });

const hasImportableUserId = (contents: string): boolean => {
  const lines = contents.split(/\r?\n/);
  for (const line of lines.slice(1)) {
    const [candidate] = line.split(",");
    if (DISCORD_USER_ID_PATTERN.test(candidate.trim())) {
      return true;
    }
  }

  return false;
};

export const ServerSettingsPanel = () => {
  const [ignoredUsers, setIgnoredUsers] = useState<IgnoredUser[]>([]);
  const [discordUserId, setDiscordUserId] = useState("");
  const [username, setUsername] = useState("");
  const [targetChannelsValue, setTargetChannelsValue] = useState("");
  const [inactiveCategoriesValue, setInactiveCategoriesValue] = useState("");
  const [userPage, setUserPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [workflowLoading, setWorkflowLoading] = useState(true);
  const [workflowSaving, setWorkflowSaving] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadIgnoredUsers = async () => {
    setLoading(true);
    setErrorMessage(null);
    try {
      const response = await fetchIgnoredUsers();
      setIgnoredUsers(response.users);
    } catch (error) {
      setErrorMessage((error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const loadWorkflowSettings = async () => {
    setWorkflowLoading(true);
    setErrorMessage(null);
    try {
      const settings = await fetchGuildWorkflowSettings();
      setTargetChannelsValue(formatSettingsList(settings.defaultTargetChannels));
      setInactiveCategoriesValue(
        formatSettingsList(settings.inactiveExcludedCategories),
      );
    } catch (error) {
      setErrorMessage((error as Error).message);
    } finally {
      setWorkflowLoading(false);
    }
  };

  useEffect(() => {
    void loadIgnoredUsers();
    void loadWorkflowSettings();
  }, []);

  const totalUserPages = Math.max(
    1,
    Math.ceil(ignoredUsers.length / USER_LIST_PAGE_SIZE),
  );
  const visibleIgnoredUsers = ignoredUsers.slice(
    (userPage - 1) * USER_LIST_PAGE_SIZE,
    userPage * USER_LIST_PAGE_SIZE,
  );
  const userStart =
    ignoredUsers.length === 0 ? 0 : (userPage - 1) * USER_LIST_PAGE_SIZE + 1;
  const userEnd = Math.min(
    ignoredUsers.length,
    userPage * USER_LIST_PAGE_SIZE,
  );

  useEffect(() => {
    setUserPage((current) => Math.min(current, totalUserPages));
  }, [totalUserPages]);

  const handleAdd = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (saving) {
      return;
    }

    setSaving(true);
    setStatusMessage(null);
    setErrorMessage(null);
    try {
      await addIgnoredUser(discordUserId, username);
      setDiscordUserId("");
      setUsername("");
      setUserPage(1);
      setStatusMessage("Ignored user added.");
      await loadIgnoredUsers();
    } catch (error) {
      setErrorMessage((error as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const handleSaveWorkflowSettings = async (
    event: FormEvent<HTMLFormElement>,
  ) => {
    event.preventDefault();
    if (workflowSaving) {
      return;
    }

    setWorkflowSaving(true);
    setStatusMessage(null);
    setErrorMessage(null);
    try {
      const settings = await saveGuildWorkflowSettings({
        defaultTargetChannels: parseSettingsList(targetChannelsValue),
        inactiveExcludedCategories: parseSettingsList(inactiveCategoriesValue),
      });
      setTargetChannelsValue(formatSettingsList(settings.defaultTargetChannels));
      setInactiveCategoriesValue(
        formatSettingsList(settings.inactiveExcludedCategories),
      );
      setStatusMessage("Workflow defaults saved.");
    } catch (error) {
      setErrorMessage((error as Error).message);
    } finally {
      setWorkflowSaving(false);
    }
  };

  const handleRemove = async (userId: string) => {
    if (saving) {
      return;
    }

    setSaving(true);
    setStatusMessage(null);
    setErrorMessage(null);
    try {
      await removeIgnoredUser(userId);
      setStatusMessage("Ignored user removed.");
      await loadIgnoredUsers();
    } catch (error) {
      setErrorMessage((error as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const importFile = async (file: File) => {
    if (!file || saving) {
      return;
    }

    setSaving(true);
    setStatusMessage(null);
    setErrorMessage(null);
    try {
      const contents = await file.text();
      if (!hasImportableUserId(contents)) {
        setErrorMessage(
          'No valid Discord user IDs found. Use a CSV with a "User ID" column.',
        );
        return;
      }

      const result = await importIgnoredUsers(contents);
      setStatusMessage(
        `Imported ${result.addedCount} user(s). ${result.skippedCount} duplicate(s) skipped.`,
      );
      setUserPage(1);
      await loadIgnoredUsers();
    } catch (error) {
      setErrorMessage((error as Error).message);
    } finally {
      setSaving(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handleImportInput = () => {
    const file = fileInputRef.current?.files?.[0];
    if (file) {
      void importFile(file);
    }
  };

  const handleDragOver = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (!saving) {
      setDragActive(true);
    }
  };

  const handleDragLeave = (event: DragEvent<HTMLDivElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
      setDragActive(false);
    }
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragActive(false);
    const file = event.dataTransfer.files?.[0];
    if (file) {
      void importFile(file);
    }
  };

  return (
    <section className={styles.panel}>
      <header>
        <div>
          <h2>Server settings</h2>
          <p>
            Settings here apply only to the currently selected Discord server.
          </p>
        </div>
      </header>

      <section className={styles.workflowSection}>
        <div className={styles.sectionHeader}>
          <div>
            <span className={styles.eyebrow}>Workflow defaults</span>
            <h3>Scan presets</h3>
          </div>
        </div>
        <form className={styles.settingsForm} onSubmit={handleSaveWorkflowSettings}>
          <label>
            Default target channels
            <textarea
              value={targetChannelsValue}
              onChange={(event) => setTargetChannelsValue(event.target.value)}
              placeholder="general&#10;in-between"
              rows={4}
              disabled={workflowLoading || workflowSaving}
            />
            <small>Used by zero-message scan presets.</small>
          </label>
          <label>
            Default excluded categories
            <textarea
              value={inactiveCategoriesValue}
              onChange={(event) => setInactiveCategoriesValue(event.target.value)}
              placeholder="Affiliate Vendors&#10;Private"
              rows={4}
              disabled={workflowLoading || workflowSaving}
            />
            <small>
              Applied automatically to zero-message, inactive-member, and channel
              archive workflows.
            </small>
          </label>
          <button
            type="submit"
            className="primary-button"
            disabled={workflowLoading || workflowSaving}
          >
            {workflowSaving ? "Saving..." : "Save workflow defaults"}
          </button>
        </form>
      </section>

      <section className={styles.ignoreSection}>
        <div className={styles.sectionHeader}>
          <div>
            <span className={styles.eyebrow}>Ignore list</span>
            <h3>{ignoredUsers.length} ignored user(s)</h3>
          </div>
          <a className="secondary-button" href={ignoredUsersExportUrl}>
            Export CSV
          </a>
        </div>

        <form className={styles.addForm} onSubmit={handleAdd}>
          <label>
            Discord user ID
            <input
              value={discordUserId}
              onChange={(event) => setDiscordUserId(event.target.value)}
              placeholder="123456789012345678"
              disabled={saving}
            />
          </label>
          <label>
            Username
            <input
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              placeholder="optional for now"
              disabled={saving}
            />
          </label>
          <button type="submit" className="primary-button" disabled={saving}>
            {saving ? "Saving..." : "Add user"}
          </button>
        </form>

        <div
          className={`${styles.importRow} ${dragActive ? styles.importRowActive : ""}`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          <div>
            <strong>Import ignored users CSV</strong>
            <p>
              Expected format: first column header <code>User ID</code>, with
              one Discord user ID per row. A second <code>Username</code> column
              is allowed and ignored.
            </p>
            <pre className={styles.csvExample}>
              User ID,Username{"\n"}702612734893883434,example_user
            </pre>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            onChange={handleImportInput}
            disabled={saving}
            className={styles.fileInput}
          />
          <button
            type="button"
            className="secondary-button"
            onClick={() => fileInputRef.current?.click()}
            disabled={saving}
          >
            Choose CSV
          </button>
          <span className={styles.dropHint}>or drag and drop a CSV here</span>
        </div>

        <div className="feedback">
          {statusMessage && <p className="status success">{statusMessage}</p>}
          {errorMessage && <p className="status error">{errorMessage}</p>}
        </div>

        {loading ? (
          <p className={styles.empty}>Loading ignored users...</p>
        ) : ignoredUsers.length === 0 ? (
          <p className={styles.empty}>No ignored users for this server.</p>
        ) : (
          <>
            <ul className={styles.userList}>
              {visibleIgnoredUsers.map((user) => (
                <li key={user.id}>
                  <span className={styles.userPrimary}>
                    {user.username ? <strong>{user.username}</strong> : null}
                    <code>{user.discordUserId}</code>
                  </span>
                  <span className={styles.addedDate}>
                    {new Date(user.createdAt).toLocaleDateString()}
                  </span>
                  <button
                    type="button"
                    className="secondary-button secondary-button--danger"
                    onClick={() => void handleRemove(user.discordUserId)}
                    disabled={saving}
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
            {ignoredUsers.length > USER_LIST_PAGE_SIZE && (
              <div className={styles.pagination}>
                <span className={styles.pageCount}>
                  {userStart}-{userEnd} of {ignoredUsers.length}
                </span>
                <button
                  type="button"
                  aria-label="Previous ignored users page"
                  className="secondary-button"
                  disabled={userPage <= 1}
                  onClick={() =>
                    setUserPage((current) => Math.max(1, current - 1))
                  }
                >
                  Previous
                </button>
                <button
                  type="button"
                  aria-label="Next ignored users page"
                  className="secondary-button"
                  disabled={userPage >= totalUserPages}
                  onClick={() =>
                    setUserPage((current) =>
                      Math.min(totalUserPages, current + 1),
                    )
                  }
                >
                  Next
                </button>
              </div>
            )}
          </>
        )}
      </section>
    </section>
  );
};
