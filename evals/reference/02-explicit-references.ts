import type { OpenHandle } from '@openhandle/sdk';

export function getExplicitReferences(openhandle: OpenHandle) {
    return Promise.all([
        openhandle.tiktok.profile({ id: '920000000001' }).get(),
        openhandle.instagram.post({ url: 'https://www.instagram.com/p/Db04otPRpRH/' }).get(),
    ]);
}
