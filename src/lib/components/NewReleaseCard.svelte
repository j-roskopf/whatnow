<script lang="ts">
	import {
		cachedImageLoad,
		coverItem,
		galleryItems,
		imageLoads,
		loadGameMeta,
		slugId
	} from '$lib/art';
	import type { ApiKeys, GameMeta, MetacriticRelease } from '$lib/types';

	let {
		release,
		meta,
		keys,
		timing,
		onOpenViewer
	}: {
		release: MetacriticRelease;
		meta?: GameMeta;
		keys: ApiKeys;
		timing: { main: string; sub: string };
		onOpenViewer: (start?: number) => void;
	} = $props();

	let posterUrl = $state<string | undefined>(release.imageUrl);
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

	const colors = hues(release.name);
	const items = $derived(meta?.items ?? []);
	const ratings = $derived(meta?.ratings);
	const cover = $derived(coverItem(items));
	const gallery = $derived(galleryItems(items));

	async function resolvePoster(url: string) {
		const cached = cachedImageLoad(url);
		if (cached !== undefined) {
			posterReady = cached;
			artLoading = false;
			return;
		}
		artLoading = true;
		posterReady = await imageLoads(url);
		artLoading = false;
	}

	$effect(() => {
		const fromRelease = release.imageUrl;
		const fromMeta = cover?.url;
		const next = fromMeta ?? fromRelease;
		posterUrl = next;

		if (next) {
			void resolvePoster(next);
			return;
		}

		posterReady = false;
		artLoading = true;
		const lookup = {
			id: slugId(release.name),
			name: release.name,
			releaseDate: release.releaseDate
		};
		let cancelled = false;
		void loadGameMeta(lookup, keys).then((result) => {
			if (cancelled) return;
			const hit = coverItem(result.items);
			if (hit?.url) {
				posterUrl = hit.url;
				void resolvePoster(hit.url);
			} else {
				artLoading = false;
			}
		});
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
		<span class="glyph">{initials(release.name)}</span>
		{#if posterReady && posterUrl}
			<img class="cover on" src={posterUrl} alt={`${release.name} cover`} />
		{/if}
		<div class="cd">
			{timing.main}
			{#if timing.sub}
				<small>{timing.sub}</small>
			{/if}
		</div>
		{#if release.score != null}
			<div class="mc-score">{release.score}</div>
		{/if}
		{#if gallery.length}
			<button
				class="art-hit"
				type="button"
				aria-label={`View media for ${release.name}`}
				onclick={() => onOpenViewer(cover ? gallery.indexOf(cover) : 0)}
			></button>
		{/if}
		{#if artLoading}
			<span class="loading-mark" aria-label="Loading artwork">···</span>
		{/if}
	</div>
	<div class="n">
		<a href={release.url} target="_blank" rel="noopener noreferrer">{release.name}</a>
	</div>
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
	{:else if release.score != null}
		<div class="ratings rail-ratings">
			<a class="rating-chip" href={release.url} target="_blank" rel="noopener noreferrer">
				Metacritic {release.score}
			</a>
		</div>
	{/if}
	{#if release.summary}
		<div class="p release-summary">{release.summary}</div>
	{/if}
</div>
