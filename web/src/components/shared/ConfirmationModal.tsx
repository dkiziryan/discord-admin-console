import { useEffect, useId, useRef } from "react";
import type { ReactNode } from "react";

import styles from "./ConfirmationModal.module.css";

export type ConfirmationModalProps = {
  cancelLabel?: string;
  confirmLabel?: string;
  confirmingLabel?: string;
  isConfirming?: boolean;
  isOpen: boolean;
  message: ReactNode;
  onCancel: () => void;
  onConfirm: () => void;
  title: string;
};

export const ConfirmationModal = ({
  cancelLabel = "Cancel",
  confirmLabel = "Confirm",
  confirmingLabel = "Working...",
  isConfirming = false,
  isOpen,
  message,
  onCancel,
  onConfirm,
  title,
}: ConfirmationModalProps) => {
  const cancelButtonRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    cancelButtonRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onCancel();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onCancel]);

  if (!isOpen) {
    return null;
  }

  return (
    <div className={styles.backdrop} role="presentation">
      <section
        aria-labelledby={titleId}
        aria-modal="true"
        className={styles.modal}
        role="dialog"
      >
        <div className={styles.content}>
          <h2 id={titleId}>{title}</h2>
          <p>{message}</p>
        </div>
        <div className={styles.actions}>
          <button
            ref={cancelButtonRef}
            type="button"
            className="secondary-button"
            disabled={isConfirming}
            onClick={onCancel}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            className="danger-button"
            disabled={isConfirming}
            onClick={onConfirm}
          >
            {isConfirming ? confirmingLabel : confirmLabel}
          </button>
        </div>
      </section>
    </div>
  );
};
