import { json, error } from '@sveltejs/kit';
import { hasAnyApiKeys, resolveApiKeys } from '$lib/server/api-keys';
import {
	lookupGameMetaBatchCached,
	META_CACHE_TTL_SECONDS
} from '$lib/server/meta-cache';
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

	const keys = resolveApiKeys();
	if (!hasAnyApiKeys(keys)) {
		error(503, 'No API keys configured');
	}

	const results = await lookupGameMetaBatchCached(lookups.slice(0, MAX_LOOKUPS), keys);

	return json(results, {
		headers: {
			'Cache-Control': `public, s-maxage=${META_CACHE_TTL_SECONDS}, stale-while-revalidate=3600`
		}
	});
};
