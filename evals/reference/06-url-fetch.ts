import type { OpenHandle } from '@openhandle/sdk';

export function fetchUnknownResource(openhandle: OpenHandle) {
    return openhandle.fetch('https://www.instagram.com/p/Db04otPRpRH/', { freshness: '24h' });
}
