import { fetchPsPlusMonthlyOnly } from '$lib/live/catalog';
import { fetchHumbleActiveBundleGames, fetchHumbleChoice } from '$lib/live/humble';
import type { PinnedResponse } from '$lib/types';

export async function fetchPinnedSections(): Promise<PinnedResponse> {
	const [monthly, choice, bundles] = await Promise.all([
		fetchPsPlusMonthlyOnly(),
		fetchHumbleChoice(),
		fetchHumbleActiveBundleGames()
	]);

	return {
		sections: [
			{ id: 'psplus-monthly', label: 'PS Plus Monthly', entries: monthly },
			{ id: 'humble-choice', label: 'Humble Choice', entries: choice },
			{ id: 'humble-bundles', label: 'Humble Bundles', entries: bundles }
		],
		fetchedAt: new Date().toISOString(),
		source: 'PS Plus imagic + Humble Bundle scrape'
	};
}
