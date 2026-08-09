import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';

const hasData = existsSync('static/data/pool-fast.json');

if (process.env.VERCEL && hasData) {
	console.log('Skipping live catalog fetch on Vercel (using committed static/data).');
	process.exit(0);
}

if (process.env.SKIP_DATA_GEN === '1' && hasData) {
	console.log('Skipping data generation (SKIP_DATA_GEN=1).');
	process.exit(0);
}

execSync('tsx scripts/generate-data.ts', { stdio: 'inherit' });
