import { OpenHandleError } from './errors.js';
import { operations } from './generated/operations.js';
import { resolveReference } from './references.js';
import type { OpenHandleConfig, OperationDefinition, OperationScope, RequestControls, ResponseBilling } from './types.js';

interface RuntimeNode {
    children: Map<string, RuntimeNode>;
    operations: Map<string, OperationDefinition>;
    scope?: OperationScope;
}

type BoundReferences = Record<string, string>;
type RuntimeOptions = RequestControls & Record<string, unknown>;

const controlKeys = new Set(['maxRetries', 'signal', 'timeoutMs']);

export class SDKRuntime {
    readonly graph: Record<string, unknown>;

    private readonly apiKey: string;
    private readonly baseUrl: string;
    private readonly fetcher: typeof globalThis.fetch;
    private readonly maxRetries: number;
    private readonly timeoutMs: number;

    constructor(config: OpenHandleConfig) {
        if (!config.apiKey?.trim()) {
            throw new TypeError('OpenHandle requires a non-empty apiKey.');
        }
        this.apiKey = config.apiKey.trim();
        this.baseUrl = (config.baseUrl ?? 'https://api.openhandle.dev').replace(/\/$/, '');
        this.fetcher = config.fetch ?? globalThis.fetch;
        this.maxRetries = config.maxRetries ?? 2;
        this.timeoutMs = config.timeoutMs ?? 30_000;
        this.graph = this.materialize(this.operationTree(), {});
    }

    private operationTree(): RuntimeNode {
        const root: RuntimeNode = { children: new Map(), operations: new Map() };
        for (const operation of operations) {
            let node = root;
            for (const scope of operation.scope) {
                let child = node.children.get(scope.name);
                if (!child) {
                    child = { children: new Map(), operations: new Map(), scope };
                    node.children.set(scope.name, child);
                }
                node = child;
            }
            node.operations.set(operation.operation, operation);
        }
        return root;
    }

    private materialize(node: RuntimeNode, bound: BoundReferences): Record<string, unknown> {
        const value: Record<string, unknown> = {};
        for (const [name, child] of node.children) {
            if (child.scope?.parameter) {
                value[name] = (reference: unknown) => {
                    const platform = this.platformFor(child);
                    const resolved = resolveReference(reference as never, platform, child.scope?.reference ?? child.scope?.name ?? name);
                    return this.materialize(child, {
                        ...bound,
                        [child.scope?.parameter ?? '']: resolved,
                    });
                };
                continue;
            }
            value[name] = this.materialize(child, bound);
        }
        for (const [name, operation] of node.operations) {
            value[name] =
                operation.operation === 'fetch'
                    ? (url: string, options: RuntimeOptions = {}) => this.execute(operation, bound, options, url)
                    : (options: RuntimeOptions = {}) => this.execute(operation, bound, options);
        }
        return value;
    }

    private platformFor(node: RuntimeNode): string {
        let candidate: RuntimeNode | undefined = node;
        while (candidate) {
            for (const operation of candidate.operations.values()) {
                return operation.scope[0]?.name ?? '';
            }
            candidate = candidate.children.values().next().value;
        }
        return '';
    }

    private async execute(operation: OperationDefinition, bound: BoundReferences, options: RuntimeOptions, socialURL?: string): Promise<unknown> {
        const maxRetries = options.maxRetries ?? this.maxRetries;
        let attempt = 0;
        while (true) {
            try {
                return await this.request(operation, bound, options, socialURL);
            } catch (error) {
                const retryable = error instanceof OpenHandleError ? error.retryable : true;
                if (!retryable || attempt >= maxRetries || options.signal?.aborted) {
                    throw error;
                }
                const retryAfter = error instanceof OpenHandleError ? error.retryAfter : undefined;
                await delay(retryAfter ?? backoff(attempt), options.signal);
                attempt++;
            }
        }
    }

    private async request(operation: OperationDefinition, bound: BoundReferences, options: RuntimeOptions, socialURL?: string): Promise<unknown> {
        const path = operation.apiPath.replace(/\{([^}]+)\}/g, (_, parameter: string) => {
            const value = bound[parameter];
            if (!value) {
                throw new TypeError(`Missing bound SDK reference ${parameter} for ${operation.path}.`);
            }
            return encodeURIComponent(value);
        });
        const url = new URL(`${this.baseUrl}${path}`);
        const requestInit: RequestInit = {
            headers: {
                Accept: 'application/json',
                Authorization: `Bearer ${this.apiKey}`,
                'X-OpenHandle-Client': '@openhandle/sdk/0.1.0',
            },
            method: operation.method.toUpperCase(),
            signal: requestSignal(options.signal, options.timeoutMs ?? this.timeoutMs),
        };

        if (operation.operation === 'fetch') {
            if (typeof socialURL !== 'string' || !socialURL.trim()) {
                throw new TypeError('fetch(url) requires a non-empty social URL.');
            }
            requestInit.headers = {
                ...requestInit.headers,
                'Content-Type': 'application/json',
            };
            requestInit.body = JSON.stringify({
                url: socialURL,
                ...requestValues(options),
            });
        } else {
            for (const [key, value] of Object.entries(requestValues(options))) {
                if (value !== undefined && value !== null && value !== '') {
                    url.searchParams.set(snakeCase(key), String(value));
                }
            }
        }

        const response = await this.fetcher(url, requestInit);
        const body = await jsonBody(response);
        if (!response.ok) {
            throw apiError(response, body);
        }
        const result = camelize(body) as Record<string, unknown>;
        result.requestId = response.headers.get('X-Request-ID') ?? '';
        result.billing = billingMetadata(response.headers);
        if (operation.paginated) {
            const nextCursor = pageCursor(result);
            result.nextCursor = nextCursor;
            result.hasNextPage = nextCursor !== null;
            result.next = () => (nextCursor === null ? Promise.resolve(null) : this.execute(operation, bound, { ...options, cursor: nextCursor }));
        }
        return result;
    }
}

const requestValues = (options: RuntimeOptions): Record<string, unknown> =>
    Object.fromEntries(Object.entries(options).filter(([key]) => !controlKeys.has(key)));

const requestSignal = (signal: AbortSignal | undefined, timeoutMs: number): AbortSignal => {
    const timeout = AbortSignal.timeout(timeoutMs);
    return signal ? AbortSignal.any([signal, timeout]) : timeout;
};

const jsonBody = async (response: Response): Promise<unknown> => {
    const text = await response.text();
    if (!text) {
        return {};
    }
    try {
        return JSON.parse(text);
    } catch (cause) {
        throw new OpenHandleError({
            cause,
            code: 'INVALID_RESPONSE',
            message: 'OpenHandle returned invalid JSON.',
            requestId: response.headers.get('X-Request-ID') ?? undefined,
            status: response.status,
        });
    }
};

const apiError = (response: Response, body: unknown): OpenHandleError => {
    const error =
        body && typeof body === 'object' && 'error' in body && body.error && typeof body.error === 'object' ? (body.error as Record<string, unknown>) : {};
    return new OpenHandleError({
        code: typeof error.code === 'string' ? error.code : `HTTP_${response.status}`,
        details: error.details && typeof error.details === 'object' ? (error.details as Record<string, unknown>) : undefined,
        message: typeof error.message === 'string' ? error.message : `OpenHandle request failed with status ${response.status}.`,
        requestId: typeof error.request_id === 'string' ? error.request_id : (response.headers.get('X-Request-ID') ?? undefined),
        retryable: typeof error.retryable === 'boolean' ? error.retryable : response.status === 429 || response.status >= 500,
        retryAfter: retryAfterMilliseconds(response.headers.get('Retry-After')),
        status: response.status,
    });
};

const retryAfterMilliseconds = (value: string | null): number | undefined => {
    if (!value) {
        return undefined;
    }
    const seconds = Number(value);
    if (Number.isFinite(seconds)) {
        return Math.max(0, seconds * 1_000);
    }
    const date = Date.parse(value);
    return Number.isNaN(date) ? undefined : Math.max(0, date - Date.now());
};

const backoff = (attempt: number): number => Math.min(4_000, 250 * 2 ** attempt) * (0.75 + Math.random() * 0.5);

const delay = (milliseconds: number, signal?: AbortSignal): Promise<void> =>
    new Promise((resolve, reject) => {
        const timeout = setTimeout(resolve, milliseconds);
        signal?.addEventListener(
            'abort',
            () => {
                clearTimeout(timeout);
                reject(signal.reason);
            },
            { once: true },
        );
    });

const billingMetadata = (headers: Headers): ResponseBilling => ({
    cost: headers.get('OpenHandle-Cost'),
    datasetVersion: headers.get('OpenHandle-Dataset-Version'),
    disposition: headerEnum(headers.get('OpenHandle-Billing-Disposition'), ['test', 'allowance', 'postpaid']),
    environment: headerEnum(headers.get('OpenHandle-Environment'), ['test', 'live']),
    listPrice: headers.get('OpenHandle-List-Price'),
});

const headerEnum = <Value extends string>(value: string | null, values: readonly Value[]): Value | null =>
    value !== null && values.includes(value as Value) ? (value as Value) : null;

const pageCursor = (response: Record<string, unknown>): string | null => {
    const meta = response.meta;
    if (!meta || typeof meta !== 'object' || !('cursors' in meta)) {
        return null;
    }
    const cursors = meta.cursors;
    if (!cursors || typeof cursors !== 'object' || !('next' in cursors)) {
        return null;
    }
    return typeof cursors.next === 'string' && cursors.next ? cursors.next : null;
};

const camelize = (value: unknown): unknown => {
    if (Array.isArray(value)) {
        return value.map(camelize);
    }
    if (!value || typeof value !== 'object') {
        return value;
    }
    return Object.fromEntries(Object.entries(value).map(([key, child]) => [camelCase(key), camelize(child)]));
};

const camelCase = (value: string): string => value.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase());
const snakeCase = (value: string): string => value.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
