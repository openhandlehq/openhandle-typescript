import type { OpenHandle } from '@openhandle/sdk';

export function listReplies(openhandle: OpenHandle) {
    return openhandle.instagram.post('Db04otPRpRH').comment('18120112390529134').replies.list();
}
