import type { CatalogEntry, PinnedSectionId } from '$lib/types';

const USER_AGENT = 'Mozilla/5.0 (compatible; WhatNow/1.0)';
const HUMBLE_ORIGIN = 'https://www.humblebundle.com';

const NON_GAME_CHOICE_PATTERNS = [/ign plus/i, /coupon/i, /membership/i, /vault/i];

function humbleOriginPath(path: string): string {
	const clean = path.startsWith('/') ? path : `/${path}`;
	return `${HUMBLE_ORIGIN}${clean}`;
}

function decodeHtml(text: string) {
	return text
		.replace(/&#39;/g, "'")
		.replace(/&amp;/g, '&')
		.replace(/&quot;/g, '"')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>');
}

function humbleChoiceImage(url: string): string {
	const decoded = decodeHtml(url);
	try {
		const parsed = new URL(decoded);
		parsed.searchParams.set('auto', 'compress,format');
		parsed.searchParams.set('fit', 'crop');
		parsed.searchParams.set('h', '600');
		parsed.searchParams.set('w', '400');
		return parsed.toString();
	} catch {
		return decoded
			.replace(/([?&])h=\d+/gi, '$1h=600')
			.replace(/([?&])w=\d+/gi, '$1w=400')
			.replace(/fit=clip/gi, 'fit=crop');
	}
}

function slug(text: string) {
	return text
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-|-$/g, '');
}

function extractScriptJson(html: string, scriptId: string): unknown | null {
	const marker = `id="${scriptId}"`;
	const start = html.indexOf(marker);
	if (start < 0) return null;

	const open = html.lastIndexOf('<script', start);
	const close = html.indexOf('</script>', start);
	if (open < 0 || close < 0) return null;

	const inner = html.slice(html.indexOf('>', open) + 1, close).trim();
	try {
		return JSON.parse(inner);
	} catch {
		return null;
	}
}

async function fetchHumbleHtml(path: string): Promise<string> {
	const url = path.startsWith('http') ? path : `${HUMBLE_ORIGIN}${path}`;
	const response = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
	if (!response.ok) return '';
	return response.text();
}

function isGameBundleProduct(product: Record<string, unknown>): boolean {
	const type = product.type as string | undefined;
	const category = product.category as string | undefined;
	const productUrl = (product.product_url as string | undefined) ?? '';
	const tileStamp = product.tile_stamp as string | undefined;

	if (type !== 'bundle') return false;
	if (category?.includes('book') || productUrl.includes('/books/')) return false;
	if (category?.includes('software') || productUrl.includes('/software/')) return false;
	if (productUrl.includes('/mobile/')) return false;
	if (tileStamp === 'books' || tileStamp === 'software') return false;
	return productUrl.includes('/games/') || tileStamp === 'games';
}

type MosaicSection = {
	section_type?: string;
	products?: Record<string, unknown>[];
};

type HomepageWebpack = {
	mosaic?: MosaicSection[];
};

type GamesLandingWebpack = {
	data?: {
		games?: {
			mosaic?: MosaicSection[];
		};
	};
};

export type HumbleBundleGroup = {
	id: PinnedSectionId;
	label: string;
	machineName: string;
	storeUrl: string;
	entries: CatalogEntry[];
};

type BundleTierItem = {
	machine_name?: string;
	human_name?: string;
	item_content_type?: string;
	featured_image?: string;
	resolved_paths?: {
		featured_image?: string;
		front_page_art_imgix?: string;
	};
	front_page_art?: { image_path?: string };
	cta_badge?: { badge?: string };
	availability_icons?: {
		platform_icons?: string[];
		human_names?: Record<string, string>;
	};
};

type BundlePageWebpack = {
	bundleData?: {
		basic_data?: { human_name?: string };
		tier_item_data?: Record<string, BundleTierItem>;
		page_url?: string;
	};
};

function humbleImageFromPath(path?: string): string | undefined {
	if (!path) return undefined;
	if (path.startsWith('http')) return path;
	return `https://hb.imgix.net/${path.replace(/^images\//, '')}?auto=compress,format&fit=crop&h=600&w=1200`;
}

function humbleBundleImage(item: BundleTierItem): string | undefined {
	const paths = item.resolved_paths;
	if (paths?.featured_image) return decodeHtml(paths.featured_image);
	if (paths?.front_page_art_imgix) return humbleChoiceImage(decodeHtml(paths.front_page_art_imgix));
	if (item.front_page_art?.image_path) return humbleImageFromPath(item.front_page_art.image_path);
	return humbleImageFromPath(item.featured_image);
}

function platformsFromItem(item: BundleTierItem): string | undefined {
	const icons = item.availability_icons?.platform_icons ?? [];
	const labels = item.availability_icons?.human_names ?? {};
	const names = icons.map((icon) => labels[icon] ?? icon.replace(/^hb-/, ''));
	return names.length ? names.join(' · ') : undefined;
}

function isBundleGameItem(item: BundleTierItem): boolean {
	if (item.item_content_type !== 'game') return false;
	if (item.cta_badge?.badge === 'coupon') return false;
	const name = item.human_name ?? '';
	if (/coupon/i.test(name) || /soundtrack/i.test(name)) return false;
	return true;
}

function bundleItemToEntry(
	item: BundleTierItem,
	bundleName: string,
	bundleMachineName: string
): CatalogEntry | null {
	if (!isBundleGameItem(item) || !item.human_name) return null;

	const machine = item.machine_name ?? slug(item.human_name);
	return {
		id: `humble-bundle-${bundleMachineName}-${machine}`,
		name: item.human_name,
		service: 'humble',
		section: 'library',
		platforms: platformsFromItem(item),
		imageUrl: humbleBundleImage(item),
		storeUrl: `${HUMBLE_ORIGIN}/games/${bundleMachineName.replace(/_bundle$/, '').replace(/_/g, '-')}`,
		tier: bundleName
	};
}

async function fetchBundleGroup(
	product: Record<string, unknown>
): Promise<HumbleBundleGroup | null> {
	const productUrl = (product.product_url as string | undefined) ?? '';
	const machineName = (product.machine_name as string | undefined) ?? '';
	const bundleName =
		(product.tile_name as string | undefined) ??
		(product.tile_short_name as string | undefined) ??
		machineName;

	if (!productUrl || !machineName) return null;

	const html = await fetchHumbleHtml(productUrl);
	const data = extractScriptJson(html, 'webpack-bundle-page-data') as BundlePageWebpack | null;
	const tierItems = data?.bundleData?.tier_item_data;
	if (!tierItems) return null;

	const displayName = data.bundleData?.basic_data?.human_name ?? bundleName;
	const bundleUrl = data.bundleData?.page_url
		? humbleOriginPath(data.bundleData.page_url)
		: humbleOriginPath(productUrl);

	const seen = new Set<string>();
	const entries = Object.values(tierItems)
		.map((item) => {
			const entry = bundleItemToEntry(item, displayName, machineName);
			if (entry) entry.storeUrl = bundleUrl;
			return entry;
		})
		.filter((entry): entry is CatalogEntry => Boolean(entry))
		.filter((entry) => {
			const key = entry.name.toLowerCase();
			if (seen.has(key)) return false;
			seen.add(key);
			return true;
		})
		.sort((a, b) => a.name.localeCompare(b.name));

	if (!entries.length) return null;

	const id = `humble-bundle-${slug(machineName.replace(/_bundle$/, ''))}` as const;
	return {
		id,
		label: displayName,
		machineName,
		storeUrl: bundleUrl,
		entries
	};
}

function productsFromMosaic(mosaic: MosaicSection[] | undefined): Record<string, unknown>[] {
	const products: Record<string, unknown>[] = [];
	const seen = new Set<string>();
	for (const section of mosaic ?? []) {
		for (const product of section.products ?? []) {
			if (!isGameBundleProduct(product)) continue;
			const key =
				(product.machine_name as string | undefined) ??
				(product.product_url as string | undefined) ??
				'';
			if (!key || seen.has(key)) continue;
			seen.add(key);
			products.push(product);
		}
	}
	return products;
}

async function fetchActiveGameBundleProducts(): Promise<Record<string, unknown>[]> {
	// Full active game-bundle list lives on /games; homepage mosaic only features a few.
	const gamesHtml = await fetchHumbleHtml('/games');
	const gamesData = extractScriptJson(gamesHtml, 'landingPage-json-data') as GamesLandingWebpack | null;
	const fromGames = productsFromMosaic(gamesData?.data?.games?.mosaic);
	if (fromGames.length) return fromGames;

	console.warn('Humble /games landing had no game bundles; falling back to homepage mosaic…');
	const homeHtml = await fetchHumbleHtml('/');
	const homeData = extractScriptJson(homeHtml, 'webpack-json-data') as HomepageWebpack | null;
	const fromHome = productsFromMosaic(homeData?.mosaic);
	if (fromHome.length) return fromHome;

	console.warn(
		'Humble homepage mosaic had no game bundles; trying legacy service_check API…'
	);
	try {
		const response = await fetch(
			'https://hr-humblebundle.appspot.com/androidapp/v2/service_check',
			{ headers: { 'User-Agent': USER_AGENT } }
		);
		if (!response.ok) return [];
		const legacy = (await response.json()) as {
			url?: string;
			bundle_machine_name?: string;
			bundle_name?: string;
		}[];
		return legacy
			.filter((row) => row.url?.includes('/games/'))
			.map((row) => ({
				product_url: row.url?.replace(HUMBLE_ORIGIN, ''),
				machine_name: row.bundle_machine_name,
				tile_name: row.bundle_name
			}));
	} catch {
		return [];
	}
}

export async function fetchHumbleChoice(): Promise<CatalogEntry[]> {
	const html = await fetchHumbleHtml('/membership');
	const re =
		/<img data-lazy="([^"]+)"[^>]*alt="([^"]+)"[^>]*class="main-image/g;
	const entries: CatalogEntry[] = [];
	const seen = new Set<string>();

	let match: RegExpExecArray | null;
	while ((match = re.exec(html))) {
		const imageUrl = decodeHtml(match[1]);
		const name = decodeHtml(match[2]);
		const key = name.toLowerCase();
		if (seen.has(key)) continue;
		if (NON_GAME_CHOICE_PATTERNS.some((pattern) => pattern.test(name))) continue;

		seen.add(key);
		entries.push({
			id: `humble-choice-${slug(name)}`,
			name,
			service: 'humble',
			section: 'new',
			imageUrl: humbleChoiceImage(imageUrl),
			storeUrl: `${HUMBLE_ORIGIN}/membership`,
			tier: 'Choice'
		});
	}

	return entries.sort((a, b) => a.name.localeCompare(b.name));
}

export async function fetchHumbleActiveBundles(): Promise<HumbleBundleGroup[]> {
	const products = await fetchActiveGameBundleProducts();
	const bundles = await Promise.all(products.map((product) => fetchBundleGroup(product)));
	return bundles
		.filter((bundle): bundle is HumbleBundleGroup => Boolean(bundle))
		.sort((a, b) => a.label.localeCompare(b.label));
}

/** Flat game list across active bundles (deduped by name). */
export async function fetchHumbleActiveBundleGames(): Promise<CatalogEntry[]> {
	const bundles = await fetchHumbleActiveBundles();
	const seen = new Set<string>();
	return bundles
		.flatMap((bundle) => bundle.entries)
		.filter((entry) => {
			const key = entry.name.toLowerCase();
			if (seen.has(key)) return false;
			seen.add(key);
			return true;
		})
		.sort((a, b) => a.name.localeCompare(b.name));
}
