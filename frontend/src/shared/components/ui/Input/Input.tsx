import { forwardRef, type InputHTMLAttributes } from 'react';
import { cn } from '@/shared/lib';
import { controlClass } from './controlClass';

export type InputProps = InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean };

export const Input = forwardRef<HTMLInputElement, InputProps>(({ className, invalid, ...rest }, ref) => (
  <input ref={ref} className={cn(controlClass, invalid && 'ring-2 ring-red-400 focus:ring-red-500', className)} aria-invalid={invalid || undefined} {...rest} />
));
Input.displayName = 'Input';
