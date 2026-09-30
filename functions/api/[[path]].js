// Scoping API for client projects (Cloudflare Pages Function, D1 bound as env.DB).
//
//   GET    /api/projects                        list client projects + master          (iCatalyst key)
//   POST   /api/projects {name, prefix, copyFrom?}
//                                               create a project from the master library,
//                                               or from another project when copyFrom is set (iCatalyst key)
//   PATCH  /api/projects/:slug {prefix}         set a project's client initials          (iCatalyst key)
//   GET    /api/projects/:slug                  project + decisions + custom nodes (anyone with the link)
//   PUT    /api/projects/:slug/items/:code      save one item's decision fields
//   POST   /api/projects/:slug/nodes {level, parent, title, description?, products?}
//                                               add a custom process (3) or scenario (4)
//   PUT    /api/projects/:slug/nodes/:code      edit a custom node
//   DELETE /api/projects/:slug/nodes/:code      remove a custom node and its decisions
//
// Clients may set scope/priority/owner/notes and manage the nodes they added. fit/fit_notes,
// nodes that came from the master library, and anything in the master itself need the
// iCatalyst key, sent as X-Vendor-Key and compared with the VENDOR_KEY secret.

const ENUMS = {
  scope:    ["", "in", "later", "out"],
  priority: ["", "must", "should", "could", "wont"],
  fit:      ["", "standard", "config", "extension", "isv", "gap"],
};
const TEXT_LIMITS = { owner: 120, notes: 4000, fit_notes: 4000 };
const CLIENT_FIELDS = ["scope", "priority", "owner", "notes"];
const VENDOR_FIELDS = ["fit", "fit_notes"];
// Segments 3 and 4 may carry a custom prefix: "i" for the master library, client initials otherwise.
const SEG = "(?:\\d{3}|[A-Za-z]{1,4}\\d{3})";
const CODE_RE = new RegExp(`^\\d{2}\\.\\d{2}\\.${SEG}\\.${SEG}(\\.\\d{3}){0,2}$`);
const SLUG_RE = /^[a-z0-9-]{6,64}$/;
const PREFIX_RE = /^[A-Z]{2,4}$/;
const MASTER_PREFIX = "i";

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
  return env.DB.prepare("SELECT id, slug, name, prefix, is_master, created_at FROM projects WHERE slug = ?").bind(slug).first();
}

async function readBody(request) {
  const body = await request.json().catch(() => null);
  return body && typeof body === "object" ? body : null;
}

function cleanNodeFields(body) {
  const out = {};
  if ("title" in body) out.title = String(body.title ?? "").trim().slice(0, 200);
  if ("description" in body) out.description = String(body.description ?? "").trim().slice(0, 8000);
  if ("products" in body) out.products = String(body.products ?? "").split(";").map((s) => s.trim()).filter(Boolean).slice(0, 12).join("; ").slice(0, 400);
  return out;
}

// Next free custom code under a parent: processes step by 10 in the area, scenarios by 10 in the process.
async function nextNodeCode(env, projectId, level, parent, prefix) {
  const s = parent.split(".");
  const stem = level === 3 ? `${s[0]}.${s[1]}.${prefix}` : `${s[0]}.${s[1]}.${s[2]}.${prefix}`;
  const { results } = await env.DB.prepare("SELECT code FROM nodes WHERE project_id = ? AND code LIKE ?")
    .bind(projectId, `${stem}%`).all();
  let max = 0;
  for (const { code } of results) {
    const seg = code.split(".")[level === 3 ? 2 : 3];
    if (seg.startsWith(prefix)) max = Math.max(max, parseInt(seg.slice(prefix.length), 10) || 0);
  }
  const num = String(max + 10).padStart(3, "0");
  if (num.length > 3) return null;
  return level === 3 ? `${stem}${num}.000` : `${stem}${num}`;
}

export async function onRequest({ request, env, params }) {
  const path = params.path || [];
  const method = request.method;

  try {
    if (path[0] !== "projects") return json({ error: "Not found" }, 404);
    const vendor = await isVendor(request, env);

    // /api/projects
    if (path.length === 1) {
      if (!vendor) return json({ error: "iCatalyst key required" }, 401);
      if (method === "GET") {
        const { results } = await env.DB.prepare(
          `SELECT p.slug, p.name, p.prefix, p.is_master, p.created_at,
                  (SELECT COUNT(*) FROM items i WHERE i.project_id = p.id) AS decisions,
                  (SELECT COUNT(*) FROM nodes n WHERE n.project_id = p.id) AS custom_nodes,
                  (SELECT MAX(updated_at) FROM items i WHERE i.project_id = p.id) AS last_updated
             FROM projects p ORDER BY p.is_master DESC, p.created_at DESC`
        ).all();
        return json({ projects: results });
      }
      if (method === "POST") {
        const body = (await readBody(request)) || {};
        const name = String(body.name || "").trim().slice(0, 100);
        const prefix = String(body.prefix || "").trim().toUpperCase();
        if (!name) return json({ error: "Client name is required" }, 400);
        if (!PREFIX_RE.test(prefix)) return json({ error: "Client initials must be 2–4 letters" }, 400);
        if (await env.DB.prepare("SELECT 1 FROM projects WHERE prefix = ?").bind(prefix).first())
          return json({ error: `Initials ${prefix} are already used by another client` }, 409);

        // New projects start from a snapshot of the master library unless copying another project.
        const source = body.copyFrom
          ? await getProject(env, String(body.copyFrom))
          : await env.DB.prepare("SELECT id, slug, name, prefix, is_master FROM projects WHERE is_master = 1").first();
        if (body.copyFrom && !source) return json({ error: "Project to copy not found" }, 404);

        const slug = makeSlug(name);
        const created = await env.DB.prepare("INSERT INTO projects (slug, name, prefix) VALUES (?, ?, ?) RETURNING id")
          .bind(slug, name, prefix).first();
        if (source) {
          await env.DB.batch([
            env.DB.prepare(
              `INSERT INTO items (project_id, code, scope, priority, owner, notes, fit, fit_notes, updated_at)
               SELECT ?, code, scope, priority, owner, notes, fit, fit_notes, CURRENT_TIMESTAMP FROM items WHERE project_id = ?`
            ).bind(created.id, source.id),
            // Master nodes stay "master"; a copied client's own nodes keep that client's codes but become
            // the new client's additions.
            env.DB.prepare(
              `INSERT INTO nodes (project_id, code, level, parent_code, title, description, products, source)
               SELECT ?, code, level, parent_code, title, description, products, source FROM nodes WHERE project_id = ?`
            ).bind(created.id, source.id),
          ]);
        }
        return json({ project: { slug, name, prefix } }, 201);
      }
      return json({ error: "Method not allowed" }, 405);
    }

    const project = await getProject(env, path[1]);
    if (!project) return json({ error: "Project not found" }, 404);
    // The master library is iCatalyst-only, for reading as well as writing.
    if (project.is_master && !vendor) return json({ error: "iCatalyst key required" }, 401);

    // /api/projects/:slug
    if (path.length === 2) {
      if (method === "GET") {
        const [items, nodes] = await Promise.all([
          env.DB.prepare("SELECT code, scope, priority, owner, notes, fit, fit_notes, updated_at FROM items WHERE project_id = ?")
            .bind(project.id).all(),
          env.DB.prepare("SELECT code, level, parent_code, title, description, products, source FROM nodes WHERE project_id = ? ORDER BY code")
            .bind(project.id).all(),
        ]);
        const byCode = {};
        for (const r of items.results) { const { code, ...rest } = r; byCode[code] = rest; }
        return json({
          project: { slug: project.slug, name: project.name, prefix: project.prefix, is_master: !!project.is_master, created_at: project.created_at },
          items: byCode,
          nodes: nodes.results,
        });
      }
      if (method === "PATCH") {
        if (!vendor) return json({ error: "iCatalyst key required" }, 401);
        if (project.is_master) return json({ error: "The master library prefix is fixed" }, 400);
        const body = (await readBody(request)) || {};
        const prefix = String(body.prefix || "").trim().toUpperCase();
        if (!PREFIX_RE.test(prefix)) return json({ error: "Client initials must be 2–4 letters" }, 400);
        if (project.prefix) return json({ error: "Initials are already set; they are part of this client's process codes" }, 409);
        if (await env.DB.prepare("SELECT 1 FROM projects WHERE prefix = ?").bind(prefix).first())
          return json({ error: `Initials ${prefix} are already used by another client` }, 409);
        await env.DB.prepare("UPDATE projects SET prefix = ? WHERE id = ?").bind(prefix, project.id).run();
        return json({ project: { slug: project.slug, prefix } });
      }
      return json({ error: "Method not allowed" }, 405);
    }

    // /api/projects/:slug/items/:code
    if (path.length === 4 && path[2] === "items" && method === "PUT") {
      const code = path[3];
      if (!CODE_RE.test(code)) return json({ error: "Invalid process code" }, 400);
      const body = await readBody(request);
      if (!body) return json({ error: "Invalid body" }, 400);

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

    // /api/projects/:slug/nodes
    if (path[2] === "nodes") {
      const source = project.is_master ? "master" : "client";
      const prefix = project.is_master ? MASTER_PREFIX : project.prefix;

      if (path.length === 3 && method === "POST") {
        if (!prefix) return json({ error: "Set this client's initials before adding processes" }, 409);
        const body = await readBody(request);
        if (!body) return json({ error: "Invalid body" }, 400);
        const level = Number(body.level);
        const parent = String(body.parent || "");
        if (level !== 3 && level !== 4) return json({ error: "Only processes and scenarios can be added" }, 400);
        if (!CODE_RE.test(parent)) return json({ error: "Invalid parent code" }, 400);
        const ps = parent.split(".");
        const parentOk = level === 3 ? ps[2] === "000" && ps[3] === "000" && ps[1] !== "00" : ps.length === 4 && ps[3] === "000" && ps[2] !== "000";
        if (!parentOk) return json({ error: level === 3 ? "A process must be added to a process area" : "A scenario must be added to a process" }, 400);
        const fields = cleanNodeFields(body);
        if (!fields.title) return json({ error: "Title is required" }, 400);

        const code = await nextNodeCode(env, project.id, level, parent, prefix);
        if (!code) return json({ error: "No more codes available under this parent" }, 409);
        await env.DB.prepare(
          `INSERT INTO nodes (project_id, code, level, parent_code, title, description, products, source)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
        ).bind(project.id, code, level, parent, fields.title, fields.description || "", fields.products || "", source).run();
        return json({ node: { code, level, parent_code: parent, title: fields.title, description: fields.description || "", products: fields.products || "", source } }, 201);
      }

      if (path.length === 4 && (method === "PUT" || method === "DELETE")) {
        const code = path[3];
        if (!CODE_RE.test(code)) return json({ error: "Invalid process code" }, 400);
        const node = await env.DB.prepare("SELECT code, level, parent_code, title, description, products, source FROM nodes WHERE project_id = ? AND code = ?")
          .bind(project.id, code).first();
        if (!node) return json({ error: "Custom process not found" }, 404);
        if (node.source === "master" && !vendor) return json({ error: "Processes from the iCatalyst library can only be changed by iCatalyst" }, 403);

        if (method === "PUT") {
          const body = await readBody(request);
          if (!body) return json({ error: "Invalid body" }, 400);
          const fields = cleanNodeFields(body);
          if ("title" in fields && !fields.title) return json({ error: "Title is required" }, 400);
          const cols = Object.keys(fields);
          if (!cols.length) return json({ error: "Nothing to update" }, 400);
          await env.DB.prepare(
            `UPDATE nodes SET ${cols.map((c) => `${c} = ?`).join(", ")}, updated_at = CURRENT_TIMESTAMP WHERE project_id = ? AND code = ?`
          ).bind(...cols.map((c) => fields[c]), project.id, code).run();
          return json({ node: { ...node, ...fields } });
        }

        const child = await env.DB.prepare("SELECT 1 FROM nodes WHERE project_id = ? AND parent_code = ?").bind(project.id, code).first();
        if (child) return json({ error: "Remove this process's custom scenarios first" }, 409);
        await env.DB.batch([
          env.DB.prepare("DELETE FROM nodes WHERE project_id = ? AND code = ?").bind(project.id, code),
          env.DB.prepare("DELETE FROM items WHERE project_id = ? AND code = ?").bind(project.id, code),
        ]);
        return json({ deleted: code });
      }
    }

    return json({ error: "Not found" }, 404);
  } catch (err) {
    return json({ error: "Server error" }, 500);
  }
}
