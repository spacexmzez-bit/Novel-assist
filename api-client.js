/* File: api-client.js */
const ApiClient = (function () {
  // Cloudflare Worker Base URL
  const WORKER_BASE = "https://novalista-worker.spacexmzez-bit.workers.dev";

  function getToken() {
    return localStorage.getItem("novel_token");
  }

  function getNovelId() {
    const params = new URLSearchParams(window.location.search);
    return params.get("id") || localStorage.getItem("active_novel_id");
  }

  function buildUrl(endpoint) {
    if (endpoint.startsWith("http://") || endpoint.startsWith("https://")) {
      return endpoint;
    }
    // Normalize slashes to prevent "devapi" or double slashes "dev//api"
    const base = WORKER_BASE.replace(/\/+$/, "");
    const path = endpoint.replace(/^\/+/, "");
    return `${base}/${path}`;
  }

  async function parseResponseBody(response) {
    // 204 No Content or zero Content-Length headers have no body
    if (response.status === 204 || response.headers.get("content-length") === "0") {
      return null;
    }

    const contentType = response.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      try {
        return await response.json();
      } catch (_) {
        return null;
      }
    }

    // Fallback for non-JSON or plain text responses
    try {
      const text = await response.text();
      return text ? { message: text } : null;
    } catch (_) {
      return null;
    }
  }

  async function request(endpoint, options = {}) {
    const token = getToken();
    const headers = {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    };

    // Avoid sending stale Bearer tokens to authentication endpoints
    const isAuthRoute = endpoint.includes("/api/auth");
    if (token && !isAuthRoute) {
      headers["Authorization"] = `Bearer ${token}`;
    }

    const config = {
      ...options,
      headers,
    };

    const targetUrl = buildUrl(endpoint);

    try {
      const response = await fetch(targetUrl, config);
      const data = await parseResponseBody(response);

      if (response.status === 401) {
        // Prevent redirect loops on login/landing pages and auth endpoints
        const currentPath = window.location.pathname;
        const isIndexPage =
          currentPath.endsWith("index.html") ||
          currentPath === "/" ||
          currentPath === "";

        if (!isAuthRoute && !isIndexPage) {
          localStorage.removeItem("novel_token");
          localStorage.removeItem("active_novel_id");
          window.location.href = "./index.html";
        }

        const errorMsg =
          (data && data.error) || "Invalid credentials or unauthorized.";
        throw new Error(errorMsg);
      }

      if (!response.ok) {
        const errorMsg =
          (data && data.error) || `Request failed with status ${response.status}`;
        const err = new Error(errorMsg);
        err.requiresOverview = Boolean(data && data.requiresOverview);
        err.status = response.status;
        err.data = data;
        throw err;
      }

      return data;
    } catch (err) {
      console.error(`API Error [${endpoint}]:`, err.message);
      throw err;
    }
  }

  return {
    baseUrl: WORKER_BASE,
    getToken,
    getNovelId,
    get: (endpoint) => request(endpoint, { method: "GET" }),
    post: (endpoint, body) =>
      request(endpoint, {
        method: "POST",
        body: body !== undefined ? JSON.stringify(body) : undefined,
      }),
    put: (endpoint, body) =>
      request(endpoint, {
        method: "PUT",
        body: body !== undefined ? JSON.stringify(body) : undefined,
      }),
    delete: (endpoint) => request(endpoint, { method: "DELETE" }),
  };
})();
