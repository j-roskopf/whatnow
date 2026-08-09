import type { CatalogEntry, Game, MetacriticPlatform } from '$lib/types';

function slugify(name: string): string {
	return name
		.toLowerCase()
		.replace(/[™®©]/g, '')
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-|-$/g, '');
}

const STORE_PLATFORM_PRIORITY: MetacriticPlatform[] = [
	'ps5',
	'ps4',
	'xbox-series-x',
	'pc',
	'switch'
];

export function psStoreSearchUrl(name: string): string {
	return `https://store.playstation.com/en-us/search/${encodeURIComponent(name)}`;
}

export function xboxStoreUrl(name: string, productId?: string): string {
	const slug = slugify(name) || 'game';
	if (productId) {
		return `https://www.xbox.com/en-us/games/store/${slug}/${productId}`;
	}
	return `https://www.xbox.com/en-us/search?q=${encodeURIComponent(name)}`;
}

export function steamSearchUrl(name: string): string {
	return `https://store.steampowered.com/search/?term=${encodeURIComponent(name)}`;
}

export function mobyGamesSearchUrl(name: string): string {
	return `https://www.mobygames.com/search/?q=${encodeURIComponent(name)}`;
}

export function nintendoStoreSearchUrl(name: string): string {
	return `https://www.nintendo.com/us/search/?q=${encodeURIComponent(name)}`;
}

export function storeUrlForPlatform(name: string, platform: MetacriticPlatform): string {
	switch (platform) {
		case 'ps5':
		case 'ps4':
			return psStoreSearchUrl(name);
		case 'xbox-series-x':
			return xboxStoreUrl(name);
		case 'pc':
			return steamSearchUrl(name);
		case 'switch':
			return nintendoStoreSearchUrl(name);
	}
}

export function storeUrlForPlatformKeys(
	name: string,
	platformKeys?: MetacriticPlatform[]
): string | undefined {
	if (!platformKeys?.length) return undefined;
	for (const platform of STORE_PLATFORM_PRIORITY) {
		if (platformKeys.includes(platform)) {
			return storeUrlForPlatform(name, platform);
		}
	}
	return storeUrlForPlatform(name, platformKeys[0]);
}

export function storeUrlFromPlatformsLabel(name: string, platforms: string): string | undefined {
	const p = platforms.toLowerCase();
	if (/ps5|ps4|playstation/i.test(p)) return psStoreSearchUrl(name);
	if (/xbox|xsx|game pass/i.test(p)) return xboxStoreUrl(name);
	if (/\bpc\b|windows/i.test(p)) return steamSearchUrl(name);
	if (/switch|nintendo/i.test(p)) return nintendoStoreSearchUrl(name);
	return undefined;
}

export function gamePassStoreUrl(name: string, productId: string): string {
	return xboxStoreUrl(name, productId);
}

export function resolveCatalogStoreUrl(entry: CatalogEntry): string | undefined {
	if (entry.storeUrl) return entry.storeUrl;

	if (entry.service === 'retro' || entry.id.startsWith('retro-')) {
		return mobyGamesSearchUrl(entry.name);
	}

	if (entry.service === 'gamepass' || entry.id.startsWith('gamepass-')) {
		const productId = entry.id.replace(/^gamepass-/, '');
		if (productId) return gamePassStoreUrl(entry.name, productId);
	}

	if (entry.service === 'modern' || entry.id.startsWith('modern-')) {
		return storeUrlForPlatformKeys(entry.name, entry.platformKeys);
	}

	if (entry.service === 'psplus' || entry.id.startsWith('psplus-')) {
		return psStoreSearchUrl(entry.name);
	}

	return undefined;
}

export function resolveGameStoreUrl(game: Game): string | undefined {
	if (game.storeUrl) return game.storeUrl;

	if (game.reason === 'retro' || game.id.startsWith('retro-')) {
		return mobyGamesSearchUrl(game.name);
	}

	if (game.id.startsWith('gamepass-')) {
		const productId = game.id.replace(/^gamepass-/, '');
		if (productId) return gamePassStoreUrl(game.name, productId);
	}

	if (game.reason === 'modern' || game.id.startsWith('modern-')) {
		return storeUrlFromPlatformsLabel(game.name, game.platforms);
	}

	if (game.id.startsWith('psplus-')) {
		return psStoreSearchUrl(game.name);
	}

	return undefined;
}
