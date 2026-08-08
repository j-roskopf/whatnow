import { fetchCatalog } from '$lib/live/catalog';
import type { ApiKeys, CatalogResponse, CatalogSection, CatalogService, GameRatings } from '$lib/types';
import { lookupGameRatings } from '$lib/remote-meta';

export async function loadCatalog(
	service: CatalogService,
	section: CatalogSection,
	system?: string
): Promise<CatalogResponse> {
	try {
		return await fetchCatalog(service, section, system);
	} catch {
		return { entries: [], fetchedAt: new Date().toISOString(), source: 'error' };
	}
}

export async function loadCatalogRatings(
	lookups: { id: string; name: string }[],
	keys: ApiKeys
): Promise<Record<string, GameRatings>> {
	if (!lookups.length) return {};

	try {
		return await lookupGameRatings(lookups, keys);
	} catch {
		return {};
	}
}
