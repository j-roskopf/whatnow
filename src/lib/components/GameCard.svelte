<script lang="ts">
	import { onMount } from 'svelte';
	import {
		coverItem,
		galleryItems,
		loadGameMeta,
		screenshotItem
	} from '$lib/art';
	import MediaViewer from '$lib/components/MediaViewer.svelte';
	import type { ApiKeys, ArtStatus, Game, GameRatings, MediaItem } from '$lib/types';

	let {
		game,
		keys,
		ratings: ratingsProp,
		showDismiss = true,
		onArtStatus,
		onDismiss
	}: {
		game: Game;
		keys: ApiKeys;
		ratings?: GameRatings;
		showDismiss?: boolean;
		onArtStatus?: (status: ArtStatus) => void;
		onDismiss?: (game: Game) => void;
	} = $props();

	let media = $state<MediaItem[]>([]);
	let ratings = $state<GameRatings>({ scores: [] });
	let loading = $state(true);
	let viewerOpen = $state(false);
	let viewerStart = $state(0);

	const isRetro = $derived(game.reason === 'retro');

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

	let colors = $derived(hues(game.name));
	let cover = $derived(coverItem(media));
	let snap = $derived(screenshotItem(media));
	let gallery = $derived(galleryItems(media));

	function openViewer(start = 0) {
		if (!gallery.length) return;
		viewerStart = start;
		viewerOpen = true;
	}

	onMount(async () => {
		if (ratingsProp?.scores.length) ratings = ratingsProp;

		const meta = await loadGameMeta(game, keys);
		media = meta.items;
		if (!ratingsProp?.scores.length) ratings = meta.ratings;
		loading = false;

		if (!onArtStatus) return;
		if (media.length) {
			onArtStatus('loaded');
			return;
		}
		onArtStatus(game.system ? 'missing' : 'no-source');
	});
</script>

<article class="card">
	<div
		class="art"
		class:has-media={media.length > 0}
		class:retro={isRetro}
		class:modern={!isRetro}
		style={`--c1:${colors[0]};--c2:${colors[1]}`}
	>
		<span class="glyph">{initials(game.name)}</span>
		{#if snap && isRetro}
			<img class="snap on" src={snap.url} alt="" />
		{/if}
		{#if cover}
			<img
				class={`box ${isRetro ? cover.fit : 'cover'} on`}
				src={cover.url}
				alt={`${game.name} cover`}
			/>
		{/if}
		<span class={`badge b-${game.reason}`}>{game.tag}</span>
		<span class="sys">{game.systemLabel}</span>
		{#if showDismiss && onDismiss}
			<button
				class="x"
				type="button"
				aria-label={`Never suggest ${game.name} again`}
				disabled={loading}
				onclick={() => onDismiss(game)}
			>
				✕
			</button>
		{/if}
		{#if loading}<span class="loading-mark" aria-label="Loading artwork">···</span>{/if}
		{#if gallery.length}
			<button
				class="art-hit"
				type="button"
				aria-label={`View media for ${game.name}`}
				onclick={() => openViewer(cover ? gallery.indexOf(cover) : 0)}
			></button>
		{/if}
	</div>
	<div class="body">
		<h3>{game.name}</h3>
		{#if ratings.scores.length}
			<div class="ratings">
				{#each ratings.scores as score}
					{#if score.url}
						<a
							class="rating-chip"
							href={score.url}
							target="_blank"
							rel="noopener noreferrer"
						>
							{score.label}{score.score != null ? ` ${score.score}` : ''}
						</a>
					{:else if score.score != null}
						<span class="rating-chip">{score.label} {score.score}</span>
					{/if}
				{/each}
			</div>
		{/if}
		<p class="why">{game.why}</p>
		<div class="meta"><span>{game.where}</span><span>{game.hours}</span><span>{game.platforms}</span></div>
	</div>
</article>

{#if viewerOpen}
	<MediaViewer
		items={gallery}
		title={game.name}
		startIndex={viewerStart}
		onClose={() => (viewerOpen = false)}
	/>
{/if}
