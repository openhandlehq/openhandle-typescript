import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { operations } from '../dist/generated/operations.js';
import { OpenHandle, OpenHandleError, OpenHandleReferenceError, ReferenceMismatchError } from '../dist/index.js';

describe('OpenHandle resource graph', () => {
    it('generates every OpenAPI operation exactly once', () => {
        assert.equal(operations.length, 126);
        assert.equal(new Set(operations.map(operation => operation.path)).size, operations.length);
    });

    it('treats profile strings as usernames and IDs as explicit strings', async () => {
        const requests: URL[] = [];
        const openhandle = client(async input => {
            requests.push(new URL(input.toString()));
            return profileResponse();
        });

        await openhandle.instagram.profile('12356').get({ freshness: '24h' });
        await openhandle.instagram.profile({ id: '12356' }).get();

        assert.equal(requests[0]?.pathname, '/v1/instagram/profiles/%4012356');
        assert.equal(requests[0]?.searchParams.get('freshness'), '24h');
        assert.equal(requests[1]?.pathname, '/v1/instagram/profiles/12356');
    });

    it('parses explicit social URLs locally and rejects resource mismatches', async () => {
        const requests: URL[] = [];
        const openhandle = client(async input => {
            requests.push(new URL(input.toString()));
            return profileResponse();
        });

        await openhandle.instagram.profile({ url: 'https://www.instagram.com/openai/?hl=en' }).get();
        assert.equal(requests[0]?.pathname, '/v1/instagram/profiles/%40openai');

        assert.throws(
            () =>
                openhandle.instagram.profile({
                    url: 'https://www.instagram.com/p/Db04otPRpRH/',
                }),
            ReferenceMismatchError,
        );
    });

    it('rejects numeric and ambiguous references before making a request', () => {
        const openhandle = client(async () => profileResponse());

        assert.throws(() => openhandle.instagram.profile(12356 as never), OpenHandleReferenceError);
        assert.throws(
            () =>
                openhandle.instagram.profile({
                    username: 'openai',
                    id: '25025320',
                } as never),
            OpenHandleReferenceError,
        );
    });

    it('binds nested resources and follows opaque pagination cursors', async () => {
        const requests: URL[] = [];
        const openhandle = client(async input => {
            const url = new URL(input.toString());
            requests.push(url);
            return pageResponse(url.searchParams.has('cursor') ? null : 'next-page');
        });

        const first = await openhandle.instagram.post('Db04otPRpRH').comment('18120112390529134').replies.list();
        assert.equal(first.hasNextPage, true);
        assert.equal(first.nextCursor, 'next-page');
        assert.equal(first.capturedAt, '2026-08-26T12:00:00Z');
        assert.equal(first.requestId, 'req_test');

        const second = await first.next();
        assert.ok(second);
        assert.equal(second.hasNextPage, false);
        assert.equal(requests[0]?.pathname, '/v1/instagram/posts/Db04otPRpRH/comments/18120112390529134/replies');
        assert.equal(requests[1]?.searchParams.get('cursor'), 'next-page');
    });

    it('throws typed API errors without retrying non-retryable failures', async () => {
        let requests = 0;
        const openhandle = client(async () => {
            requests++;
            return new Response(
                JSON.stringify({
                    error: {
                        code: 'PROFILE_PRIVATE',
                        message: 'This profile is private.',
                        request_id: 'req_private',
                        retryable: false,
                    },
                }),
                { status: 403, headers: { 'Content-Type': 'application/json' } },
            );
        });

        await assert.rejects(openhandle.instagram.profile('private').get(), (error: unknown) => {
            assert.ok(error instanceof OpenHandleError);
            assert.equal(error.code, 'PROFILE_PRIVATE');
            assert.equal(error.requestId, 'req_private');
            assert.equal(error.retryable, false);
            return true;
        });
        assert.equal(requests, 1);
    });

    it('sends URL fetches as typed JSON requests', async () => {
        let body: unknown;
        const openhandle = client(async (_input, init) => {
            body = JSON.parse(String(init?.body));
            return profileResponse();
        });

        await openhandle.fetch('https://www.instagram.com/openai/', { freshness: '7d' });
        assert.deepEqual(body, { url: 'https://www.instagram.com/openai/', freshness: '7d' });
    });

    it('retries explicitly retryable failures and honors Retry-After', async () => {
        let requests = 0;
        const openhandle = new OpenHandle({
            apiKey: 'oh_test_sdk',
            baseUrl: 'https://api.openhandle.test',
            fetch: (async () => {
                requests++;
                if (requests === 1) {
                    return new Response(
                        JSON.stringify({ error: { code: 'UPSTREAM_DEGRADED', message: 'Try again.', request_id: 'req_retry', retryable: true } }),
                        { status: 503, headers: { 'Content-Type': 'application/json', 'Retry-After': '0' } },
                    );
                }
                return profileResponse();
            }) as typeof globalThis.fetch,
            maxRetries: 1,
        });

        await openhandle.instagram.profile('openai').get();
        assert.equal(requests, 2);
    });
});

const client = (fetcher: (input: URL | RequestInfo, init?: RequestInit) => Promise<Response>): OpenHandle =>
    new OpenHandle({
        apiKey: 'oh_test_sdk',
        baseUrl: 'https://api.openhandle.test',
        fetch: fetcher as typeof globalThis.fetch,
        maxRetries: 0,
    });

const profileResponse = (): Response =>
    response({
        platform: 'instagram',
        resource: 'profile',
        captured_at: '2026-08-26T12:00:00Z',
        source: 'live',
        data: { id: '25025320', handle: 'openai' },
    });

const pageResponse = (cursor: string | null): Response =>
    response({
        platform: 'instagram',
        resource: 'comment',
        captured_at: '2026-08-26T12:00:00Z',
        source: 'live',
        data: [],
        meta: { cursors: { next: cursor } },
    });

const response = (body: unknown): Response =>
    new Response(JSON.stringify(body), {
        status: 200,
        headers: {
            'Content-Type': 'application/json',
            'OpenHandle-Billing-Disposition': 'test',
            'OpenHandle-Cost': '0.000',
            'OpenHandle-Environment': 'test',
            'X-Request-ID': 'req_test',
        },
    });
