/* File: src/index.js */
const PRIMARY_MODEL = "gemini-2.5-flash-lite";
const FALLBACK_MODEL = "gemini-2.0-flash-lite";
const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

function generateToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map(b => b.toString(16).padStart(2, "0")).join("");
}

async function authenticate(request, env) {
  const authHeader = request.headers.get("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) return null;
  const token = authHeader.replace("Bearer ", "").trim();
  const sessionData = await env.NOVEL_STORE.get(`session:${token}`, { type: "json" });
  if (!sessionData || Date.now() > sessionData.expiresAt) return null;
  return { token, username: sessionData.username };
}

async function callGemini(model, apiKey, systemInstruction, contents, responseSchema = null) {
  const url = `${GEMINI_API_BASE}/${model}:generateContent?key=${apiKey}`;
  const payload = {
    contents,
    generationConfig: { temperature: 0.8, topP: 0.95, maxOutputTokens: 2500 },
  };
  if (systemInstruction) {
    payload.systemInstruction = { parts: [{ text: systemInstruction }] };
  }
  if (responseSchema) {
    payload.generationConfig.responseMimeType = "application/json";
  }

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const errorText = await res.text();
    const error = new Error(errorText);
    error.status = res.status;
    throw error;
  }

  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("No response generated.");
  return text;
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, "");

    try {
      // --- PUBLIC AUTH ROUTES (Login & Register) ---
      if (path === "/api/auth" && request.method === "POST") {
        const body = await request.json();
        const { action, username, passwordHash, apiKey } = body;

        if (action === "register" || action === "login") {
          if (!username || !passwordHash) {
            return jsonResponse({ error: "Username and password are required." }, 400);
          }

          const cleanUsername = username.toLowerCase().trim();
          const userKey = `user:${cleanUsername}`;
          const existing = await env.NOVEL_STORE.get(userKey, { type: "json" });

          if (action === "register") {
            if (existing) return jsonResponse({ error: "Username already taken." }, 409);
            const user = { username: cleanUsername, passwordHash, geminiApiKey: null };
            await env.NOVEL_STORE.put(userKey, JSON.stringify(user));
          } else {
            if (!existing || existing.passwordHash !== passwordHash) {
              return jsonResponse({ error: "Invalid credentials." }, 401);
            }
          }

          const token = generateToken();
          const expiresAt = Date.now() + 30 * 24 * 60 * 60 * 1000;
          await env.NOVEL_STORE.put(`session:${token}`, JSON.stringify({ username: cleanUsername, expiresAt }));
          return jsonResponse({ token, username: cleanUsername });
        }

        const user = await authenticate(request, env);
        if (!user) return jsonResponse({ error: "Unauthorized" }, 401);

        if (action === "save_api_key") {
          const userData = await env.NOVEL_STORE.get(`user:${user.username}`, { type: "json" });
          userData.geminiApiKey = (apiKey || "").trim() || null;
          await env.NOVEL_STORE.put(`user:${user.username}`, JSON.stringify(userData));
          return jsonResponse({ message: "Key synced successfully" });
        }

        return jsonResponse({ error: "Invalid action." }, 400);
      }

      // --- PROTECTED ROUTES GUARD ---
      const user = await authenticate(request, env);
      if (!user) return jsonResponse({ error: "Unauthorized" }, 401);

      // --- NOVELS ROUTES ---
      if (path === "/api/novels") {
        const novelId = url.searchParams.get("id");

        if (request.method === "GET") {
          if (novelId) {
            const novel = await env.NOVEL_STORE.get(`novel:${novelId}`, { type: "json" });
            if (!novel || novel.owner !== user.username) return jsonResponse({ error: "Not found" }, 404);
            return jsonResponse({ novel });
          }
          const list = (await env.NOVEL_STORE.get(`novels:${user.username}`, { type: "json" })) || [];
          return jsonResponse({ novels: list });
        }

        if (request.method === "POST") {
          const { title, description, coverBase64, overview, characters } = await request.json();
          if (!title) return jsonResponse({ error: "Title is required" }, 400);

          const id = "n_" + crypto.randomUUID();
          const now = Date.now();
          const initialOverview = overview || "";
          const novel = {
            id,
            owner: user.username,
            title,
            description: description || "",
            coverBase64: coverBase64 || null,
            overview: initialOverview,
            createdAt: now,
            updatedAt: now,
          };

          await env.NOVEL_STORE.put(`novel:${id}`, JSON.stringify(novel));
          await env.NOVEL_STORE.put(`chapters:${id}`, JSON.stringify([]));

          const seededCharacters = Array.isArray(characters)
            ? characters.map(c => ({
                id: "item_" + crypto.randomUUID(),
                name: c.name || "Unnamed",
                role: c.role || "Supporting",
                notes: c.notes || "",
                createdAt: now,
              }))
            : [];
          await env.NOVEL_STORE.put(`characters:${id}`, JSON.stringify(seededCharacters));
          await env.NOVEL_STORE.put(`timeline:${id}`, JSON.stringify([]));

          const list = (await env.NOVEL_STORE.get(`novels:${user.username}`, { type: "json" })) || [];
          const words = initialOverview.trim().split(/\s+/).filter(Boolean).length;
          list.unshift({
            id,
            title,
            description: novel.description,
            coverBase64: novel.coverBase64,
            hasOverview: words >= 500,
            updatedAt: now,
          });
          await env.NOVEL_STORE.put(`novels:${user.username}`, JSON.stringify(list));

          return jsonResponse({ novel }, 201);
        }

        if (request.method === "PUT") {
          const body = await request.json();
          const novel = await env.NOVEL_STORE.get(`novel:${body.id}`, { type: "json" });
          if (!novel || novel.owner !== user.username) return jsonResponse({ error: "Not found" }, 404);

          if (body.title !== undefined) novel.title = body.title;
          if (body.description !== undefined) novel.description = body.description;
          if (body.coverBase64 !== undefined) novel.coverBase64 = body.coverBase64;
          if (body.overview !== undefined) novel.overview = body.overview;
          novel.updatedAt = Date.now();

          await env.NOVEL_STORE.put(`novel:${body.id}`, JSON.stringify(novel));

          const list = (await env.NOVEL_STORE.get(`novels:${user.username}`, { type: "json" })) || [];
          const idx = list.findIndex(n => n.id === body.id);
          if (idx !== -1) {
            const words = novel.overview ? novel.overview.trim().split(/\s+/).filter(Boolean).length : 0;
            list[idx] = {
              id: novel.id,
              title: novel.title,
              description: novel.description,
              coverBase64: novel.coverBase64,
              hasOverview: words >= 500,
              updatedAt: novel.updatedAt,
            };
            await env.NOVEL_STORE.put(`novels:${user.username}`, JSON.stringify(list));
          }
          return jsonResponse({ novel });
        }

        if (request.method === "DELETE") {
          if (!novelId) return jsonResponse({ error: "ID required" }, 400);
          await env.NOVEL_STORE.delete(`novel:${novelId}`);
          await env.NOVEL_STORE.delete(`chapters:${novelId}`);
          await env.NOVEL_STORE.delete(`characters:${novelId}`);
          await env.NOVEL_STORE.delete(`timeline:${novelId}`);

          let list = (await env.NOVEL_STORE.get(`novels:${user.username}`, { type: "json" })) || [];
          list = list.filter(n => n.id !== novelId);
          await env.NOVEL_STORE.put(`novels:${user.username}`, JSON.stringify(list));
          return jsonResponse({ message: "Deleted" });
        }
      }

      // --- NOVEL IMPORT ENDPOINT ---
      if (path === "/api/novels/import" && request.method === "POST") {
        const payload = await request.json();
        const { novel, chapters, characters, timeline } = payload;

        if (!novel || !novel.title) {
          return jsonResponse({ error: "Invalid backup package: Missing novel details." }, 400);
        }

        const newId = "n_" + crypto.randomUUID();
        const now = Date.now();
        const words = (novel.overview || "").trim().split(/\s+/).filter(Boolean).length;

        const importedNovel = {
          id: newId,
          owner: user.username,
          title: novel.title,
          description: novel.description || "",
          coverBase64: novel.coverBase64 || null,
          overview: novel.overview || "",
          createdAt: now,
          updatedAt: now,
        };

        await env.NOVEL_STORE.put(`novel:${newId}`, JSON.stringify(importedNovel));
        await env.NOVEL_STORE.put(`chapters:${newId}`, JSON.stringify(Array.isArray(chapters) ? chapters : []));
        await env.NOVEL_STORE.put(`characters:${newId}`, JSON.stringify(Array.isArray(characters) ? characters : []));
        await env.NOVEL_STORE.put(`timeline:${newId}`, JSON.stringify(Array.isArray(timeline) ? timeline : []));

        const list = (await env.NOVEL_STORE.get(`novels:${user.username}`, { type: "json" })) || [];
        list.unshift({
          id: newId,
          title: importedNovel.title,
          description: importedNovel.description,
          coverBase64: importedNovel.coverBase64,
          hasOverview: words >= 500,
          updatedAt: now,
        });
        await env.NOVEL_STORE.put(`novels:${user.username}`, JSON.stringify(list));

        return jsonResponse({ novel: importedNovel }, 201);
      }

      // --- CONTENT ROUTES (Chapters, Characters, Timeline) ---
      if (path === "/api/content") {
        const novelId = url.searchParams.get("novelId");
        const type = url.searchParams.get("type");

        if (request.method === "GET") {
          const items = (await env.NOVEL_STORE.get(`${type}:${novelId}`, { type: "json" })) || [];
          return jsonResponse({ items });
        }

        if (request.method === "POST") {
          const { item } = await request.json();
          const items = (await env.NOVEL_STORE.get(`${type}:${novelId}`, { type: "json" })) || [];
          const newItem = { ...item, id: "item_" + crypto.randomUUID(), createdAt: Date.now() };
          items.push(newItem);
          await env.NOVEL_STORE.put(`${type}:${novelId}`, JSON.stringify(items));
          return jsonResponse({ item: newItem }, 201);
        }

        if (request.method === "PUT") {
          const { item } = await request.json();
          const items = (await env.NOVEL_STORE.get(`${type}:${novelId}`, { type: "json" })) || [];
          const idx = items.findIndex(i => i.id === item.id);
          if (idx !== -1) {
            items[idx] = { ...items[idx], ...item, updatedAt: Date.now() };
            await env.NOVEL_STORE.put(`${type}:${novelId}`, JSON.stringify(items));
          }
          return jsonResponse({ item: items[idx] });
        }

        if (request.method === "DELETE") {
          const itemId = url.searchParams.get("itemId");
          let items = (await env.NOVEL_STORE.get(`${type}:${novelId}`, { type: "json" })) || [];
          items = items.filter(i => i.id !== itemId);
          await env.NOVEL_STORE.put(`${type}:${novelId}`, JSON.stringify(items));
          return jsonResponse({ message: "Deleted" });
        }
      }

      // --- AI STORY PITCH GENERATOR ENDPOINT ---
      if (path === "/api/ai/pitch" && request.method === "POST") {
        const { genre, length, depth, customInstruction } = await request.json();
        const userData = await env.NOVEL_STORE.get(`user:${user.username}`, { type: "json" });
        const apiKey = userData?.geminiApiKey;

        if (!apiKey) {
          return jsonResponse({ error: "No Gemini API key synced. Set it in the Dashboard." }, 400);
        }

        const systemPrompt = `You are a creative story consultant. Generate a compelling, original novel pitch.
Return strictly valid JSON conforming to this structure:
{
  "title": "Novel Title",
  "logline": "A crisp one-sentence hook (max 30 words).",
  "overview": "A detailed 3-paragraph synopsis covering setup, conflict, and climax (approx 250-350 words).",
  "characters": [
    { "name": "Character Name", "role": "Protagonist/Antagonist/Supporting", "notes": "Key personality trait and motivation." },
    { "name": "Character Name", "role": "Protagonist/Antagonist/Supporting", "notes": "Key personality trait and motivation." }
  ]
}
Output only the JSON object. Do not include markdown code block formatting or extra commentary.`;

        const userPrompt = `Parameters:
- Genre: ${genre || "Random / Hybrid"}
- Target Length: ${length || "Full-Length Novel"}
- Narrative Depth: ${depth || "Balanced"}
- Custom Instructions: ${customInstruction || "None. Surprise me with an imaginative, distinct concept."}`;

        const formatted = [{ role: "user", parts: [{ text: userPrompt }] }];

        let rawResponse = "";
        try {
          rawResponse = await callGemini(PRIMARY_MODEL, apiKey, systemPrompt, formatted, true);
        } catch (err) {
          const isExhausted = err.status === 405 || (err.message && err.message.includes("405")) || (err.message && err.message.toLowerCase().includes("resource exhausted"));
          if (isExhausted) {
            rawResponse = await callGemini(FALLBACK_MODEL, apiKey, systemPrompt, formatted, true);
          } else {
            throw err;
          }
        }

        let pitch;
        try {
          const cleaned = rawResponse.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
          pitch = JSON.parse(cleaned);
        } catch (parseErr) {
          return jsonResponse({ error: "Failed to parse pitch JSON from AI model.", raw: rawResponse }, 502);
        }

        return jsonResponse({ pitch });
      }

      // --- AI ASSISTANT PROXY ---
      if (path === "/api/ai" && request.method === "POST") {
        const { novelId, messages } = await request.json();
        const userData = await env.NOVEL_STORE.get(`user:${user.username}`, { type: "json" });
        const apiKey = userData?.geminiApiKey;

        if (!apiKey) return jsonResponse({ error: "No Gemini API key synced. Set it in Dashboard." }, 400);

        let overview = "";
        let novelTitle = "";
        if (novelId) {
          const novel = await env.NOVEL_STORE.get(`novel:${novelId}`, { type: "json" });
          if (novel) {
            overview = novel.overview || "";
            novelTitle = novel.title || "";
          }
        }

        const words = overview.trim().split(/\s+/).filter(Boolean).length;
        if (words < 500) {
          return jsonResponse({
            error: `Overview has ${words} words. 500 words required for AI access.`,
            requiresOverview: true,
          }, 403);
        }

        const systemPrompt = `You are a master fiction editor and story writing consultant.
Context:
- Title: "${novelTitle}"
- Synopsis:
${overview}

Rules:
- Strictly assist with storytelling, dialogue, character arcs, and scene pacing.
- No pleasantries or fluff. Be direct and constructive.`;

        const formatted = messages.map(m => ({
          role: m.role === "assistant" ? "model" : "user",
          parts: [{ text: m.content }],
        }));

        let message = "";
        let modelUsed = PRIMARY_MODEL;

        try {
          message = await callGemini(PRIMARY_MODEL, apiKey, systemPrompt, formatted);
        } catch (err) {
          const isExhausted = err.status === 405 || (err.message && err.message.includes("405")) || (err.message && err.message.toLowerCase().includes("resource exhausted"));

          if (isExhausted) {
            modelUsed = FALLBACK_MODEL;
            message = await callGemini(FALLBACK_MODEL, apiKey, systemPrompt, formatted);
          } else {
            throw err;
          }
        }

        return jsonResponse({ message, modelUsed });
      }

      return jsonResponse({ error: "Endpoint not found" }, 404);
    } catch (err) {
      return jsonResponse({ error: err.message }, 500);
    }
  },
};
