# OpenHandle TypeScript SDK

The official TypeScript and JavaScript client for the OpenHandle API.

## Installation

```bash
pnpm add @openhandle/sdk
```

The package is also compatible with npm, Yarn, and Bun.

## Usage

```ts
import { OpenHandle } from '@openhandle/sdk';

const openhandle = new OpenHandle({ apiKey: process.env.OPENHANDLE_API_KEY! });
const profile = openhandle.instagram.profile('openai');

const response = await profile.get();
const posts = await profile.posts.list({ freshness: '24h' });
```

Profile strings are usernames. Use an explicit reference for platform IDs and
URLs:

```ts
openhandle.instagram.profile({ id: '25025320' });
openhandle.instagram.profile({ url: 'https://www.instagram.com/openai/' });
```

Platform IDs are opaque strings. Numeric ID values are rejected.

Only terminal operations such as `get`, `list`, `search`, and `fetch` perform
network requests. Selecting a resource is synchronous and can be reused:

```ts
const post = openhandle.instagram.post('Db04otPRpRH');

const details = await post.get();
const comments = await post.comments.list();
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
