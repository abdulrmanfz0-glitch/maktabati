// Web build: Vite bundles worker.js as its own file (with lazy chunks for pdf.js and the word list).
export default async function makeWorker() {
  return new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
}
