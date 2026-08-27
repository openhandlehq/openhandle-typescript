import type { InstagramProfile, OpenHandle } from '@openhandle/sdk';

export async function getProfile(openhandle: OpenHandle): Promise<InstagramProfile> {
    const response = await openhandle.instagram.profile('northstar_forge_test').get({ freshness: '24h' });
    return response.data;
}
