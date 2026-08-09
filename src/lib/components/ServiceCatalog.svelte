<script lang="ts">
	import { onMount } from 'svelte';
	import { filterCatalogByMinScore, sortCatalog } from '$lib/browse';
	import { loadCatalog, loadCatalogRatings } from '$lib/catalog';
	import { RETRO_SYSTEM_KEYS, RETRO_SYSTEM_LABELS } from '$lib/data';
	import CatalogCard from '$lib/components/CatalogCard.svelte';
	import type {
		CatalogEntry,
		CatalogSection,
		CatalogService,
		GameRatings,
		MetacriticPlatform,
		MinScoreSource,
		RetroSystemKey,
		SortKey
	} from '$lib/types';

	const MODERN_PLATFORMS: { id: MetacriticPlatform | 'all'; label: string }[] = [
		{ id: 'all', label: 'All' },
		{ id: 'ps5', label: 'PS5' },
		{ id: 'ps4', label: 'PS4' },
		{ id: 'switch', label: 'Switch' },
		{ id: 'xbox-series-x', label: 'Xbox' },
		{ id: 'pc', label: 'PC' }
	];

	let { service }: { service: CatalogService } = $props();

	const serviceSections: Record<CatalogService, { id: CatalogSection; label: string }[]> = {
		gamepass: [
			{ id: 'leaving', label: 'Leaving soon' },
			{ id: 'new', label: 'Just arrived' },
			{ id: 'library', label: 'Full library' }
		],
		psplus: [
			{ id: 'leaving', label: 'Leaving soon' },
			{ id: 'new', label: 'Just arrived' },
			{ id: 'library', label: 'Full library' }
		],
		modern: [
			{ id: 'picks', label: 'Well-received' },
			{ id: 'library', label: 'Full catalog' }
		],
		retro: [
			{ id: 'picks', label: 'Well-received' },
			{ id: 'library', label: 'Full library' }
		],
		humble: [
			{ id: 'new', label: 'Choice' },
			{ id: 'library', label: 'Bundles' }
		]
	};

	const sections = $derived(serviceSections[service]);
	const isRetro = $derived(service === 'retro');
	const isModern = $derived(service === 'modern');

	let section = $state<CatalogSection>('library');
	let retroSystem = $state<RetroSystemKey>('snes');
	let modernPlatform = $state<MetacriticPlatform | 'all'>('all');
	let sort = $state<SortKey>('name');
	let minScore = $state(0);
	let minScoreSource = $state<MinScoreSource>('metacritic');
	let search = $state('');
	let page = $state(0);
	let loading = $state(false);
	let ratingsLoading = $state(false);
	let entries = $state<CatalogEntry[]>([]);
	let ratings = $state<Record<string, GameRatings>>({});
	let source = $state('');
	let fetchedAt = $state('');
	const ratingAttempts = new Set<string>();

	const pageSize = 48;

	let filtered = $derived(
		filterCatalogByMinScore(
			sortCatalog(
				entries
					.filter((entry) =>
						entry.name.toLowerCase().includes(search.trim().toLowerCase())
					)
					.filter((entry) => {
						if (!isModern || section !== 'library' || modernPlatform === 'all') return true;
						return entry.platformKeys?.includes(modernPlatform) ?? false;
					}),
				sort,
				ratings
			),
			minScore,
			minScoreSource,
			ratings
		)
	);
	let pageCount = $derived(Math.max(1, Math.ceil(filtered.length / pageSize)));
	let visible = $derived(filtered.slice(page * pageSize, page * pageSize + pageSize));

	async function hydrateRatings(slice: CatalogEntry[]) {
		const missing = slice.filter((entry) => !ratings[entry.id] && !ratingAttempts.has(entry.id));
		if (!missing.length) return;
		for (const entry of missing) ratingAttempts.add(entry.id);

		ratingsLoading = true;
		const batch = await loadCatalogRatings(
			missing.map((entry) => ({ id: entry.id, name: entry.name }))
		);
		ratings = { ...ratings, ...batch };
		ratingsLoading = false;
	}

	async function loadSection(next: CatalogSection, system = retroSystem) {
		section = next;
		page = 0;
		if (next === 'picks') {
			minScore = 0;
			search = '';
		}
		loading = true;
		ratings = {};
		ratingAttempts.clear();
		const catalog = await loadCatalog(
			service,
			next,
			isRetro && next === 'library' ? system : undefined
		);
		entries = catalog.entries.map((entry) => ({ ...entry, section: next }));
		source = catalog.source;
		fetchedAt = catalog.fetchedAt;
		loading = false;
	}

	async function loadRetroSystem(next: RetroSystemKey) {
		retroSystem = next;
		if (section === 'library') {
			await loadSection('library', next);
		}
	}

	$effect(() => {
		if (loading || section === 'picks') return;
		const slice = visible;
		if (!slice.length) return;
		void hydrateRatings(slice);
	});

	onMount(() => {
		loadSection(section);
	});
</script>

<div class="catalog-wrap">
	<div class="section-tabs" role="tablist" aria-label="Catalog sections">
		{#each sections as item}
			<button
				type="button"
				role="tab"
				class:sel={section === item.id}
				aria-selected={section === item.id}
				onclick={() => loadSection(item.id)}
			>
				{item.label}
			</button>
		{/each}
	</div>

	{#if isRetro && section === 'library'}
		<div class="section-tabs system-tabs" role="tablist" aria-label="Retro systems">
			{#each RETRO_SYSTEM_KEYS as key}
				<button
					type="button"
					role="tab"
					class:sel={retroSystem === key}
					aria-selected={retroSystem === key}
					onclick={() => loadRetroSystem(key)}
				>
					{RETRO_SYSTEM_LABELS[key]}
				</button>
			{/each}
		</div>
	{/if}

	{#if isModern && section === 'library'}
		<div class="section-tabs system-tabs" role="tablist" aria-label="Modern platforms">
			{#each MODERN_PLATFORMS as row}
				<button
					type="button"
					role="tab"
					class:sel={modernPlatform === row.id}
					aria-selected={modernPlatform === row.id}
					onclick={() => {
						modernPlatform = row.id;
						page = 0;
					}}
				>
					{row.label}
				</button>
			{/each}
		</div>
	{/if}

	<div class="browse-controls catalog-controls">
		<label>
			<span class="sr-only">Search</span>
			<input bind:value={search} type="search" placeholder="Search titles" />
		</label>
		<label>
			<span>Sort</span>
			<select
				value={sort}
				onchange={(e) => {
					sort = (e.currentTarget as HTMLSelectElement).value as SortKey;
					page = 0;
				}}
			>
				<option value="name">Name</option>
				<option value="critics">IGDB critics</option>
				<option value="metacritic">Metacritic</option>
				<option value="opencritic">OpenCritic</option>
				<option value="players">IGDB players</option>
				{#if section !== 'picks'}
					<option value="date">Release date</option>
				{/if}
			</select>
		</label>
		{#if section !== 'picks'}
			<label>
				<span>Min score</span>
				<select
					value={minScoreSource}
					onchange={(e) => {
						minScoreSource = (e.currentTarget as HTMLSelectElement).value as MinScoreSource;
						page = 0;
					}}
				>
					<option value="igdb-critics">IGDB critics</option>
					<option value="metacritic">Metacritic</option>
					<option value="opencritic">OpenCritic</option>
				</select>
				<select
					value={String(minScore)}
					onchange={(e) => {
						minScore = Number((e.currentTarget as HTMLSelectElement).value);
						page = 0;
					}}
				>
					<option value="0">Any</option>
					<option value="70">70+</option>
					<option value="80">80+</option>
					<option value="90">90+</option>
				</select>
			</label>
		{/if}
		{#if filtered.length}
			<span class="count">{filtered.length} titles</span>
		{/if}
		{#if ratingsLoading}
			<span class="count">Loading ratings…</span>
		{/if}
	</div>

	{#if loading}
		<div class="loading">Loading catalog…</div>
	{:else if !visible.length}
		<div class="empty">
			{#if entries.length && (search.trim() || minScore)}
				No titles match your filters.
			{:else}
				No titles match.
			{/if}
		</div>
	{:else}
		<div class="shelf catalog-grid">
			{#each visible as entry (entry.id)}
				<CatalogCard entry={entry} ratings={ratings[entry.id]} showSummary={service !== 'modern'} />
			{/each}
		</div>
		{#if pageCount > 1}
			<div class="pager">
				<button type="button" disabled={page === 0} onclick={() => (page -= 1)}>Prev</button>
				<span>{page + 1} / {pageCount}</span>
				<button type="button" disabled={page >= pageCount - 1} onclick={() => (page += 1)}>
					Next
				</button>
			</div>
		{/if}
		{#if source}
			<p class="catalog-note">
				{source}
				{#if fetchedAt}
					· updated {new Date(fetchedAt).toLocaleString()}
				{/if}
			</p>
		{/if}
	{/if}
</div>
