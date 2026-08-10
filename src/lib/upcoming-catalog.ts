import type { UpcomingPlatformKey, UpcomingResponse } from '$lib/types';

export async function loadUpcomingGames(platform: UpcomingPlatformKey): Promise<UpcomingResponse> {
	try {
		const response = await fetch(`/data/upcoming/${platform}.json`);
		if (!response.ok) {
			return emptyResponse(platform);
		}
		return (await response.json()) as UpcomingResponse;
	} catch {
		return emptyResponse(platform);
	}
}

function emptyResponse(platform: UpcomingPlatformKey): UpcomingResponse {
	return {
		games: [],
		platform,
		fetchedAt: new Date().toISOString(),
		source: 'error'
	};
}
