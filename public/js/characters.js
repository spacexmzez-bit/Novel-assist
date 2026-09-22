// State and elements for Character Tool
(function () {
  const novelId = ApiClient.getNovelId();
  if (!novelId) {
    window.location.href = "/index.html";
    return;
  }

  // DOM Elements
  const navBackDashboard = document.getElementById("navBackDashboard");
  const charactersGrid = document.getElementById("charactersGrid");
  const emptyCharacters = document.getElementById("emptyCharacters");
  const openCharModalBtn = document.getElementById("openCharModalBtn");
  const closeCharModalBtn = document.getElementById("closeCharModalBtn");
  const cancelCharModalBtn = document.getElementById("cancelCharModalBtn");
  const charModal = document.getElementById("charModal");
  const charModalTitle = document.getElementById("charModalTitle");
  const charForm = document.getElementById("charForm");
  const charIdInput = document.getElementById("charIdInput");
  const charNameInput = document.getElementById("charNameInput");
  const charRoleInput = document.getElementById("charRoleInput");
  const charStatusInput = document.getElementById("charStatusInput");
  const charDescInput = document.getElementById("charDescInput");
  const charArchetypeInput = document.getElementById("charArchetypeInput");
  const charAppearanceInput = document.getElementById("charAppearanceInput");
  const charMotivationInput = document.getElementById("charMotivationInput");
  const charRelationshipsInput = document.getElementById("charRelationshipsInput");
  const charTraitsInput = document.getElementById("charTraitsInput");
  const charFormError = document.getElementById("charFormError");
  const saveCharBtn = document.getElementById("saveCharBtn");
  const charSearchInput = document.getElementById("charSearchInput");
  const roleFilterSelect = document.getElementById("roleFilterSelect");

  navBackDashboard.href = `/dashboard.html?id=${novelId}`;

  let charactersList = [];

  // Helper: Escape HTML strings
  function escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text || "";
    return div.innerHTML;
  }

  // Load characters from KV
  async function loadCharacters() {
    try {
      const data = await ApiClient.get(`/api/content?novelId=${novelId}&type=characters`);
      charactersList = data.items || [];
      renderCharacters();
    } catch (err) {
      alert("Failed to load characters: " + err.message);
    }
  }

  // Filter and render character cards
  function renderCharacters() {
    const searchTerm = charSearchInput.value.toLowerCase().trim();
    const filterRole = roleFilterSelect.value;

    const filtered = charactersList.filter((c) => {
      const matchRole = filterRole === "ALL" || c.mainRole === filterRole;
      const matchSearch =
        !searchTerm ||
        c.name.toLowerCase().includes(searchTerm) ||
        (c.traits && c.traits.some((t) => t.toLowerCase().includes(searchTerm))) ||
        (c.archetype && c.archetype.toLowerCase().includes(searchTerm));
      return matchRole && matchSearch;
    });

    charactersGrid.innerHTML = "";

    if (filtered.length === 0) {
      emptyCharacters.style.display = "block";
      return;
    }

    emptyCharacters.style.display = "none";

    filtered.forEach((char) => {
      const card = document.createElement("div");
      card.className = "card character-card";

      const traitsBadges = (char.traits || [])
        .map((t) => `<span class="trait-chip">${escapeHtml(t)}</span>`)
        .join("");

      card.innerHTML = `
        <div>
          <div style="display: flex; justify-content: space-between; align-items: flex-start;">
            <div>
              <div class="char-name">${escapeHtml(char.name)}</div>
              <div class="char-role">${escapeHtml(char.mainRole)}</div>
            </div>
            <span class="badge ${char.status === "Alive" ? "badge-success" : "badge-warning"}">${escapeHtml(char.status || "Alive")}</span>
          </div>

          <p class="char-desc">${escapeHtml(char.description)}</p>

          ${char.archetype ? `
            <div class="char-detail-row">
              <span class="char-detail-label">Archetype:</span>
              <span>${escapeHtml(char.archetype)}</span>
            </div>` : ""}

          ${char.motivation ? `
            <div class="char-detail-row">
              <span class="char-detail-label">Motivation:</span>
              <span>${escapeHtml(char.motivation)}</span>
            </div>` : ""}

          ${char.storyAppearance ? `
            <div class="char-detail-row">
              <span class="char-detail-label">Appearance:</span>
              <span>${escapeHtml(char.storyAppearance)}</span>
            </div>` : ""}

          ${char.relationships ? `
            <div class="char-detail-row">
              <span class="char-detail-label">Ties:</span>
              <span>${escapeHtml(char.relationships)}</span>
            </div>` : ""}

          ${traitsBadges ? `<div class="char-traits-wrap">${traitsBadges}</div>` : ""}
        </div>

        <div class="char-card-actions">
          <button class="btn btn-secondary btn-sm edit-btn" data-id="${char.id}">Edit</button>
          <button class="btn btn-danger btn-sm delete-btn" data-id="${char.id}">Delete</button>
        </div>
      `;

      card.querySelector(".edit-btn").onclick = () => openEditModal(char);
      card.querySelector(".delete-btn").onclick = () => deleteCharacter(char.id);

      charactersGrid.appendChild(card);
    });
  }

  // Modal actions
  function openCreateModal() {
    charForm.reset();
    charIdInput.value = "";
    charModalTitle.textContent = "Add Character";
    charFormError.style.display = "none";
    charModal.classList.add("active");
  }

  function openEditModal(char) {
    charIdInput.value = char.id;
    charNameInput.value = char.name || "";
    charRoleInput.value = char.mainRole || "Supporting";
    charStatusInput.value = char.status || "Alive";
    charDescInput.value = char.description || "";
    charArchetypeInput.value = char.archetype || "";
    charAppearanceInput.value = char.storyAppearance || "";
    charMotivationInput.value = char.motivation || "";
    charRelationshipsInput.value = char.relationships || "";
    charTraitsInput.value = (char.traits || []).join(", ");
    charModalTitle.textContent = "Edit Character";
    charFormError.style.display = "none";
    charModal.classList.add("active");
  }

  function closeModal() {
    charModal.classList.remove("active");
  }

  openCharModalBtn.addEventListener("click", openCreateModal);
  closeCharModalBtn.addEventListener("click", closeModal);
  cancelCharModalBtn.addEventListener("click", closeModal);

  // Form Submission (Add or Update)
  charForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    charFormError.style.display = "none";

    const name = charNameInput.value.trim();
    const description = charDescInput.value.trim();

    if (!name || !description) {
      charFormError.textContent = "Name and description are required.";
      charFormError.style.display = "block";
      return;
    }

    const traits = charTraitsInput.value
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);

    const charPayload = {
      name,
      mainRole: charRoleInput.value,
      status: charStatusInput.value,
      description,
      archetype: charArchetypeInput.value.trim(),
      storyAppearance: charAppearanceInput.value.trim(),
      motivation: charMotivationInput.value.trim(),
      relationships: charRelationshipsInput.value.trim(),
      traits,
    };

    saveCharBtn.disabled = true;
    saveCharBtn.textContent = "Saving...";

    try {
      const isEditing = Boolean(charIdInput.value);

      if (isEditing) {
        charPayload.id = charIdInput.value;
        await ApiClient.put("/api/content", {
          novelId,
          type: "characters",
          item: charPayload,
        });

        const index = charactersList.findIndex((c) => c.id === charPayload.id);
        if (index !== -1) charactersList[index] = { ...charactersList[index], ...charPayload };
      } else {
        const res = await ApiClient.post("/api/content", {
          novelId,
          type: "characters",
          item: charPayload,
        });
        charactersList.push(res.item);
      }

      closeModal();
      renderCharacters();
    } catch (err) {
      charFormError.textContent = err.message;
      charFormError.style.display = "block";
    } finally {
      saveCharBtn.disabled = false;
      saveCharBtn.textContent = "Save Profile";
    }
  });

  // Delete character
  async function deleteCharacter(charId) {
    const confirmed = confirm("Are you sure you want to remove this character from the roster?");
    if (!confirmed) return;

    try {
      await ApiClient.delete(`/api/content?novelId=${novelId}&type=characters&itemId=${charId}`);
      charactersList = charactersList.filter((c) => c.id !== charId);
      renderCharacters();
    } catch (err) {
      alert("Failed to delete character: " + err.message);
    }
  }

  // Filter Listeners
  charSearchInput.addEventListener("input", renderCharacters);
  roleFilterSelect.addEventListener("change", renderCharacters);

  document.addEventListener("DOMContentLoaded", loadCharacters);
})();
