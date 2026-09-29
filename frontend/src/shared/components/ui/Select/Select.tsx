import { forwardRef, type SelectHTMLAttributes } from 'react';
import { cn } from '@/shared/lib';
import { controlClass } from '../Input';

export type SelectProps = SelectHTMLAttributes<HTMLSelectElement> & { invalid?: boolean };

export const Select = forwardRef<HTMLSelectElement, SelectProps>(({ className, invalid, children, ...rest }, ref) => (
  <select ref={ref} className={cn(controlClass, 'pr-8', invalid && 'ring-2 ring-red-400 focus:ring-red-500', className)} aria-invalid={invalid || undefined} {...rest}>
    {children}
  </select>
));
Select.displayName = 'Select';
