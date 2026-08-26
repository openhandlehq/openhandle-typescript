# Contributing

Thank you for improving the OpenHandle TypeScript SDK.

## Development

Install Node.js 20 or newer and pnpm, then run:

```bash
pnpm install
pnpm test
```

Run `pnpm generate` after changing the pinned OpenAPI document or generator.
Generated files must be committed with their source changes.

## Commits

Use Conventional Commits. `feat` changes produce minor releases, `fix` changes
produce patch releases, and a `!` or `BREAKING CHANGE` footer produces a major
release.

API contract changes normally arrive as automated pull requests. Runtime,
typing, documentation, and example improvements are welcome directly.
