import { type ChangeEvent, forwardRef, type InputHTMLAttributes, useLayoutEffect, useRef, useState } from 'react';
import { cn, formatAmount } from '@/shared/lib';
import { controlClass } from './controlClass';

export type InputProps = InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean };

const EYE = 'M2 10s3-5.5 8-5.5S18 10 18 10s-3 5.5-8 5.5S2 10 2 10Zm8 2.2a2.2 2.2 0 1 0 0-4.4 2.2 2.2 0 0 0 0 4.4Z';
const EYE_OFF = 'M3 3l14 14M8.6 4.7A8.6 8.6 0 0 1 10 4.5c5 0 8 5.5 8 5.5a14 14 0 0 1-2.4 3M5.6 6.1C3.4 7.6 2 10 2 10s3 5.5 8 5.5c1.4 0 2.6-.4 3.7-1M8.4 8.4a2.2 2.2 0 0 0 3.2 3.2';

export const Input = forwardRef<HTMLInputElement, InputProps>(({ className, invalid, type, onChange, ...rest }, ref) => {
  const [shown, setShown] = useState(false);
  const cls = cn(controlClass, invalid && 'ring-2 ring-red-400 focus:ring-red-500', className);
  // An amount box (inputMode="decimal" on a text input): the thousands commas are added as you type.
  const isAmount = rest.inputMode === 'decimal' && (type === undefined || type === 'text');
  const inner = useRef<HTMLInputElement | null>(null);
  const setRef = (el: HTMLInputElement | null) => {
    inner.current = el;
    if (typeof ref === 'function') ref(el);
    else if (ref) ref.current = el;
  };
  // A value that is not typed (a form's saved value) is shown with its commas too.
  useLayoutEffect(() => {
    const el = inner.current;
    if (isAmount && el && rest.value === undefined) {
      const f = formatAmount(el.value);
      if (f !== el.value) el.value = f;
    }
  });
  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (isAmount) {
      const el = e.target;
      const before = el.value;
      const next = formatAmount(before);
      if (next !== before) {
        // Keep the cursor after the same digits.
        const wanted = before.slice(0, el.selectionStart ?? before.length).replace(/[^\d.]/g, '').length;
        el.value = next;
        let seen = 0;
        let pos = 0;
        while (pos < next.length && seen < wanted) if (/[\d.]/.test(next[pos++]!)) seen++;
        el.setSelectionRange(pos, pos);
      }
    }
    onChange?.(e);
  };
  const shownValue = isAmount && typeof rest.value === 'string' ? formatAmount(rest.value) : rest.value;
  if (type !== 'password') return <input ref={setRef} type={type} className={cls} aria-invalid={invalid || undefined} {...rest} value={shownValue} onChange={handleChange} />;
  // Password: an eye button shows what was typed (and hides it again).
  return (
    <div className="relative">
      <input ref={ref} type={shown ? 'text' : 'password'} className={cn(cls, 'pr-10')} aria-invalid={invalid || undefined} onChange={onChange} {...rest} />
      <button
        type="button"
        onClick={() => setShown((s) => !s)}
        className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-slate-500 hover:text-slate-800"
        aria-label={shown ? 'Hide password' : 'Show password'}
        title={shown ? 'Hide password' : 'Show password'}
        tabIndex={-1}
      >
        <svg viewBox="0 0 20 20" className="size-5" fill="none" aria-hidden>
          <path d={shown ? EYE_OFF : EYE} stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
    </div>
  );
});
Input.displayName = 'Input';
