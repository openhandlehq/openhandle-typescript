import { type OpenHandle, OpenHandleError } from '@openhandle/sdk';

interface FailureMetadata {
    code: string;
    requestId?: string;
    retryable: boolean;
}

export async function failureMetadata(openhandle: OpenHandle): Promise<FailureMetadata | null> {
    try {
        await openhandle.instagram.profile('quiet_harbor_test').get();
        return null;
    } catch (error) {
        if (error instanceof OpenHandleError) {
            return { code: error.code, requestId: error.requestId, retryable: error.retryable };
        }
        throw error;
    }
}
