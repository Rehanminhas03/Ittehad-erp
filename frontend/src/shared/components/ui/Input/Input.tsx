import { forwardRef, type InputHTMLAttributes, useState } from 'react';
import { cn } from '@/shared/lib';
import { controlClass } from './controlClass';

export type InputProps = InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean };

const EYE = 'M2 10s3-5.5 8-5.5S18 10 18 10s-3 5.5-8 5.5S2 10 2 10Zm8 2.2a2.2 2.2 0 1 0 0-4.4 2.2 2.2 0 0 0 0 4.4Z';
const EYE_OFF = 'M3 3l14 14M8.6 4.7A8.6 8.6 0 0 1 10 4.5c5 0 8 5.5 8 5.5a14 14 0 0 1-2.4 3M5.6 6.1C3.4 7.6 2 10 2 10s3 5.5 8 5.5c1.4 0 2.6-.4 3.7-1M8.4 8.4a2.2 2.2 0 0 0 3.2 3.2';

export const Input = forwardRef<HTMLInputElement, InputProps>(({ className, invalid, type, ...rest }, ref) => {
  const [shown, setShown] = useState(false);
  const cls = cn(controlClass, invalid && 'ring-2 ring-red-400 focus:ring-red-500', className);
  if (type !== 'password') return <input ref={ref} type={type} className={cls} aria-invalid={invalid || undefined} {...rest} />;
  // Password: an eye button shows what was typed (and hides it again).
  return (
    <div className="relative">
      <input ref={ref} type={shown ? 'text' : 'password'} className={cn(cls, 'pr-10')} aria-invalid={invalid || undefined} {...rest} />
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
