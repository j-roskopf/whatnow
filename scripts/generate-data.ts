import { mkdirSync, writeFileSync } from 'node:fs';
import { UPCOMING, RETRO_SYSTEM_KEYS } from '../src/lib/data.ts';
import { fetchCatalog, fetchLivePool } from '../src/lib/live/catalog.ts';
import { lookupGameMeta } from '../src/lib/server/game-meta.ts';
import { fetchMetacriticGameImage, fetchMetacriticNewReleases } from '../src/lib/server/metacritic.ts';
import type { ApiKeys, CatalogSection, CatalogService, GameMeta, MetacriticPlatform } from '../src/lib/types.ts';

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

function slugify(name: string) {
	return name
		.toLowerCase()
		.replace(/[™®©]/g, '')
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
		if (meta.items.length) {
			results[id] = meta;
			continue;
		}

		const slugs = new Set([slugify(game.name), ...(game.searchAs ?? []).map(slugify)]);
		for (const slug of slugs) {
			if (!slug) continue;
			const imageUrl = await fetchMetacriticGameImage(slug);
			if (!imageUrl) continue;
			results[id] = {
				items: [{ url: imageUrl, fit: 'cover', source: 'rawg', kind: 'cover' }],
				ratings: meta.ratings
			};
			break;
		}
	}

	return results;
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

console.log('Generating pool data…');
writeJson(`${outDir}/pool-fast.json`, await fetchLivePool({ includeRetro: false }));
writeJson(`${outDir}/pool.json`, await fetchLivePool({ includeRetro: true }));

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
	writeJson(
		`${outDir}/metacritic/${platform}.json`,
		await fetchMetacriticNewReleases(platform)
	);
}

console.log('Generating upcoming art…');
writeJson(`${outDir}/upcoming-meta.json`, await generateUpcomingMeta(buildKeys()));

console.log('Static data generation complete.');
