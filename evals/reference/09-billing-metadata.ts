import type { InstagramProfileResponse, OpenHandle } from '@openhandle/sdk';

export async function getBillingMetadata(openhandle: OpenHandle) {
    const response: InstagramProfileResponse = await openhandle.instagram.profile('northstar_forge_test').get();
    return {
        cost: response.billing.cost,
        environment: response.billing.environment,
        requestId: response.requestId,
    };
}
