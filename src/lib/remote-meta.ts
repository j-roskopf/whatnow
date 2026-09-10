import type { GameMeta, GameRatings } from '$lib/types';

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

const MAX_LOOKUPS = 48;
const COALESCE_MS = 75;

type PendingResolver = {
	ids: string[];
	resolve: (results: Record<string, GameMeta>) => void;
};

let queue: MetaLookup[] = [];
let resolvers: PendingResolver[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;

async function postMetaBatch(lookups: MetaLookup[]): Promise<Record<string, GameMeta>> {
	if (!lookups.length) return {};

	const response = await fetch('/api/meta', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ lookups })
	});

	if (response.status === 503) return {};
	if (!response.ok) return {};

	return (await response.json()) as Record<string, GameMeta>;
}

function dedupeLookups(lookups: MetaLookup[]): MetaLookup[] {
	const byId = new Map<string, MetaLookup>();
	for (const lookup of lookups) {
		if (!byId.has(lookup.id)) byId.set(lookup.id, lookup);
	}
	return [...byId.values()];
}

async function flushQueue() {
	flushTimer = null;
	const batch = dedupeLookups(queue.splice(0));
	const waiting = resolvers.splice(0);
	if (!batch.length) {
		for (const entry of waiting) entry.resolve({});
		return;
	}

	const results: Record<string, GameMeta> = {};
	try {
		for (let index = 0; index < batch.length; index += MAX_LOOKUPS) {
			const chunk = batch.slice(index, index + MAX_LOOKUPS);
			Object.assign(results, await postMetaBatch(chunk));
		}
	} catch {
		// Resolvers still settle with whatever we have (often empty).
	}

	for (const entry of waiting) {
		const slice: Record<string, GameMeta> = {};
		for (const id of entry.ids) {
			if (results[id]) slice[id] = results[id];
		}
		entry.resolve(slice);
	}
}

function scheduleFlush() {
	if (flushTimer != null) return;
	flushTimer = setTimeout(() => {
		void flushQueue();
	}, COALESCE_MS);
}

async function fetchMetaBatch(lookups: MetaLookup[]): Promise<Record<string, GameMeta>> {
	if (!lookups.length) return {};

	return new Promise((resolve) => {
		queue.push(...lookups);
		resolvers.push({ ids: lookups.map((lookup) => lookup.id), resolve });
		scheduleFlush();
	});
}

export async function lookupGameMeta(name: string, options?: LookupOptions): Promise<GameMeta> {
	const id = `__lookup__:${name}`;
	const results = await fetchMetaBatch([{ id, name, ...options }]);
	return results[id] ?? { items: [], ratings: { scores: [] } };
}

export async function lookupGameMetaBatch(
	lookups: MetaLookup[]
): Promise<Record<string, GameMeta>> {
	return fetchMetaBatch(lookups);
}

export async function lookupGameRatings(
	lookups: { id: string; name: string; searchAs?: string[] }[]
): Promise<Record<string, GameRatings>> {
	const results = await fetchMetaBatch(lookups);
	const ratings: Record<string, GameRatings> = {};

	for (const [id, meta] of Object.entries(results)) {
		if (meta.ratings.scores.length) ratings[id] = meta.ratings;
	}

	return ratings;
}
