<script lang="ts">
	import { onMount } from 'svelte';
	import GameCard from '$lib/components/GameCard.svelte';
	import {
		buildRandomPool,
		RANDOM_SOURCES,
		randomSourceOf,
		type RandomSource
	} from '$lib/random-pool';
	import type { Game } from '$lib/types';

	type Phase = 'loading' | 'idle' | 'spinning' | 'reveal';

	let phase = $state<Phase>('loading');
	let pool = $state<Game[]>([]);
	let picked = $state<Game | null>(null);
	let flashSource = $state<RandomSource>('modern');
	let flashName = $state('');
	let spinTimer: ReturnType<typeof setTimeout> | undefined;

	const sourceLabel = $derived(
		RANDOM_SOURCES.find((row) => row.id === flashSource)?.label ?? ''
	);
	const pickedSource = $derived(picked ? randomSourceOf(picked) : null);
	const pickedLabel = $derived(
		pickedSource ? RANDOM_SOURCES.find((row) => row.id === pickedSource)?.label ?? '' : ''
	);

	function pickRandom(): Game | undefined {
		if (!pool.length) return undefined;
		return pool[Math.floor(Math.random() * pool.length)];
	}

	function clearSpinTimer() {
		if (spinTimer) {
			clearTimeout(spinTimer);
			spinTimer = undefined;
		}
	}

	function spin() {
		if (phase === 'spinning' || !pool.length) return;
		clearSpinTimer();
		picked = null;
		phase = 'spinning';

		const final = pickRandom();
		if (!final) {
			phase = 'idle';
			return;
		}

		const finalSource = randomSourceOf(final);
		const start = performance.now();
		const duration = 2600;

		const tick = () => {
			const elapsed = performance.now() - start;
			const progress = Math.min(elapsed / duration, 1);
			const ease = 1 - (1 - progress) ** 3;
			const interval = 40 + ease * 220;

			if (progress < 0.72) {
				flashSource = RANDOM_SOURCES[Math.floor(Math.random() * RANDOM_SOURCES.length)].id;
				flashName = pool[Math.floor(Math.random() * pool.length)].name;
			} else if (progress < 0.92) {
				flashSource = RANDOM_SOURCES[Math.floor(Math.random() * RANDOM_SOURCES.length)].id;
				flashName = pool[Math.floor(Math.random() * pool.length)].name;
			} else {
				flashSource = finalSource;
				flashName = final.name;
			}

			if (progress < 1) {
				spinTimer = setTimeout(tick, interval);
				return;
			}

			flashSource = finalSource;
			flashName = final.name;
			picked = final;
			phase = 'reveal';
		};

		tick();
	}

	onMount(async () => {
		pool = await buildRandomPool();
		phase = pool.length ? 'idle' : 'idle';
		if (pool.length) {
			flashName = pool[0].name;
			flashSource = randomSourceOf(pool[0]);
		}
	});

	$effect(() => {
		return () => clearSpinTimer();
	});
</script>

<div class="random-wrap">
	<div class="slab">
		<h2>Random pick</h2>
		<div class="line"></div>
		{#if phase !== 'loading' && pool.length}
			<span class="count">{pool.length} games across every shelf</span>
		{/if}
	</div>

	{#if phase === 'loading'}
		<div class="random-stage loading">
			<p class="random-hint">Loading every catalog…</p>
		</div>
	{:else if !pool.length}
		<div class="random-stage empty">
			<p class="random-hint">No games in the pool yet.</p>
		</div>
	{:else}
		<div class="random-stage" class:spinning={phase === 'spinning'} class:reveal={phase === 'reveal'}>
			<div class="random-orbit" aria-hidden="true">
				{#each RANDOM_SOURCES as source}
					<span
						class="orbit-chip"
						class:lit={phase === 'spinning' && flashSource === source.id}
						style={`--src-color: var(--${source.id})`}
					>
						{source.label}
					</span>
				{/each}
			</div>

			<div class="random-core">
				<span class="random-source random-source-{flashSource}" class:pulse={phase === 'spinning'}>
					{sourceLabel}
				</span>
				<p class="random-name" class:blur={phase === 'spinning'}>{flashName}</p>
				{#if phase === 'idle'}
					<p class="random-hint">One spin. Any shelf. No regrets.</p>
				{:else if phase === 'spinning'}
					<p class="random-hint shuffle">Shuffling the stacks…</p>
				{:else if picked}
					<p class="random-hint landed">Landed on <strong>{pickedLabel}</strong></p>
				{/if}
			</div>

			<div class="random-actions">
				{#if phase === 'idle' || phase === 'reveal'}
					<button type="button" class="random-spin" onclick={spin}>
						{phase === 'reveal' ? 'Spin again' : 'Spin'}
					</button>
				{:else}
					<button type="button" class="random-spin spinning" disabled>Spinning…</button>
				{/if}
			</div>
		</div>

		{#if phase === 'reveal' && picked}
			<div class="random-reveal-card">
				<GameCard game={picked} showDismiss={false} />
			</div>
		{/if}
	{/if}
</div>
