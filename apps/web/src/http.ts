// HTTP status codes and small helpers the web routes use to read requests and fail.
import { HTTPException } from 'hono/http-exception';
import type { ContentfulStatusCode } from 'hono/utils/http-status';

export const CREATED = 201;
export const ACCEPTED = 202;
export const BAD_REQUEST = 400;
export const UNAUTHORIZED = 401;
export const NOT_FOUND = 404;
export const CONFLICT = 409;
export const INTERNAL_ERROR = 500;
export const BAD_GATEWAY = 502;

export function fail(status: ContentfulStatusCode, message: string): HTTPException {
  return new HTTPException(status, { message });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export async function readObject(request: Request): Promise<Record<string, unknown>> {
  const body: unknown = await request.json().catch(() => null);
  if (!isRecord(body)) {
    throw fail(BAD_REQUEST, 'Expected a JSON object body');
  }
  return body;
}

export function requireText(body: Record<string, unknown>, key: string): string {
  const value = body[key];
  if (typeof value !== 'string' || value.trim() === '') {
    throw fail(BAD_REQUEST, `"${key}" must be a non-empty string`);
  }
  return value.trim();
}

export function optionalText(body: Record<string, unknown>, key: string): string | undefined {
  const value = body[key];
  if (value === undefined || value === null || value === '') {
    return undefined;
  }
  if (typeof value !== 'string') {
    throw fail(BAD_REQUEST, `"${key}" must be a string`);
  }
  return value.trim();
}

export function requireId(value: string | undefined, label: string): number {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) {
    throw fail(BAD_REQUEST, `Invalid ${label}`);
  }
  return id;
}
