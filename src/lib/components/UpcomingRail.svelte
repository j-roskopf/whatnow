<script lang="ts">
	import { galleryItems, loadMetaBatch, slugId } from '$lib/art';
	import MediaViewer from '$lib/components/MediaViewer.svelte';
	import UpcomingCard from '$lib/components/UpcomingCard.svelte';
	import { loadUpcomingMeta } from '$lib/upcoming';
	import type { GameMeta, UpcomingGame } from '$lib/types';

	let { games, today }: { games: UpcomingGame[]; today: Date } = $props();

	let meta = $state<Record<string, GameMeta>>({});
	let viewerGame = $state<UpcomingGame | null>(null);
	let viewerStart = $state(0);

	function lookupFor(game: UpcomingGame) {
		return {
			id: slugId(game.name),
			name: game.name,
			releaseDate: game.date,
			searchAs: game.searchAs,
			igdbId: game.igdbId
		};
	}

	function openViewer(game: UpcomingGame, start = 0) {
		const items = galleryItems(meta[slugId(game.name)]?.items ?? []);
		if (!items.length) return;
		viewerGame = game;
		viewerStart = start;
	}

	async function loadAll() {
		const staticMeta = await loadUpcomingMeta();
		const enhanced = await loadMetaBatch(games.map(lookupFor));
		meta = { ...staticMeta, ...enhanced };
	}

	$effect(() => {
		void loadAll();
	});
</script>

<div class="rail">
	{#each games as game}
		<UpcomingCard
			{game}
			meta={meta[slugId(game.name)]}
			{today}
			onOpenViewer={(start) => openViewer(game, start)}
		/>
	{/each}
</div>

{#if viewerGame}
	<MediaViewer
		items={galleryItems(meta[slugId(viewerGame.name)]?.items ?? [])}
		title={viewerGame.name}
		startIndex={viewerStart}
		onClose={() => (viewerGame = null)}
	/>
{/if}
