<script lang="ts">
	import { loadMetaBatch, slugId } from '$lib/art';
	import { loadMetacriticNewReleases } from '$lib/metacritic';
	import MediaViewer from '$lib/components/MediaViewer.svelte';
	import NewReleaseCard from '$lib/components/NewReleaseCard.svelte';
	import type { GameMeta, MetacriticPlatform, MetacriticRelease } from '$lib/types';

	let { today }: { today: Date } = $props();

	const platforms: { id: MetacriticPlatform; label: string }[] = [
		{ id: 'ps5', label: 'PS5' },
		{ id: 'ps4', label: 'PS4' },
		{ id: 'xbox-series-x', label: 'Xbox' },
		{ id: 'pc', label: 'PC' }
	];

	let platform = $state<MetacriticPlatform>('ps5');
	let loading = $state(false);
	let releases = $state<MetacriticRelease[]>([]);
	let source = $state('');
	let fetchedAt = $state('');
	let meta = $state<Record<string, GameMeta>>({});
	let viewerRelease = $state<MetacriticRelease | null>(null);
	let viewerStart = $state(0);

	function lookupFor(release: MetacriticRelease) {
		return {
			id: slugId(release.name),
			name: release.name,
			releaseDate: release.releaseDate
		};
	}

	function releaseTiming(release: MetacriticRelease) {
		if (!release.releaseDate) {
			return { main: release.releaseDateLabel ?? 'New', sub: '' };
		}
		const days = Math.ceil(
			(new Date(`${release.releaseDate}T12:00:00`).getTime() - today.getTime()) / 86400000
		);
		if (days > 0) return { main: String(days), sub: 'days out' };
		if (days === 0) return { main: 'Out', sub: 'today' };
		return { main: String(Math.abs(days)), sub: 'days ago' };
	}

	function openViewer(release: MetacriticRelease, start = 0) {
		const items = meta[slugId(release.name)]?.items ?? [];
		if (!items.length) return;
		viewerRelease = release;
		viewerStart = start;
	}

	async function fetchReleases(next: MetacriticPlatform) {
		loading = true;
		meta = {};
		const payload = await loadMetacriticNewReleases(next);
		releases = payload.releases;
		source = payload.source;
		fetchedAt = payload.fetchedAt;
		loading = false;

		if (releases.length) {
			const results = await loadMetaBatch(releases.map(lookupFor));
			meta = results;
		}
	}

	$effect(() => {
		const platformSnapshot = platform;
		fetchReleases(platformSnapshot);
	});
</script>

<div class="section-tabs" role="tablist" aria-label="Metacritic platform">
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
	<div class="loading">Loading new releases…</div>
{:else if !releases.length}
	<div class="empty">No new releases found for this platform.</div>
{:else}
	<div class="rail">
		{#each releases as release (release.id)}
			<NewReleaseCard
				release={release}
				meta={meta[slugId(release.name)]}
				timing={releaseTiming(release)}
				onOpenViewer={(start) => openViewer(release, start)}
			/>
		{/each}
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

{#if viewerRelease}
	<MediaViewer
		items={meta[slugId(viewerRelease.name)]?.items ?? []}
		title={viewerRelease.name}
		startIndex={viewerStart}
		onClose={() => (viewerRelease = null)}
	/>
{/if}
