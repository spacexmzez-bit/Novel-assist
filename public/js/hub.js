// State variables
let activeAuthMode = "login";
let base64CoverData = null;

// DOM Elements
const authSection = document.getElementById("authSection");
const hubSection = document.getElementById("hubSection");
const tabLogin = document.getElementById("tabLogin");
const tabRegister = document.getElementById("tabRegister");
const authForm = document.getElementById("authForm");
const usernameInput = document.getElementById("usernameInput");
const passwordInput = document.getElementById("passwordInput");
const authSubmitBtn = document.getElementById("authSubmitBtn");
const authError = document.getElementById("authError");
const userGreeting = document.getElementById("userGreeting");
const logoutBtn = document.getElementById("logoutBtn");
const novelsGrid = document.getElementById("novelsGrid");
const emptyNovels = document.getElementById("emptyNovels");

// Create Modal DOM
const openCreateModalBtn = document.getElementById("openCreateModalBtn");
const closeCreateModalBtn = document.getElementById("closeCreateModalBtn");
const cancelCreateBtn = document.getElementById("cancelCreateBtn");
const createModal = document.getElementById("createModal");
const createNovelForm = document.getElementById("createNovelForm");
const novelTitleInput = document.getElementById("novelTitleInput");
const novelDescInput = document.getElementById("novelDescInput");
const novelCoverInput = document.getElementById("novelCoverInput");
const coverPreview = document.getElementById("coverPreview");
const createNovelError = document.getElementById("createNovelError");
const saveNovelBtn = document.getElementById("saveNovelBtn");

// Helper: Show authentication error
function showAuthError(message) {
  authError.textContent = message;
  authError.style.display = "block";
}

// Helper: Clear authentication error
function clearAuthError() {
  authError.textContent = "";
  authError.style.display = "none";
}

// Helper: Get token
function getToken() {
  return localStorage.getItem("novel_token");
}

// Helper: Set session
function setSession(token, username) {
  localStorage.setItem("novel_token", token);
  localStorage.setItem("novel_username", username);
}

// Helper: Clear session
function clearSession() {
  localStorage.removeItem("novel_token");
  localStorage.removeItem("novel_username");
  localStorage.removeItem("active_novel_id");
}

// Tab Switching
tabLogin.addEventListener("click", () => {
  activeAuthMode = "login";
  tabLogin.classList.add("active");
  tabRegister.classList.remove("active");
  authSubmitBtn.textContent = "Log In";
  clearAuthError();
});

tabRegister.addEventListener("click", () => {
  activeAuthMode = "register";
  tabRegister.classList.add("active");
  tabLogin.classList.remove("active");
  authSubmitBtn.textContent = "Register";
  clearAuthError();
});

// Authentication submission
authForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  clearAuthError();

  const username = usernameInput.value.trim();
  const password = passwordInput.value;

  if (!username || !password) {
    showAuthError("Please fill out both fields.");
    return;
  }

  authSubmitBtn.disabled = true;
  authSubmitBtn.textContent = "Processing...";

  try {
    const res = await fetch("/api/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: activeAuthMode,
        username,
        password,
      }),
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || "Authentication failed.");
    }

    setSession(data.token, data.username);
    initView();
  } catch (err) {
    showAuthError(err.message);
  } finally {
    authSubmitBtn.disabled = false;
    authSubmitBtn.textContent = activeAuthMode === "login" ? "Log In" : "Register";
  }
});

// Logout handler
logoutBtn.addEventListener("click", async () => {
  const token = getToken();
  if (token) {
    try {
      await fetch("/api/auth", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`,
        },
        body: JSON.stringify({ action: "logout" }),
      });
    } catch (_) {}
  }
  clearSession();
  initView();
});

// Convert uploaded file to base64 with 5MB validation
novelCoverInput.addEventListener("change", () => {
  const file = novelCoverInput.files[0];
  if (!file) {
    base64CoverData = null;
    coverPreview.style.display = "none";
    return;
  }

  // 5MB limit
  if (file.size > 5 * 1024 * 1024) {
    createNovelError.textContent = "Image size exceeds 5MB limit.";
    createNovelError.style.display = "block";
    novelCoverInput.value = "";
    base64CoverData = null;
    coverPreview.style.display = "none";
    return;
  }

  createNovelError.style.display = "none";
  const reader = new FileReader();
  reader.onload = (e) => {
    base64CoverData = e.target.result;
    coverPreview.src = base64CoverData;
    coverPreview.style.display = "block";
  };
  reader.readAsDataURL(file);
});

// Modal triggers
openCreateModalBtn.addEventListener("click", () => {
  createNovelForm.reset();
  base64CoverData = null;
  coverPreview.style.display = "none";
  createNovelError.style.display = "none";
  createModal.classList.add("active");
});

function closeModal() {
  createModal.classList.remove("active");
}
closeCreateModalBtn.addEventListener("click", closeModal);
cancelCreateBtn.addEventListener("click", closeModal);

// Novel creation submission
createNovelForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  createNovelError.style.display = "none";

  const title = novelTitleInput.value.trim();
  const description = novelDescInput.value.trim();

  if (!title) {
    createNovelError.textContent = "Title is mandatory.";
    createNovelError.style.display = "block";
    return;
  }

  saveNovelBtn.disabled = true;
  saveNovelBtn.textContent = "Creating...";

  try {
    const token = getToken();
    const res = await fetch("/api/novels", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`,
      },
      body: JSON.stringify({
        title,
        description,
        coverBase64: base64CoverData,
      }),
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || "Failed to create novel.");
    }

    closeModal();
    loadNovels();
  } catch (err) {
    createNovelError.textContent = err.message;
    createNovelError.style.display = "block";
  } finally {
    saveNovelBtn.disabled = false;
    saveNovelBtn.textContent = "Create Novel";
  }
});

// Fetch and render novels
async function loadNovels() {
  const token = getToken();
  try {
    const res = await fetch("/api/novels", {
      headers: { "Authorization": `Bearer ${token}` },
    });

    if (res.status === 401) {
      clearSession();
      initView();
      return;
    }

    const data = await res.json();
    const novels = data.novels || [];

    novelsGrid.innerHTML = "";
    if (novels.length === 0) {
      emptyNovels.style.display = "block";
      return;
    }

    emptyNovels.style.display = "none";
    novels.forEach((novel) => {
      const card = document.createElement("div");
      card.className = "card novel-card";
      card.onclick = () => {
        localStorage.setItem("active_novel_id", novel.id);
        window.location.href = `/dashboard.html?id=${novel.id}`;
      };

      const coverHtml = novel.coverBase64
        ? `<img class="novel-cover" src="${novel.coverBase64}" alt="${novel.title}">`
        : `<div class="novel-cover-placeholder">No Cover Image</div>`;

      const overviewBadge = novel.hasOverview
        ? `<span class="badge badge-success">AI Ready (500+ words)</span>`
        : `<span class="badge badge-warning">Needs Overview</span>`;

      card.innerHTML = `
        ${coverHtml}
        <h3 class="novel-title">${escapeHtml(novel.title)}</h3>
        <p class="novel-desc">${escapeHtml(novel.description || "No description provided.")}</p>
        <div class="novel-footer">
          <span>${overviewBadge}</span>
          <span>${new Date(novel.updatedAt).toLocaleDateString()}</span>
        </div>
      `;
      novelsGrid.appendChild(card);
    });
  } catch (err) {
    console.error("Error loading novels:", err);
  }
}

// XSS Prevention helper
function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

// View Controller Initialization
async function initView() {
  const token = getToken();
  const username = localStorage.getItem("novel_username");

  if (!token) {
    authSection.style.display = "block";
    hubSection.style.display = "none";
    logoutBtn.style.display = "none";
    userGreeting.textContent = "";
  } else {
    authSection.style.display = "none";
    hubSection.style.display = "block";
    logoutBtn.style.display = "inline-flex";
    userGreeting.textContent = username ? `Signed in as @${username}` : "";
    loadNovels();
  }
}

// Start
document.addEventListener("DOMContentLoaded", initView);
