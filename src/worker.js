
const corsHeaders = {
  "Content-Type": "application/json",
  "Cache-Control": "no-store"
};

function json(data, status = 200, extra = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, ...extra }
  });
}

function base64url(bytes) {
  let binary = "";
  for (const byte of new Uint8Array(bytes)) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function decodeBase64url(value) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(normalized + "=".repeat((4 - normalized.length % 4) % 4));
  return Uint8Array.from(binary, c => c.charCodeAt(0));
}

async function sha256(value) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value)
  );
  return [...new Uint8Array(digest)]
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
}

async function hmac(message, secret) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );

  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(message)
  );

  return new Uint8Array(signature);
}

function getCookie(request, name) {
  const cookie = request.headers.get("Cookie") || "";
  const item = cookie.split(";").map(v => v.trim())
    .find(v => v.startsWith(name + "="));
  return item ? item.slice(name.length + 1) : "";
}

async function createSession(secret) {
  const expires = Math.floor(Date.now() / 1000) + 8 * 60 * 60;
  const signature = await hmac(String(expires), secret);
  return `${expires}.${base64url(signature)}`;
}

async function verifySession(request, secret) {
  const value = getCookie(request, "mr_admin");
  const parts = value.split(".");
  if (parts.length !== 2 || !/^\d+$/.test(parts[0])) return false;

  const expires = Number(parts[0]);
  if (!Number.isSafeInteger(expires) || expires <= Date.now() / 1000) {
    return false;
  }

  try {
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"]
    );

    return await crypto.subtle.verify(
      "HMAC",
      key,
      decodeBase64url(parts[1]),
      new TextEncoder().encode(String(expires))
    );
  } catch {
    return false;
  }
}

function supabaseHeaders(env, extra = {}) {
  return {
    "apikey": env.SUPABASE_SECRET_KEY,
    "Authorization": `Bearer ${env.SUPABASE_SECRET_KEY}`,
    "Content-Type": "application/json",
    ...extra
  };
}

async function dbRequest(env, path, options = {}) {
  const base = env.SUPABASE_URL.replace(/\/+$/, "");
  const response = await fetch(`${base}/rest/v1/${path}`, {
    ...options,
    headers: supabaseHeaders(env, options.headers || {})
  });

  if (!response.ok) {
    const detail = await response.text();
    console.error("Supabase error:", response.status, detail);
    throw new Error("Database request failed");
  }

  if (response.status === 204) return null;
  return response.json();
}

async function readBody(request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

function randomKey() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return "mr_live_" + base64url(bytes);
}

function validLabel(value) {
  return typeof value === "string" &&
    value.trim().length > 0 &&
    value.trim().length <= 80;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    if (!env.SUPABASE_URL || !env.SUPABASE_SECRET_KEY ||
        !env.ADMIN_PASSWORD || !env.SESSION_SECRET) {
      return json({ error: "Server configuration incomplete" }, 500);
    }

    if (method === "GET" && path === "/") {
      return json({
        status: "online",
        service: "MetaRoot API",
        platform: "Cloudflare Workers",
        version: "1.0"
      });
    }

    if (method === "POST" && path === "/api/admin-login") {
      const body = await readBody(request);
      if (!body || typeof body.password !== "string") {
        return json({ error: "Invalid request" }, 400);
      }

      if (body.password !== env.ADMIN_PASSWORD) {
        return json({ error: "Invalid credentials" }, 401);
      }

      const session = await createSession(env.SESSION_SECRET);

      return json({ success: true, message: "Admin login successful" }, 200, {
        "Set-Cookie": `mr_admin=${session}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=28800`
      });
    }

    if (method === "POST" && path === "/api/validate-key") {
      const body = await readBody(request);
      const key = body?.key ||
        (request.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");

      if (typeof key !== "string" || key.length < 12 || key.length > 200) {
        return json({ valid: false }, 400);
      }

      const hash = await sha256(key);
      const params = new URLSearchParams({
        select: "label,expires_at",
        key_hash: `eq.${hash}`,
        is_active: "eq.true",
        limit: "1"
      });

      const rows = await dbRequest(env, `api_keys?${params}`);
      if (!rows || rows.length === 0) {
        return json({ valid: false });
      }

      const record = rows[0];
      if (record.expires_at &&
          new Date(record.expires_at).getTime() <= Date.now()) {
        return json({ valid: false });
      }

      return json({
        valid: true,
        label: record.label || null
      });
    }

    const adminRoutes = [
      "/api/create-key",
      "/api/list-keys",
      "/api/revoke-key"
    ];

    if (adminRoutes.includes(path)) {
      if (!await verifySession(request, env.SESSION_SECRET)) {
        return json({ error: "Unauthorized" }, 401);
      }
    }

    if (method === "POST" && path === "/api/create-key") {
      const body = await readBody(request);

      if (!body || !validLabel(body.label)) {
        return json({ error: "Label must be 1-80 characters" }, 400);
      }

      let expiresAt = null;
      if (body.expires_at !== undefined && body.expires_at !== null &&
          body.expires_at !== "") {
        const date = new Date(body.expires_at);
        if (Number.isNaN(date.getTime()) || date.getTime() <= Date.now()) {
          return json({ error: "Invalid expiration date" }, 400);
        }
        expiresAt = date.toISOString();
      }

      const key = randomKey();
      const hash = await sha256(key);

      await dbRequest(env, "api_keys", {
        method: "POST",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({
          key_hash: hash,
          label: body.label.trim(),
          is_active: true,
          expires_at: expiresAt
        })
      });

      return json({
        success: true,
        key,
        message: "Save this key now. It will not be shown again."
      }, 201);
    }

    if (method === "GET" && path === "/api/list-keys") {
      const params = new URLSearchParams({
        select: "id,label,is_active,expires_at,created_at",
        order: "created_at.desc"
      });

      const rows = await dbRequest(env, `api_keys?${params}`);
      return json({ success: true, keys: rows });
    }

    if (method === "POST" && path === "/api/revoke-key") {
      const body = await readBody(request);

      if (!body || typeof body.id !== "string" ||
          !/^[0-9a-f-]{36}$/i.test(body.id)) {
        return json({ error: "Invalid key ID" }, 400);
      }

      const params = new URLSearchParams({ id: `eq.${body.id}` });

      await dbRequest(env, `api_keys?${params}`, {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({ is_active: false })
      });

      return json({ success: true, message: "API key revoked" });
    }

    return json({ error: "Not found" }, 404);
  }
};
