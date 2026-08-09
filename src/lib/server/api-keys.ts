import { env } from '$env/dynamic/private';
import type { ApiKeys } from '$lib/types';

function pick(...values: (string | undefined)[]) {
	for (const value of values) {
		const trimmed = value?.trim();
		if (trimmed) return trimmed;
	}
	return undefined;
}

export function resolveApiKeys(client?: ApiKeys): ApiKeys {
	return {
		steamGridDb: pick(client?.steamGridDb, env.STEAMGRIDDB_KEY),
		igdbClientId: pick(client?.igdbClientId, env.IGDB_CLIENT_ID),
		igdbClientSecret: pick(client?.igdbClientSecret, env.IGDB_CLIENT_SECRET),
		openCritic: pick(client?.openCritic, env.OPENCRITIC_KEY)
	};
}

export function hasAnyApiKeys(keys: ApiKeys): boolean {
	return Boolean(
		keys.steamGridDb || keys.igdbClientId || keys.igdbClientSecret || keys.openCritic
	);
}
