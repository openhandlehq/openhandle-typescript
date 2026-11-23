import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

import type { WebhookEvent, WebhookVerificationErrorCode } from '../dist/webhooks.js';
import { verifyWebhook, WebhookVerificationError } from '../dist/webhooks.js';

interface Fixture {
    version: number;
    secret: string;
    defaultToleranceSeconds: number;
    cases: FixtureCase[];
}

interface FixtureCase {
    name: string;
    body: string;
    headers: Record<string, string>;
    now: number;
    toleranceSeconds?: number;
    event?: WebhookEvent;
    error?: WebhookVerificationErrorCode;
}

const fixture = JSON.parse(readFileSync(new URL('../testdata/webhook-conformance.json', import.meta.url), 'utf8')) as Fixture;

const options = (test: FixtureCase) => ({ now: new Date(test.now * 1000), toleranceSeconds: test.toleranceSeconds });

const firstValidCase = (): FixtureCase => {
    const test = fixture.cases.find(candidate => candidate.event !== undefined);
    assert.ok(test, 'The fixture has no valid case.');
    return test;
};

describe('shared webhook conformance', () => {
    assert.equal(fixture.version, 1);
    assert.equal(fixture.defaultToleranceSeconds, 300);

    for (const test of fixture.cases) {
        it(test.name, () => {
            if (test.error) {
                assert.throws(
                    () => verifyWebhook(test.body, test.headers, fixture.secret, options(test)),
                    error => error instanceof WebhookVerificationError && error.code === test.error,
                    `Expected WebhookVerificationError with code ${test.error}.`,
                );
                return;
            }
            assert.deepEqual(verifyWebhook(test.body, test.headers, fixture.secret, options(test)), test.event);
        });
    }
});

describe('verifyWebhook inputs', () => {
    it('verifies a Uint8Array body', () => {
        const test = firstValidCase();
        const body = new TextEncoder().encode(test.body);
        assert.deepEqual(verifyWebhook(body, test.headers, fixture.secret, options(test)), test.event);
    });

    it('reads signature and timestamp from a Headers instance', () => {
        const test = firstValidCase();
        const headers = new Headers(test.headers);
        assert.deepEqual(verifyWebhook(test.body, headers, fixture.secret, options(test)), test.event);
    });
});
