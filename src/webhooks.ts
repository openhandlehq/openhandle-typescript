import { createHmac, timingSafeEqual } from 'node:crypto';

import { WebhookVerificationError } from './errors.js';
import type { WebhookEvent } from './generated/public-types.js';

export type { WebhookVerificationErrorCode } from './errors.js';
export { WebhookVerificationError } from './errors.js';
export type { WebhookEvent } from './generated/public-types.js';

export type WebhookHeaders = Headers | Record<string, string | string[] | undefined>;

export interface VerifyWebhookOptions {
    /** Maximum allowed difference in seconds between the signed timestamp and `now`. Defaults to 300. */
    toleranceSeconds?: number;
    /** The current time. Exists for tests; defaults to `new Date()`. */
    now?: Date;
}

const signatureHeader = 'x-openhandle-signature';
const timestampHeader = 'x-openhandle-timestamp';
const defaultToleranceSeconds = 300;

/**
 * Verifies a pushed OpenHandle webhook and returns the parsed event.
 *
 * Pass the raw request body exactly as received. Throws `WebhookVerificationError`
 * with a `code` when the request is not a valid, fresh, signed OpenHandle event.
 */
export const verifyWebhook = (rawBody: string | Uint8Array, headers: WebhookHeaders, secret: string, options: VerifyWebhookOptions = {}): WebhookEvent => {
    const signature = readHeader(headers, signatureHeader);
    if (signature === undefined) {
        throw new WebhookVerificationError('missing_signature', 'The X-Openhandle-Signature header is missing.');
    }

    const timestampValue = readHeader(headers, timestampHeader);
    if (timestampValue === undefined) {
        throw new WebhookVerificationError('missing_timestamp', 'The X-Openhandle-Timestamp header is missing.');
    }

    const timestamp = Number(timestampValue);
    if (!/^\d+$/.test(timestampValue) || !Number.isSafeInteger(timestamp)) {
        throw new WebhookVerificationError('invalid_timestamp', 'The X-Openhandle-Timestamp header is not an integer of Unix seconds.');
    }

    const toleranceSeconds = options.toleranceSeconds ?? defaultToleranceSeconds;
    const nowSeconds = Math.floor((options.now ?? new Date()).getTime() / 1000);
    if (Math.abs(nowSeconds - timestamp) > toleranceSeconds) {
        throw new WebhookVerificationError(
            'timestamp_out_of_tolerance',
            `The webhook timestamp is more than ${toleranceSeconds} seconds from the current time.`,
        );
    }

    const body = typeof rawBody === 'string' ? new TextEncoder().encode(rawBody) : rawBody;
    const expected = `sha256=${createHmac('sha256', secret).update(`${timestampValue}.`).update(body).digest('hex')}`;
    const expectedBytes = new TextEncoder().encode(expected);
    const actualBytes = new TextEncoder().encode(signature);
    if (actualBytes.length !== expectedBytes.length || !timingSafeEqual(actualBytes, expectedBytes)) {
        throw new WebhookVerificationError('invalid_signature', 'The X-Openhandle-Signature header does not match the body.');
    }

    let payload: unknown;
    try {
        payload = JSON.parse(typeof rawBody === 'string' ? rawBody : new TextDecoder('utf-8', { fatal: true }).decode(rawBody));
    } catch (cause) {
        throw new WebhookVerificationError('invalid_payload', 'The webhook body is not valid JSON.', { cause });
    }
    if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
        throw new WebhookVerificationError('invalid_payload', 'The webhook body is not a JSON object.');
    }
    const event = payload as Record<string, unknown>;
    const data = event.data;
    const named = ['id', 'type', 'environment', 'createdAt'].every(field => typeof event[field] === 'string');
    if (!named || typeof data !== 'object' || data === null || Array.isArray(data)) {
        throw new WebhookVerificationError('invalid_payload', 'The webhook body is not a webhook event.');
    }

    return payload as WebhookEvent;
};

const readHeader = (headers: WebhookHeaders, name: string): string | undefined => {
    if (isHeaders(headers)) {
        return headers.get(name) || undefined;
    }
    for (const [key, value] of Object.entries(headers)) {
        if (key.toLowerCase() !== name) {
            continue;
        }
        const first = Array.isArray(value) ? value[0] : value;
        if (first) {
            return first;
        }
    }
    return undefined;
};

const isHeaders = (headers: WebhookHeaders): headers is Headers => typeof (headers as Headers).get === 'function';
