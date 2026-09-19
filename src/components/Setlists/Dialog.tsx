import React, { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

const SIZES = {
  sm: 'sm:max-w-md',
  md: 'sm:max-w-lg',
  lg: 'sm:max-w-2xl',
};

interface DialogProps {
  title: React.ReactNode;
  description?: React.ReactNode;
  onClose: () => void;
  children?: React.ReactNode;
  footer?: React.ReactNode;
  size?: keyof typeof SIZES;
  role?: 'dialog' | 'alertdialog';
  /** Makes body and footer one form, so Enter submits. */
  onSubmit?: () => void;
}

/**
 * A modal window: a bottom sheet on phones, centered from tablets up. Focus
 * moves in (to the element marked data-autofocus, or the first control),
 * stays inside while open, and returns where it was on closing.
 */
export const Dialog: React.FC<DialogProps> = ({
  title,
  description,
  onClose,
  children,
  footer,
  size = 'md',
  role = 'dialog',
  onSubmit,
}) => {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const panel = panelRef.current;
    const target =
      panel?.querySelector<HTMLElement>('[data-autofocus]') ??
      panel?.querySelector<HTMLElement>(`[data-dialog-body] ${FOCUSABLE.split(', ').join(', [data-dialog-body] ')}`) ??
      panel;
    target?.focus({ preventScroll: true });
    return () => {
      if (previouslyFocused?.isConnected) previouslyFocused.focus({ preventScroll: true });
    };
  }, []);

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      onClose();
      return;
    }
    if (event.key !== 'Tab' || !panelRef.current) return;
    const focusable = Array.from(panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
      (element) => element.offsetParent !== null
    );
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && (document.activeElement === first || document.activeElement === panelRef.current)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  const content = (
    <>
      {children && (
        <div data-dialog-body="" className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 sm:px-6 pb-5">
          {children}
        </div>
      )}
      {footer && (
        <div className="shrink-0 flex flex-wrap items-center justify-end gap-2 border-t border-slate-100 dark:border-dark-800 px-5 sm:px-6 pt-3.5 pb-[max(0.875rem,env(safe-area-inset-bottom))] sm:pb-3.5">
          {footer}
        </div>
      )}
    </>
  );

  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center sm:p-6" onKeyDown={handleKeyDown}>
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-slate-900/40 dark:bg-black/60 animate-fade-in"
        onPointerDown={onClose}
      />
      <div
        ref={panelRef}
        role={role}
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
        className={`relative flex w-full ${SIZES[size]} max-h-[92dvh] sm:max-h-[min(88vh,52rem)] flex-col rounded-t-2xl sm:rounded-2xl border border-slate-200 dark:border-dark-700 bg-white dark:bg-dark-900 text-slate-900 dark:text-slate-100 shadow-2xl animate-dialog-in focus:outline-none`}
      >
        <div className="shrink-0 flex items-start gap-3 px-5 sm:px-6 pt-5 pb-4">
          <div className="min-w-0 flex-1 pt-1">
            <h2 id={titleId} className="text-lg font-bold leading-snug tracking-tight text-[#10203A] dark:text-white break-words">
              {title}
            </h2>
            {description && (
              <div id={descriptionId} className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                {description}
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="-mr-2 w-10 h-10 shrink-0 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-dark-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {onSubmit ? (
          <form
            noValidate
            className="flex min-h-0 flex-1 flex-col"
            onSubmit={(event) => {
              event.preventDefault();
              // A dialog opened from inside another one is a React child of it,
              // so without this the outer form would submit too.
              event.stopPropagation();
              onSubmit();
            }}
          >
            {content}
          </form>
        ) : (
          content
        )}
      </div>
    </div>,
    document.body
  );
};
