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

// Handle GET: List all novels for user, or fetch a single novel's metadata
export async function onRequestGet(context) {
  const { request, env } = context;
  const user = await authenticateSession(request, env);

  if (!user) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  const url = new URL(request.url);
  const novelId = url.searchParams.get("id");

  if (novelId) {
    const novel = await env.NOVEL_STORE.get(`novel:${novelId}`, { type: "json" });
    if (!novel || novel.owner !== user.username) {
      return jsonResponse({ error: "Novel not found or access denied." }, 404);
    }
    return jsonResponse({ novel });
  }

  // Retrieve user's novel registry
  const userNovelsList = await env.NOVEL_STORE.get(`novels:${user.username}`, { type: "json" }) || [];
  return jsonResponse({ novels: userNovelsList });
}

// Handle POST: Create a new novel
export async function onRequestPost(context) {
  const { request, env } = context;
  const user = await authenticateSession(request, env);

  if (!user) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  try {
    const body = await request.json();
    const title = (body.title || "").trim();
    const description = (body.description || "").trim();
    const coverBase64 = body.coverBase64 || null; // Optional data URI / base64 string

    if (!title) {
      return jsonResponse({ error: "Novel title is mandatory." }, 400);
    }

    // Validate cover size (maximum 5MB in binary, ~6.7MB base64 encoded)
    if (coverBase64) {
      const estimatedSizeBytes = (coverBase64.length * 3) / 4;
      if (estimatedSizeBytes > 5 * 1024 * 1024) {
        return jsonResponse({ error: "Book cover exceeds 5MB size limit." }, 400);
      }
    }

    const novelId = "n_" + crypto.randomUUID();
    const now = Date.now();

    const novelRecord = {
      id: novelId,
      owner: user.username,
      title,
      description,
      coverBase64,
      overview: "", // Mandatory 500-word story synopsis for AI access
      createdAt: now,
      updatedAt: now,
    };

    // Save full novel object
    await env.NOVEL_STORE.put(`novel:${novelId}`, JSON.stringify(novelRecord));

    // Initialize blank content lists for novel tools
    await env.NOVEL_STORE.put(`chapters:${novelId}`, JSON.stringify([]));
    await env.NOVEL_STORE.put(`characters:${novelId}`, JSON.stringify([]));
    await env.NOVEL_STORE.put(`timeline:${novelId}`, JSON.stringify([]));

    // Update user's index of novels (lightweight metadata)
    const userNovelsList = await env.NOVEL_STORE.get(`novels:${user.username}`, { type: "json" }) || [];
    userNovelsList.unshift({
      id: novelId,
      title,
      description,
      coverBase64,
      hasOverview: false,
      createdAt: now,
      updatedAt: now,
    });
    await env.NOVEL_STORE.put(`novels:${user.username}`, JSON.stringify(userNovelsList));

    return jsonResponse({
      message: "Novel created successfully",
      novel: novelRecord,
    }, 201);
  } catch (err) {
    return jsonResponse({ error: "Server error", details: err.message }, 500);
  }
}

// Handle PUT: Update novel metadata (title, description, cover, or 500-word overview)
export async function onRequestPut(context) {
  const { request, env } = context;
  const user = await authenticateSession(request, env);

  if (!user) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  try {
    const body = await request.json();
    const novelId = body.id;

    if (!novelId) {
      return jsonResponse({ error: "Novel ID is required." }, 400);
    }

    const novel = await env.NOVEL_STORE.get(`novel:${novelId}`, { type: "json" });
    if (!novel || novel.owner !== user.username) {
      return jsonResponse({ error: "Novel not found or access denied." }, 404);
    }

    if (body.title !== undefined) {
      const trimmedTitle = body.title.trim();
      if (!trimmedTitle) {
        return jsonResponse({ error: "Title cannot be empty." }, 400);
      }
      novel.title = trimmedTitle;
    }

    if (body.description !== undefined) {
      novel.description = body.description.trim();
    }

    if (body.coverBase64 !== undefined) {
      if (body.coverBase64) {
        const estimatedSizeBytes = (body.coverBase64.length * 3) / 4;
        if (estimatedSizeBytes > 5 * 1024 * 1024) {
          return jsonResponse({ error: "Book cover exceeds 5MB size limit." }, 400);
        }
      }
      novel.coverBase64 = body.coverBase64;
    }

    if (body.overview !== undefined) {
      novel.overview = body.overview.trim();
    }

    novel.updatedAt = Date.now();

    // Save updated full record
    await env.NOVEL_STORE.put(`novel:${novelId}`, JSON.stringify(novel));

    // Sync changes to user's novel registry list
    const userNovelsList = await env.NOVEL_STORE.get(`novels:${user.username}`, { type: "json" }) || [];
    const index = userNovelsList.findIndex(n => n.id === novelId);
    if (index !== -1) {
      const overviewWords = novel.overview ? novel.overview.trim().split(/\s+/).filter(Boolean).length : 0;
      userNovelsList[index] = {
        id: novel.id,
        title: novel.title,
        description: novel.description,
        coverBase64: novel.coverBase64,
        hasOverview: overviewWords >= 500,
        createdAt: novel.createdAt,
        updatedAt: novel.updatedAt,
      };
      await env.NOVEL_STORE.put(`novels:${user.username}`, JSON.stringify(userNovelsList));
    }

    return jsonResponse({
      message: "Novel updated successfully",
      novel,
    });
  } catch (err) {
    return jsonResponse({ error: "Server error", details: err.message }, 500);
  }
}

// Handle DELETE: Remove novel and all associated tool data
export async function onRequestDelete(context) {
  const { request, env } = context;
  const user = await authenticateSession(request, env);

  if (!user) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  const url = new URL(request.url);
  const novelId = url.searchParams.get("id");

  if (!novelId) {
    return jsonResponse({ error: "Novel ID is required." }, 400);
  }

  const novel = await env.NOVEL_STORE.get(`novel:${novelId}`, { type: "json" });
  if (!novel || novel.owner !== user.username) {
    return jsonResponse({ error: "Novel not found or access denied." }, 404);
  }

  // Delete all keys tied to the novel
  await env.NOVEL_STORE.delete(`novel:${novelId}`);
  await env.NOVEL_STORE.delete(`chapters:${novelId}`);
  await env.NOVEL_STORE.delete(`characters:${novelId}`);
  await env.NOVEL_STORE.delete(`timeline:${novelId}`);

  // Remove from user index
  let userNovelsList = await env.NOVEL_STORE.get(`novels:${user.username}`, { type: "json" }) || [];
  userNovelsList = userNovelsList.filter(n => n.id !== novelId);
  await env.NOVEL_STORE.put(`novels:${user.username}`, JSON.stringify(userNovelsList));

  return jsonResponse({ message: "Novel deleted successfully" });
}
