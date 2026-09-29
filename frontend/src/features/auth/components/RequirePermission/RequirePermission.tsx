import type { ReactNode } from 'react';
import { usePermission } from '@/shared/hooks';
import { Forbidden } from '../Forbidden';

/** Route-level UI gate; the API enforces the same permissions server-side. */
export function RequirePermission({ any, children }: { any: readonly string[]; children: ReactNode }) {
  const perm = usePermission();
  if (!perm.can(any)) return <Forbidden />;
  return <>{children}</>;
}
