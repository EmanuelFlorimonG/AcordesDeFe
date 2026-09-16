import React from 'react';
import { Dialog } from './Dialog';
import { dangerButton, primaryButton, secondaryButton } from './ui';

interface ConfirmDialogProps {
  title: React.ReactNode;
  message: React.ReactNode;
  confirmLabel: string;
  onConfirm: () => void;
  onClose: () => void;
  tone?: 'danger' | 'normal';
}

/** A question with two answers, for changes that can't be undone. */
export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  title,
  message,
  confirmLabel,
  onConfirm,
  onClose,
  tone = 'danger',
}) => (
  <Dialog
    role="alertdialog"
    size="sm"
    title={title}
    onClose={onClose}
    footer={
      <>
        <button type="button" data-autofocus="" onClick={onClose} className={secondaryButton}>
          Cancelar
        </button>
        <button
          type="button"
          onClick={() => {
            onConfirm();
            onClose();
          }}
          className={tone === 'danger' ? dangerButton : primaryButton}
        >
          {confirmLabel}
        </button>
      </>
    }
  >
    <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-300">{message}</p>
  </Dialog>
);
