import { createHash } from 'node:crypto';
import { Redis } from '@upstash/redis';
import { lookupGameMeta } from '$lib/server/game-meta';
import type { ApiKeys, GameMeta } from '$lib/types';

export const META_CACHE_TTL_SECONDS = 24 * 60 * 60;
const META_CACHE_PREFIX = 'meta:v1:';

type LookupOptions = {
	releaseDate?: string;
	searchAs?: string[];
	igdbId?: number;
};

export type MetaLookupInput = {
	id: string;
	name: string;
	releaseDate?: string;
	searchAs?: string[];
	igdbId?: number;
};

let redis: Redis | null | undefined;

function getRedis(): Redis | null {
	if (redis !== undefined) return redis;

	const url = process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
	const token = process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;
	if (!url || !token) {
		redis = null;
		return redis;
	}

	redis = new Redis({ url, token });
	return redis;
}

export function metaCacheKey(name: string, options?: LookupOptions): string {
	const payload = JSON.stringify({
		name: name.trim().toLowerCase(),
		releaseDate: options?.releaseDate,
		igdbId: options?.igdbId,
		searchAs: options?.searchAs?.map((alias) => alias.trim().toLowerCase()).sort()
	});
	const hash = createHash('sha256').update(payload).digest('hex').slice(0, 16);
	return `${META_CACHE_PREFIX}${hash}`;
}

async function readCachedMeta(key: string): Promise<GameMeta | null> {
	const client = getRedis();
	if (!client) return null;
	try {
		return (await client.get<GameMeta>(key)) ?? null;
	} catch {
		return null;
	}
}

async function writeCachedMeta(key: string, meta: GameMeta): Promise<void> {
	const client = getRedis();
	if (!client) return;
	try {
		await client.set(key, meta, { ex: META_CACHE_TTL_SECONDS });
	} catch {
		// Cache write failures should not break the request.
	}
}

export async function lookupGameMetaCached(
	name: string,
	keys: ApiKeys,
	options?: LookupOptions
): Promise<GameMeta> {
	const key = metaCacheKey(name, options);
	const cached = await readCachedMeta(key);
	if (cached) return cached;

	const meta = await lookupGameMeta(name, keys, options);
	await writeCachedMeta(key, meta);
	return meta;
}

export async function lookupGameMetaBatchCached(
	lookups: MetaLookupInput[],
	keys: ApiKeys
): Promise<Record<string, GameMeta>> {
	const results: Record<string, GameMeta> = {};
	if (!lookups.length) return results;

	const keyed = lookups.map((lookup) => ({
		lookup,
		key: metaCacheKey(lookup.name, {
			releaseDate: lookup.releaseDate,
			searchAs: lookup.searchAs,
			igdbId: lookup.igdbId
		})
	}));

	const client = getRedis();
	if (client) {
		try {
			const cacheKeys = keyed.map((entry) => entry.key);
			const cached = await client.mget<GameMeta>(...cacheKeys);
			const misses: typeof keyed = [];

			for (let index = 0; index < keyed.length; index += 1) {
				const { lookup, key } = keyed[index];
				const hit = cached[index];
				if (hit) {
					results[lookup.id] = hit;
				} else {
					misses.push({ lookup, key });
				}
			}

			if (!misses.length) return results;

			await Promise.all(
				misses.map(async ({ lookup, key }) => {
					const meta = await lookupGameMeta(lookup.name, keys, {
						releaseDate: lookup.releaseDate,
						searchAs: lookup.searchAs,
						igdbId: lookup.igdbId
					});
					results[lookup.id] = meta;
					await writeCachedMeta(key, meta);
				})
			);

			return results;
		} catch {
			// Fall through to uncached lookups.
		}
	}

	await Promise.all(
		keyed.map(async ({ lookup }) => {
			results[lookup.id] = await lookupGameMeta(lookup.name, keys, {
				releaseDate: lookup.releaseDate,
				searchAs: lookup.searchAs,
				igdbId: lookup.igdbId
			});
		})
	);

	return results;
}
