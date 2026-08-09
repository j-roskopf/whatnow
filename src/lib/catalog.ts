import type { CatalogResponse, CatalogSection, CatalogService, GameRatings } from '$lib/types';
import { lookupGameRatings } from '$lib/remote-meta';

function catalogFile(
	service: CatalogService,
	section: CatalogSection,
	system?: string
): string {
	if (service === 'retro' && section === 'library' && system) {
		return `/data/catalog/retro-library-${system}.json`;
	}
	return `/data/catalog/${service}-${section}.json`;
}

export async function loadCatalog(
	service: CatalogService,
	section: CatalogSection,
	system?: string
): Promise<CatalogResponse> {
	try {
		const response = await fetch(catalogFile(service, section, system));
		if (!response.ok) {
			return { entries: [], fetchedAt: new Date().toISOString(), source: 'error' };
		}
		return (await response.json()) as CatalogResponse;
	} catch {
		return { entries: [], fetchedAt: new Date().toISOString(), source: 'error' };
	}
}

export async function loadCatalogRatings(
	lookups: { id: string; name: string }[]
): Promise<Record<string, GameRatings>> {
	if (!lookups.length) return {};

	try {
		return await lookupGameRatings(lookups);
	} catch {
		return {};
	}
}
