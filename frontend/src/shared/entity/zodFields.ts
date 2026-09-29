import { z } from 'zod';

/**
 * Form-field schemas shared by feature configs. They mirror the backend validation for
 * immediate feedback; the backend remains authoritative (422s are mapped back onto fields).
 */
export const requiredText = (min = 2, max = 120) => z.string().trim().min(min, `At least ${min} characters`).max(max);

/** Empty input -> null, so optional columns are cleared rather than set to ''. */
export const optionalText = (max = 200) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v === '' ? null : v))
    .nullable()
    .optional();

export const code = () =>
  z
    .string()
    .trim()
    .toUpperCase()
    .min(2)
    .max(20)
    .regex(/^[A-Z0-9_-]+$/, 'Letters, digits, - and _ only');

export const idField = (label = 'This field') =>
  z.coerce.number({ error: `${label} is required` }).int().positive(`${label} is required`);

export const optionalId = () =>
  z
    .union([z.literal(''), z.coerce.number().int().positive()])
    .transform((v) => (v === '' ? null : v))
    .nullable()
    .optional();

/** Money as a decimal string; accepts "9,500,000" or "9500000.50". Server re-validates and computes totals. */
export const money = (label = 'Amount') =>
  z
    .string()
    .trim()
    .transform((v) => v.replace(/,/g, '') || '0')
    .refine((v) => /^\d{1,12}(\.\d{1,2})?$/.test(v), `${label} must be a number with up to 2 decimals`);

/** Optional yyyy-mm-dd from a date input ('' -> null). */
export const optionalDate = () =>
  z
    .string()
    .trim()
    .refine((v) => v === '' || /^\d{4}-\d{2}-\d{2}$/.test(v), 'Enter a valid date')
    .transform((v) => (v === '' ? null : v));

export const password = () =>
  z
    .string()
    .min(10, 'At least 10 characters')
    .max(128)
    .regex(/[A-Za-z]/, 'Must contain a letter')
    .regex(/\d/, 'Must contain a digit');
