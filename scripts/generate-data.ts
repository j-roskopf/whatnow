import { mkdirSync, writeFileSync } from 'node:fs';
import { isBrowserSafeImageUrl } from '../src/lib/html.ts';
import { UPCOMING, RETRO_SYSTEM_KEYS } from '../src/lib/data.ts';
import { fetchCatalog, fetchLivePool } from '../src/lib/live/catalog.ts';
import { fetchPinnedSections } from '../src/lib/live/pinned.ts';
import { lookupGameMeta } from '../src/lib/server/game-meta.ts';
import { mirrorMetacriticCover } from '../src/lib/server/mirror-image.ts';
import { fetchMetacriticNewReleases } from '../src/lib/server/metacritic.ts';
import type {
	ApiKeys,
	CatalogSection,
	CatalogService,
	GameMeta,
	MetacriticPlatform,
	MetacriticRelease,
	MetacriticReleasesResponse
} from '../src/lib/types.ts';

const outDir = 'static/data';

function writeJson(path: string, data: unknown) {
	writeFileSync(path, `${JSON.stringify(data)}\n`);
}

function slugId(name: string) {
	return name
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-|-$/g, '');
}

function buildKeys(): ApiKeys {
	return {
		steamGridDb: process.env.STEAMGRIDDB_KEY,
		igdbClientId: process.env.IGDB_CLIENT_ID,
		igdbClientSecret: process.env.IGDB_CLIENT_SECRET,
		openCritic: process.env.OPENCRITIC_KEY
	};
}

function slugify(name: string) {
	return name
		.toLowerCase()
		.replace(/[™®©]/g, '')
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-|-$/g, '');
}

async function resolveCoverUrl(
	name: string,
	slug: string,
	keys: ApiKeys,
	options?: { releaseDate?: string; searchAs?: string[]; igdbId?: number }
): Promise<string | undefined> {
	const meta = await lookupGameMeta(name, keys, options);
	const cover = meta.items.find((item) => item.kind === 'cover');
	if (cover?.url && isBrowserSafeImageUrl(cover.url)) return cover.url;

	console.log(`Mirroring Metacritic art for ${name}…`);
	return mirrorMetacriticCover(slug, 'releases');
}

async function generateUpcomingMeta(keys: ApiKeys): Promise<Record<string, GameMeta>> {
	const results: Record<string, GameMeta> = {};

	for (const game of UPCOMING) {
		const id = slugId(game.name);
		console.log(`Generating upcoming art ${game.name}…`);

		const meta = await lookupGameMeta(game.name, keys, {
			releaseDate: game.date,
			searchAs: game.searchAs,
			igdbId: game.igdbId
		});
		if (meta.items.some((item) => isBrowserSafeImageUrl(item.url))) {
			results[id] = {
				...meta,
				items: meta.items.filter((item) => isBrowserSafeImageUrl(item.url))
			};
			continue;
		}

		const slugs = new Set([slugify(game.name), ...(game.searchAs ?? []).map(slugify)]);
		for (const slug of slugs) {
			if (!slug) continue;
			const localUrl = await mirrorMetacriticCover(slug, 'upcoming');
			if (!localUrl) continue;
			results[id] = {
				items: [{ url: localUrl, fit: 'cover', source: 'rawg', kind: 'cover' }],
				ratings: meta.ratings
			};
			break;
		}
	}

	return results;
}

async function enhanceReleaseImages(
	releases: MetacriticRelease[],
	keys: ApiKeys
): Promise<MetacriticRelease[]> {
	return Promise.all(
		releases.map(async (release) => {
			if (isBrowserSafeImageUrl(release.imageUrl)) return release;

			const imageUrl = await resolveCoverUrl(release.name, release.id, keys, {
				releaseDate: release.releaseDate
			});
			return imageUrl ? { ...release, imageUrl } : { ...release, imageUrl: undefined };
		})
	);
}

async function enhanceNewReleases(
	payload: MetacriticReleasesResponse,
	keys: ApiKeys
): Promise<MetacriticReleasesResponse> {
	return {
		...payload,
		releases: await enhanceReleaseImages(payload.releases, keys)
	};
}

const catalogQueries: [CatalogService, CatalogSection][] = [
	['gamepass', 'leaving'],
	['gamepass', 'new'],
	['gamepass', 'library'],
	['psplus', 'leaving'],
	['psplus', 'new'],
	['psplus', 'library'],
	['modern', 'picks'],
	['modern', 'library'],
	['retro', 'picks'],
	['retro', 'library']
];

const metacriticPlatforms: MetacriticPlatform[] = ['ps5', 'ps4', 'xbox-series-x', 'pc'];

mkdirSync(`${outDir}/catalog`, { recursive: true });
mkdirSync(`${outDir}/metacritic`, { recursive: true });
mkdirSync('static/art/releases', { recursive: true });
mkdirSync('static/art/upcoming', { recursive: true });

console.log('Generating pool data…');
writeJson(`${outDir}/pool-fast.json`, await fetchLivePool({ includeRetro: false }));
writeJson(`${outDir}/pool.json`, await fetchLivePool({ includeRetro: true }));

console.log('Generating pinned subscriptions…');
writeJson(`${outDir}/pinned.json`, await fetchPinnedSections());

for (const [service, section] of catalogQueries) {
	const key = `${service}-${section}`;
	console.log(`Generating catalog ${key}…`);
	writeJson(`${outDir}/catalog/${key}.json`, await fetchCatalog(service, section));
}

for (const system of RETRO_SYSTEM_KEYS) {
	const key = `retro-library-${system}`;
	console.log(`Generating catalog ${key}…`);
	writeJson(`${outDir}/catalog/${key}.json`, await fetchCatalog('retro', 'library', system));
}

for (const platform of metacriticPlatforms) {
	console.log(`Generating Metacritic ${platform}…`);
	const payload = await fetchMetacriticNewReleases(platform);
	writeJson(
		`${outDir}/metacritic/${platform}.json`,
		await enhanceNewReleases(payload, buildKeys())
	);
}

console.log('Generating upcoming art…');
writeJson(`${outDir}/upcoming-meta.json`, await generateUpcomingMeta(buildKeys()));

console.log('Static data generation complete.');
