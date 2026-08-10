<script lang="ts">
	import { galleryItems, loadMetaBatch, slugId } from '$lib/art';
	import MediaViewer from '$lib/components/MediaViewer.svelte';
	import UpcomingCard from '$lib/components/UpcomingCard.svelte';
	import { pickDisplayImageUrl } from '$lib/html';
	import { loadUpcomingMeta } from '$lib/upcoming';
	import { loadUpcomingGames } from '$lib/upcoming-catalog';
	import type { GameMeta, UpcomingGame, UpcomingPlatformKey } from '$lib/types';

	let { today }: { today: Date } = $props();

	const PAGE_SIZE = 48;

	const platforms: { id: UpcomingPlatformKey; label: string }[] = [
		{ id: 'all', label: 'All' },
		{ id: 'ps5', label: 'PS5' },
		{ id: 'switch2', label: 'Switch 2' },
		{ id: 'switch', label: 'Switch' },
		{ id: 'xbox-series-x', label: 'Xbox' },
		{ id: 'pc', label: 'PC' },
		{ id: 'ps4', label: 'PS4' }
	];

	let platform = $state<UpcomingPlatformKey>('all');
	let loading = $state(false);
	let games = $state<UpcomingGame[]>([]);
	let visibleCount = $state(PAGE_SIZE);
	let source = $state('');
	let fetchedAt = $state('');
	let meta = $state<Record<string, GameMeta>>({});
	let viewerGame = $state<UpcomingGame | null>(null);
	let viewerStart = $state(0);

	const visibleGames = $derived(games.slice(0, visibleCount));
	const hasMore = $derived(visibleCount < games.length);

	function lookupFor(game: UpcomingGame) {
		return {
			id: game.id || slugId(game.name),
			name: game.name,
			releaseDate: game.date,
			searchAs: game.searchAs,
			igdbId: game.igdbId
		};
	}

	function openViewer(game: UpcomingGame, start = 0) {
		const items = galleryItems(meta[game.id || slugId(game.name)]?.items ?? []);
		if (!items.length) return;
		viewerGame = game;
		viewerStart = start;
	}

	async function loadVisibleMeta(slice: UpcomingGame[]) {
		const lookups = slice
			.filter((game) => {
				const id = game.id || slugId(game.name);
				const safeImage = pickDisplayImageUrl(game.imageUrl);
				return !safeImage && !meta[id]?.items?.length;
			})
			.map(lookupFor);
		if (!lookups.length) return;

		const enhanced = await loadMetaBatch(lookups);
		if (Object.keys(enhanced).length) {
			meta = { ...meta, ...enhanced };
		}
	}

	async function fetchGames(next: UpcomingPlatformKey) {
		loading = true;
		visibleCount = PAGE_SIZE;
		meta = {};
		try {
			const payload = await loadUpcomingGames(next);
			games = payload.games;
			source = payload.source;
			fetchedAt = payload.fetchedAt;
			meta = await loadUpcomingMeta();
		} finally {
			loading = false;
		}
	}

	$effect(() => {
		const platformSnapshot = platform;
		void fetchGames(platformSnapshot);
	});

	$effect(() => {
		const slice = visibleGames;
		if (loading || !slice.length) return;
		void loadVisibleMeta(slice);
	});
</script>

<div class="section-tabs" role="tablist" aria-label="Upcoming platform">
	{#each platforms as row}
		<button
			type="button"
			role="tab"
			class:sel={platform === row.id}
			aria-selected={platform === row.id}
			onclick={() => (platform = row.id)}
		>
			{row.label}
		</button>
	{/each}
</div>

{#if loading}
	<div class="loading">Loading upcoming releases…</div>
{:else if !games.length}
	<div class="empty">No upcoming releases found for this platform.</div>
{:else}
	<div class="rail">
		{#each visibleGames as game (game.id)}
			<UpcomingCard
				{game}
				meta={meta[game.id || slugId(game.name)]}
				{today}
				onOpenViewer={(start) => openViewer(game, start)}
			/>
		{/each}
	</div>
	{#if hasMore}
		<div class="slab upcoming-more">
			<span>{visibleGames.length} of {games.length}</span>
			<button type="button" onclick={() => (visibleCount += PAGE_SIZE)}>Show more</button>
		</div>
	{/if}
{/if}

{#if source}
	<p class="catalog-note">
		{source}
		{#if fetchedAt}
			· updated {new Date(fetchedAt).toLocaleString()}
		{/if}
	</p>
{/if}

{#if viewerGame}
	<MediaViewer
		items={galleryItems(meta[viewerGame.id || slugId(viewerGame.name)]?.items ?? [])}
		title={viewerGame.name}
		startIndex={viewerStart}
		onClose={() => (viewerGame = null)}
	/>
{/if}
