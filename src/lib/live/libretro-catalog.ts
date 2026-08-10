import type { CatalogEntry } from '$lib/types';
import { mobyGamesSearchUrl } from '$lib/store-urls';

const LIBRETRO = 'https://thumbnails.libretro.com';
const USER_AGENT = 'Mozilla/5.0 (compatible; WhatNow/1.0)';

const REGION_RANK: Record<string, number> = {
	usa: 0,
	world: 1,
	europe: 2,
	canada: 3,
	australia: 4
};

function libretroMediaUrl(system: string, folder: string, file: string) {
	return `${LIBRETRO}/${encodeURIComponent(system)}/${folder}/${encodeURIComponent(file)}.png`;
}

export function libretroBoxartUrl(system: string, file: string) {
	return libretroMediaUrl(system, 'Named_Boxarts', file);
}

export function libretroSnapUrl(system: string, file: string) {
	return libretroMediaUrl(system, 'Named_Snaps', file);
}

function slug(text: string) {
	return text
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-|-$/g, '');
}

function displayNameFromFile(file: string) {
	return file
		.replace(/\s*\([^)]*\)/g, '')
		.replace(/\s+/g, ' ')
		.trim();
}

function regionRank(file: string) {
	const match = file.match(/\(([^)]+)\)/i);
	if (!match) return 99;
	const region = match[1].toLowerCase();
	for (const [key, rank] of Object.entries(REGION_RANK)) {
		if (region.includes(key)) return rank;
	}
	return 50;
}

function isPlayableRelease(file: string) {
	if (/beta|proto|sample|demo|unl|hack|alt|bad|pirate/i.test(file)) return false;
	return /\((USA|Europe|World|Canada|Australia)\)/i.test(file);
}

function parseIndexFiles(html: string): string[] {
	const files: string[] = [];
	const pattern = /href="([^"]+\.png)"/gi;
	let match: RegExpExecArray | null;

	while ((match = pattern.exec(html)) !== null) {
		const href = match[1];
		if (!href || href.includes('Parent Directory')) continue;
		const decoded = decodeURIComponent(href.replace(/\.png$/i, ''));
		if (decoded) files.push(decoded);
	}

	return files;
}

function pickBestReleases(files: string[]): string[] {
	const buckets = new Map<string, string>();

	for (const file of files) {
		if (!isPlayableRelease(file)) continue;
		const label = displayNameFromFile(file).toLowerCase();
		if (!label) continue;
		const current = buckets.get(label);
		if (!current || regionRank(file) < regionRank(current)) {
			buckets.set(label, file);
		}
	}

	return [...buckets.values()].sort((a, b) =>
		displayNameFromFile(a).localeCompare(displayNameFromFile(b))
	);
}

export async function fetchLibretroSystemCatalog(
	systemKey: string,
	systemPath: string,
	systemLabel: string
): Promise<CatalogEntry[]> {
	const url = `${LIBRETRO}/${encodeURIComponent(systemPath)}/Named_Boxarts/`;
	const response = await fetch(url, {
		headers: { 'User-Agent': USER_AGENT, Accept: 'text/html' },
		redirect: 'follow'
	});
	if (!response.ok) return [];

	const files = pickBestReleases(parseIndexFiles(await response.text()));
	return files.map((file) => {
		const name = displayNameFromFile(file);
		return {
			id: `retro-${systemKey}-${slug(file)}`,
			name,
			service: 'retro',
			section: 'library',
			system: systemPath,
			file,
			systemLabel,
			platforms: 'Emulated',
			imageUrl: libretroMediaUrl(systemPath, 'Named_Boxarts', file),
			snapUrl: libretroMediaUrl(systemPath, 'Named_Snaps', file),
			tier: systemLabel,
			storeUrl: mobyGamesSearchUrl(name)
		};
	});
}
