import { OpenHandle } from '@openhandle/sdk';

export function createClient(apiKey: string) {
    return new OpenHandle({ apiKey });
}
