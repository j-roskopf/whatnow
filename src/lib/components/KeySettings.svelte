<script lang="ts">
	import type { ApiKeys } from '$lib/types';

	let { initialKeys, onSave }: { initialKeys: ApiKeys; onSave: (keys: ApiKeys) => void } = $props();
	let steamGridDb = $state('');
	let igdbClientId = $state('');
	let igdbClientSecret = $state('');
	let openCritic = $state('');

	$effect(() => {
		steamGridDb = initialKeys.steamGridDb ?? '';
		igdbClientId = initialKeys.igdbClientId ?? '';
		igdbClientSecret = initialKeys.igdbClientSecret ?? '';
		openCritic = initialKeys.openCritic ?? '';
	});

	function save() {
		onSave({
			steamGridDb: steamGridDb.trim(),
			igdbClientId: igdbClientId.trim(),
			igdbClientSecret: igdbClientSecret.trim(),
			openCritic: openCritic.trim()
		});
	}
</script>

<div class="keyrow">
	<label>
		<span class="sr-only">SteamGridDB API key</span>
		<input bind:value={steamGridDb} type="password" placeholder="SteamGridDB key" autocomplete="off" spellcheck="false" />
	</label>
	<label>
		<span class="sr-only">IGDB Client ID</span>
		<input bind:value={igdbClientId} type="password" placeholder="IGDB Client ID" autocomplete="off" spellcheck="false" />
	</label>
	<label>
		<span class="sr-only">IGDB Client Secret</span>
		<input bind:value={igdbClientSecret} type="password" placeholder="IGDB Client Secret" autocomplete="off" spellcheck="false" />
	</label>
	<label>
		<span class="sr-only">OpenCritic RapidAPI key</span>
		<input bind:value={openCritic} type="password" placeholder="OpenCritic RapidAPI key" autocomplete="off" spellcheck="false" />
	</label>
	<button type="button" onclick={save}>Save &amp; load art</button>
	<a href="https://www.steamgriddb.com/profile/preferences/api" target="_blank" rel="noopener">SGDB</a>
	<a href="https://dev.twitch.tv/console/apps" target="_blank" rel="noopener">IGDB</a>
	<a href="https://rapidapi.com/opencritic-opencritic-default/api/opencritic-api" target="_blank" rel="noopener">OpenCritic</a>
	<small>Optional overrides — server keys are used when set in Vercel. IGDB gives critics/players + Metacritic links. OpenCritic key is optional (free RapidAPI tier).</small>
</div>
