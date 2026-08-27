import type { OpenHandle } from '@openhandle/sdk';

export function getWithControls(openhandle: OpenHandle, signal: AbortSignal) {
    return openhandle.twitter.profile('northstar_test').get({ maxRetries: 0, timeoutMs: 5_000, signal });
}
