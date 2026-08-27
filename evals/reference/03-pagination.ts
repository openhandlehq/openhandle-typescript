import type { InstagramProfilePostsPage, OpenHandle } from '@openhandle/sdk';

export async function collectPostIDs(openhandle: OpenHandle): Promise<string[]> {
    const ids: string[] = [];
    let page: InstagramProfilePostsPage = await openhandle.instagram.profile('northstar_forge_test').posts.list();
    while (true) {
        ids.push(...page.data.map(post => post.id));
        const nextPage = await page.next();
        if (!nextPage) break;
        page = nextPage;
    }
    return ids;
}
