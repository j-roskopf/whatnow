<script lang="ts">
	import { coverItem, galleryItems, loadMetaBatch, slugId } from '$lib/art';
	import MediaViewer from '$lib/components/MediaViewer.svelte';
	import type { ApiKeys, GameMeta, MediaItem, UpcomingGame } from '$lib/types';

	let {
		games,
		today,
		keys
	}: { games: UpcomingGame[]; today: Date; keys: ApiKeys } = $props();

	let meta = $state<Record<string, GameMeta>>({});
	let viewerGame = $state<UpcomingGame | null>(null);
	let viewerStart = $state(0);

	function hues(text: string) {
		let hash = 0;
		for (let index = 0; index < text.length; index += 1) {
			hash = (hash * 31 + text.charCodeAt(index)) >>> 0;
		}
		const first = hash % 360;
		return [`hsl(${first} 42% 26%)`, `hsl(${(first + 38) % 360} 46% 15%)`];
	}

	function initials(name: string) {
		return name
			.replace(/[^A-Za-z0-9 ]/g, '')
			.split(/\s+/)
			.filter(Boolean)
			.slice(0, 3)
			.map((word) => word[0])
			.join('');
	}

	function daysOut(date: string) {
		return Math.ceil((new Date(`${date}T12:00:00`).getTime() - today.getTime()) / 86400000);
	}

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

	async function loadAll(keysSnapshot: ApiKeys) {
		const lookups = games.map(lookupFor);
		const results = await loadMetaBatch(lookups, keysSnapshot);
		meta = { ...meta, ...results };
	}

	$effect(() => {
		const keysSnapshot = keys;
		loadAll(keysSnapshot);
	});
</script>

<div class="rail">
	{#each games as game}
		{@const id = slugId(game.name)}
		{@const colors = hues(game.name)}
		{@const items = meta[id]?.items ?? []}
		{@const ratings = meta[id]?.ratings}
		{@const cover = coverItem(items)}
		{@const gallery = galleryItems(items)}
		<div class="up">
			<div
				class="frame modern"
				class:has-media={items.length > 0}
				style={`--c1:${colors[0]};--c2:${colors[1]}`}
			>
				<span class="glyph">{initials(game.name)}</span>
				{#if cover}
					<img class="cover on" src={cover.url} alt={`${game.name} cover`} />
				{/if}
				<div class="cd">{daysOut(game.date)}<small>days out</small></div>
				{#if gallery.length}
					<button
						class="art-hit"
						type="button"
						aria-label={`View media for ${game.name}`}
						onclick={() => openViewer(game, cover ? gallery.indexOf(cover) : 0)}
					></button>
				{/if}
			</div>
			<div class="n">{game.name}</div>
			{#if ratings?.scores.length}
				<div class="ratings rail-ratings">
					{#each ratings.scores as score}
						{#if score.url}
							<a class="rating-chip" href={score.url} target="_blank" rel="noopener noreferrer">
								{score.label}{score.score != null ? ` ${score.score}` : ''}
							</a>
						{:else if score.score != null}
							<span class="rating-chip">{score.label} {score.score}</span>
						{/if}
					{/each}
				</div>
			{/if}
			<div class="p">{game.platforms}</div>
		</div>
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
