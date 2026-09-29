import type { FetchBaseQueryError } from '@reduxjs/toolkit/query';

export interface FieldIssue {
  in?: string;
  path: string;
  message: string;
}

interface ApiErrorBody {
  error?: { code?: string; message?: string; details?: unknown };
}

function isFetchError(e: unknown): e is FetchBaseQueryError {
  return typeof e === 'object' && e !== null && 'status' in e;
}

export function apiErrorStatus(e: unknown): number | string | undefined {
  return isFetchError(e) ? e.status : undefined;
}

/** Human-readable message from an RTK Query / API error. */
export function apiErrorMessage(e: unknown, fallback = 'Something went wrong'): string {
  if (!e) return fallback;
  if (isFetchError(e)) {
    if (e.status === 'FETCH_ERROR') return 'Cannot reach the server';
    const body = e.data as ApiErrorBody | undefined;
    if (body?.error?.message) return body.error.message;
    if (e.status === 403) return 'You do not have permission to do this';
    if (e.status === 404) return 'Not found';
  }
  if (e instanceof Error) return e.message;
  return fallback;
}

/** A 409 (e.g. duplicate record) with its message and server-provided details such as `existingId`. */
export function apiConflict(e: unknown): { message: string; details: Record<string, unknown> } | null {
  if (!isFetchError(e) || e.status !== 409) return null;
  const err = (e.data as ApiErrorBody | undefined)?.error;
  return {
    message: err?.message ?? 'This record conflicts with an existing one',
    details: (err?.details && typeof err.details === 'object' ? err.details : {}) as Record<string, unknown>,
  };
}

/** Field-level validation issues (422) keyed by field path, for mapping onto form fields. */
export function apiFieldErrors(e: unknown): FieldIssue[] {
  if (!isFetchError(e) || e.status !== 422) return [];
  const details = (e.data as ApiErrorBody | undefined)?.error?.details;
  return Array.isArray(details) ? (details as FieldIssue[]) : [];
}
