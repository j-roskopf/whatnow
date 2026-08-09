import type { ApiKeys, GameMeta, GameRatings } from '$lib/types';

type LookupOptions = {
	releaseDate?: string;
	searchAs?: string[];
	igdbId?: number;
};

type MetaLookup = {
	id: string;
	name: string;
	releaseDate?: string;
	searchAs?: string[];
	igdbId?: number;
};

async function fetchMetaBatch(
	lookups: MetaLookup[],
	keys: ApiKeys
): Promise<Record<string, GameMeta>> {
	if (!lookups.length) return {};

	const response = await fetch('/api/meta', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ lookups, keys })
	});

	if (response.status === 503) return {};
	if (!response.ok) return {};

	return (await response.json()) as Record<string, GameMeta>;
}

export async function lookupGameMeta(
	name: string,
	keys: ApiKeys,
	options?: LookupOptions
): Promise<GameMeta> {
	const id = '__lookup__';
	const results = await fetchMetaBatch([{ id, name, ...options }], keys);
	return results[id] ?? { items: [], ratings: { scores: [] } };
}

export async function lookupGameRatings(
	lookups: { id: string; name: string; searchAs?: string[] }[],
	keys: ApiKeys
): Promise<Record<string, GameRatings>> {
	const results = await fetchMetaBatch(lookups, keys);
	const ratings: Record<string, GameRatings> = {};

	for (const [id, meta] of Object.entries(results)) {
		if (meta.ratings.scores.length) ratings[id] = meta.ratings;
	}

	return ratings;
}
