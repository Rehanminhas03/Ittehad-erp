import { forwardRef, type InputHTMLAttributes, type ReactNode, useId } from 'react';
import { cn } from '@/shared/lib';

export type CheckboxProps = InputHTMLAttributes<HTMLInputElement> & { label: ReactNode };

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(({ label, className, id, ...rest }, ref) => {
  const auto = useId();
  const cid = id ?? auto;
  return (
    <label htmlFor={cid} className={cn('inline-flex items-center gap-2 text-sm text-slate-700', className)}>
      <input ref={ref} id={cid} type="checkbox" className="size-4 rounded border-slate-300 text-brand-600 focus:ring-2 focus:ring-brand-500 focus:ring-offset-0" {...rest} />
      {label}
    </label>
  );
});
Checkbox.displayName = 'Checkbox';
