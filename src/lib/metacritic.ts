import { fetchMetacriticNewReleases } from '$lib/metacritic-live';
import type { MetacriticPlatform, MetacriticReleasesResponse } from '$lib/types';

export async function loadMetacriticNewReleases(
	platform: MetacriticPlatform
): Promise<MetacriticReleasesResponse> {
	try {
		return await fetchMetacriticNewReleases(platform);
	} catch {
		return {
			releases: [],
			platform,
			fetchedAt: new Date().toISOString(),
			source: 'error'
		};
	}
}
