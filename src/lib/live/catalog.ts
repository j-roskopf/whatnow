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
import { pickBestNameMatch } from '$lib/igdb';
import { fetchLibretroSystemCatalog } from '$lib/live/libretro-catalog';
import { fetchPsStoreLastChance } from '$lib/live/ps-store';

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
			? `https://store.playstation.com${game.conceptUrl}`
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

function enrichPicksWithLibrary(picks: CatalogEntry[], library: CatalogEntry[]): CatalogEntry[] {
	return picks.map((pick) => {
		const exact = library.find((row) => row.name.toLowerCase() === pick.name.toLowerCase());
		const match = exact ?? pickBestNameMatch(pick.name, library, 72);
		if (!match) return pick;
		return {
			...pick,
			imageUrl: match.imageUrl ?? pick.imageUrl,
			storeUrl: match.storeUrl ?? pick.storeUrl,
			releaseDate: match.releaseDate ?? pick.releaseDate
		};
	});
}

async function fetchModernPicks(): Promise<CatalogResponse> {
	const library = readCache('modern', 'library') ?? await fetchModernLibrary();
	const picks = await buildModernPickEntries();
	const entries = enrichPicksWithLibrary(picks, library.entries);
	return {
		entries,
		fetchedAt: new Date().toISOString(),
		source: 'Well-received picks · 75+ critics · leaving + recently added'
	};
}

async function fetchModernLibrary(): Promise<CatalogResponse> {
	const [gamePass, psPlus] = await Promise.all([
		fetchGamePassSection('library'),
		fetchPsPlusLibrary()
	]);

	const entries = dedupeByName(
		[...gamePass.entries, ...psPlus.entries].map((entry) => ({
			...entry,
			service: 'modern' as const,
			section: 'library' as const,
			tier: entry.service === 'gamepass' ? (entry.tier ?? 'Game Pass') : (entry.tier ?? 'PS Plus')
		}))
	).sort((a, b) => a.name.localeCompare(b.name));

	return {
		entries,
		fetchedAt: new Date().toISOString(),
		source: 'Game Pass + PS Plus libraries'
	};
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
	return `Classic ${labels.systemLabel} title — emulated, good for a short session.`;
}

function pickSummary(reason: 'leaving' | 'new', entry: CatalogEntry): string {
	if (reason === 'leaving') {
		const labels = serviceLabels(entry);
		return `Leaving soon on ${labels.where}. Play before it disappears from your subscription.`;
	}
	const labels = serviceLabels(entry);
	return `Recently added to ${labels.where}. Worth a look while it costs nothing.`;
}

function catalogEntryToGame(entry: CatalogEntry, reason: GameReason): Game {
	const labels = serviceLabels(entry);
	const tag =
		entry.tier ??
		entry.systemLabel ??
		(reason === 'leaving' ? 'Leaving soon' : reason === 'free' ? 'New' : labels.systemLabel);

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
		file: entry.file
	};
}

async function fetchLiveLeavingEntries(): Promise<CatalogEntry[]> {
	const [gamePass, psPlusLibrary] = await Promise.all([
		fetchGamePassSection('leaving'),
		fetchPsPlusLibrary()
	]);
	const psPlusLeaving = await fetchPsPlusLeaving(psPlusLibrary.entries);
	return dedupeByName([...gamePass.entries, ...psPlusLeaving.entries]);
}

async function fetchLiveNewEntries(): Promise<CatalogEntry[]> {
	const [gamePass, psPlus] = await Promise.all([
		fetchGamePassSection('new'),
		fetchPsPlusNew()
	]);
	return dedupeByName([...gamePass.entries, ...psPlus.entries]);
}

const RETRO_POOL_PER_SYSTEM = 48;

async function fetchLiveRetroPoolSample(): Promise<CatalogEntry[]> {
	const catalogs = await Promise.all(RETRO_SYSTEM_KEYS.map((key) => fetchRetroLibrary(key)));
	return dedupeByName(
		catalogs.flatMap((catalog) => catalog.entries.slice(0, RETRO_POOL_PER_SYSTEM))
	);
}

async function buildModernPickEntries(): Promise<CatalogEntry[]> {
	const [leaving, newEntries] = await Promise.all([
		fetchLiveLeavingEntries(),
		fetchLiveNewEntries()
	]);

	return dedupeByName([
		...leaving.slice(0, 12).map((entry) => ({
			...entry,
			service: 'modern' as const,
			section: 'picks' as const,
			tier: entry.tier ?? 'Leaving soon',
			summary: pickSummary('leaving', entry)
		})),
		...newEntries.slice(0, 32).map((entry) => ({
			...entry,
			service: 'modern' as const,
			section: 'picks' as const,
			tier: entry.tier ?? 'Recently added',
			summary: pickSummary('new', entry)
		}))
	]);
}

async function buildRetroPickEntries(): Promise<CatalogEntry[]> {
	const samples = await fetchLiveRetroPoolSample();
	return samples.slice(0, 48).map((entry) => ({
		...entry,
		section: 'picks' as const,
		summary: defaultWhy('retro', entry)
	}));
}

export async function fetchLivePool(options?: {
	includeRetro?: boolean;
	curate?: boolean;
}): Promise<PoolResponse> {
	const includeRetro = options?.includeRetro ?? true;
	const curate = options?.curate ?? false;

	if (includeRetro && curate && poolCache && Date.now() < poolCache.expires) {
		return poolCache.data;
	}

	const [leaving, newEntries, retro] = await Promise.all([
		fetchLiveLeavingEntries(),
		fetchLiveNewEntries(),
		includeRetro ? fetchLiveRetroPoolSample() : Promise.resolve([])
	]);

	const process = async (entries: CatalogEntry[]) => entries;

	const [curatedLeaving, curatedNew, curatedRetro] = await Promise.all([
		process(leaving),
		process(newEntries),
		retro.length ? process(retro) : Promise.resolve([])
	]);

	const games = [
		...curatedLeaving.map((entry) => catalogEntryToGame(entry, 'leaving')),
		...curatedNew.map((entry) => catalogEntryToGame(entry, 'free')),
		...curatedRetro.map((entry) => catalogEntryToGame(entry, 'retro'))
	];

	const source = curate
		? includeRetro
			? 'Well-received · 75+ critics · Game Pass, PS Plus & retro'
			: 'Well-received · 75+ critics · Game Pass & PS Plus'
		: includeRetro
			? 'Game Pass, PS Plus & libretro catalogs'
			: 'Game Pass & PS Plus (loading retro…)';

	const data: PoolResponse = {
		games,
		fetchedAt: new Date().toISOString(),
		source,
		counts: {
			leaving: curatedLeaving.length,
			free: curatedNew.length,
			retro: curatedRetro.length
		}
	};

	if (includeRetro && curate) {
		poolCache = { expires: Date.now() + CACHE_TTL_MS, data };
	}

	return data;
}
