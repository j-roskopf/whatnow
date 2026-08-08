import type { CatalogEntry } from '$lib/types';

const env = process.env;

const USER_AGENT = 'Mozilla/5.0 (compatible; WhatNow/1.0)';
const GRAPHQL_URL = 'https://web.np.playstation.com/api/graphql/v1/op';
const CATEGORY_GRID_HASH = '4ce7d410a4db2c8b635a48c1dcec375906ff63b19dadd87e073f8fd0c0481d35';
const DISCOVERY_PAGES = [
	'https://www.playstation.com/en-us/ps-plus/',
	'https://store.playstation.com/en-us/pages/subscriptions',
	'https://store.playstation.com/en-us/pages/collections',
	'https://store.playstation.com/en-us/pages/deals'
];
const LEAVING_NAME_RE = /last\s*chance|leaving/i;

type StoreProduct = {
	id?: string;
	name?: string;
	platforms?: string[];
	media?: { type?: string; url?: string; role?: string }[];
};

type StoreConcept = {
	id?: string;
	name?: string;
	media?: { type?: string; url?: string; role?: string }[];
	products?: StoreProduct[];
};

type GridResponse = {
	data?: {
		categoryGridRetrieve?: {
			localizedName?: string;
			reportingName?: string;
			pageInfo?: { totalCount?: number; offset?: number; size?: number; isLast?: boolean };
			products?: StoreProduct[];
			concepts?: StoreConcept[];
		};
	};
};

let discoveredGridId: { id: string | null; expires: number } = { id: null, expires: 0 };

function slug(text: string) {
	return text
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-|-$/g, '');
}

function coverUrl(item: StoreConcept | StoreProduct): string | undefined {
	const media = item.media ?? [];
	const master = media.find((m) => m.role === 'MASTER' || m.type === 'IMAGE');
	return master?.url ?? media[0]?.url;
}

function productPlatforms(product?: StoreProduct): string | undefined {
	if (!product?.platforms?.length) return undefined;
	return product.platforms.join(' · ');
}

async function categoryGridRetrieve(gridId: string, offset: number, size: number) {
	const body = {
		operationName: 'categoryGridRetrieve',
		variables: {
			id: gridId,
			pageArgs: { offset, size },
			sortBy: null,
			filterBy: [],
			facetOptions: []
		},
		extensions: { persistedQuery: { version: 1, sha256Hash: CATEGORY_GRID_HASH } }
	};

	const response = await fetch(GRAPHQL_URL, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			'User-Agent': USER_AGENT,
			'x-psn-store-locale-override': 'en-US'
		},
		body: JSON.stringify(body)
	});
	if (!response.ok) return null;
	return (await response.json()) as GridResponse;
}

async function discoverLeavingGridId(): Promise<string | null> {
	if (env.PS_PLUS_LEAVING_GRID_ID?.trim()) return env.PS_PLUS_LEAVING_GRID_ID.trim();
	if (discoveredGridId.expires > Date.now()) return discoveredGridId.id;

	const categoryIds = new Set<string>();
	for (const pageUrl of DISCOVERY_PAGES) {
		try {
			const response = await fetch(pageUrl, {
				headers: { 'User-Agent': USER_AGENT, Accept: 'text/html' }
			});
			if (!response.ok) continue;
			const html = await response.text();
			for (const match of html.matchAll(/\/en-us\/category\/([a-f0-9-]{36})/gi)) {
				categoryIds.add(match[1]);
			}
			for (const match of html.matchAll(/\/category\/([a-f0-9-]{36})/gi)) {
				categoryIds.add(match[1]);
			}
		} catch {
			continue;
		}
	}

	for (const gridId of categoryIds) {
		try {
			const json = await categoryGridRetrieve(gridId, 0, 5);
			const grid = json?.data?.categoryGridRetrieve;
			if (!grid?.pageInfo?.totalCount) continue;
			const label = `${grid.localizedName ?? ''} ${grid.reportingName ?? ''}`;
			if (LEAVING_NAME_RE.test(label)) {
				discoveredGridId = { id: gridId, expires: Date.now() + 6 * 60 * 60 * 1000 };
				return gridId;
			}
		} catch {
			continue;
		}
	}

	discoveredGridId = { id: null, expires: Date.now() + 60 * 60 * 1000 };
	return null;
}

function gridToEntries(gridId: string, items: StoreConcept[]): CatalogEntry[] {
	const entries: CatalogEntry[] = [];
	for (const concept of items) {
		const product = concept.products?.[0];
		const name = concept.name ?? product?.name;
		if (!name) continue;
		entries.push({
			id: `psplus-leaving-${concept.id ?? slug(name)}`,
			name,
			service: 'psplus',
			section: 'leaving',
			platforms: productPlatforms(product),
			imageUrl: coverUrl(concept) ?? coverUrl(product ?? {}),
			storeUrl: concept.id
				? `https://store.playstation.com/en-us/concept/${concept.id}`
				: undefined,
			tier: 'Last chance'
		});
	}
	return entries;
}

export async function fetchPsStoreLastChance(): Promise<CatalogEntry[]> {
	const gridId = await discoverLeavingGridId();
	if (!gridId) return [];

	const concepts: StoreConcept[] = [];
	let offset = 0;
	const pageSize = 50;

	while (true) {
		const json = await categoryGridRetrieve(gridId, offset, pageSize);
		const grid = json?.data?.categoryGridRetrieve;
		if (!grid) break;

		const batch = grid.concepts ?? [];
		if (!batch.length) break;
		concepts.push(...batch);

		const pageInfo = grid.pageInfo;
		if (pageInfo?.isLast) break;
		if (
			pageInfo?.totalCount != null &&
			pageInfo.offset != null &&
			pageInfo.size != null &&
			pageInfo.offset + pageInfo.size >= pageInfo.totalCount
		) {
			break;
		}
		offset += pageSize;
		if (offset > 500) break;
	}

	return gridToEntries(gridId, concepts);
}
