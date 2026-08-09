import { json, error } from '@sveltejs/kit';
import { hasAnyApiKeys, resolveApiKeys } from '$lib/server/api-keys';
import { lookupGameMeta } from '$lib/server/game-meta';
import type { ApiKeys, GameMeta } from '$lib/types';
import type { RequestHandler } from './$types';

export const prerender = false;

type MetaLookup = {
	id: string;
	name: string;
	releaseDate?: string;
	searchAs?: string[];
	igdbId?: number;
};

type MetaRequest = {
	lookups?: MetaLookup[];
	keys?: ApiKeys;
};

const MAX_LOOKUPS = 48;

export const POST: RequestHandler = async ({ request }) => {
	let body: MetaRequest;
	try {
		body = (await request.json()) as MetaRequest;
	} catch {
		error(400, 'Invalid JSON body');
	}

	const lookups = body.lookups?.filter((lookup) => lookup?.id && lookup?.name) ?? [];
	if (!lookups.length) {
		error(400, 'At least one lookup is required');
	}

	const keys = resolveApiKeys(body.keys);
	if (!hasAnyApiKeys(keys)) {
		error(503, 'No API keys configured');
	}

	const results: Record<string, GameMeta> = {};

	await Promise.all(
		lookups.slice(0, MAX_LOOKUPS).map(async (lookup) => {
			const meta = await lookupGameMeta(lookup.name, keys, {
				releaseDate: lookup.releaseDate,
				searchAs: lookup.searchAs,
				igdbId: lookup.igdbId
			});
			results[lookup.id] = meta;
		})
	);

	return json(results);
};
