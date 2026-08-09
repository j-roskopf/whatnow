<script lang="ts">
	import {
		cachedImageLoad,
		coverItem,
		galleryItems,
		imageLoads,
		loadGameMeta,
		slugId
	} from '$lib/art';
	import { pickDisplayImageUrl } from '$lib/html';
	import type { GameMeta, UpcomingGame } from '$lib/types';

	let {
		game,
		meta,
		today,
		onOpenViewer
	}: {
		game: UpcomingGame;
		meta?: GameMeta;
		today: Date;
		onOpenViewer: (start?: number) => void;
	} = $props();

	let posterUrl = $state<string | undefined>();
	let posterReady = $state(false);
	let artLoading = $state(false);

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

	const colors = hues(game.name);
	const items = $derived(meta?.items ?? []);
	const ratings = $derived(meta?.ratings);
	const cover = $derived(coverItem(items));
	const gallery = $derived(galleryItems(items));

	async function resolvePoster(url: string): Promise<boolean> {
		const cached = cachedImageLoad(url);
		if (cached !== undefined) {
			posterReady = cached;
			artLoading = false;
			return cached;
		}
		artLoading = true;
		const ok = await imageLoads(url);
		posterReady = ok;
		artLoading = false;
		return ok;
	}

	async function tryRemotePoster() {
		const result = await loadGameMeta({
			id: slugId(game.name),
			name: game.name,
			releaseDate: game.date,
			searchAs: game.searchAs,
			igdbId: game.igdbId
		});
		const hit = coverItem(result.items);
		const url = pickDisplayImageUrl(hit?.url);
		if (!url) return false;
		posterUrl = url;
		return resolvePoster(url);
	}

	$effect(() => {
		const next = pickDisplayImageUrl(cover?.url);
		let cancelled = false;

		async function resolve() {
			if (next) {
				posterUrl = next;
				const ok = await resolvePoster(next);
				if (cancelled) return;
				if (ok) return;
			} else {
				posterReady = false;
			}

			artLoading = true;
			const remoteOk = await tryRemotePoster();
			if (cancelled) return;
			if (!remoteOk) artLoading = false;
		}

		void resolve();
		return () => {
			cancelled = true;
		};
	});
</script>

<div class="up">
	<div
		class="frame modern"
		class:has-media={posterReady}
		style={`--c1:${colors[0]};--c2:${colors[1]}`}
	>
		<span class="glyph">{initials(game.name)}</span>
		{#if posterReady && posterUrl}
			<img class="cover on" src={posterUrl} alt={`${game.name} cover`} />
		{/if}
		<div class="cd">{daysOut(game.date)}<small>days out</small></div>
		{#if gallery.length}
			<button
				class="art-hit"
				type="button"
				aria-label={`View media for ${game.name}`}
				onclick={() => onOpenViewer(cover ? gallery.indexOf(cover) : 0)}
			></button>
		{/if}
		{#if artLoading}
			<span class="loading-mark" aria-label="Loading artwork">···</span>
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
