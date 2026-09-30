// Scoping API for client projects (Cloudflare Pages Function, D1 bound as env.DB).
//
//   GET  /api/projects                 list projects            (iCatalyst key)
//   POST /api/projects {name}          create a project         (iCatalyst key)
//   GET  /api/projects/:slug           project + its decisions  (anyone with the link)
//   PUT  /api/projects/:slug/items/:code  save one item's fields
//
// Clients may set scope/priority/owner/notes. fit/fit_notes need the iCatalyst key,
// sent as the X-Vendor-Key header and compared with the VENDOR_KEY secret.

const ENUMS = {
  scope:    ["", "in", "later", "out"],
  priority: ["", "must", "should", "could", "wont"],
  fit:      ["", "standard", "config", "extension", "isv", "gap"],
};
const TEXT_LIMITS = { owner: 120, notes: 4000, fit_notes: 4000 };
const CLIENT_FIELDS = ["scope", "priority", "owner", "notes"];
const VENDOR_FIELDS = ["fit", "fit_notes"];
const CODE_RE = /^\d{2}\.\d{2}\.\d{3}\.\d{3}(\.\d{3}){0,2}$/;
const SLUG_RE = /^[a-z0-9-]{6,64}$/;

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });

async function isVendor(request, env) {
  const key = request.headers.get("x-vendor-key") || "";
  if (!env.VENDOR_KEY || !key) return false;
  // Constant-time comparison via SHA-256 digests.
  const enc = new TextEncoder();
  const [a, b] = await Promise.all([
    crypto.subtle.digest("SHA-256", enc.encode(key)),
    crypto.subtle.digest("SHA-256", enc.encode(env.VENDOR_KEY)),
  ]);
  const x = new Uint8Array(a), y = new Uint8Array(b);
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}

function makeSlug(name) {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 24) || "project";
  const alphabet = "abcdefghjkmnpqrstuvwxyz23456789";
  const rand = crypto.getRandomValues(new Uint8Array(10));
  return `${base}-${Array.from(rand, (n) => alphabet[n % alphabet.length]).join("")}`;
}

async function getProject(env, slug) {
  if (!SLUG_RE.test(slug)) return null;
  return env.DB.prepare("SELECT id, slug, name, created_at FROM projects WHERE slug = ?").bind(slug).first();
}

export async function onRequest({ request, env, params }) {
  const path = params.path || [];
  const method = request.method;

  try {
    if (path[0] !== "projects") return json({ error: "Not found" }, 404);

    // /api/projects
    if (path.length === 1) {
      if (!(await isVendor(request, env))) return json({ error: "iCatalyst key required" }, 401);
      if (method === "GET") {
        const { results } = await env.DB.prepare(
          `SELECT p.slug, p.name, p.created_at,
                  COUNT(i.code) AS decisions, MAX(i.updated_at) AS last_updated
             FROM projects p LEFT JOIN items i ON i.project_id = p.id
            GROUP BY p.id ORDER BY p.created_at DESC`
        ).all();
        return json({ projects: results });
      }
      if (method === "POST") {
        const body = await request.json().catch(() => ({}));
        const name = String(body.name || "").trim().slice(0, 100);
        if (!name) return json({ error: "Project name is required" }, 400);
        const slug = makeSlug(name);
        await env.DB.prepare("INSERT INTO projects (slug, name) VALUES (?, ?)").bind(slug, name).run();
        return json({ project: { slug, name } }, 201);
      }
      return json({ error: "Method not allowed" }, 405);
    }

    const project = await getProject(env, path[1]);
    if (!project) return json({ error: "Project not found" }, 404);

    // /api/projects/:slug
    if (path.length === 2 && method === "GET") {
      const { results } = await env.DB.prepare(
        "SELECT code, scope, priority, owner, notes, fit, fit_notes, updated_at FROM items WHERE project_id = ?"
      ).bind(project.id).all();
      const items = {};
      for (const r of results) { const { code, ...rest } = r; items[code] = rest; }
      return json({ project: { slug: project.slug, name: project.name, created_at: project.created_at }, items });
    }

    // /api/projects/:slug/items/:code
    if (path.length === 4 && path[2] === "items" && method === "PUT") {
      const code = path[3];
      if (!CODE_RE.test(code)) return json({ error: "Invalid process code" }, 400);
      const body = await request.json().catch(() => null);
      if (!body || typeof body !== "object") return json({ error: "Invalid body" }, 400);

      const vendor = await isVendor(request, env);
      const allowed = vendor ? [...CLIENT_FIELDS, ...VENDOR_FIELDS] : CLIENT_FIELDS;
      const changes = {};
      for (const [field, raw] of Object.entries(body)) {
        if (!allowed.includes(field)) {
          if (VENDOR_FIELDS.includes(field)) return json({ error: "Fit/gap can only be set by iCatalyst" }, 403);
          continue;
        }
        const value = String(raw ?? "");
        if (ENUMS[field] && !ENUMS[field].includes(value)) return json({ error: `Invalid ${field}` }, 400);
        changes[field] = TEXT_LIMITS[field] ? value.slice(0, TEXT_LIMITS[field]) : value;
      }
      if (!Object.keys(changes).length) return json({ error: "Nothing to update" }, 400);

      const cols = Object.keys(changes);
      await env.DB.prepare(
        `INSERT INTO items (project_id, code, ${cols.join(", ")}, updated_at)
         VALUES (?, ?, ${cols.map(() => "?").join(", ")}, CURRENT_TIMESTAMP)
         ON CONFLICT (project_id, code) DO UPDATE SET
           ${cols.map((c) => `${c} = excluded.${c}`).join(", ")}, updated_at = CURRENT_TIMESTAMP`
      ).bind(project.id, code, ...cols.map((c) => changes[c])).run();

      const row = await env.DB.prepare(
        "SELECT scope, priority, owner, notes, fit, fit_notes, updated_at FROM items WHERE project_id = ? AND code = ?"
      ).bind(project.id, code).first();
      return json({ code, item: row });
    }

    return json({ error: "Not found" }, 404);
  } catch (err) {
    return json({ error: "Server error" }, 500);
  }
}
