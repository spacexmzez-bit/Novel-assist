// PBKDF2 Hashing Parameters
const PBKDF2_ITERATIONS = 100000;
const HASH_ALGO = "SHA-256";

// Helper: Convert ArrayBuffer to Hex string
function bufToHex(buffer) {
  return Array.from(new Uint8Array(buffer))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
}

// Helper: Convert Hex string to ArrayBuffer
function hexToBuf(hexString) {
  const bytes = new Uint8Array(Math.ceil(hexString.length / 2));
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hexString.substr(i * 2, 2), 16);
  }
  return bytes.buffer;
}

// Helper: Hash password using PBKDF2
async function hashPassword(password, saltHex = null) {
  let saltBytes;
  if (saltHex) {
    saltBytes = new Uint8Array(hexToBuf(saltHex));
  } else {
    saltBytes = new Uint8Array(16);
    crypto.getRandomValues(saltBytes);
  }

  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    enc.encode(password),
    { name: "PBKDF2" },
    false,
    ["deriveBits", "deriveKey"]
  );

  const key = await crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: saltBytes,
      iterations: PBKDF2_ITERATIONS,
      hash: HASH_ALGO,
    },
    keyMaterial,
    { name: "HMAC", hash: HASH_ALGO, length: 256 },
    true,
    ["sign"]
  );

  const exported = await crypto.subtle.exportKey("raw", key);
  return {
    salt: bufToHex(saltBytes),
    hash: bufToHex(exported),
  };
}

// Helper: Generate secure session token
function generateToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return bufToHex(bytes);
}

// Helper: JSON response
function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });
}

// Helper: Authenticate session token from Authorization header
export async function authenticateSession(request, env) {
  const authHeader = request.headers.get("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return null;
  }
  const token = authHeader.replace("Bearer ", "").trim();
  const sessionData = await env.NOVEL_STORE.get(`session:${token}`, { type: "json" });

  if (!sessionData) {
    return null;
  }

  if (Date.now() > sessionData.expiresAt) {
    await env.NOVEL_STORE.delete(`session:${token}`);
    return null;
  }

  return { token, username: sessionData.username };
}

// Handle OPTIONS preflight
export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });
}

// Handle GET: Verify session / Get current user profile
export async function onRequestGet(context) {
  const { request, env } = context;
  const user = await authenticateSession(request, env);

  if (!user) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  const profile = await env.NOVEL_STORE.get(`user:${user.username}`, { type: "json" });
  if (!profile) {
    return jsonResponse({ error: "User not found" }, 404);
  }

  return jsonResponse({
    username: profile.username,
    hasApiKey: Boolean(profile.geminiApiKey),
    createdAt: profile.createdAt,
  });
}

// Handle POST: Register, Login, Logout, and API Key sync
export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    const body = await request.json();
    const action = body.action;

    // Action 1: Register
    if (action === "register") {
      const username = (body.username || "").trim().toLowerCase();
      const password = body.password || "";

      if (!username || username.length < 3) {
        return jsonResponse({ error: "Username must be at least 3 characters." }, 400);
      }
      if (!password || password.length < 6) {
        return jsonResponse({ error: "Password must be at least 6 characters." }, 400);
      }

      const existingUser = await env.NOVEL_STORE.get(`user:${username}`);
      if (existingUser) {
        return jsonResponse({ error: "Username already taken." }, 409);
      }

      const { salt, hash } = await hashPassword(password);
      const newUser = {
        username,
        salt,
        hash,
        geminiApiKey: null,
        createdAt: Date.now(),
      };

      await env.NOVEL_STORE.put(`user:${username}`, JSON.stringify(newUser));

      // Auto-login upon registration
      const token = generateToken();
      const expiresAt = Date.now() + 30 * 24 * 60 * 60 * 1000; // 30 days
      await env.NOVEL_STORE.put(
        `session:${token}`,
        JSON.stringify({ username, expiresAt })
      );

      return jsonResponse({
        message: "Registration successful",
        token,
        username,
      });
    }

    // Action 2: Login
    if (action === "login") {
      const username = (body.username || "").trim().toLowerCase();
      const password = body.password || "";

      if (!username || !password) {
        return jsonResponse({ error: "Username and password required." }, 400);
      }

      const userData = await env.NOVEL_STORE.get(`user:${username}`, { type: "json" });
      if (!userData) {
        return jsonResponse({ error: "Invalid username or password." }, 401);
      }

      const { hash } = await hashPassword(password, userData.salt);
      if (hash !== userData.hash) {
        return jsonResponse({ error: "Invalid username or password." }, 401);
      }

      const token = generateToken();
      const expiresAt = Date.now() + 30 * 24 * 60 * 60 * 1000; // 30 days
      await env.NOVEL_STORE.put(
        `session:${token}`,
        JSON.stringify({ username, expiresAt })
      );

      return jsonResponse({
        message: "Login successful",
        token,
        username,
        hasApiKey: Boolean(userData.geminiApiKey),
      });
    }

    // Action 3: Logout
    if (action === "logout") {
      const user = await authenticateSession(request, env);
      if (user) {
        await env.NOVEL_STORE.delete(`session:${user.token}`);
      }
      return jsonResponse({ message: "Logged out successfully" });
    }

    // Action 4: Sync BYOK Gemini API Key
    if (action === "save_api_key") {
      const user = await authenticateSession(request, env);
      if (!user) {
        return jsonResponse({ error: "Unauthorized" }, 401);
      }

      const apiKey = (body.apiKey || "").trim();
      const userData = await env.NOVEL_STORE.get(`user:${user.username}`, { type: "json" });

      if (!userData) {
        return jsonResponse({ error: "User not found" }, 404);
      }

      userData.geminiApiKey = apiKey || null;
      await env.NOVEL_STORE.put(`user:${user.username}`, JSON.stringify(userData));

      return jsonResponse({
        message: "API key updated successfully",
        hasApiKey: Boolean(userData.geminiApiKey),
      });
    }

    return jsonResponse({ error: "Invalid action" }, 400);
  } catch (err) {
    return jsonResponse({ error: "Server error", details: err.message }, 500);
  }
}
