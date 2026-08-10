import { load } from 'cheerio';
import { CURATED_UPCOMING } from '$lib/data';
import { fetchMetacriticComingSoon } from '$lib/server/metacritic';
import type { UpcomingGame, UpcomingPlatformKey, UpcomingResponse } from '$lib/types';

const USER_AGENT = 'Mozilla/5.0 (compatible; WhatNow/1.0)';

const PLATFORM_ORDER: Exclude<UpcomingPlatformKey, 'all'>[] = [
	'ps5',
	'xbox-series-x',
	'switch2',
	'switch',
	'pc',
	'ps4'
];

const PLATFORM_LABELS: Record<Exclude<UpcomingPlatformKey, 'all'>, string> = {
	ps5: 'PS5',
	ps4: 'PS4',
	switch: 'Switch',
	switch2: 'Switch 2',
	'xbox-series-x': 'Xbox',
	pc: 'PC'
};

type MutableUpcoming = UpcomingGame & {
	platformSet: Set<Exclude<UpcomingPlatformKey, 'all'>>;
};

function slugId(name: string) {
	return name
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-|-$/g, '');
}

function normalizeKey(name: string) {
	return name
		.toLowerCase()
		.replace(/[™®©'']/g, '')
		.replace(/[^a-z0-9]+/g, ' ')
		.trim();
}

function parseDisplayDate(label?: string): string | undefined {
	if (!label?.trim()) return undefined;
	const parsed = new Date(label.trim());
	if (Number.isNaN(parsed.getTime())) return undefined;
	return parsed.toISOString().slice(0, 10);
}

function formatPlatforms(platformSet: Set<Exclude<UpcomingPlatformKey, 'all'>>) {
	return PLATFORM_ORDER.filter((key) => platformSet.has(key))
		.map((key) => PLATFORM_LABELS[key])
		.join(' · ');
}

function isFutureDate(date: string, today = new Date()) {
	const target = new Date(`${date}T12:00:00`).getTime();
	const floor = new Date(`${today.toISOString().slice(0, 10)}T00:00:00`).getTime();
	return target >= floor;
}

function upsertGame(
	map: Map<string, MutableUpcoming>,
	input: {
		name: string;
		date?: string;
		releaseDateLabel?: string;
		platforms?: Exclude<UpcomingPlatformKey, 'all'>[];
		storeUrl?: string;
		imageUrl?: string;
		score?: number;
		summary?: string;
		searchAs?: string[];
		igdbId?: number;
		steamAppId?: number;
	}
) {
	if (!input.name.trim()) return;
	const key = normalizeKey(input.name);
	if (!key) return;

	const date = input.date ?? parseDisplayDate(input.releaseDateLabel);
	if (!date) return;

	let entry = map.get(key);
	if (!entry) {
		entry = {
			id: slugId(input.name),
			name: input.name.trim(),
			date,
			releaseDateLabel: input.releaseDateLabel,
			platforms: '',
			platformSet: new Set(),
			searchAs: input.searchAs,
			igdbId: input.igdbId,
			steamAppId: input.steamAppId
		};
		map.set(key, entry);
	}

	if (new Date(`${date}T12:00:00`) < new Date(`${entry.date}T12:00:00`)) {
		entry.date = date;
		entry.releaseDateLabel = input.releaseDateLabel ?? entry.releaseDateLabel;
	}

	for (const platform of input.platforms ?? []) {
		entry.platformSet.add(platform);
	}

	if (input.storeUrl) entry.storeUrl = input.storeUrl;
	if (input.imageUrl && !entry.imageUrl) entry.imageUrl = input.imageUrl;
	if (input.score != null) entry.score = input.score;
	if (input.summary && !entry.summary) entry.summary = input.summary;
	if (input.searchAs?.length) {
		entry.searchAs = [...new Set([...(entry.searchAs ?? []), ...input.searchAs])];
	}
	if (input.igdbId) entry.igdbId = input.igdbId;
	if (input.steamAppId) entry.steamAppId = input.steamAppId;
}

function steamHeaderUrl(appId: number) {
	return `https://shared.akamai.steamstatic.com/steam/apps/${appId}/header.jpg`;
}

async function fetchSteamComingSoon(maxItems = 750) {
	const results: {
		appId: number;
		name: string;
		dateLabel: string;
		date?: string;
		storeUrl: string;
	}[] = [];

	for (let start = 0; start < maxItems; start += 50) {
		const url = `https://store.steampowered.com/search/results/?sort_by=Released_ASC&filter=comingsoon&count=50&start=${start}&cc=us&l=english`;
		const response = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
		if (!response.ok) break;

		const html = await response.text();
		const $ = load(html);
		let count = 0;

		$('.search_result_row').each((_, element) => {
			const appId = Number($(element).attr('data-ds-appid'));
			const name = $(element).find('.title').text().trim();
			const dateLabel = $(element).find('.search_released').text().trim();
			if (!appId || !name) return;
			count += 1;
			results.push({
				appId,
				name,
				dateLabel,
				date: parseDisplayDate(dateLabel),
				storeUrl: `https://store.steampowered.com/app/${appId}/`
			});
		});

		if (count < 50) break;
	}

	return results;
}

type SteamAppDetails = {
	name: string;
	date?: string;
	releaseDateLabel?: string;
	headerImage?: string;
	storeUrl: string;
};

async function fetchSteamApp(appId: number): Promise<SteamAppDetails | null> {
	try {
		const response = await fetch(
			`https://store.steampowered.com/api/appdetails/?appids=${appId}&cc=us&l=english`,
			{ headers: { 'User-Agent': USER_AGENT } }
		);
		if (!response.ok) return null;
		const json = await response.json();
		const data = json?.[appId]?.data;
		if (!data?.name) return null;

		const release = data.release_date;
		const releaseDateLabel = release?.date?.trim();
		const date = release?.coming_soon ? parseDisplayDate(releaseDateLabel) : undefined;

		return {
			name: data.name,
			date,
			releaseDateLabel,
			headerImage: data.header_image,
			storeUrl: `https://store.steampowered.com/app/${appId}/`
		};
	} catch {
		return null;
	}
}

async function buildUpcomingMap() {
	const map = new Map<string, MutableUpcoming>();

	const metacriticPlatforms = PLATFORM_ORDER.filter((platform) => platform !== 'pc');
	await Promise.all(
		metacriticPlatforms.map(async (platform) => {
			console.log(`Fetching Metacritic coming soon (${platform})…`);
			const releases = await fetchMetacriticComingSoon(platform, { maxPages: 4 });
			for (const release of releases) {
				upsertGame(map, {
					name: release.name,
					date: release.releaseDate,
					releaseDateLabel: release.releaseDateLabel,
					platforms: [platform],
					storeUrl: release.url,
					imageUrl: release.imageUrl,
					score: release.score,
					summary: release.summary
				});
			}
		})
	);

	console.log('Fetching Metacritic coming soon (pc)…');
	const pcReleases = await fetchMetacriticComingSoon('pc', { maxPages: 4 });
	for (const release of pcReleases) {
		upsertGame(map, {
			name: release.name,
			date: release.releaseDate,
			releaseDateLabel: release.releaseDateLabel,
			platforms: ['pc'],
			storeUrl: release.url,
			imageUrl: release.imageUrl,
			score: release.score,
			summary: release.summary
		});
	}

	console.log('Fetching Steam coming soon…');
	const steamGames = await fetchSteamComingSoon();
	for (const game of steamGames) {
		upsertGame(map, {
			name: game.name,
			date: game.date,
			releaseDateLabel: game.dateLabel,
			platforms: ['pc'],
			storeUrl: game.storeUrl,
			imageUrl: steamHeaderUrl(game.appId),
			steamAppId: game.appId
		});
	}

	for (const curated of CURATED_UPCOMING) {
		let date = curated.date;
		let releaseDateLabel: string | undefined;
		let storeUrl = curated.storeUrl;
		let imageUrl = curated.imageUrl;

		if (curated.steamAppId) {
			const steam = await fetchSteamApp(curated.steamAppId);
			if (steam) {
				date = steam.date ?? date;
				releaseDateLabel = steam.releaseDateLabel;
				storeUrl = steam.storeUrl;
				imageUrl = imageUrl ?? steam.headerImage;
			}
		}

		const platformKeys = curated.platformKeys ?? inferPlatformKeys(curated.platforms);
		upsertGame(map, {
			name: curated.name,
			date,
			releaseDateLabel,
			platforms: platformKeys,
			storeUrl,
			imageUrl,
			searchAs: curated.searchAs,
			igdbId: curated.igdbId,
			steamAppId: curated.steamAppId
		});
	}

	return map;
}

function inferPlatformKeys(platforms: string): Exclude<UpcomingPlatformKey, 'all'>[] {
	const keys: Exclude<UpcomingPlatformKey, 'all'>[] = [];
	const text = platforms.toLowerCase();
	if (/ps5|playstation 5/i.test(text)) keys.push('ps5');
	if (/ps4|playstation 4/i.test(text)) keys.push('ps4');
	if (/switch 2|ns2/i.test(text)) keys.push('switch2');
	else if (/switch|nintendo/i.test(text)) keys.push('switch');
	if (/xbox|xsx|game pass/i.test(text)) keys.push('xbox-series-x');
	if (/\bpc\b|windows/i.test(text)) keys.push('pc');
	return keys;
}

function finalizeGames(map: Map<string, MutableUpcoming>, platform: UpcomingPlatformKey): UpcomingGame[] {
	const today = new Date();
	const games = [...map.values()]
		.map((entry) => {
			const platformKeys = [...entry.platformSet];
			return {
				id: entry.id,
				name: entry.name,
				date: entry.date,
				releaseDateLabel: entry.releaseDateLabel,
				platforms: formatPlatforms(entry.platformSet) || entry.platforms,
				platformKeys,
				storeUrl: entry.storeUrl,
				imageUrl: entry.imageUrl,
				score: entry.score,
				summary: entry.summary,
				searchAs: entry.searchAs,
				igdbId: entry.igdbId,
				steamAppId: entry.steamAppId
			} satisfies UpcomingGame;
		})
		.filter((game) => isFutureDate(game.date, today))
		.filter((game) => {
			if (platform === 'all') return true;
			return game.platformKeys?.includes(platform);
		})
		.sort((a, b) => {
			const dateDiff = new Date(`${a.date}T12:00:00`).getTime() - new Date(`${b.date}T12:00:00`).getTime();
			if (dateDiff !== 0) return dateDiff;
			return a.name.localeCompare(b.name);
		});

	return games;
}

export async function fetchAllUpcomingGames(): Promise<Record<UpcomingPlatformKey, UpcomingResponse>> {
	const map = await buildUpcomingMap();
	const fetchedAt = new Date().toISOString();
	const platforms: UpcomingPlatformKey[] = [
		'all',
		'ps5',
		'switch2',
		'switch',
		'xbox-series-x',
		'pc',
		'ps4'
	];

	const results = {} as Record<UpcomingPlatformKey, UpcomingResponse>;
	for (const platform of platforms) {
		results[platform] = {
			games: finalizeGames(map, platform),
			platform,
			fetchedAt,
			source:
				platform === 'all'
					? 'Metacritic, Steam & curated highlights'
					: `Metacritic & Steam (${PLATFORM_LABELS[platform]})`
		};
	}
	return results;
}

export async function fetchUpcomingGames(platform: UpcomingPlatformKey): Promise<UpcomingResponse> {
	const all = await fetchAllUpcomingGames();
	return all[platform];
}
