import type { paths } from './generated/schema.js';

export type Freshness = 'live' | '24h' | '7d' | '30d';

export type ProfileReference = string | { username: string } | { id: string } | { url: string };
export type ResourceReference = string | { id: string } | { url: string };

export interface OpenHandleConfig {
    /** Secret Test or Live API key. Never expose it in browser or mobile bundles. */
    apiKey: string;
    /** API origin. Defaults to https://api.openhandle.dev. */
    baseUrl?: string;
    /** Custom Fetch implementation, commonly used for testing or instrumentation. */
    fetch?: typeof globalThis.fetch;
    /** Maximum retry attempts after the initial request. Defaults to 2. */
    maxRetries?: number;
    /** Timeout in milliseconds for each request attempt. Defaults to 30,000. */
    timeoutMs?: number;
}

export interface RequestControls {
    /** Override the client's maximum retry attempts for this operation. */
    maxRetries?: number;
    /** Abort this operation and stop further retry attempts. */
    signal?: AbortSignal;
    /** Override the client's per-attempt timeout in milliseconds for this operation. */
    timeoutMs?: number;
}

export interface ResponseBilling {
    /** Authoritative charge for this request as a decimal string. */
    cost: string | null;
    /** Synthetic dataset version for Test responses. */
    datasetVersion: string | null;
    /** How this request was accounted for. */
    disposition: 'test' | 'allowance' | 'postpaid' | null;
    /** Environment selected by the API key. */
    environment: 'test' | 'live' | null;
    /** Live-equivalent list price as a decimal string. */
    listPrice: string | null;
}

export interface ResponseMetadata {
    /** Accounting headers normalized onto the response. */
    billing: ResponseBilling;
    /** Stable request identifier for logs and support. */
    requestId: string;
}

type SnakeToCamel<Value extends string> = Value extends `${infer Head}_${infer Tail}` ? `${Head}${Capitalize<SnakeToCamel<Tail>>}` : Value;

export type Camelize<Value> = Value extends readonly (infer Item)[]
    ? Camelize<Item>[]
    : Value extends object
      ? {
            [Key in keyof Value as Key extends string ? SnakeToCamel<Key> : Key]: Camelize<Value[Key]>;
        }
      : Value;

type PathOperation<Path extends keyof paths, Method extends keyof paths[Path]> = NonNullable<paths[Path][Method]>;

type QueryFor<Path extends keyof paths, Method extends keyof paths[Path]> =
    PathOperation<Path, Method> extends {
        parameters: { query?: infer Query };
    }
        ? NonNullable<Query>
        : Record<never, never>;

type SuccessBody<Path extends keyof paths, Method extends keyof paths[Path]> =
    PathOperation<Path, Method> extends {
        responses: { 200: { content: { 'application/json': infer Body } } };
    }
        ? Body
        : never;

export type OperationOptions<Path extends keyof paths, Method extends keyof paths[Path]> = Camelize<QueryFor<Path, Method>> & RequestControls;

export type OperationResponse<Path extends keyof paths, Method extends keyof paths[Path]> = Camelize<SuccessBody<Path, Method>> & ResponseMetadata;

export type OperationPage<Path extends keyof paths, Method extends keyof paths[Path]> = OperationResponse<Path, Method> & {
    /** Whether the response includes another opaque cursor. */
    hasNextPage: boolean;
    /** Fetch the next page lazily, or return null after the final page. */
    next(): Promise<OperationPage<Path, Method> | null>;
    /** Opaque cursor for the next page, or null after the final page. */
    nextCursor: string | null;
};

export type FetchOptions = RequestControls & { freshness?: Freshness };

export interface OperationDefinition {
    apiPath: string;
    method: 'get' | 'post';
    operation: 'fetch' | 'get' | 'list' | 'search';
    paginated: boolean;
    path: string;
    scope: readonly OperationScope[];
}

export interface OperationScope {
    name: string;
    parameter?: string;
    reference?: string;
}
