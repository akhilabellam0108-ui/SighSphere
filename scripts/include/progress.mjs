/**
 * Node twin of progress.py: keeps the "INCLUDE progress" check run up to date while a long
 * step runs, so progress is visible on GitHub before the step ends. Best effort; silent
 * outside GitHub Actions.
 */
const lines = [];
let checkId = null;
let last = 0;

async function api(method, path, body) {
  const token = process.env.GITHUB_TOKEN;
  const repo = process.env.GITHUB_REPOSITORY;
  if (!token || !repo) return null;
  try {
    const r = await fetch(`https://api.github.com/repos/${repo}${path}`, {
      method, body: JSON.stringify(body),
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' },
    });
    return r.ok ? r.json() : null;
  } catch {
    return null;
  }
}

export async function report(line, force = false) {
  console.log(line);
  lines.push(`${new Date().toISOString().slice(11, 19)}  ${line}`);
  if (!force && Date.now() - last < 20000) return;
  last = Date.now();
  const output = { title: line.slice(0, 200), summary: '```\n' + lines.slice(-60).join('\n') + '\n```' };
  if (!checkId) {
    const r = await api('POST', '/check-runs', { name: 'INCLUDE tracking', head_sha: process.env.GITHUB_SHA, status: 'in_progress', output });
    checkId = r?.id ?? null;
  } else {
    await api('PATCH', `/check-runs/${checkId}`, { output });
  }
}

export async function finish(line, ok = true) {
  await report(line, true);
  if (checkId) await api('PATCH', `/check-runs/${checkId}`, { status: 'completed', conclusion: ok ? 'success' : 'failure' });
}
