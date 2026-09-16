import React, { useEffect, useId, useRef, useState } from 'react';

export interface ActionMenuItem {
  label: string;
  icon: React.ElementType;
  onSelect: () => void;
  disabled?: boolean;
  danger?: boolean;
  /** Draws a divider above this item */
  separated?: boolean;
}

interface ActionMenuProps {
  label: string;
  icon: React.ElementType;
  items: ActionMenuItem[];
  triggerClassName: string;
}

const ITEM_HEIGHT = 40;

/**
 * A small menu of actions behind one button. Arrow keys move between items,
 * Esc closes it and returns focus to the button.
 */
export const ActionMenu: React.FC<ActionMenuProps> = ({ label, icon: Icon, items, triggerClassName }) => {
  const [open, setOpen] = useState(false);
  const [opensUp, setOpensUp] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  const menuItems = () =>
    Array.from(menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not([disabled])') ?? []);

  useEffect(() => {
    if (!open) return;
    menuItems()[0]?.focus();
    const handlePointerDown = (event: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [open]);

  const toggle = () => {
    if (!open && triggerRef.current) {
      // Open upward when the menu wouldn't fit below the button.
      const rect = triggerRef.current.getBoundingClientRect();
      const menuHeight = items.length * ITEM_HEIGHT + 16;
      setOpensUp(rect.bottom + menuHeight > window.innerHeight - 16 && rect.top > menuHeight);
    }
    setOpen((value) => !value);
  };

  const close = () => {
    setOpen(false);
    triggerRef.current?.focus();
  };

  const handleMenuKeyDown = (event: React.KeyboardEvent) => {
    const elements = menuItems();
    const index = elements.indexOf(document.activeElement as HTMLButtonElement);
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        elements[(index + 1) % elements.length]?.focus();
        break;
      case 'ArrowUp':
        event.preventDefault();
        elements[(index - 1 + elements.length) % elements.length]?.focus();
        break;
      case 'Home':
        event.preventDefault();
        elements[0]?.focus();
        break;
      case 'End':
        event.preventDefault();
        elements[elements.length - 1]?.focus();
        break;
      case 'Escape':
        event.preventDefault();
        event.stopPropagation();
        close();
        break;
      case 'Tab':
        setOpen(false);
        break;
    }
  };

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        ref={triggerRef}
        type="button"
        onClick={toggle}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={label}
        title={label}
        className={`${triggerClassName} ${open ? 'bg-slate-100 dark:bg-dark-800 text-slate-700 dark:text-slate-200' : ''}`}
      >
        <Icon className="w-[18px] h-[18px]" />
      </button>

      {open && (
        <div
          ref={menuRef}
          id={menuId}
          role="menu"
          aria-label={label}
          onKeyDown={handleMenuKeyDown}
          className={`absolute right-0 z-30 w-60 py-1.5 rounded-xl border border-slate-200 dark:border-dark-700 bg-white dark:bg-dark-900 shadow-xl animate-dialog-in ${
            opensUp ? 'bottom-full mb-1.5' : 'top-full mt-1.5'
          }`}
        >
          {items.map((item) => {
            const ItemIcon = item.icon;
            return (
              <React.Fragment key={item.label}>
                {item.separated && <div role="separator" className="my-1.5 h-px bg-slate-100 dark:bg-dark-800" />}
                <button
                  type="button"
                  role="menuitem"
                  disabled={item.disabled}
                  onClick={() => {
                    close();
                    item.onSelect();
                  }}
                  className={`w-full h-10 flex items-center gap-3 px-3.5 text-left text-sm font-medium transition-colors disabled:opacity-35 focus:outline-none ${
                    item.danger
                      ? 'text-red-600 dark:text-red-400 hover:bg-red-50 focus:bg-red-50 dark:hover:bg-red-500/10 dark:focus:bg-red-500/10'
                      : 'text-slate-700 dark:text-slate-200 hover:bg-slate-50 focus:bg-slate-50 dark:hover:bg-dark-800 dark:focus:bg-dark-800'
                  }`}
                >
                  <ItemIcon className={`w-4 h-4 shrink-0 ${item.danger ? '' : 'text-slate-400'}`} />
                  <span className="truncate">{item.label}</span>
                </button>
              </React.Fragment>
            );
          })}
        </div>
      )}
    </div>
  );
};
