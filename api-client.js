/* File: api-client.js */
const ApiClient = (function () {
  // Replace this with your actual Cloudflare Worker URL
  const WORKER_BASE = "https://novalist.spacexmzez.workers.dev/";

  function getToken() {
    return localStorage.getItem("novel_token");
  }

  function getNovelId() {
    const params = new URLSearchParams(window.location.search);
    return params.get("id") || localStorage.getItem("active_novel_id");
  }

  async function request(endpoint, options = {}) {
    const token = getToken();
    const headers = {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    };

    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }

    const config = {
      ...options,
      headers,
    };

    const targetUrl = endpoint.startsWith("http") ? endpoint : `${WORKER_BASE}${endpoint}`;

    try {
      const response = await fetch(targetUrl, config);

      if (response.status === 401) {
        localStorage.removeItem("novel_token");
        localStorage.removeItem("active_novel_id");
        window.location.href = "./index.html";
        throw new Error("Session expired or unauthorized.");
      }

      const data = await response.json();

      if (!response.ok) {
        const err = new Error(data.error || `Request failed with status ${response.status}`);
        err.requiresOverview = Boolean(data.requiresOverview);
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
    post: (endpoint, body) => request(endpoint, { method: "POST", body: JSON.stringify(body) }),
    put: (endpoint, body) => request(endpoint, { method: "PUT", body: JSON.stringify(body) }),
    delete: (endpoint) => request(endpoint, { method: "DELETE" }),
  };
})();
