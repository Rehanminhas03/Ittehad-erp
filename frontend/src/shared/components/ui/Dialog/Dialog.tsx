import { type ReactNode, useEffect, useRef } from 'react';

export interface DialogProps {
  open: boolean;
  title: ReactNode;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  /** 'lg' for forms with two columns, 'xl' for document previews. Default 'md'. */
  size?: 'md' | 'lg' | 'xl';
}

const WIDTHS = { md: 'max-w-lg', lg: 'max-w-2xl', xl: 'max-w-4xl' };

/** Native <dialog> modal: focus trapping and Escape handling come from the browser. */
export function Dialog({ open, title, onClose, children, footer, size = 'md' }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal?.();
    if (!open && d.open) d.close?.();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      className={`m-auto w-[calc(100%-2rem)] ${WIDTHS[size]} rounded-2xl p-0 shadow-2xl ring-1 ring-slate-900/5 backdrop:bg-slate-900/40 backdrop:backdrop-blur-[2px]`}
    >
      {open && (
        <div>
          <div className="border-b border-slate-100 px-5 py-4">
            <h2 className="text-base font-semibold text-slate-900">{title}</h2>
          </div>
          <div className="px-5 py-4">{children}</div>
          {footer && <div className="flex justify-end gap-2 border-t border-slate-100 bg-slate-50/60 px-5 py-3.5 rounded-b-2xl">{footer}</div>}
        </div>
      )}
    </dialog>
  );
}
