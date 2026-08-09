import { mkdirSync, writeFileSync } from 'node:fs';
import { RETRO_SYSTEM_KEYS } from '../src/lib/data.ts';
import { fetchCatalog, fetchLivePool } from '../src/lib/live/catalog.ts';
import { fetchMetacriticNewReleases } from '../src/lib/server/metacritic.ts';
import type { CatalogSection, CatalogService, MetacriticPlatform } from '../src/lib/types.ts';

const outDir = 'static/data';

function writeJson(path: string, data: unknown) {
	writeFileSync(path, `${JSON.stringify(data)}\n`);
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

console.log('Static data generation complete.');
