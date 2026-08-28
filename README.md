# OpenHandle TypeScript SDK

The official TypeScript and JavaScript client for the OpenHandle API.

## Installation

```bash
pnpm add @openhandle/sdk
```

The package is also compatible with npm, Yarn, and Bun.

## Usage

Create a Test key in the [Openhandle dashboard](https://app.openhandle.dev),
store it as `OPENHANDLE_TEST_KEY`, and create one reusable client:

```ts
import { OpenHandle } from '@openhandle/sdk';

const openhandle = new OpenHandle({ apiKey: process.env.OPENHANDLE_TEST_KEY! });
const profile = openhandle.instagram.profile('northstar_forge_test');

const response = await profile.get();
const posts = await profile.posts.list({ freshness: '24h' });

console.log(response.data.handle, posts.data.length);
```

The key selects the environment. `oh_test_` keys return deterministic synthetic
data with a `$0.000` actual charge; `oh_live_` keys use real public identifiers
and normal billing. Never ship an API key in a browser or mobile bundle.

See the [API reference](https://openhandle.dev/docs/api-reference) for a typed
SDK example for every operation.

## Resource selection

The SDK follows one predictable grammar:

```text
openhandle.<platform>.<resource>(reference).<subresource>.<operation>(options)
```

Only terminal operations such as `get`, `list`, `search`, and `fetch` perform
network requests. Selecting a resource is synchronous and reusable:

```ts
const post = openhandle.instagram.post('Db04otPRpRH');

const details = await post.get();
const comments = await post.comments.list();
```

Raw strings use the selected resource's natural shorthand. Supported social
URLs are recognized and validated locally before a request. For profiles, the
remaining shorthand is a username, including an all-numeric username:

```ts
openhandle.instagram.profile('openai');
openhandle.instagram.profile('https://www.instagram.com/openai/');
openhandle.instagram.profile('12356');
openhandle.instagram.profile({ username: '12356' });
openhandle.instagram.profile({ id: '25025320' });
openhandle.instagram.profile({ url: 'https://www.instagram.com/openai/' });
```

Platform IDs are opaque strings and always require an explicit `{ id: '...' }`
reference. Numeric ID values are rejected. Resolution is entirely local: the
SDK does not follow redirects, make hidden lookup requests, or try multiple
interpretations.

Use `fetch` when the URL's platform or resource is not known:

```ts
const response = await openhandle.fetch('https://www.instagram.com/p/Db04otPRpRH/', {
    freshness: '24h',
});
```

## Responses and billing

Successful responses preserve the public envelope and add normalized request
metadata:

```ts
const response = await openhandle.instagram.profile('northstar_forge_test').get();

response.data; // Typed, camel-cased resource
response.platform;
response.resource;
response.capturedAt;
response.source;
response.requestId;
response.billing.cost;
response.billing.environment;
```

Unavailable metrics are `null`, never `0`. Monetary values are decimal strings
so applications do not lose precision.

## Pagination

List operations return a typed page with its opaque cursor and a lazy `next()`
helper:

```ts
let page = await openhandle.instagram.profile('northstar_forge_test').posts.list();

while (true) {
    for (const post of page.data) {
        console.log(post.id);
    }

    const nextPage = await page.next();
    if (!nextPage) break;
    page = nextPage;
}
```

Each call to `next()` that fetches a page is one request. It returns `null`
without a request after the final page.

## Errors and retries

API failures throw `OpenHandleError`. Branch on `code`, never `message`, and
include `requestId` in logs or support requests:

```ts
import { OpenHandleError } from '@openhandle/sdk';

try {
    await openhandle.instagram.profile('quiet_harbor_test').get();
} catch (error) {
    if (error instanceof OpenHandleError) {
        console.error(error.code, error.status, error.retryable, error.requestId);
    }
    throw error;
}
```

The client retries explicitly retryable API failures and transient Fetch
failures up to `maxRetries`. It honors `Retry-After` and uses capped exponential
backoff with jitter. Reference-validation errors occur before a request and are
available as `OpenHandleReferenceError` and `ReferenceMismatchError`.

## Configuration

```ts
const openhandle = new OpenHandle({
    apiKey: process.env.OPENHANDLE_TEST_KEY!,
    baseUrl: 'https://api.openhandle.dev',
    maxRetries: 2,
    timeoutMs: 30_000,
});

await openhandle.instagram.profile('northstar_forge_test').get({
    maxRetries: 0,
    signal: abortController.signal,
    timeoutMs: 10_000,
});
```

| Option | Default | Meaning |
|---|---:|---|
| `apiKey` | required | Secret Test or Live API key |
| `baseUrl` | `https://api.openhandle.dev` | API origin, useful for proxies and tests |
| `fetch` | `globalThis.fetch` | Custom Fetch implementation |
| `maxRetries` | `2` | Retry attempts after the initial request |
| `timeoutMs` | `30000` | Timeout for each request attempt |

`maxRetries`, `timeoutMs`, and an `AbortSignal` can also be supplied per
operation. Per-operation values override client defaults.

## Runtime support

The package is ESM-only and supports Node.js 20 or newer. It also works with
runtimes that provide the standard Fetch and AbortSignal APIs.

## TypeScript conventions

Request options and response fields use camel case. The exported `components`
type represents the raw OpenAPI wire schema; terminal SDK operation return
types apply the camel-case transformation automatically.

The root package also exports camel-cased model types and named aliases for
every operation. These are useful for wrappers, caches, callbacks, and public
function signatures:

```ts
import type {
    InstagramProfile,
    InstagramProfilePostsOptions,
    InstagramProfilePostsPage,
    InstagramProfileResponse,
} from '@openhandle/sdk';

async function getProfile(): Promise<InstagramProfileResponse> {
    return openhandle.instagram.profile('northstar_forge_test').get();
}

function readProfile(profile: InstagramProfile) {
    return profile.handle;
}
```

Operation names omit the terminal `get` or `list`: for example,
`instagram.profile.posts.list` produces `InstagramProfilePostsOptions` and
`InstagramProfilePostsPage`. Search terminals keep `Search` in the name when
needed to avoid ambiguity.

For example:

```ts
const result = await openhandle.instagram.profile('northstar_forge_test').posts.list({
    freshness: '24h',
    since: '2026-08-01T00:00:00Z',
});

result.data[0]?.publishedAt;
```

## Development

The SDK is generated from the pinned OpenAPI document in
[`openapi/openhandle.json`](./openapi/openhandle.json). The generator, runtime,
tests, and generated output are all kept in this repository so releases are
reproducible without access to the private OpenHandle API implementation.

```bash
pnpm install
pnpm generate
pnpm test
```

`pnpm generate:check` fails when the committed generated files do not match the
pinned OpenAPI document.

## Releases

Conventional commits feed an automated release pull request. Merging that pull
request creates a `v*` tag; the tag workflow tests and publishes the package to
npm using trusted publishing. Registry credentials are not stored in GitHub.

## License

[MIT](./LICENSE)
