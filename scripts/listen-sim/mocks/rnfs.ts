export const fs = { present: true, unlinked: [] as string[], missing: [] as string[] };
export const DocumentDirectoryPath = '/docs';
export const CachesDirectoryPath = '/cache';
export async function exists(p: string) { return fs.present && !fs.missing.some((m) => p.includes(m)); }
export async function unlink(p: string) { fs.unlinked.push(p); }
export async function mkdir() {}
export async function readFile() { return '0.wav after early nightfall the yellow lamps would light up'; }
export async function writeFile() {}
export async function stat(p: string) { return { size: p.includes('gtcrn') ? 535_638 : 0 }; }
export async function moveFile() {}
export async function copyFile() {}
export async function readDir() { return []; }
export function stopDownload() {}
export function downloadFile() { return { jobId: 1, promise: Promise.resolve({ statusCode: 200 }) }; }
