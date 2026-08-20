import { useState } from "react";

import styles from "./RemoveThreadsByTagPanel.module.css";
import type {
  RemoveThreadsByTagResponse,
  ThreadByTagAction,
} from "../../models/types";
import { requestRemoveThreadsByTag } from "../../services/threads/removeThreadsByTag";
import { ConfirmationModal } from "../shared/ConfirmationModal";

const DEFAULT_BATCH_LIMIT = 25;
const MAX_BATCH_LIMIT = 500;

export const RemoveThreadsByTagPanel = () => {
  const [tagInput, setTagInput] = useState("");
  const [limitInput, setLimitInput] = useState(String(DEFAULT_BATCH_LIMIT));
  const [preview, setPreview] = useState<RemoveThreadsByTagResponse | null>(null);
  const [result, setResult] = useState<RemoveThreadsByTagResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [processingAction, setProcessingAction] =
    useState<ThreadByTagAction | null>(null);
  const [confirmAction, setConfirmAction] =
    useState<ThreadByTagAction | null>(null);
  const [confirmValue, setConfirmValue] = useState("");
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const previewThreads = preview?.data.matchingThreads ?? [];
  const previewCount = previewThreads.length;

  const clearStalePreview = () => {
    setPreview(null);
    setResult(null);
    setStatusMessage(null);
    setErrorMessage(null);
  };

  const readLimit = (): number | null => {
    const parsed = Number(limitInput);
    if (
      !Number.isSafeInteger(parsed) ||
      parsed < 1 ||
      parsed > MAX_BATCH_LIMIT
    ) {
      return null;
    }
    return parsed;
  };

  const handlePreview = async () => {
    if (loading || processing) {
      return;
    }

    const tag = tagInput.trim();
    if (!tag) {
      setErrorMessage("Provide a thread tag.");
      return;
    }

    const limit = readLimit();
    if (limit === null) {
      setErrorMessage(`Provide a batch limit between 1 and ${MAX_BATCH_LIMIT}.`);
      return;
    }

    setLoading(true);
    setPreview(null);
    setResult(null);
    setStatusMessage(null);
    setErrorMessage(null);

    try {
      const response = await requestRemoveThreadsByTag({
        dryRun: true,
        limit,
        tag,
      });
      setPreview(response);
      setStatusMessage(response.message);
    } catch (error) {
      setErrorMessage((error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleProcessRequest = (action: ThreadByTagAction) => {
    if (processing || previewCount === 0) {
      setErrorMessage("Run a preview with at least one matching thread first.");
      return;
    }
    setConfirmAction(action);
    setConfirmValue("");
  };

  const handleProcess = async (action: ThreadByTagAction) => {
    if (!preview || processing || previewCount === 0) {
      return;
    }

    setConfirmAction(null);
    setProcessing(true);
    setProcessingAction(action);
    setStatusMessage(null);
    setErrorMessage(null);

    try {
      const response = await requestRemoveThreadsByTag({
        action,
        dryRun: false,
        limit: preview.data.limit,
        tag: preview.data.tag,
        threadIds: previewThreads.map((thread) => thread.id),
      });
      setResult(response);
      setPreview(null);
      setStatusMessage(response.message);
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
          <h2>Remove threads by tag</h2>
          <p>
            Preview a limited batch of tagged forum threads, then archive or
            delete that exact batch.
          </p>
        </div>
        <div className={styles.controls}>
          <label>
            Thread tag
            <input
              aria-label="Thread tag"
              value={tagInput}
              onChange={(event) => {
                setTagInput(event.target.value);
                clearStalePreview();
              }}
              placeholder="WTB"
              disabled={loading || processing}
            />
          </label>
          <label>
            Batch limit
            <input
              aria-label="Batch limit"
              type="number"
              min={1}
              max={MAX_BATCH_LIMIT}
              value={limitInput}
              onChange={(event) => {
                setLimitInput(event.target.value);
                clearStalePreview();
              }}
              disabled={loading || processing}
            />
          </label>
          <button
            type="button"
            className="primary-button"
            onClick={() => void handlePreview()}
            disabled={loading || processing}
          >
            {loading ? "Scanning…" : "Preview matching threads"}
          </button>
        </div>
        <small className={styles.safetyNote}>
          Tag matching ignores case. The batch limit also caps how many threads
          can be archived or deleted.
        </small>
      </header>

      {preview && previewCount > 0 && (
        <div className={styles.preview}>
          <div className={styles.previewHeader}>
            <strong>
              {previewCount} of {preview.data.totalMatchingCount} matching
              thread(s) included
            </strong>
            {preview.data.moreCount > 0 && (
              <small>
                {preview.data.moreCount} additional matching thread(s) will not
                be processed.
              </small>
            )}
          </div>
          <ul>
            {previewThreads.map((thread) => (
              <li key={thread.id} className={styles.threadRow}>
                <strong>{thread.name}</strong>
                <small>
                  #{thread.parentChannelName}
                  {thread.archived ? " · Already archived" : ""}
                  {thread.createdAt
                    ? ` · Created ${new Date(thread.createdAt).toLocaleString()}`
                    : " · Creation date unavailable"}
                </small>
              </li>
            ))}
          </ul>
          <div className={styles.actions}>
            <button
              type="button"
              className="primary-button"
              onClick={() => handleProcessRequest("archive")}
              disabled={processing}
            >
              {processing && processingAction === "archive"
                ? "Archiving…"
                : `Archive all ${previewCount}`}
            </button>
            <button
              type="button"
              className="danger-button"
              onClick={() => handleProcessRequest("delete")}
              disabled={processing}
            >
              {processing && processingAction === "delete"
                ? "Deleting…"
                : `Delete all ${previewCount}`}
            </button>
          </div>
        </div>
      )}

      {result && result.data.failures.length > 0 && (
        <div className={styles.failures}>
          <strong>Threads not processed</strong>
          <ul>
            {result.data.failures.map((failure) => (
              <li key={failure}>{failure}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="feedback">
        {statusMessage && <p className="status success">{statusMessage}</p>}
        {errorMessage && <p className="status error">{errorMessage}</p>}
      </div>

      <ConfirmationModal
        confirmDisabled={confirmValue !== String(previewCount)}
        confirmLabel={
          confirmAction === "delete" ? "Delete threads" : "Archive threads"
        }
        confirmingLabel={
          confirmAction === "delete" ? "Deleting..." : "Archiving..."
        }
        isConfirming={processing}
        isOpen={Boolean(confirmAction)}
        message={
          <>
            <p>
              This will {confirmAction ?? "process"} all {previewCount} threads
              in the preview tagged <strong>{preview?.data.tag}</strong>. Type{" "}
              <strong>{previewCount}</strong> to continue.
            </p>
            <label>
              Previewed thread count
              <input
                aria-label="Previewed thread count confirmation"
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
            ? "Confirm thread deletion"
            : "Confirm thread archive"
        }
      />
    </section>
  );
};
