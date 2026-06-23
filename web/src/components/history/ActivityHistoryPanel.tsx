import { useEffect, useState } from "react";

import styles from "./ActivityHistoryPanel.module.css";
import type { JobHistoryItem } from "../../models/types";
import { fetchJobHistory } from "../../services/jobs/jobHistory";
import {
  formatJobDate,
  formatJobStatus,
  formatJobType,
} from "../../utils/jobHistory";

export const ActivityHistoryPanel = () => {
  const [history, setHistory] = useState<JobHistoryItem[] | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const loadHistory = async () => {
      setLoading(true);
      setErrorMessage(null);
      try {
        const jobs = await fetchJobHistory();
        if (!cancelled) {
          setHistory(jobs);
        }
      } catch (error) {
        if (!cancelled) {
          setErrorMessage((error as Error).message);
          setHistory(null);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void loadHistory();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section className={styles.panel}>
      <header>
        <h2>Activity history</h2>
        <p>Recent dashboard actions for the selected server.</p>
      </header>

      {loading && <p className={styles.empty}>Loading activity history...</p>}
      {errorMessage && <p className="status error">{errorMessage}</p>}
      {!loading && !errorMessage && history?.length === 0 && (
        <p className={styles.empty}>No activity yet.</p>
      )}
      {!loading && !errorMessage && history && history.length > 0 && (
        <ul className={styles.historyList}>
          {history.map((job) => (
            <li key={job.id}>
              <div>
                <strong>{formatJobType(job.type)}</strong>
                <span>{formatJobStatus(job.status)}</span>
              </div>
              <p>{job.errorMessage ?? job.summary}</p>
              <small>{formatJobDate(job.createdAt)}</small>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
};
