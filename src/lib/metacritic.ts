import type { MetacriticPlatform, MetacriticReleasesResponse } from '$lib/types';

export async function loadMetacriticNewReleases(
	platform: MetacriticPlatform
): Promise<MetacriticReleasesResponse> {
	try {
		const response = await fetch(`/data/metacritic/${platform}.json`);
		if (!response.ok) {
			return {
				releases: [],
				platform,
				fetchedAt: new Date().toISOString(),
				source: 'error'
			};
		}
		return (await response.json()) as MetacriticReleasesResponse;
	} catch {
		return {
			releases: [],
			platform,
			fetchedAt: new Date().toISOString(),
			source: 'error'
		};
	}
}
