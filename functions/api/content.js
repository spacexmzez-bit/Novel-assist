// Helper: JSON response with CORS headers
function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });
}

// Session authentication check
async function authenticateSession(request, env) {
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

// Verify novel ownership
async function verifyNovelOwner(novelId, username, env) {
  const novel = await env.NOVEL_STORE.get(`novel:${novelId}`, { type: "json" });
  if (!novel || novel.owner !== username) {
    return false;
  }
  return true;
}

// Handle OPTIONS preflight
export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });
}

// Handle GET: Fetch chapters, characters, or timeline events for a novel
export async function onRequestGet(context) {
  const { request, env } = context;
  const user = await authenticateSession(request, env);

  if (!user) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  const url = new URL(request.url);
  const novelId = url.searchParams.get("novelId");
  const type = url.searchParams.get("type"); // "chapters", "characters", or "timeline"

  if (!novelId || !["chapters", "characters", "timeline"].includes(type)) {
    return jsonResponse({ error: "Valid novelId and type parameter (chapters, characters, timeline) required." }, 400);
  }

  const isOwner = await verifyNovelOwner(novelId, user.username, env);
  if (!isOwner) {
    return jsonResponse({ error: "Novel not found or access denied." }, 404);
  }

  const data = await env.NOVEL_STORE.get(`${type}:${novelId}`, { type: "json" }) || [];
  return jsonResponse({ type, items: data });
}

// Handle POST: Add new item to chapters, characters, or timeline
export async function onRequestPost(context) {
  const { request, env } = context;
  const user = await authenticateSession(request, env);

  if (!user) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  try {
    const body = await request.json();
    const { novelId, type, item } = body;

    if (!novelId || !["chapters", "characters", "timeline"].includes(type) || !item) {
      return jsonResponse({ error: "Invalid payload. novelId, type, and item are required." }, 400);
    }

    const isOwner = await verifyNovelOwner(novelId, user.username, env);
    if (!isOwner) {
      return jsonResponse({ error: "Novel not found or access denied." }, 404);
    }

    const currentItems = await env.NOVEL_STORE.get(`${type}:${novelId}`, { type: "json" }) || [];
    const now = Date.now();
    const itemId = "item_" + crypto.randomUUID();

    let newItem = { id: itemId, createdAt: now, updatedAt: now };

    if (type === "chapters") {
      newItem.title = (item.title || "Untitled Chapter").trim();
      newItem.content = item.content || "";
      newItem.order = currentItems.length + 1;
    } else if (type === "characters") {
      newItem.name = (item.name || "").trim();
      newItem.mainRole = (item.mainRole || "Supporting").trim();
      newItem.description = (item.description || "").trim();
      newItem.traits = Array.isArray(item.traits) ? item.traits : [];
      newItem.storyAppearance = (item.storyAppearance || "").trim();
      // Extra recommended parameters
      newItem.archetype = (item.archetype || "").trim();
      newItem.motivation = (item.motivation || "").trim();
      newItem.relationships = (item.relationships || "").trim();
      newItem.status = (item.status || "Alive").trim();

      if (!newItem.name) {
        return jsonResponse({ error: "Character name is required." }, 400);
      }
    } else if (type === "timeline") {
      newItem.title = (item.title || "").trim();
      newItem.timePeriod = (item.timePeriod || "").trim();
      newItem.eventLevel = (item.eventLevel || "Main event").trim();
      // Extra recommended parameters
      newItem.povCharacter = (item.povCharacter || "").trim();
      newItem.location = (item.location || "").trim();
      newItem.consequence = (item.consequence || "").trim();
      newItem.positionPercent = typeof item.positionPercent === "number" ? item.positionPercent : 50;

      if (!newItem.title || !newItem.timePeriod) {
        return jsonResponse({ error: "Timeline event title and time/period are required." }, 400);
      }
    }

    currentItems.push(newItem);
    await env.NOVEL_STORE.put(`${type}:${novelId}`, JSON.stringify(currentItems));

    return jsonResponse({ message: "Item added successfully", item: newItem }, 201);
  } catch (err) {
    return jsonResponse({ error: "Server error", details: err.message }, 500);
  }
}

// Handle PUT: Update an existing item or reorder items in bulk
export async function onRequestPut(context) {
  const { request, env } = context;
  const user = await authenticateSession(request, env);

  if (!user) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  try {
    const body = await request.json();
    const { novelId, type, item, items } = body;

    if (!novelId || !["chapters", "characters", "timeline"].includes(type)) {
      return jsonResponse({ error: "novelId and valid type required." }, 400);
    }

    const isOwner = await verifyNovelOwner(novelId, user.username, env);
    if (!isOwner) {
      return jsonResponse({ error: "Novel not found or access denied." }, 404);
    }

    // Bulk replace mode (useful for chapter reordering or timeline recalculations)
    if (Array.isArray(items)) {
      await env.NOVEL_STORE.put(`${type}:${novelId}`, JSON.stringify(items));
      return jsonResponse({ message: "Collection updated successfully", items });
    }

    if (!item || !item.id) {
      return jsonResponse({ error: "Item with valid ID is required for single update." }, 400);
    }

    const currentItems = await env.NOVEL_STORE.get(`${type}:${novelId}`, { type: "json" }) || [];
    const index = currentItems.findIndex(i => i.id === item.id);

    if (index === -1) {
      return jsonResponse({ error: "Item not found in this novel." }, 404);
    }

    const existing = currentItems[index];
    const updated = {
      ...existing,
      ...item,
      id: existing.id,
      updatedAt: Date.now(),
    };

    currentItems[index] = updated;
    await env.NOVEL_STORE.put(`${type}:${novelId}`, JSON.stringify(currentItems));

    return jsonResponse({ message: "Item updated successfully", item: updated });
  } catch (err) {
    return jsonResponse({ error: "Server error", details: err.message }, 500);
  }
}

// Handle DELETE: Delete a specific item from chapters, characters, or timeline
export async function onRequestDelete(context) {
  const { request, env } = context;
  const user = await authenticateSession(request, env);

  if (!user) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  const url = new URL(request.url);
  const novelId = url.searchParams.get("novelId");
  const type = url.searchParams.get("type");
  const itemId = url.searchParams.get("itemId");

  if (!novelId || !["chapters", "characters", "timeline"].includes(type) || !itemId) {
    return jsonResponse({ error: "novelId, type, and itemId are required." }, 400);
  }

  const isOwner = await verifyNovelOwner(novelId, user.username, env);
  if (!isOwner) {
    return jsonResponse({ error: "Novel not found or access denied." }, 404);
  }

  let currentItems = await env.NOVEL_STORE.get(`${type}:${novelId}`, { type: "json" }) || [];
  const initialLength = currentItems.length;
  currentItems = currentItems.filter(i => i.id !== itemId);

  if (currentItems.length === initialLength) {
    return jsonResponse({ error: "Item not found." }, 404);
  }

  await env.NOVEL_STORE.put(`${type}:${novelId}`, JSON.stringify(currentItems));
  return jsonResponse({ message: "Item deleted successfully" });
}
