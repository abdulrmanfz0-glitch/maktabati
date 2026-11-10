// Child process for the bench: runs one fixture in a fresh process so time and peak memory
// are measured per file. Prints one JSON line of metrics (no book text).
import { listFixtures } from './fixtures.mjs';
import { runOne } from './run.mjs';

const id = process.argv[2];
const fx = listFixtures().find(f => f.id === id);
if (!fx) { console.log(JSON.stringify({ id, ok: false, error: 'not-found' })); process.exit(0); }
const r = await runOne(fx);
if (r.ok) delete r.book;
console.log(JSON.stringify(r));
