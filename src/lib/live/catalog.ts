import type {
	CatalogEntry,
	CatalogResponse,
	CatalogSection,
	CatalogService,
	Game,
	GameReason,
	PoolResponse,
	RetroSystemKey
} from '$lib/types';
import { RETRO_SYSTEM_LABELS, RETRO_SYSTEM_KEYS, SYSTEMS } from '$lib/data';
import { shuffle } from '$lib/curation';
import { fetchLibretroSystemCatalog } from '$lib/live/libretro-catalog';
import { fetchModernRetailLibrary, fetchModernRetailPicks } from '$lib/live/modern';
import { fetchPsStoreLastChance } from '$lib/live/ps-store';
import { gamePassStoreUrl } from '$lib/store-urls';

const USER_AGENT = 'Mozilla/5.0 (compatible; WhatNow/1.0)';
const CACHE_TTL_MS = 30 * 60 * 1000;

const GAMEPASS_SIGLS = {
	libraryPc: '609d944c-d395-4c0a-9ea4-e9f39b52c1ad',
	libraryCloud: '29a81209-df6f-41fd-a528-2ae6b91f719c',
	new: '3fdd7f57-7092-4b65-bd40-5a9dac1b2b84',
	leaving: 'cc7fc951-d00f-410e-9e02-5e4628e04163'
} as const;

const PSPLUS_IMAGIC = {
	catalog: 'plus-games-list',
	monthly: 'plus-monthly-games-list',
	classics: 'plus-classics-list',
	ubisoft: 'ubisoft-classics-list'
} as const;

type CacheEntry = { expires: number; data: CatalogResponse };

const cache = new Map<string, CacheEntry>();

function cacheKey(service: CatalogService, section: CatalogSection, system?: string) {
	return system ? `${service}:${section}:${system}` : `${service}:${section}`;
}

function readCache(
	service: CatalogService,
	section: CatalogSection,
	system?: string
): CatalogResponse | null {
	const hit = cache.get(cacheKey(service, section, system));
	if (!hit || Date.now() > hit.expires) return null;
	return hit.data;
}

function writeCache(
	service: CatalogService,
	section: CatalogSection,
	data: CatalogResponse,
	system?: string
) {
	cache.set(cacheKey(service, section, system), { expires: Date.now() + CACHE_TTL_MS, data });
}

function slug(text: string) {
	return text
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-|-$/g, '');
}

async function fetchGamePassSigl(siglId: string): Promise<string[]> {
	const url = `https://catalog.gamepass.com/sigls/v2?id=${siglId}&market=US&language=en-us`;
	const response = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
	if (!response.ok) return [];
	const json = await response.json();
	if (!Array.isArray(json)) return [];
	return json.filter((item) => item?.id).map((item) => item.id as string);
}

async function fetchGamePassProducts(productIds: string[]): Promise<CatalogEntry[]> {
	if (!productIds.length) return [];

	const entries: CatalogEntry[] = [];
	const chunkSize = 25;

	for (let index = 0; index < productIds.length; index += chunkSize) {
		const chunk = productIds.slice(index, index + chunkSize);
		const url = `https://displaycatalog.mp.microsoft.com/v7.0/products?bigIds=${chunk.join(',')}&market=US&languages=en-us`;
		const response = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
		if (!response.ok) continue;

		const json = await response.json();
		for (const product of json.Products ?? []) {
			const localized = product.LocalizedProperties?.[0];
			if (!localized?.ProductTitle) continue;

			const images = localized.Images ?? [];
			const poster = images.find((img: { ImagePurpose?: string }) => img.ImagePurpose === 'Poster');
			const box = images.find((img: { ImagePurpose?: string }) => img.ImagePurpose === 'BoxArt');
			const imageUrl = poster?.Uri || box?.Uri;
			const releaseDate = product.MarketProperties?.[0]?.OriginalReleaseDate;

			entries.push({
				id: `gamepass-${product.ProductId}`,
				name: localized.ProductTitle,
				service: 'gamepass',
				section: 'library',
				imageUrl: imageUrl ? `https:${imageUrl}` : undefined,
				releaseDate,
				platforms: 'Xbox · PC · Cloud',
				storeUrl: gamePassStoreUrl(localized.ProductTitle, product.ProductId),
				tier: 'Game Pass'
			});
		}
	}

	return entries;
}

async function fetchGamePassSection(section: CatalogSection): Promise<CatalogResponse> {
	const fetchedAt = new Date().toISOString();

	if (section === 'library') {
		const [pcIds, cloudIds] = await Promise.all([
			fetchGamePassSigl(GAMEPASS_SIGLS.libraryPc),
			fetchGamePassSigl(GAMEPASS_SIGLS.libraryCloud)
		]);
		const uniqueIds = [...new Set([...pcIds, ...cloudIds])];
		const entries = await fetchGamePassProducts(uniqueIds).then((items) =>
			items.map((item) => ({ ...item, section: 'library' as const }))
		);
		return {
			entries: entries.sort((a, b) => a.name.localeCompare(b.name)),
			fetchedAt,
			source: 'Microsoft Game Pass catalog'
		};
	}

	const siglId = section === 'leaving' ? GAMEPASS_SIGLS.leaving : GAMEPASS_SIGLS.new;
	const ids = await fetchGamePassSigl(siglId);
	const entries = await fetchGamePassProducts(ids).then((items) =>
		items.map((item) => ({ ...item, section }))
	);

	return {
		entries,
		fetchedAt,
		source: section === 'leaving' ? 'Game Pass leaving soon' : 'Game Pass recently added'
	};
}

type ImagicGame = {
	conceptId?: string;
	name?: string;
	conceptUrl?: string;
	imageUrl?: string;
	device?: string[];
	releaseDate?: string;
};

async function fetchPsPlusImagic(category: string): Promise<ImagicGame[]> {
	const url = `https://www.playstation.com/bin/imagic/gameslist?locale=en-us&categoryList=${category}`;
	const response = await fetch(url, {
		headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' }
	});
	if (!response.ok) return [];

	const json = await response.json();
	if (!Array.isArray(json)) return [];

	const games: ImagicGame[] = [];
	for (const group of json) {
		for (const game of group?.games ?? []) {
			if (game?.name) games.push(game);
		}
	}
	return games;
}

function imagicToEntry(
	game: ImagicGame,
	section: CatalogSection,
	tier?: string
): CatalogEntry {
	const platforms = (game.device ?? []).join(' · ') || 'PS5 · PS4';
	return {
		id: `psplus-${game.conceptId ?? slug(game.name ?? 'unknown')}`,
		name: game.name ?? 'Unknown',
		service: 'psplus',
		section,
		platforms,
		imageUrl: game.imageUrl,
		releaseDate: game.releaseDate,
		storeUrl: game.conceptUrl
			? game.conceptUrl.startsWith('http')
				? game.conceptUrl
				: `https://store.playstation.com${game.conceptUrl}`
			: undefined,
		tier
	};
}

function dedupePsPlus(entries: CatalogEntry[]): CatalogEntry[] {
	const seen = new Set<string>();
	return entries.filter((entry) => {
		const key = entry.name.toLowerCase();
		if (seen.has(key)) return false;
		seen.add(key);
		return true;
	});
}

async function fetchPsPlusLibrary(): Promise<CatalogResponse> {
	const groups = await Promise.all([
		fetchPsPlusImagic(PSPLUS_IMAGIC.catalog),
		fetchPsPlusImagic(PSPLUS_IMAGIC.classics),
		fetchPsPlusImagic(PSPLUS_IMAGIC.ubisoft),
		fetchPsPlusImagic(PSPLUS_IMAGIC.monthly)
	]);

	const entries = dedupePsPlus(
		groups.flatMap((games, index) => {
			const tiers = ['Extra catalog', 'Classics', 'Ubisoft+ Classics', 'Monthly'];
			return games.map((game) => imagicToEntry(game, 'library', tiers[index]));
		})
	);

	return {
		entries: entries.sort((a, b) => a.name.localeCompare(b.name)),
		fetchedAt: new Date().toISOString(),
		source: 'PlayStation Plus imagic catalog'
	};
}

export async function fetchPsPlusMonthlyOnly(): Promise<CatalogEntry[]> {
	const monthly = await fetchPsPlusImagic(PSPLUS_IMAGIC.monthly);
	const entries = dedupePsPlus(
		monthly.map((game) => imagicToEntry(game, 'new', 'Monthly'))
	);
	return entries.sort((a, b) => {
		const ad = a.releaseDate ? new Date(a.releaseDate).getTime() : 0;
		const bd = b.releaseDate ? new Date(b.releaseDate).getTime() : 0;
		return bd - ad;
	});
}

async function fetchPsPlusNew(): Promise<CatalogResponse> {
	const monthly = await fetchPsPlusImagic(PSPLUS_IMAGIC.monthly);
	const catalog = await fetchPsPlusImagic(PSPLUS_IMAGIC.catalog);

	const now = Date.now();
	const recentWindowMs = 60 * 86400000;

	const recentCatalog = catalog.filter((game) => {
		if (!game.releaseDate) return false;
		const when = new Date(game.releaseDate).getTime();
		return when > now - recentWindowMs;
	});

	const entries = dedupePsPlus([
		...monthly.map((game) => imagicToEntry(game, 'new', 'Monthly')),
		...recentCatalog.map((game) => imagicToEntry(game, 'new', 'Recently added'))
	]);

	return {
		entries: entries.sort((a, b) => {
			const ad = a.releaseDate ? new Date(a.releaseDate).getTime() : 0;
			const bd = b.releaseDate ? new Date(b.releaseDate).getTime() : 0;
			return bd - ad;
		}),
		fetchedAt: new Date().toISOString(),
		source: 'PS Plus monthly games + recent catalog additions'
	};
}

function dedupeByName(entries: CatalogEntry[]): CatalogEntry[] {
	const seen = new Set<string>();
	return entries.filter((entry) => {
		const key = entry.name.toLowerCase();
		if (seen.has(key)) return false;
		seen.add(key);
		return true;
	});
}

async function fetchModernPicks(): Promise<CatalogResponse> {
	const cached = readCache('modern', 'picks');
	if (cached) return cached;
	const result = await fetchModernRetailPicks({ maxPages: 6 });
	writeCache('modern', 'picks', result);
	return result;
}

async function fetchModernLibrary(): Promise<CatalogResponse> {
	const cached = readCache('modern', 'library');
	if (cached) return cached;
	const result = await fetchModernRetailLibrary({ maxPages: 8 });
	writeCache('modern', 'library', result);
	return result;
}

function parseRetroSystem(value?: string): RetroSystemKey | null {
	if (value && RETRO_SYSTEM_KEYS.includes(value as RetroSystemKey)) {
		return value as RetroSystemKey;
	}
	return null;
}

async function fetchRetroLibrary(systemKey: RetroSystemKey): Promise<CatalogResponse> {
	const systemPath = SYSTEMS[systemKey];
	const systemLabel = RETRO_SYSTEM_LABELS[systemKey];
	const entries = await fetchLibretroSystemCatalog(systemKey, systemPath, systemLabel);

	return {
		entries,
		fetchedAt: new Date().toISOString(),
		source: `libretro ${systemLabel} catalog`
	};
}

async function enrichLeavingFromLibrary(leaving: CatalogEntry[], library: CatalogEntry[]) {
	const byName = new Map(library.map((entry) => [entry.name.toLowerCase(), entry]));
	return leaving.map((entry) => {
		const match = byName.get(entry.name.toLowerCase());
		if (!match) return entry;
		return {
			...entry,
			imageUrl: match.imageUrl ?? entry.imageUrl,
			storeUrl: match.storeUrl ?? entry.storeUrl,
			releaseDate: match.releaseDate ?? entry.releaseDate
		};
	});
}

async function fetchPsPlusLeaving(library: CatalogEntry[]): Promise<CatalogResponse> {
	const storeLeaving = await fetchPsStoreLastChance();
	const entries = await enrichLeavingFromLibrary(storeLeaving, library);

	return {
		entries,
		fetchedAt: new Date().toISOString(),
		source: storeLeaving.length
			? 'PlayStation Store last chance to play'
			: 'PS Plus leaving (none found on PlayStation Store)'
	};
}

export async function fetchCatalog(
	service: CatalogService,
	section: CatalogSection,
	system?: string
): Promise<CatalogResponse> {
	if (service === 'modern') {
		const cached = readCache(service, section);
		if (cached) return cached;
		const result =
			section === 'picks' ? await fetchModernPicks() : await fetchModernLibrary();
		writeCache(service, section, result);
		return result;
	}

	if (service === 'retro') {
		if (section === 'picks') {
			const cached = readCache(service, section);
			if (cached) return cached;
			const result = {
				entries: await buildRetroPickEntries(),
				fetchedAt: new Date().toISOString(),
				source: 'Well-received retro · 75+ critics'
			};
			writeCache(service, section, result);
			return result;
		}

		const systemKey = parseRetroSystem(system) ?? 'snes';
		const cached = readCache(service, section, systemKey);
		if (cached) return cached;
		const result = await fetchRetroLibrary(systemKey);
		writeCache(service, section, result, systemKey);
		return result;
	}

	const cached = readCache(service, section);
	if (cached) return cached;

	let result: CatalogResponse;
	if (service === 'gamepass') {
		result = await fetchGamePassSection(section);
	} else if (section === 'library') {
		result = await fetchPsPlusLibrary();
	} else if (section === 'new') {
		result = await fetchPsPlusNew();
	} else {
		const library = readCache('psplus', 'library') ?? await fetchPsPlusLibrary();
		result = await fetchPsPlusLeaving(library.entries);
	}

	writeCache(service, section, result);
	return result;
}

let poolCache: { expires: number; data: PoolResponse } | null = null;

function serviceLabels(entry: CatalogEntry): { systemLabel: string; where: string } {
	const id = entry.id ?? '';
	if (entry.service === 'gamepass' || id.startsWith('gamepass-')) {
		return { systemLabel: 'Game Pass', where: entry.tier ?? 'Game Pass' };
	}
	if (entry.service === 'psplus' || id.startsWith('psplus-')) {
		const tier = entry.tier ?? 'Extra';
		const where = /plus/i.test(tier) ? tier : `PS Plus ${tier}`;
		return { systemLabel: 'PS Plus', where };
	}
	if (entry.service === 'humble' || id.startsWith('humble-')) {
		const tier = entry.tier ?? 'Humble';
		return { systemLabel: 'Humble', where: tier };
	}
	if (entry.service === 'modern' || id.startsWith('modern-')) {
		return {
			systemLabel: 'Modern',
			where: entry.platforms ?? 'Retail'
		};
	}
	return {
		systemLabel: entry.systemLabel ?? 'Retro',
		where: entry.platforms === 'Emulated' ? 'Emulated' : (entry.platforms ?? 'Emulated')
	};
}

function defaultWhy(reason: GameReason, entry: CatalogEntry): string {
	const labels = serviceLabels(entry);
	if (reason === 'leaving') {
		return `Leaving soon on ${labels.where}. Play it before it disappears from your subscription.`;
	}
	if (reason === 'free') {
		return `Recently added to ${labels.where}. Worth a look while it costs nothing.`;
	}
	if (reason === 'modern') {
		return `Standalone ${labels.where} title — not tied to a subscription, worth playing on its own.`;
	}
	return `Classic ${labels.systemLabel} title — emulated, good for a short session.`;
}

function catalogEntryToGame(entry: CatalogEntry, reason: GameReason): Game {
	const labels = serviceLabels(entry);
	const tag =
		entry.tier ??
		entry.systemLabel ??
		(reason === 'leaving'
			? 'Leaving soon'
			: reason === 'free'
				? 'New'
				: reason === 'modern'
					? 'Modern'
					: labels.systemLabel);

	return {
		id: entry.id,
		name: entry.name,
		reason,
		tag,
		systemLabel: labels.systemLabel,
		where: labels.where,
		hours: '—',
		platforms: entry.platforms ?? '',
		why: entry.summary ?? defaultWhy(reason, entry),
		system: entry.system,
		file: entry.file,
		imageUrl: entry.imageUrl,
		snapUrl: entry.snapUrl,
		storeUrl: entry.storeUrl
	};
}

const RETRO_POOL_SYSTEMS: RetroSystemKey[] = ['snes', 'gba', 'n64'];

async function fetchLiveLeavingEntries(): Promise<CatalogEntry[]> {
	const [gamePass, psPlusLeaving] = await Promise.all([
		fetchGamePassSection('leaving'),
		fetchPsPlusLeaving([])
	]);
	return dedupeByName([...gamePass.entries, ...psPlusLeaving.entries]);
}

async function fetchLiveNewEntries(): Promise<CatalogEntry[]> {
	const [gamePass, psPlusCatalog] = await Promise.all([
		fetchGamePassSection('new'),
		fetchPsPlusImagic(PSPLUS_IMAGIC.catalog)
	]);

	const now = Date.now();
	const recentWindowMs = 60 * 86400000;
	const recentCatalog = psPlusCatalog
		.filter((game) => {
			if (!game.releaseDate) return false;
			const when = new Date(game.releaseDate).getTime();
			return when > now - recentWindowMs;
		})
		.map((game) => imagicToEntry(game, 'new', 'Recently added'));

	return dedupeByName([...gamePass.entries, ...recentCatalog]);
}

const RETRO_POOL_PER_SYSTEM = 48;

async function fetchLiveRetroPoolSample(perSystem = RETRO_POOL_PER_SYSTEM): Promise<CatalogEntry[]> {
	const catalogs = await Promise.all(RETRO_POOL_SYSTEMS.map((key) => fetchRetroLibrary(key)));
	return dedupeByName(
		catalogs.flatMap((catalog) => catalog.entries.slice(0, perSystem))
	);
}

const MODERN_POOL_SAMPLE = 80;
const MODERN_POOL_PAGES = 3;

async function fetchLiveModernPoolSample(
	maxPages = MODERN_POOL_PAGES,
	sampleSize = MODERN_POOL_SAMPLE
): Promise<CatalogEntry[]> {
	const catalog = await fetchModernRetailLibrary({ maxPages });
	return shuffle(catalog.entries).slice(0, sampleSize);
}

export async function fetchLivePool(options?: {
	includeRetro?: boolean;
	curate?: boolean;
	fast?: boolean;
}): Promise<PoolResponse> {
	const includeRetro = options?.includeRetro ?? true;
	const curate = options?.curate ?? false;
	const fast = options?.fast ?? false;

	if (includeRetro && curate && !fast && poolCache && Date.now() < poolCache.expires) {
		return poolCache.data;
	}

	const retroPerSystem = fast ? 16 : RETRO_POOL_PER_SYSTEM;
	const modernPages = fast ? 2 : MODERN_POOL_PAGES;
	const modernSample = fast ? 48 : MODERN_POOL_SAMPLE;

	const [leaving, newEntries, modern, retro] = await Promise.all([
		fast ? Promise.resolve([]) : fetchLiveLeavingEntries(),
		fetchLiveNewEntries(),
		fetchLiveModernPoolSample(modernPages, modernSample),
		includeRetro ? fetchLiveRetroPoolSample(retroPerSystem) : Promise.resolve([])
	]);

	const games = [
		...(fast ? [] : leaving.map((entry) => catalogEntryToGame(entry, 'leaving'))),
		...newEntries.map((entry) => catalogEntryToGame(entry, 'free')),
		...modern.map((entry) => catalogEntryToGame(entry, 'modern')),
		...retro.map((entry) => catalogEntryToGame(entry, 'retro'))
	];

	const source = fast
		? 'Recently added subscriptions, modern retail & retro (fast load)'
		: curate
			? includeRetro
				? 'Well-received · 75+ critics · subscriptions, modern & retro'
				: 'Well-received · 75+ critics · subscriptions & modern'
			: includeRetro
				? 'Subscriptions, modern retail & libretro catalogs'
				: 'Subscriptions & modern retail (loading retro…)';

	const data: PoolResponse = {
		games,
		fetchedAt: new Date().toISOString(),
		source,
		counts: {
			leaving: fast ? 0 : leaving.length,
			free: newEntries.length,
			modern: modern.length,
			retro: retro.length
		}
	};

	if (includeRetro && curate && !fast) {
		poolCache = { expires: Date.now() + CACHE_TTL_MS, data };
	}

	return data;
}

async function buildRetroPickEntries(): Promise<CatalogEntry[]> {
	const samples = await fetchLiveRetroPoolSample();
	return samples.slice(0, 48).map((entry) => ({
		...entry,
		section: 'picks' as const,
		summary: defaultWhy('retro', entry)
	}));
}
