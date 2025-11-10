import type { ReactNode } from "react";

import styles from "./AuthCard.module.css";

export const AuthCard = ({
  title,
  description,
  detail,
  error,
  actionLabel,
  onAction,
  children,
}: {
  title: string;
  description: string;
  detail?: string;
  error?: string | null;
  actionLabel?: string;
  onAction?: () => void;
  children?: ReactNode;
}) => (
  <section className={styles.card}>
    <p className={styles.eyebrow}>Access control</p>
    <h2>{title}</h2>
    <p>{description}</p>
    {detail && <p className={styles.detail}>{detail}</p>}
    {error && <p className="status error">{error}</p>}
    {actionLabel && onAction && (
      <button type="button" className={styles.button} onClick={onAction}>
        {actionLabel}
      </button>
    )}
    {children}
  </section>
);
