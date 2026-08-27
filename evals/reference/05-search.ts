import type { OpenHandle, TikTokSearchPostsOptions } from '@openhandle/sdk';

export function searchPosts(openhandle: OpenHandle) {
    const options: TikTokSearchPostsOptions = { q: 'synthetic', freshness: '24h' };
    return openhandle.tiktok.search.posts.list(options);
}
