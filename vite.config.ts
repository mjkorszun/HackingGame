import { execSync } from 'node:child_process';
import { defineConfig } from 'vite';

/** Build label: the number of the last merged pull request (from the squash commit title) and the build date. */
function buildLabel(): string {
  let pr = 'dev';
  try {
    const subject = execSync('git log -1 --format=%s', { encoding: 'utf8' });
    const m = subject.match(/\(#(\d+)\)\s*$/);
    if (m) pr = m[1].padStart(4, '0');
  } catch {
    /* not a git checkout */
  }
  const date = new Date().toISOString().slice(0, 10);
  return `v${pr} · ${date}`;
}

export default defineConfig({
  base: './',
  define: {
    __BUILD_LABEL__: JSON.stringify(buildLabel()),
  },
});
