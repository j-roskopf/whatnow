import { fetchPsPlusMonthlyOnly } from '$lib/live/catalog';
import { fetchHumbleActiveBundles, fetchHumbleChoice } from '$lib/live/humble';
import type { PinnedResponse, PinnedSection } from '$lib/types';

export async function fetchPinnedSections(): Promise<PinnedResponse> {
	const [monthly, choice, bundles] = await Promise.all([
		fetchPsPlusMonthlyOnly(),
		fetchHumbleChoice(),
		fetchHumbleActiveBundles()
	]);

	const bundleSections: PinnedSection[] = bundles.map((bundle) => ({
		id: bundle.id,
		label: bundle.label,
		entries: bundle.entries
	}));

	return {
		sections: [
			{ id: 'psplus-monthly', label: 'PS Plus Monthly', entries: monthly },
			{ id: 'humble-choice', label: 'Humble Choice', entries: choice },
			...bundleSections
		],
		fetchedAt: new Date().toISOString(),
		source: 'PS Plus imagic + Humble Bundle scrape'
	};
}
