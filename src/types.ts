import type { paths } from './generated/schema.js';

export type Freshness = 'live' | '24h' | '7d' | '30d';

export type ProfileReference = string | { username: string } | { id: string } | { url: string };
export type ResourceReference = string | { id: string } | { url: string };

export interface OpenHandleConfig {
    apiKey: string;
    baseUrl?: string;
    fetch?: typeof globalThis.fetch;
    maxRetries?: number;
    timeoutMs?: number;
}

export interface RequestControls {
    maxRetries?: number;
    signal?: AbortSignal;
    timeoutMs?: number;
}

export interface ResponseBilling {
    cost: string | null;
    datasetVersion: string | null;
    disposition: 'test' | 'allowance' | 'postpaid' | null;
    environment: 'test' | 'live' | null;
    listPrice: string | null;
}

export interface ResponseMetadata {
    billing: ResponseBilling;
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
    hasNextPage: boolean;
    next(): Promise<OperationPage<Path, Method> | null>;
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
