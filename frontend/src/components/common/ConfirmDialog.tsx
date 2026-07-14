import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel: string;
  cancelLabel: string;
  /** "destructive" for irreversible/high-risk actions (red confirm button); "primary" otherwise. */
  tone?: "primary" | "destructive";
  onConfirm: () => void;
  onCancel: () => void;
  /** Extra summary content rendered between the description and the action buttons. */
  children?: ReactNode;
}

/**
 * Minimal dependency-free confirmation modal. Used for actions that need a
 * second, explicit step before firing (e.g. committing a real trading mandate)
 * without pulling in a dialog library for a single use case.
 */
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel,
  tone = "primary",
  onConfirm,
  onCancel,
  children,
}: ConfirmDialogProps) {
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    confirmRef.current?.focus();
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onCancel]);

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'hsl(0 0% 0% / 0.5)' }}
      onClick={onCancel}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        className="w-full max-w-sm rounded-2xl p-4 shadow-lg"
        style={{ border: '1px solid hsl(var(--border-hairline))', background: 'hsl(var(--bg-elevated))' }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="confirm-dialog-title" className="text-sm font-semibold text-text-primary">
          {title}
        </h2>
        {description && <p className="mt-1 text-xs leading-relaxed" style={{ color: 'hsl(var(--text-secondary))' }}>{description}</p>}
        {children && <div className="mt-3">{children}</div>}
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="v2-btn-secondary text-xs px-3 py-1.5"
          >
            {cancelLabel}
          </button>
          <button
            ref={confirmRef}
            type="button"
            onClick={onConfirm}
            className={tone === "destructive" ? "v2-btn-negative text-xs px-3 py-1.5" : "v2-btn-primary text-xs px-3 py-1.5"}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
