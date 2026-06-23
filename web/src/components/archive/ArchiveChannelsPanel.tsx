import { useEffect, useMemo, useState } from "react";

import styles from "./ArchiveChannelsPanel.module.css";
import type {
  ArchivedChannelSummary,
  ArchiveChannelsResponse,
} from "../../models/types";
import { requestArchiveChannels } from "../../services/archive/archiveChannels";
import { fetchDefaultInactiveCategories } from "../../services/inactivity/inactiveDefaults";
import { ConfirmationModal } from "../shared/ConfirmationModal";

type SelectionMap = Record<string, boolean>;

type ChannelAction = "archive" | "delete";

export const ArchiveChannelsPanel = () => {
  const [days, setDays] = useState(90);
  const [daysInput, setDaysInput] = useState("90");
  const [preview, setPreview] = useState<ArchivedChannelSummary[]>([]);
  const [selection, setSelection] = useState<SelectionMap>({});
  const [loading, setLoading] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [processingAction, setProcessingAction] =
    useState<ChannelAction | null>(null);
  const [confirmAction, setConfirmAction] = useState<ChannelAction | null>(null);
  const [confirmValue, setConfirmValue] = useState("");
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [result, setResult] = useState<ArchiveChannelsResponse | null>(null);
  const [defaultCategories, setDefaultCategories] = useState<string[]>([]);

  const selectedIds = useMemo(
    () =>
      preview
        .filter((channel) => selection[channel.id])
        .map((channel) => channel.id),
    [preview, selection]
  );

  const lastActionSummary = useMemo(() => {
    if (!result || result.data.processedCount === 0) {
      return null;
    }
    const verb = result.data.action === "archive" ? "Archived" : "Deleted";
    return `${verb} ${result.data.processedCount} channel(s).`;
  }, [result]);

  useEffect(() => {
    let cancelled = false;

    const loadDefaults = async () => {
      try {
        const categories = await fetchDefaultInactiveCategories();
        if (!cancelled) {
          setDefaultCategories(categories);
        }
      } catch {
        // Archive previews still work without showing defaults.
      }
    };

    void loadDefaults();
    return () => {
      cancelled = true;
    };
  }, []);

  const applyDaysPreset = (nextDays: number) => {
    setDays(nextDays);
    setDaysInput(String(nextDays));
  };

  const handlePreview = async () => {
    if (loading) {
      return;
    }

    setLoading(true);
    setStatusMessage(null);
    setErrorMessage(null);
    setResult(null);

    try {
      const response = await requestArchiveChannels({ days, dryRun: true });
      setPreview(response.data.inactiveChannels);
      const defaultSelection: SelectionMap = {};
      response.data.inactiveChannels.forEach((channel) => {
        defaultSelection[channel.id] = true;
      });
      setSelection(defaultSelection);
      setStatusMessage(response.message);
    } catch (error) {
      setErrorMessage((error as Error).message);
      setPreview([]);
      setSelection({});
    } finally {
      setLoading(false);
    }
  };

  const handleToggle = (channelId: string) => {
    setSelection((prev) => ({
      ...prev,
      [channelId]: !prev[channelId],
    }));
  };

  const handleSelectAll = (value: boolean) => {
    const next: SelectionMap = {};
    preview.forEach((channel) => {
      next[channel.id] = value;
    });
    setSelection(next);
  };

  const handleProcessRequest = (action: ChannelAction) => {
    if (processing || selectedIds.length === 0) {
      setErrorMessage("Select at least one channel to process.");
      return;
    }

    setConfirmAction(action);
    setConfirmValue("");
  };

  const handleProcess = async (action: ChannelAction) => {
    if (processing || selectedIds.length === 0) {
      setErrorMessage("Select at least one channel to process.");
      return;
    }

    setConfirmAction(null);
    setProcessing(true);
    setProcessingAction(action);
    setStatusMessage(null);
    setErrorMessage(null);

    try {
      const response = await requestArchiveChannels({
        days,
        channelIds: selectedIds,
        dryRun: false,
        action,
      });
      setResult(response);
      setStatusMessage(response.message);
      setPreview([]);
      setSelection({});
    } catch (error) {
      setErrorMessage((error as Error).message);
    } finally {
      setProcessing(false);
      setProcessingAction(null);
    }
  };

  return (
    <section className={styles.panel}>
      <header className={styles.header}>
        <div>
          <h2>Archive inactive channels</h2>
          <p>
            Find channels without recent messages and move or delete them in
            bulk.
          </p>
        </div>
        <div className={styles.presetBar} aria-label="Archive channel presets">
          <button
            type="button"
            className="secondary-button"
            onClick={() => applyDaysPreset(90)}
            disabled={loading || processing}
          >
            90-day review
          </button>
          <button
            type="button"
            className="secondary-button"
            onClick={() => applyDaysPreset(180)}
            disabled={loading || processing}
          >
            180-day review
          </button>
          <button
            type="button"
            className="secondary-button"
            onClick={() => applyDaysPreset(365)}
            disabled={loading || processing}
          >
            365-day review
          </button>
        </div>
        {defaultCategories.length > 0 && (
          <small className={styles.defaultCategories}>
            Defaults exclude{" "}
            {defaultCategories.map((category) => `“${category}”`).join(", ")}
          </small>
        )}
        <div className={styles.controls}>
          <label>
            Inactive for (days)
            <input
              type="number"
              min={1}
              value={daysInput}
              onChange={(event) => {
                const { value } = event.target;
                if (value === "") {
                  setDaysInput("");
                  return;
                }
                const parsed = Number(value);
                if (!Number.isNaN(parsed)) {
                  setDaysInput(value);
                  setDays(parsed);
                }
              }}
              onBlur={() => {
                if (daysInput === "") {
                  setDays(1);
                  setDaysInput("1");
                } else {
                  const parsed = Number(daysInput);
                  const clamped = Number.isNaN(parsed) ? 1 : Math.max(1, parsed);
                  setDays(clamped);
                  setDaysInput(String(clamped));
                }
              }}
              disabled={loading || processing}
            />
          </label>
          <button
            type="button"
            className="primary-button"
            onClick={handlePreview}
            disabled={loading || processing}
          >
            {loading ? "Scanning…" : "Preview inactive channels"}
          </button>
        </div>
      </header>

      {preview.length > 0 && (
        <div className={styles.preview}>
          <div className={styles.bulkActions}>
            <span>{preview.length} channel(s) found</span>
            <div>
              <button
                type="button"
                className="secondary-button"
                onClick={() => handleSelectAll(true)}
              >
                Select all
              </button>
              <button
                type="button"
                className="secondary-button"
                onClick={() => handleSelectAll(false)}
              >
                Clear all
              </button>
            </div>
          </div>
          <ul>
            {preview.map((channel) => (
              <li key={channel.id} className={styles.channelRow}>
                <label>
                  <input
                    type="checkbox"
                    checked={Boolean(selection[channel.id])}
                    onChange={() => handleToggle(channel.id)}
                    disabled={processing}
                  />
                  <span>
                    <strong>#{channel.name}</strong>
                    <small>
                      Last message:{" "}
                      {channel.lastMessageAt
                        ? new Date(channel.lastMessageAt).toLocaleString()
                        : "Unknown"}
                    </small>
                  </span>
                </label>
              </li>
            ))}
          </ul>

          <div className={styles.actions}>
            <button
              type="button"
              className="primary-button"
              onClick={() => handleProcessRequest("archive")}
              disabled={processing || selectedIds.length === 0}
            >
              {processing && processingAction === "archive"
                ? "Archiving…"
                : `Archive ${selectedIds.length} selected`}
            </button>
            <button
              type="button"
              className="danger-button"
              onClick={() => handleProcessRequest("delete")}
              disabled={processing || selectedIds.length === 0}
            >
              {processing && processingAction === "delete"
                ? "Deleting…"
                : `Delete ${selectedIds.length} selected`}
            </button>
          </div>
        </div>
      )}

      {lastActionSummary && (
        <p className={styles.summary}>{lastActionSummary}</p>
      )}

      <div className="feedback">
        {statusMessage && <p className="status success">{statusMessage}</p>}
        {errorMessage && <p className="status error">{errorMessage}</p>}
      </div>
      <ConfirmationModal
        confirmDisabled={confirmValue !== String(selectedIds.length)}
        confirmLabel={
          confirmAction === "delete" ? "Delete channels" : "Archive channels"
        }
        confirmingLabel={
          confirmAction === "delete" ? "Deleting..." : "Archiving..."
        }
        isConfirming={processing}
        isOpen={Boolean(confirmAction)}
        message={
          <>
            <p>
              This will {confirmAction ?? "process"} {selectedIds.length} selected
              channel{selectedIds.length === 1 ? "" : "s"}. Type{" "}
              <strong>{selectedIds.length}</strong> to continue.
            </p>
            <label>
              Selected channel count
              <input
                aria-label="Selected channel count confirmation"
                inputMode="numeric"
                value={confirmValue}
                onChange={(event) => setConfirmValue(event.target.value)}
              />
            </label>
          </>
        }
        onCancel={() => {
          if (!processing) {
            setConfirmAction(null);
          }
        }}
        onConfirm={() => {
          if (confirmAction) {
            void handleProcess(confirmAction);
          }
        }}
        title={
          confirmAction === "delete"
            ? "Confirm channel deletion"
            : "Confirm channel archive"
        }
      />
    </section>
  );
};
