// Query parameters & auth check
const params = new URLSearchParams(window.location.search);
const novelId = params.get("id") || localStorage.getItem("active_novel_id");
const token = localStorage.getItem("novel_token");

if (!token) {
  window.location.href = "/index.html";
}

if (!novelId) {
  window.location.href = "/index.html";
}

// Persist active novel ID
localStorage.setItem("active_novel_id", novelId);

// DOM Elements
const navNovelTitle = document.getElementById("navNovelTitle");
const novelTitle = document.getElementById("novelTitle");
const novelDescription = document.getElementById("novelDescription");
const coverWrapper = document.getElementById("coverWrapper");
const bodyLink = document.getElementById("bodyLink");
const charactersLink = document.getElementById("charactersLink");
const timelineLink = document.getElementById("timelineLink");
const overviewInput = document.getElementById("overviewInput");
const overviewCounter = document.getElementById("overviewCounter");
const overviewSaveStatus = document.getElementById("overviewSaveStatus");
const saveOverviewBtn = document.getElementById("saveOverviewBtn");
const deleteNovelBtn = document.getElementById("deleteNovelBtn");

// BYOK Modal Elements
const openKeySettingsBtn = document.getElementById("openKeySettingsBtn");
const closeKeyModalBtn = document.getElementById("closeKeyModalBtn");
const cancelKeyModalBtn = document.getElementById("cancelKeyModalBtn");
const keyModal = document.getElementById("keyModal");
const apiKeyInput = document.getElementById("apiKeyInput");
const saveApiKeyBtn = document.getElementById("saveApiKeyBtn");
const keyStatusMessage = document.getElementById("keyStatusMessage");

// Set tool links
bodyLink.href = `/editor.html?id=${novelId}`;
charactersLink.href = `/characters.html?id=${novelId}`;
timelineLink.href = `/timeline.html?id=${novelId}`;

// Helper: Calculate word count
function getWordCount(text) {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

// Update word counter UI
function updateCounterUI() {
  const count = getWordCount(overviewInput.value);
  if (count >= 500) {
    overviewCounter.textContent = `${count} / 500 words (AI Unlocked)`;
    overviewCounter.className = "word-counter-badge valid";
  } else {
    overviewCounter.textContent = `${count} / 500 words (Minimum 500 required for AI)`;
    overviewCounter.className = "word-counter-badge invalid";
  }
}

// Fetch novel details
async function fetchNovel() {
  try {
    const res = await fetch(`/api/novels?id=${novelId}`, {
      headers: { "Authorization": `Bearer ${token}` }
    });

    if (res.status === 401) {
      localStorage.removeItem("novel_token");
      window.location.href = "/index.html";
      return;
    }

    const data = await res.json();
    if (!res.ok || !data.novel) {
      alert("Novel not found.");
      window.location.href = "/index.html";
      return;
    }

    const novel = data.novel;
    navNovelTitle.textContent = novel.title;
    novelTitle.textContent = novel.title;
    novelDescription.textContent = novel.description || "No description provided.";
    overviewInput.value = novel.overview || "";

    if (novel.coverBase64) {
      coverWrapper.innerHTML = `<img class="novel-dashboard-cover" src="${novel.coverBase64}" alt="${novel.title}">`;
    } else {
      coverWrapper.innerHTML = `<div class="novel-dashboard-placeholder">No Cover Image</div>`;
    }

    updateCounterUI();
  } catch (err) {
    console.error("Error fetching novel:", err);
  }
}

// Save overview
overviewInput.addEventListener("input", updateCounterUI);

saveOverviewBtn.addEventListener("click", async () => {
  saveOverviewBtn.disabled = true;
  saveOverviewBtn.textContent = "Saving...";
  overviewSaveStatus.textContent = "";

  try {
    const res = await fetch("/api/novels", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`,
      },
      body: JSON.stringify({
        id: novelId,
        overview: overviewInput.value,
      }),
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || "Failed to update overview.");
    }

    overviewSaveStatus.textContent = "Saved successfully!";
    overviewSaveStatus.style.color = "var(--accent-success)";
    updateCounterUI();
  } catch (err) {
    overviewSaveStatus.textContent = err.message;
    overviewSaveStatus.style.color = "var(--accent-danger)";
  } finally {
    saveOverviewBtn.disabled = false;
    saveOverviewBtn.textContent = "Save Overview";
  }
});

// Delete Novel
deleteNovelBtn.addEventListener("click", async () => {
  const confirmed = confirm("Are you sure you want to delete this novel? This will permanently delete its chapters, characters, and timeline data.");
  if (!confirmed) return;

  try {
    const res = await fetch(`/api/novels?id=${novelId}`, {
      method: "DELETE",
      headers: { "Authorization": `Bearer ${token}` }
    });

    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || "Failed to delete novel.");
    }

    localStorage.removeItem("active_novel_id");
    window.location.href = "/index.html";
  } catch (err) {
    alert("Error: " + err.message);
  }
});

// Key Settings Modal Controls
openKeySettingsBtn.addEventListener("click", () => {
  apiKeyInput.value = "";
  keyStatusMessage.style.display = "none";
  keyModal.classList.add("active");
});

function closeKeyModal() {
  keyModal.classList.remove("active");
}
closeKeyModalBtn.addEventListener("click", closeKeyModal);
cancelKeyModalBtn.addEventListener("click", closeKeyModal);

// Save Gemini BYOK Key
saveApiKeyBtn.addEventListener("click", async () => {
  const key = apiKeyInput.value.trim();
  if (!key) {
    keyStatusMessage.textContent = "Please input a valid key.";
    keyStatusMessage.style.color = "var(--accent-danger)";
    keyStatusMessage.style.display = "block";
    return;
  }

  saveApiKeyBtn.disabled = true;
  saveApiKeyBtn.textContent = "Saving...";

  try {
    const res = await fetch("/api/auth", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
      },
      body: JSON.stringify({
        action: "save_api_key",
        apiKey: key,
      }),
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || "Failed to save API key.");
    }

    keyStatusMessage.textContent = "API key synced successfully!";
    keyStatusMessage.style.color = "var(--accent-success)";
    keyStatusMessage.style.display = "block";

    setTimeout(() => {
      closeKeyModal();
    }, 1200);
  } catch (err) {
    keyStatusMessage.textContent = err.message;
    keyStatusMessage.style.color = "var(--accent-danger)";
    keyStatusMessage.style.display = "block";
  } finally {
    saveApiKeyBtn.disabled = false;
    saveApiKeyBtn.textContent = "Save Key";
  }
});

// Initialize
document.addEventListener("DOMContentLoaded", fetchNovel);
