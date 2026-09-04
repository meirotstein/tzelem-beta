import type { ReactNode } from "react";
import type { ConfirmationRequest } from "../app/types";

export function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <section
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="modal-header">
          <h2>{title}</h2>
          <button
            className="icon-button"
            type="button"
            onClick={onClose}
            aria-label="סגירה"
          >
            ×
          </button>
        </div>
        {children}
      </section>
    </div>
  );
}

export function ConfirmDialog({
  request,
  onClose,
}: {
  request: ConfirmationRequest;
  onClose: () => void;
}) {
  return (
    <Modal title={request.title} onClose={onClose}>
      <p className="confirmation-message">{request.message}</p>
      <div className="modal-actions">
        <button type="button" className="secondary-button" onClick={onClose}>
          ביטול
        </button>
        <button
          type="button"
          className={request.danger ? "danger-button" : "primary-button"}
          onClick={() => {
            onClose();
            request.onConfirm();
          }}
        >
          {request.confirmLabel}
        </button>
      </div>
    </Modal>
  );
}

export function ToastMessage({
  error,
  notice,
  onClose,
}: {
  error: string;
  notice: string;
  onClose: () => void;
}) {
  if (!error && !notice) return null;
  return (
    <div
      className={`toast ${error ? "error" : "success"}`}
      role={error ? "alert" : "status"}
      aria-live={error ? "assertive" : "polite"}
    >
      <span>{error || notice}</span>
      <button onClick={onClose} aria-label="סגירה">
        ×
      </button>
    </div>
  );
}
export const Field = ({ label, children }: { label: string; children: ReactNode }) => (
  <label className="field">
    <span>{label}</span>
    {children}
  </label>
);
export const EmptyList = ({ children }: { children: ReactNode }) => (
  <div className="empty-list">{children}</div>
);
