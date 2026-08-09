<script lang="ts">
	import { onMount } from 'svelte';
	import BrowseTabs from '$lib/components/BrowseTabs.svelte';
	import GameCard from '$lib/components/GameCard.svelte';
	import NewReleasesRail from '$lib/components/NewReleasesRail.svelte';
	import PinnedShelf from '$lib/components/PinnedShelf.svelte';
	import ServiceCatalog from '$lib/components/ServiceCatalog.svelte';
	import UpcomingRail from '$lib/components/UpcomingRail.svelte';
	import { UPCOMING } from '$lib/data';
	import { loadPool } from '$lib/pool';
	import { loadPinned } from '$lib/pinned';
	import { loadDismissed, loadHand, saveDismissed, saveHand } from '$lib/storage';
	import type { ArtStatus, BrowseTab, Game } from '$lib/types';

	const today = new Date();
	const dateKey = today.toISOString().slice(0, 10);

	let ready = $state(false);
	let dismissed = $state<Set<string>>(new Set());
	let hand = $state<string[]>([]);
	let games = $state<Game[]>([]);
	let poolSource = $state('');
	let artVersion = $state(0);
	let artStatus = $state({ loaded: 0, missing: 0, noSource: 0 });
	let tab = $state<BrowseTab>('tonight');
	let pinnedMonthlyIds = $state<Set<string>>(new Set());

	const SHELF_SIZE = 10;

	let shelf = $derived(
		hand.map((id) => games.find((game) => game.id === id)).filter((game): game is Game => Boolean(game))
	);
	let pool = $derived(games.filter((game) => !dismissed.has(game.id)));

	function isMonthlyPsPlus(game: Game) {
		return pinnedMonthlyIds.has(game.id) || game.tag === 'Monthly';
	}

	function deal() {
		const available = games.filter(
			(game) => !dismissed.has(game.id) && !isMonthlyPsPlus(game)
		);
		const pick = (items: Game[], count: number) =>
			items
				.slice()
				.sort(() => Math.random() - 0.5)
				.slice(0, count)
				.map((game) => game.id);

		let result = [
			...pick(available.filter((game) => game.reason === 'leaving'), 2),
			...pick(available.filter((game) => game.reason === 'free'), 2),
			...pick(available.filter((game) => game.reason === 'modern'), 3),
			...pick(available.filter((game) => game.reason === 'retro'), 3)
		];

		if (result.length < SHELF_SIZE) {
			const rest = available.filter((game) => !result.includes(game.id));
			result = result.concat(pick(rest, SHELF_SIZE - result.length));
		}

		return result.slice(0, SHELF_SIZE);
	}

	function resetArtStatus() {
		artStatus = { loaded: 0, missing: 0, noSource: 0 };
	}

	function recordArtStatus(status: ArtStatus) {
		if (status === 'loaded') artStatus.loaded += 1;
		if (status === 'missing') artStatus.missing += 1;
		if (status === 'no-source') artStatus.noSource += 1;
	}

	function persist() {
		saveDismissed(dismissed);
		saveHand(dateKey, hand);
	}

	function redeal() {
		hand = deal();
		resetArtStatus();
		artVersion += 1;
		persist();
	}

	function dismiss(game: Game) {
		dismissed = new Set([...dismissed, game.id]);
		hand = hand.filter((id) => id !== game.id);
		const replacement = games.filter(
			(item) =>
				!dismissed.has(item.id) &&
				!hand.includes(item.id) &&
				!isMonthlyPsPlus(item)
		);
		if (replacement.length) hand = [...hand, replacement[Math.floor(Math.random() * replacement.length)].id];
		resetArtStatus();
		artVersion += 1;
		persist();
	}

	function resetDismissed() {
		dismissed = new Set();
		hand = deal();
		resetArtStatus();
		artVersion += 1;
		persist();
	}

	function resolveHand(): string[] {
		const saved = loadHand(dateKey)?.filter((id) => !dismissed.has(id));
		const valid =
			saved?.filter((id) => {
				const game = games.find((row) => row.id === id);
				return game && !isMonthlyPsPlus(game);
			}) ?? [];
		if (valid.length >= SHELF_SIZE) return valid.slice(0, SHELF_SIZE);
		return deal();
	}

	onMount(async () => {
		dismissed = loadDismissed();

		const pinned = await loadPinned();
		const monthly = pinned.sections.find((section) => section.id === 'psplus-monthly');
		pinnedMonthlyIds = new Set(monthly?.entries.map((entry) => entry.id) ?? []);

		const fast = await loadPool({ fast: true });
		games = fast.games;
		poolSource = fast.source;
		hand = resolveHand();
		persist();
		ready = true;

		// Retro catalogs are large; load them after the UI is interactive.
		window.setTimeout(async () => {
			const full = await loadPool();
			if (full.games.length <= games.length) return;
			games = full.games;
			poolSource = full.source;
			const valid = hand.filter((id) => games.some((game) => game.id === id));
			if (valid.length < hand.length) {
				hand = resolveHand();
				persist();
			}
		}, 0);
	});
</script>

<svelte:head>
	<title>What Now — a shorter way to choose</title>
	<meta name="description" content="Ten games, weighted toward what you already pay for and what is about to disappear." />
</svelte:head>

<div class="wrap">
	<header>
		<h1>What<br /><em>now</em></h1>
		<div class="stamp">{today.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}</div>
	</header>

	<p class="sub">
		Browse by service, sort by critic scores, or let tonight's shelf pick ten for you. Hover a retro cover to see
		the game running. Click any cover for screenshots.
	</p>

	<BrowseTabs active={tab} onChange={(next) => (tab = next)} />

	{#if tab === 'tonight'}
		<div class="slab">
			<h2>Tonight's shelf</h2>
			<div class="line"></div>
			<button type="button" onclick={redeal}>Deal again</button>
		</div>
		<div class="shelf">
			{#if !ready}
				<div class="loading">Loading live catalog…</div>
			{:else if !shelf.length}
				<div class="empty">Nothing left in the pool. Clear dismissed below to start over.</div>
			{:else}
				{#each shelf as game (game.id + ':' + artVersion)}
					<GameCard
						game={game}
						onArtStatus={recordArtStatus}
						onDismiss={dismiss}
					/>
				{/each}
			{/if}
		</div>
		<PinnedShelf />
	{:else if tab === 'new'}
		<div class="slab"><h2>New releases</h2><div class="line"></div></div>
		<NewReleasesRail {today} />
	{:else if tab === 'soon'}
		<div class="slab"><h2>Landing soon</h2><div class="line"></div></div>
		<UpcomingRail games={UPCOMING} {today} />
	{:else if tab === 'psplus'}
		<div class="slab"><h2>PS Plus catalog</h2><div class="line"></div></div>
		<ServiceCatalog service="psplus" />
	{:else if tab === 'gamepass'}
		<div class="slab"><h2>Game Pass catalog</h2><div class="line"></div></div>
		<ServiceCatalog service="gamepass" />
	{:else if tab === 'modern'}
		<div class="slab"><h2>Modern</h2><div class="line"></div></div>
		<ServiceCatalog service="modern" />
	{:else if tab === 'retro'}
		<div class="slab"><h2>Retro</h2><div class="line"></div></div>
		<ServiceCatalog service="retro" />
	{/if}

	<footer>
		<span>{pool.length} in pool · {dismissed.size} dismissed</span>
		{#if poolSource}
			<span>{poolSource}</span>
		{/if}
		<span class:warn={artStatus.noSource > 0}>
			art · {artStatus.loaded} loaded{artStatus.missing ? ` · ${artStatus.missing} missing` : ''}{artStatus.noSource
				? ` · ${artStatus.noSource} no source`
				: ''}
		</span>
		<span>
			ratings via Metacritic, IGDB &amp; OpenCritic · art via
			<a href="https://www.steamgriddb.com" target="_blank" rel="noopener">SteamGridDB</a> &amp; libretro
		</span>
		<button type="button" onclick={resetDismissed}>Clear dismissed</button>
	</footer>
</div>
