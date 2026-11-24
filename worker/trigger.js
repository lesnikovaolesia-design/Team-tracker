// A tiny Cloudflare Worker that lets the tracker page start the "Update tracker"
// GitHub job, so 🔄 Update reads Jira right away instead of waiting for the schedule.
//
// Secrets (Cloudflare: Worker → Settings → Variables and Secrets):
//   GITHUB_TOKEN      a fine-grained GitHub token for this one repository, Actions: Read and write
//   TRACKER_PASSWORD  the same team password the page asks for
//
// POST  starts the job, unless one is running or ran in the last 2 minutes.
// GET   says how the newest run is doing.
// Both need the X-Team-Key header the page sends, made from the team password.

const REPO = 'lesnikovaolesia-design/Team-tracker';
const WORKFLOW = 'update.yml';
const ORIGINS = ['https://lesnikovaolesia-design.github.io', 'http://localhost:8765'];
const RECENT_MS = 2 * 60 * 1000;

export default {
  async fetch(req, env) {
    const origin = req.headers.get('Origin') || '';
    const cors = {
      'Access-Control-Allow-Origin': ORIGINS.includes(origin) ? origin : ORIGINS[0],
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'X-Team-Key',
      'Access-Control-Max-Age': '86400',
      Vary: 'Origin',
    };
    const reply = (body, status = 200) => new Response(JSON.stringify(body), {status, headers: {...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store'}});
    if (req.method === 'OPTIONS') return new Response(null, {status: 204, headers: cors});
    if (!env.GITHUB_TOKEN || !env.TRACKER_PASSWORD) return reply({error: 'setup'}, 500);
    if (req.headers.get('X-Team-Key') !== await teamKey(env.TRACKER_PASSWORD)) return reply({error: 'key'}, 403);

    const gh = (path, init = {}) => fetch(`https://api.github.com/repos/${REPO}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${env.GITHUB_TOKEN}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'team-tracker-trigger',
        ...(init.body ? {'Content-Type': 'application/json'} : {}),
      },
    });
    const latest = async () => {
      const r = await gh(`/actions/workflows/${WORKFLOW}/runs?per_page=1`);
      if (!r.ok) throw new Error(`github ${r.status}`);
      const run = (await r.json()).workflow_runs?.[0];
      return run ? {id: run.id, status: run.status, conclusion: run.conclusion, created_at: run.created_at} : null;
    };

    try {
      if (req.method === 'GET') return reply({run: await latest()});
      if (req.method !== 'POST') return reply({error: 'method'}, 405);
      const run = await latest();
      if (run && (run.status !== 'completed' || Date.now() - Date.parse(run.created_at) < RECENT_MS)) return reply({started: false, run});
      const since = new Date().toISOString();
      const r = await gh(`/actions/workflows/${WORKFLOW}/dispatches`, {method: 'POST', body: JSON.stringify({ref: 'main'})});
      if (!r.ok) return reply({error: `github ${r.status}`}, 502);
      return reply({started: true, since});
    } catch (e) {
      return reply({error: e.message}, 502);
    }
  },
};

// The page sends this instead of the password itself.
export async function teamKey(password) {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`team-tracker:${password}`));
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
