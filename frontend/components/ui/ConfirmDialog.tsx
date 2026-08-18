"use client";

import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  isConfirming?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  isConfirming = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <Modal
      open={open}
      onClose={onCancel}
      title={title}
      footer={
        <>
          <Button variant="secondary" type="button" onClick={onCancel} disabled={isConfirming}>
            {cancelLabel}
          </Button>
          <Button variant="primary" type="button" onClick={onConfirm} disabled={isConfirming}>
            {isConfirming ? "Working…" : confirmLabel}
          </Button>
        </>
      }
    >
      <p className="text-sm text-text-muted">{message}</p>
    </Modal>
  );
}
