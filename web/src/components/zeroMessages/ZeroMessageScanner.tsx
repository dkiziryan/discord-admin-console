import { useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";

import styles from "./ZeroMessageScanner.module.css";
import type { ScanResponse, ScanStatus } from "../../models/types";
import { cancelScan } from "../../services/zeroMessages/cancelScan";
import { fetchScanStatus } from "../../services/zeroMessages/scanStatus";
import { requestZeroMessageScan } from "../../services/zeroMessages/zeroMessages";
import { fetchDefaultInactiveCategories } from "../../services/inactivity/inactiveDefaults";
import { useScanStatusPolling } from "../../hooks/useScanStatusPolling";
import { parseChannelInput } from "../../utils/channel";
import { ProgressIndicator } from "../shared/ProgressIndicator";
import { ZeroScanResults } from "./ZeroScanResults";

const FAST_SCAN_MAX_MESSAGES_PER_CHANNEL = 5_000;
const SCAN_START_GRACE_PERIOD_MS = 15_000;

export const ZeroMessageScanner = () => {
  const [channelInput, setChannelInput] = useState("");
  const [dryRun, setDryRun] = useState(false);
  const [countReactionsAsActivity, setCountReactionsAsActivity] = useState(false);
  const [fastScan, setFastScan] = useState(false);
  const [activeView, setActiveView] = useState<"scan" | "results">("scan");
  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [result, setResult] = useState<ScanResponse | null>(null);
  const [scanStatus, setScanStatus] = useState<ScanStatus | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [defaultCategories, setDefaultCategories] = useState<string[]>([]);
  const scanRequestInFlight = useRef(false);
  const scanStartedAt = useRef<number | null>(null);

  useEffect(() => {
    void loadDefaultCategories();
  }, []);

  const elapsedSeconds = useScanStatusPolling({
    loading,
    pollStatus: fetchScanStatus,
    onStatus: (payload) => {
      if (!payload) {
        return;
      }

      const scanAgeMs =
        scanStartedAt.current === null ? 0 : Date.now() - scanStartedAt.current;
      const startGracePeriodExpired = scanAgeMs > SCAN_START_GRACE_PERIOD_MS;
      setScanStatus(payload);
      if (!payload.inProgress && payload.result) {
        setResult(payload.result);
        setStatusMessage(payload.result.message);
        setErrorMessage(null);
        setActiveView("results");
        setLoading(false);
      } else if (!payload.inProgress && payload.errorMessage) {
        setResult(null);
        setStatusMessage(null);
        setErrorMessage(payload.errorMessage);
        setActiveView("scan");
        setLoading(false);
      } else if (!payload.inProgress && payload.lastMessage) {
        setStatusMessage(payload.lastMessage);
        setErrorMessage(null);
        setLoading(false);
      } else if (
        !payload.inProgress &&
        (!scanRequestInFlight.current || startGracePeriodExpired)
      ) {
        setStatusMessage(null);
        setErrorMessage("Scan did not start. Try again.");
        setLoading(false);
      }
    },
    onStop: () => {
      setScanStatus(null);
      setCancelling(false);
      scanStartedAt.current = null;
    },
  });

  const formattedElapsedTime = useMemo(() => {
    const minutes = Math.floor(elapsedSeconds / 60);
    const seconds = elapsedSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, "0")}`;
  }, [elapsedSeconds]);

  const formattedPreview = useMemo(() => {
    if (!result) {
      return null;
    }

    const lines = [...result.data.previewNames];
    if (result.data.moreCount > 0) {
      lines.push(`...and ${result.data.moreCount} more`);
    }

    return lines;
  }, [result]);

  const loadDefaultCategories = async () => {
    try {
      const categories = await fetchDefaultInactiveCategories();
      setDefaultCategories(categories);
    } catch (error) {
      setErrorMessage((error as Error).message);
    }
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setStatusMessage(null);
    setErrorMessage(null);
    setResult(null);
    setActiveView("scan");
    setLoading(true);
    scanRequestInFlight.current = true;
    scanStartedAt.current = Date.now();

    void runScan();
  };

  const handleCancel = async () => {
    if (!loading || cancelling) {
      return;
    }

    setCancelling(true);
    setErrorMessage(null);
    try {
      await cancelScan();
    } catch (error) {
      const message = (error as Error).message;
      if (message === "No scan is currently running.") {
        setStatusMessage(message);
        setErrorMessage(null);
        setLoading(false);
      } else {
        setErrorMessage(message);
      }
    } finally {
      setCancelling(false);
    }
  };

  const runScan = async () => {
    const userChannels = parseChannelInput(channelInput);

    try {
      await requestZeroMessageScan({
        countReactionsAsActivity,
        dryRun,
        ...(userChannels.length > 0 ? { channelNames: userChannels } : {}),
        ...(fastScan
          ? { maxMessagesPerChannel: FAST_SCAN_MAX_MESSAGES_PER_CHANNEL }
          : {}),
      });
    } catch (error) {
      const message = (error as Error).message;
      if (message.toLowerCase().includes("cancelled")) {
        setStatusMessage(message);
        setErrorMessage(null);
      } else {
        setErrorMessage(message);
        setStatusMessage(null);
      }
      setResult(null);
      setActiveView("scan");
      setLoading(false);
    } finally {
      scanRequestInFlight.current = false;
    }
  };

  return (
    <>
      {activeView === "scan" ? (
        <>
          <form onSubmit={handleSubmit} className={styles.controlPanel}>
            <label htmlFor="channelInput">
              Target channel names (newline or comma separated). Leave blank to scan all eligible channels.
            </label>
            <textarea
              id="channelInput"
              placeholder="general&#10;in-between"
              value={channelInput}
              onChange={(event) => setChannelInput(event.target.value)}
              rows={6}
              disabled={loading}
            />
            {defaultCategories.length > 0 && (
              <small>
                Default excluded categories:{" "}
                {defaultCategories.map((category) => `“${category}”`).join(", ")}
              </small>
            )}
            <label className={styles.dryRunToggle}>
              <input
                type="checkbox"
                checked={dryRun}
                onChange={(event) => setDryRun(event.target.checked)}
                disabled={loading}
              />
              <span>Dry run (connect to Discord without scanning channels)</span>
            </label>
            <label className={styles.dryRunToggle}>
              <input
                type="checkbox"
                checked={countReactionsAsActivity}
                onChange={(event) => setCountReactionsAsActivity(event.target.checked)}
                disabled={loading}
              />
              <span>Count reactions as activity</span>
            </label>
            <label className={styles.dryRunToggle}>
              <input
                type="checkbox"
                checked={fastScan}
                onChange={(event) => setFastScan(event.target.checked)}
                disabled={loading}
              />
              <span>Fast scan (approximate: first 5,000 messages per channel)</span>
            </label>
            {fastScan ? (
              <small>
                Fast scan can miss older posts and may over-report zero-message users.
              </small>
            ) : (
              <small>
                Exact scan checks full eligible channel history and may take longer.
              </small>
            )}
            <div className={styles.actions}>
              <button type="submit" disabled={loading}>
                {loading ? "Scanning…" : "Scan for zero-message users"}
              </button>
              {loading && (
                <button
                  type="button"
                  className="secondary-button secondary-button--danger"
                  onClick={handleCancel}
                  disabled={cancelling}
                >
                  {cancelling ? "Cancelling…" : "Cancel scan"}
                </button>
              )}
              {result && !loading && (
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => setActiveView("results")}
                >
                  View last results
                </button>
              )}
            </div>

            {loading && (
              <div className={styles.scanProgress}>
                <p className={styles.elapsedTime}>
                  Elapsed scan time: {formattedElapsedTime}
                </p>
                <ProgressIndicator status={scanStatus} />
              </div>
            )}
          </form>

          <section className="feedback">
            {statusMessage && !result && <p className="status success">{statusMessage}</p>}
            {errorMessage && <p className="status error">{errorMessage}</p>}
          </section>
        </>
      ) : (
        result && (
          <ZeroScanResults
            result={result}
            previewLines={formattedPreview}
            statusMessage={statusMessage}
            onRunAnotherScan={() => {
              setActiveView("scan");
              setStatusMessage(null);
              setErrorMessage(null);
            }}
          />
        )
      )}
    </>
  );
};
