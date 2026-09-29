import { forwardRef, type TextareaHTMLAttributes } from 'react';
import { cn } from '@/shared/lib';
import { controlClass } from '../Input';

export type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean };

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(({ className, invalid, rows = 3, ...rest }, ref) => (
  <textarea ref={ref} rows={rows} className={cn(controlClass, invalid && 'ring-2 ring-red-400 focus:ring-red-500', className)} aria-invalid={invalid || undefined} {...rest} />
));
Textarea.displayName = 'Textarea';
