import { browser } from '$app/environment';
import { lookupGameMeta } from '$lib/remote-meta';
import type {
	ArtLookup,
	GameMedia,
	GameMeta,
	GameRatings,
	MediaItem
} from '$lib/types';

const LIBRETRO = 'https://thumbnails.libretro.com';
const ART_CACHE_PREFIX = 'whatnow:art:';
const META_CACHE_PREFIX = 'whatnow:meta:v3:';
const imageLoadCache = new Map<string, boolean>();

const LIBRETRO_KINDS: { kind: MediaItem['kind']; folder: string; fit: MediaItem['fit'] }[] = [
	{ kind: 'cover', folder: 'Named_Boxarts', fit: 'contain' },
	{ kind: 'screenshot', folder: 'Named_Snaps', fit: 'cover' },
	{ kind: 'title', folder: 'Named_Titles', fit: 'cover' },
	{ kind: 'logo', folder: 'Named_Logos', fit: 'contain' }
];

type LibretroFolder = 'Named_Boxarts' | 'Named_Snaps' | 'Named_Titles' | 'Named_Logos';

export function libretroUrl(game: ArtLookup, folder: LibretroFolder) {
	if (!game.system || !game.file) return null;
	return `${LIBRETRO}/${encodeURIComponent(game.system)}/${folder}/${encodeURIComponent(game.file)}.png`;
}

export function imageLoads(url: string): Promise<boolean> {
	if (!browser) return Promise.resolve(false);
	const cached = imageLoadCache.get(url);
	if (cached !== undefined) return Promise.resolve(cached);

	return new Promise((resolve) => {
		const image = new Image();
		image.onload = () => {
			imageLoadCache.set(url, true);
			resolve(true);
		};
		image.onerror = () => {
			imageLoadCache.set(url, false);
			resolve(false);
		};
		image.src = url;
	});
}

export function cachedImageLoad(url?: string): boolean | undefined {
	if (!url) return undefined;
	return imageLoadCache.get(url);
}

function metaCacheKey(game: ArtLookup) {
	return `${META_CACHE_PREFIX}${game.id}`;
}

function legacyCacheKey(game: ArtLookup) {
	return `${ART_CACHE_PREFIX}${game.id}`;
}

function readCachedMeta(game: ArtLookup): GameMeta | null {
	if (!browser) return null;
	try {
		const meta = localStorage.getItem(metaCacheKey(game));
		if (meta) return JSON.parse(meta) as GameMeta;

		const legacy = localStorage.getItem(legacyCacheKey(game));
		if (legacy) {
			const item = JSON.parse(legacy) as { url: string; fit: MediaItem['fit']; source: MediaItem['source'] };
			return {
				items: [{ ...item, kind: 'cover' }],
				ratings: { scores: [] }
			};
		}
	} catch {
		return null;
	}
	return null;
}

function writeCachedMeta(game: ArtLookup, meta: GameMeta) {
	if (!browser) return;
	try {
		localStorage.setItem(metaCacheKey(game), JSON.stringify(meta));
		localStorage.removeItem(legacyCacheKey(game));
	} catch {
		// Artwork remains a best-effort enhancement if storage is unavailable.
	}
}

export function clearArtCache() {
	if (!browser) return;
	try {
		for (let index = localStorage.length - 1; index >= 0; index -= 1) {
			const key = localStorage.key(index);
			if (key?.startsWith(ART_CACHE_PREFIX) || key?.startsWith(META_CACHE_PREFIX)) {
				localStorage.removeItem(key);
			}
		}
	} catch {
		// Best-effort cache clear.
	}
}

export async function loadLibretroMedia(game: ArtLookup): Promise<MediaItem[]> {
	const candidates = LIBRETRO_KINDS.map(({ kind, folder, fit }) => {
		const url = libretroUrl(game, folder as LibretroFolder);
		return url ? { url, fit, source: 'libretro' as const, kind } : null;
	}).filter((item): item is MediaItem => Boolean(item));

	const loaded = await Promise.all(
		candidates.map(async (item) => ((await imageLoads(item.url)) ? item : null))
	);
	return loaded.filter((item): item is MediaItem => Boolean(item));
}

export async function remoteMeta(game: ArtLookup): Promise<GameMeta> {
	const cached = readCachedMeta(game);
	if (cached?.items.length) return cached;

	try {
		const result = await lookupGameMeta(game.name, {
			releaseDate: game.releaseDate,
			searchAs: game.searchAs,
			igdbId: game.igdbId
		});
		if (result.items.length || result.ratings.scores.length) writeCachedMeta(game, result);
		return result;
	} catch {
		return { items: [], ratings: { scores: [] } };
	}
}

export async function loadGameMeta(game: ArtLookup): Promise<GameMeta> {
	const libretro = await loadLibretroMedia(game);
	if (libretro.length) return { items: libretro, ratings: { scores: [] } };

	return remoteMeta(game);
}

export async function loadGameMedia(game: ArtLookup): Promise<GameMedia> {
	const meta = await loadGameMeta(game);
	return { items: meta.items };
}

export async function loadMetaBatch(lookups: ArtLookup[]): Promise<Record<string, GameMeta>> {
	if (!browser || !lookups.length) return {};

	const results: Record<string, GameMeta> = {};
	const uncached: ArtLookup[] = [];

	for (const lookup of lookups) {
		const hit = readCachedMeta(lookup);
		if (hit?.items.length || hit?.ratings.scores.length) results[lookup.id] = hit;
		else uncached.push(lookup);
	}

	if (uncached.length) {
		try {
			const batch = await Promise.all(
				uncached.map(async (lookup) => {
					const meta = await lookupGameMeta(lookup.name, {
						releaseDate: lookup.releaseDate,
						searchAs: lookup.searchAs,
						igdbId: lookup.igdbId
					});
					return { lookup, meta };
				})
			);

			for (const { lookup, meta } of batch) {
				if (meta.items.length || meta.ratings.scores.length) {
					writeCachedMeta(lookup, meta);
					results[lookup.id] = meta;
				}
			}
		} catch {
			// Batch fetch is best-effort.
		}
	}

	return results;
}

export function slugId(name: string) {
	return name
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-|-$/g, '');
}

export function coverItem(items: MediaItem[]): MediaItem | null {
	return items.find((item) => item.kind === 'cover') ?? items[0] ?? null;
}

export function screenshotItem(items: MediaItem[]): MediaItem | null {
	return items.find((item) => item.kind === 'screenshot') ?? null;
}

export function screenshotItems(items: MediaItem[]): MediaItem[] {
	return items.filter((item) => item.kind === 'screenshot');
}

export function galleryItems(items: MediaItem[]): MediaItem[] {
	const cover = coverItem(items);
	const shots = screenshotItems(items);
	if (shots.length) {
		return cover ? [cover, ...shots.filter((s) => s.url !== cover.url)] : shots;
	}
	const extras = items.filter((item) => item.kind === 'hero' && item.url !== cover?.url);
	return cover ? [cover, ...extras] : extras;
}

export function ratingsMap(
	results: Record<string, GameMeta>
): Record<string, GameRatings> {
	return Object.fromEntries(
		Object.entries(results).map(([id, meta]) => [id, meta.ratings])
	);
}
