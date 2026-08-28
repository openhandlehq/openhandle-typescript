import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

import { OpenHandleReferenceError, ReferenceMismatchError } from '../dist/errors.js';
import { resolveReference } from '../dist/references.js';
import type { ProfileReference, ResourceReference } from '../dist/types.js';

interface Fixture {
    version: number;
    cases: FixtureCase[];
}

interface FixtureCase {
    name: string;
    platform: string;
    resource: string;
    input: {
        kind: 'raw' | 'username' | 'id' | 'url';
        value: string;
    };
    identifier?: string;
    error?: 'invalid_reference' | 'reference_mismatch';
}

const fixture = JSON.parse(readFileSync(new URL('../testdata/reference-conformance.json', import.meta.url), 'utf8')) as Fixture;

describe('shared reference conformance', () => {
    assert.equal(fixture.version, 1);

    for (const test of fixture.cases) {
        it(test.name, () => {
            const reference = fixtureReference(test);
            if (test.error) {
                assert.throws(
                    () => resolveReference(reference, test.platform, test.resource),
                    error => referenceErrorName(error) === test.error,
                );
                return;
            }
            assert.equal(resolveReference(reference, test.platform, test.resource), test.identifier);
        });
    }
});

const fixtureReference = (test: FixtureCase): ProfileReference | ResourceReference => {
    switch (test.input.kind) {
        case 'raw':
            return test.input.value;
        case 'username':
            return { username: test.input.value };
        case 'id':
            return { id: test.input.value };
        case 'url':
            return { url: test.input.value };
    }
};

const referenceErrorName = (error: unknown): FixtureCase['error'] | 'unexpected_error' => {
    if (error instanceof ReferenceMismatchError) {
        return 'reference_mismatch';
    }
    if (error instanceof OpenHandleReferenceError) {
        return 'invalid_reference';
    }
    return 'unexpected_error';
};
