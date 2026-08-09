<script lang="ts">
	import { cachedImageLoad, coverItem, imageLoads, loadGameMeta } from '$lib/art';
	import { normalizeImageUrl, pickDisplayImageUrl } from '$lib/html';
	import { resolveCatalogStoreUrl } from '$lib/store-urls';
	import type { CatalogEntry, GameRatings } from '$lib/types';

	let { entry, ratings, showSummary = true }: {
		entry: CatalogEntry;
		ratings?: GameRatings;
		showSummary?: boolean;
	} = $props();

	let coverUrl = $state<string | undefined>();
	let snapUrl = $state<string | undefined>();
	let coverReady = $state(false);
	let snapReady = $state(false);
	let artLoading = $state(false);
	let triedRemote = $state(false);

	function initials(name: string) {
		return name
			.replace(/[^A-Za-z0-9 ]/g, '')
			.split(/\s+/)
			.filter(Boolean)
			.slice(0, 3)
			.map((word) => word[0])
			.join('');
	}

	function hues(text: string) {
		let hash = 0;
		for (let index = 0; index < text.length; index += 1) {
			hash = (hash * 31 + text.charCodeAt(index)) >>> 0;
		}
		const first = hash % 360;
		return [`hsl(${first} 42% 26%)`, `hsl(${(first + 38) % 360} 46% 15%)`];
	}

	let colors = $derived(hues(entry.name));
	const isRetro = $derived(Boolean(entry.snapUrl));
	const displayRatings = $derived(ratings ?? entry.ratings);
	const storeUrl = $derived(resolveCatalogStoreUrl(entry));

	$effect(() => {
		coverUrl = normalizeImageUrl(entry.imageUrl);
		snapUrl = normalizeImageUrl(entry.snapUrl);
		triedRemote = false;
	});

	$effect(() => {
		if (coverUrl || triedRemote) return;
		const lookup = { id: entry.id, name: entry.name };
		let cancelled = false;
		artLoading = true;
		void loadGameMeta(lookup).then((meta) => {
			if (cancelled) return;
			const cover = coverItem(meta.items);
			const url = pickDisplayImageUrl(cover?.url);
			if (url) coverUrl = url;
			triedRemote = true;
			artLoading = false;
		});
		return () => {
			cancelled = true;
		};
	});

	$effect(() => {
		const cover = coverUrl;
		const snap = snapUrl;
		const cachedCover = cachedImageLoad(cover);
		const cachedSnap = cachedImageLoad(snap);

		coverReady = cachedCover ?? false;
		snapReady = cachedSnap ?? false;

		const pending: Promise<void>[] = [];
		if (cover && cachedCover === undefined) {
			artLoading = true;
			pending.push(
				imageLoads(cover).then(async (ok) => {
					if (ok) {
						coverReady = true;
						return;
					}
					if (triedRemote) {
						coverReady = false;
						return;
					}
					triedRemote = true;
					const meta = await loadGameMeta({ id: entry.id, name: entry.name });
					const fallback = pickDisplayImageUrl(coverItem(meta.items)?.url);
					if (fallback && fallback !== cover) {
						coverUrl = fallback;
						coverReady = await imageLoads(fallback);
					} else {
						coverUrl = undefined;
						coverReady = false;
					}
				}).then(() => undefined)
			);
		}
		if (snap && cachedSnap === undefined) {
			artLoading = true;
			pending.push(imageLoads(snap).then((ok) => (snapReady = ok)));
		}

		if (!pending.length) {
			artLoading = false;
			return;
		}

		void Promise.all(pending).then(() => {
			artLoading = false;
		});
	});
</script>

<article class="catalog-card">
	<div
		class="art"
		class:retro={isRetro}
		class:modern={!isRetro}
		class:has-media={coverReady || snapReady}
		style={`--c1:${colors[0]};--c2:${colors[1]}`}
	>
		<span class="glyph">{initials(entry.name)}</span>
		{#if snapReady && snapUrl}
			<img class="snap on" src={snapUrl} alt="" />
		{/if}
		{#if coverReady && coverUrl}
			<img
				class={`box ${isRetro ? 'contain' : 'cover'} on`}
				src={coverUrl}
				alt={`${entry.name} cover`}
			/>
		{/if}
		{#if entry.tier}
			<span class={`badge ${isRetro ? 'b-retro' : 'b-free'}`}>{entry.tier}</span>
		{/if}
		{#if entry.systemLabel}
			<span class="sys">{entry.systemLabel}</span>
		{/if}
		{#if artLoading}
			<span class="loading-mark" aria-label="Loading artwork">···</span>
		{/if}
	</div>
	<div class="body">
		<h3>
			{#if storeUrl}
				<a href={storeUrl} target="_blank" rel="noopener noreferrer">{entry.name}</a>
			{:else}
				{entry.name}
			{/if}
		</h3>
		{#if displayRatings?.scores.length}
			<div class="ratings catalog-ratings">
				{#each displayRatings.scores as score}
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
		{#if showSummary && entry.summary}
			<p class="why">{entry.summary}</p>
		{/if}
		{#if entry.platforms}
			<div class="meta"><span>{entry.platforms}</span></div>
		{/if}
	</div>
</article>
