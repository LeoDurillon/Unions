// Turns GitHub failures into messages the wizard can show next to the field.
import { HTTPException } from 'hono/http-exception';

import { BAD_GATEWAY, fail, UNAUTHORIZED } from '../http';

function statusOf(error: unknown): number | null {
  return typeof error === 'object' &&
    error !== null &&
    'status' in error &&
    typeof error.status === 'number'
    ? error.status
    : null;
}

/** Turns GitHub failures into messages the wizard can show next to the field. */
export async function guarded<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    if (error instanceof HTTPException) {
      throw error;
    }
    if (statusOf(error) === UNAUTHORIZED) {
      throw fail(
        UNAUTHORIZED,
        'GitHub rejected these credentials (bad or expired token, wrong App ID or private key).',
      );
    }
    const message = error instanceof Error ? error.message : 'GitHub request failed';
    throw fail(BAD_GATEWAY, message);
  }
}
