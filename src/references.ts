import { OpenHandleReferenceError, ReferenceMismatchError } from './errors.js';
import type { ProfileReference, ResourceReference } from './types.js';

interface SocialURLResolution {
    identifier: string;
    platform: string;
    resource: string;
}

const numericID = /^[0-9]+$/;
const instagramName = /^[A-Za-z0-9._]{1,30}$/;
const tiktokName = /^[A-Za-z0-9._]{2,24}$/;
const twitterName = /^[A-Za-z0-9_]{1,15}$/;
const shortcode = /^[A-Za-z0-9_-]+$/;

export const resolveReference = (input: ProfileReference | ResourceReference, platform: string, resource: string): string => {
    if (typeof input === 'number') {
        throw new OpenHandleReferenceError('Platform IDs are opaque strings; numeric reference values are not accepted.');
    }
    if (typeof input === 'string') {
        const value = requiredString(input);
        return resource === 'profile' ? usernameReference(value, platform) : value;
    }
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
        throw new OpenHandleReferenceError('A reference must be a string or an object containing exactly one of username, id, or url.');
    }

    const entries = Object.entries(input).filter(([, value]) => value !== undefined);
    if (entries.length !== 1) {
        throw new OpenHandleReferenceError('A reference object must contain exactly one of username, id, or url.');
    }

    const [kind, raw] = entries[0] ?? [];
    if (typeof raw !== 'string') {
        throw new OpenHandleReferenceError('Reference values must be strings.');
    }
    const value = requiredString(raw);
    if (kind === 'username') {
        if (resource !== 'profile') {
            throw new OpenHandleReferenceError(`The ${resource} resource does not accept username references.`);
        }
        return usernameReference(value, platform);
    }
    if (kind === 'id') {
        return value;
    }
    if (kind === 'url') {
        const resolution = resolveSocialURL(value);
        if (resolution.platform !== platform || resolution.resource !== resource) {
            throw new ReferenceMismatchError(platform, resource, resolution.platform, resolution.resource);
        }
        return resolution.identifier;
    }
    throw new OpenHandleReferenceError(`Unknown reference kind ${kind}.`);
};

const usernameReference = (input: string, platform: string): string => {
    const username = input.replace(/^@/, '');
    const valid = platform === 'instagram' ? instagramName.test(username) : platform === 'tiktok' ? tiktokName.test(username) : twitterName.test(username);
    if (!valid) {
        throw new OpenHandleReferenceError(`Invalid ${platform} username.`);
    }
    return `@${username}`;
};

const resolveSocialURL = (input: string): SocialURLResolution => {
    let parsed: URL;
    try {
        parsed = new URL(input.includes('://') ? input : `https://${input}`);
    } catch (cause) {
        throw new OpenHandleReferenceError(`Invalid social URL: ${cause instanceof Error ? cause.message : 'unable to parse URL'}.`);
    }
    if ((parsed.protocol !== 'http:' && parsed.protocol !== 'https:') || parsed.username || parsed.password) {
        throw new OpenHandleReferenceError('Social URLs must use HTTP or HTTPS and cannot contain credentials.');
    }

    const host = parsed.hostname.toLowerCase().replace(/^www\./, '');
    const parts = parsed.pathname.split('/').filter(Boolean);
    if (host === 'instagram.com') {
        return resolveInstagramURL(parts);
    }
    if (host === 'tiktok.com' || host === 'm.tiktok.com') {
        return resolveTikTokURL(parts);
    }
    if (host === 'x.com' || host === 'twitter.com' || host === 'mobile.twitter.com') {
        return resolveTwitterURL(parts);
    }
    throw new OpenHandleReferenceError(`Unsupported social domain ${host}.`);
};

const resolveInstagramURL = (parts: string[]): SocialURLResolution => {
    if (parts.length === 2 && ['p', 'reel', 'tv'].includes(parts[0] ?? '') && shortcode.test(parts[1] ?? '')) {
        return {
            platform: 'instagram',
            resource: 'post',
            identifier: parts[1] ?? '',
        };
    }
    if (parts.length === 3 && parts[0] === 'stories' && parts[1] === 'highlights' && numericID.test(parts[2] ?? '')) {
        return {
            platform: 'instagram',
            resource: 'highlight',
            identifier: parts[2] ?? '',
        };
    }
    if (parts.length === 3 && parts[0] === 'stories' && instagramName.test(parts[1] ?? '') && numericID.test(parts[2] ?? '')) {
        return {
            platform: 'instagram',
            resource: 'story',
            identifier: parts[2] ?? '',
        };
    }
    if (
        parts.length === 1 &&
        instagramName.test(parts[0] ?? '') &&
        !['p', 'reel', 'reels', 'tv', 'explore', 'accounts', 'direct', 'stories'].includes(parts[0]?.toLowerCase() ?? '')
    ) {
        return {
            platform: 'instagram',
            resource: 'profile',
            identifier: `@${parts[0]}`,
        };
    }
    throw new OpenHandleReferenceError('Unsupported Instagram URL.');
};

const resolveTikTokURL = (parts: string[]): SocialURLResolution => {
    const first = parts[0] ?? '';
    const username = first.startsWith('@') ? first.slice(1) : '';
    if (!tiktokName.test(username)) {
        throw new OpenHandleReferenceError('Unsupported TikTok URL.');
    }
    if (parts.length === 3 && parts[1] === 'video' && numericID.test(parts[2] ?? '')) {
        return { platform: 'tiktok', resource: 'post', identifier: parts[2] ?? '' };
    }
    if (parts.length === 1) {
        return {
            platform: 'tiktok',
            resource: 'profile',
            identifier: `@${username}`,
        };
    }
    throw new OpenHandleReferenceError('Unsupported TikTok URL.');
};

const resolveTwitterURL = (parts: string[]): SocialURLResolution => {
    if (parts.length >= 3 && parts[1]?.toLowerCase() === 'status' && twitterName.test(parts[0] ?? '') && numericID.test(parts[2] ?? '')) {
        return {
            platform: 'twitter',
            resource: 'post',
            identifier: parts[2] ?? '',
        };
    }
    if (parts.length === 4 && parts[0] === 'i' && parts[1] === 'web' && parts[2] === 'status' && numericID.test(parts[3] ?? '')) {
        return {
            platform: 'twitter',
            resource: 'post',
            identifier: parts[3] ?? '',
        };
    }
    const username = parts[0] ?? '';
    if (
        parts.length === 1 &&
        twitterName.test(username) &&
        !['home', 'explore', 'search', 'settings', 'messages', 'notifications', 'i', 'intent', 'share'].includes(username.toLowerCase())
    ) {
        return {
            platform: 'twitter',
            resource: 'profile',
            identifier: `@${username}`,
        };
    }
    throw new OpenHandleReferenceError('Unsupported Twitter URL.');
};

const requiredString = (input: string): string => {
    const value = input.trim();
    if (!value) {
        throw new OpenHandleReferenceError('Reference values must not be empty.');
    }
    return value;
};
