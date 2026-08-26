export interface OpenHandleErrorInput {
    cause?: unknown;
    code: string;
    details?: Record<string, unknown>;
    message: string;
    requestId?: string;
    retryable?: boolean;
    retryAfter?: number;
    status?: number;
}

export class OpenHandleError extends Error {
    readonly code: string;
    readonly details?: Record<string, unknown>;
    readonly requestId?: string;
    readonly retryable: boolean;
    readonly retryAfter?: number;
    readonly status?: number;

    constructor(input: OpenHandleErrorInput) {
        super(input.message, { cause: input.cause });
        this.name = 'OpenHandleError';
        this.code = input.code;
        this.details = input.details;
        this.requestId = input.requestId;
        this.retryable = input.retryable ?? false;
        this.retryAfter = input.retryAfter;
        this.status = input.status;
    }
}

export class OpenHandleReferenceError extends TypeError {
    constructor(message: string) {
        super(message);
        this.name = 'OpenHandleReferenceError';
    }
}

export class ReferenceMismatchError extends OpenHandleReferenceError {
    constructor(expectedPlatform: string, expectedResource: string, actualPlatform: string, actualResource: string) {
        super(`Expected a ${expectedPlatform} ${expectedResource} URL, received a ${actualPlatform} ${actualResource} URL.`);
        this.name = 'ReferenceMismatchError';
    }
}
