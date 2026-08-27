import type { GeneratedClient } from './generated/resources.js';
import { SDKRuntime } from './runtime.js';
import type { OpenHandleConfig } from './types.js';

export {
    OpenHandleError,
    OpenHandleReferenceError,
    ReferenceMismatchError,
} from './errors.js';
export type * from './generated/public-types.js';
export type { components } from './generated/schema.js';
export type {
    Camelize,
    FetchOptions,
    Freshness,
    OpenHandleConfig,
    OperationOptions,
    OperationPage,
    OperationResponse,
    ProfileReference,
    RequestControls,
    ResourceReference,
    ResponseBilling,
    ResponseMetadata,
} from './types.js';

class OpenHandleClient {
    constructor(config: OpenHandleConfig) {
        const runtime = new SDKRuntime(config);
        Object.assign(this, runtime.graph);
    }
}

export type OpenHandle = OpenHandleClient & GeneratedClient;
export const OpenHandle = OpenHandleClient as new (config: OpenHandleConfig) => OpenHandle;
