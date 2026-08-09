import { fetchMetacriticAvailableCatalog } from '$lib/server/metacritic';
import { GOOD_RECEPTION_MIN, curateByReception } from '$lib/curation';
import type { CatalogEntry, CatalogResponse, GameRatings, MetacriticPlatform } from '$lib/types';
import { storeUrlForPlatform, storeUrlForPlatformKeys } from '$lib/store-urls';

const MODERN_PLATFORM_LABELS: Record<MetacriticPlatform, string> = {
	ps5: 'PS5',
	ps4: 'PS4',
	switch: 'Switch',
	'xbox-series-x': 'Xbox',
	pc: 'PC'
};

const MODERN_PLATFORMS: MetacriticPlatform[] = ['ps5', 'ps4', 'switch', 'xbox-series-x', 'pc'];

function ratingsFromScore(score: number): GameRatings {
	const rounded = Math.round(score);
	return {
		scores: [{ source: 'metacritic', label: 'Metacritic', score: rounded }],
		metacritic: rounded,
		bestCritic: rounded
	};
}

function mergePlatformKeys(
	existing: MetacriticPlatform[] | undefined,
	platform: MetacriticPlatform
): MetacriticPlatform[] {
	const keys = existing ? [...existing] : [];
	if (!keys.includes(platform)) keys.push(platform);
	return keys;
}

function mergePlatformLabels(existing: string | undefined, label: string): string {
	if (!existing) return label;
	if (existing.includes(label)) return existing;
	return `${existing} · ${label}`;
}

export async function fetchModernRetailLibrary(options?: {
	maxPages?: number;
}): Promise<CatalogResponse> {
	const maxPages = options?.maxPages ?? 8;
	const byName = new Map<string, CatalogEntry>();

	for (const platform of MODERN_PLATFORMS) {
		const releases = await fetchMetacriticAvailableCatalog(platform, { maxPages });
		const label = MODERN_PLATFORM_LABELS[platform];

		for (const release of releases) {
			const key = release.name.toLowerCase();
			const existing = byName.get(key);

			if (existing) {
				existing.platforms = mergePlatformLabels(existing.platforms, label);
				existing.platformKeys = mergePlatformKeys(existing.platformKeys, platform);
				existing.storeUrl = storeUrlForPlatformKeys(existing.name, existing.platformKeys);
				if (!existing.imageUrl && release.imageUrl) existing.imageUrl = release.imageUrl;
				if (release.score != null && !existing.ratings) {
					existing.ratings = ratingsFromScore(release.score);
					existing.tier = String(Math.round(release.score));
				}
				continue;
			}

			byName.set(key, {
				id: `modern-${release.id}`,
				name: release.name,
				service: 'modern',
				section: 'library',
				platforms: label,
				platformKeys: [platform],
				imageUrl: release.imageUrl,
				releaseDate: release.releaseDate,
				storeUrl: storeUrlForPlatform(release.name, platform),
				tier: release.score != null ? String(Math.round(release.score)) : undefined,
				summary: release.summary,
				ratings: release.score != null ? ratingsFromScore(release.score) : undefined
			});
		}
	}

	return {
		entries: [...byName.values()].sort((a, b) => a.name.localeCompare(b.name)),
		fetchedAt: new Date().toISOString(),
		source: 'Metacritic · PS5, PS4, Switch, Xbox & PC'
	};
}

export async function fetchModernRetailPicks(options?: {
	maxPages?: number;
}): Promise<CatalogResponse> {
	const library = await fetchModernRetailLibrary(options);
	const scores = new Map<string, number>();

	for (const entry of library.entries) {
		const score = entry.ratings?.metacritic ?? entry.ratings?.bestCritic;
		if (score != null) scores.set(entry.id, score);
	}

	let curated = curateByReception(library.entries, scores, GOOD_RECEPTION_MIN);
	if (curated.length < Math.min(12, library.entries.length)) {
		const relaxed = curateByReception(library.entries, scores, 70);
		if (relaxed.length > curated.length) curated = relaxed;
	}
	if (!curated.length) {
		curated = library.entries.filter((entry) => (scores.get(entry.id) ?? -1) >= 70).slice(0, 48);
	}

	return {
		entries: curated.slice(0, 48).map((entry) => ({
			...entry,
			section: 'picks' as const,
			summary:
				entry.summary ??
				`Well-received on ${entry.platforms ?? 'modern platforms'} — ${entry.tier ?? '75+'} Metacritic.`
		})),
		fetchedAt: new Date().toISOString(),
		source: 'Well-received · 75+ critics · PS5, PS4, Switch, Xbox & PC'
	};
}
