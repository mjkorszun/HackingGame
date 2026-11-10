import { execSync } from 'node:child_process';
import { defineConfig } from 'vite';

/** Build label: the number of the last merged pull request (from the squash commit title) and the build date and time. */
function buildLabel(): string {
  let pr = 'dev';
  try {
    const subject = execSync('git log -1 --format=%s', { encoding: 'utf8' });
    const m = subject.match(/\(#(\d+)\)\s*$/);
    if (m) pr = m[1].padStart(4, '0');
  } catch {
    /* not a git checkout */
  }
  // Build time in Polish local time, e.g. 2026-11-10 22:15.
  const date = new Date().toLocaleString('sv-SE', { timeZone: 'Europe/Warsaw', dateStyle: 'short', timeStyle: 'short' });
  return `v${pr} · ${date}`;
}

export default defineConfig({
  base: './',
  define: {
    __BUILD_LABEL__: JSON.stringify(buildLabel()),
  },
});
