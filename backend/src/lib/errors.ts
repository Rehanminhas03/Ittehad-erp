/** Errors thrown anywhere in request handling; the error middleware maps them to HTTP responses. */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
  }
}

export const badRequest = (message: string, details?: unknown) =>
  new HttpError(400, 'bad_request', message, details);
export const unauthorized = (message = 'Authentication required') =>
  new HttpError(401, 'unauthorized', message);
export const forbidden = (message = 'You do not have permission to perform this action') =>
  new HttpError(403, 'forbidden', message);
export const notFound = (what = 'Resource') => new HttpError(404, 'not_found', `${what} not found`);
export const conflict = (message: string, details?: unknown) =>
  new HttpError(409, 'conflict', message, details);
export const validationError = (details: unknown) =>
  new HttpError(422, 'validation_error', 'Request validation failed', details);
