// UI Interaction, DOM management, and Find Overlay
const EditorUI = (function () {
  const elements = {
    navBackDashboard: document.getElementById("navBackDashboard"),
    chaptersList: document.getElementById("chaptersList"),
    chapterTitleInput: document.getElementById("chapterTitleInput"),
    chapterBody: document.getElementById("chapterBody"),
    saveIndicator: document.getElementById("saveIndicator"),
    statusWordCount: document.getElementById("statusWordCount"),
    statusCharCount: document.getElementById("statusCharCount"),
    statusLastSaved: document.getElementById("statusLastSaved"),
    addChapterBtn: document.getElementById("addChapterBtn"),
    deleteChapterBtn: document.getElementById("deleteChapterBtn"),
    toggleFindBtn: document.getElementById("toggleFindBtn"),
    closeFindBtn: document.getElementById("closeFindBtn"),
    findBar: document.getElementById("findBar"),
    findInput: document.getElementById("findInput"),
    findMatchCount: document.getElementById("findMatchCount"),
    findPrevBtn: document.getElementById("findPrevBtn"),
    findNextBtn: document.getElementById("findNextBtn"),
  };

  let searchMatches = [];
  let currentMatchIndex = -1;

  // Initialize UI navigation
  function initNav(novelId) {
    elements.navBackDashboard.href = `/dashboard.html?id=${novelId}`;
  }

  // Render chapters list in sidebar
  function renderChapters(chapters, activeChapterId, onSelect) {
    elements.chaptersList.innerHTML = "";
    chapters.forEach((ch, idx) => {
      const li = document.createElement("li");
      li.className = `chapter-item ${ch.id === activeChapterId ? "active" : ""}`;
      li.textContent = `${idx + 1}. ${ch.title || "Untitled"}`;
      li.onclick = () => onSelect(ch.id);
      elements.chaptersList.appendChild(li);
    });
  }

  // Update text stats
  function updateStats(text) {
    const trimmed = text.trim();
    const words = trimmed ? trimmed.split(/\s+/).filter(Boolean).length : 0;
    const chars = text.length;

    elements.statusWordCount.textContent = `${words.toLocaleString()} words`;
    elements.statusCharCount.textContent = `${chars.toLocaleString()} characters`;
  }

  // Status indicator updates
  function setSaveStatus(state) {
    if (state === "saving") {
      elements.saveIndicator.textContent = "Saving...";
      elements.saveIndicator.style.color = "var(--accent-warning)";
    } else if (state === "saved") {
      elements.saveIndicator.textContent = "Synced";
      elements.saveIndicator.style.color = "var(--accent-success)";
      elements.statusLastSaved.textContent = `Saved at ${new Date().toLocaleTimeString()}`;
    } else if (state === "error") {
      elements.saveIndicator.textContent = "Sync Error";
      elements.saveIndicator.style.color = "var(--accent-danger)";
    }
  }

  // Find tool handlers
  function toggleFind(show) {
    const isVisible = elements.findBar.classList.contains("active");
    const targetState = show !== undefined ? show : !isVisible;

    if (targetState) {
      elements.findBar.classList.add("active");
      elements.findInput.focus();
      elements.findInput.select();
      performSearch();
    } else {
      elements.findBar.classList.remove("active");
      searchMatches = [];
      currentMatchIndex = -1;
      elements.findMatchCount.textContent = "0/0";
    }
  }

  function performSearch() {
    const term = elements.findInput.value;
    const content = elements.chapterBody.value;
    searchMatches = [];
    currentMatchIndex = -1;

    if (!term || !content) {
      elements.findMatchCount.textContent = "0/0";
      return;
    }

    let pos = 0;
    const lowerContent = content.toLowerCase();
    const lowerTerm = term.toLowerCase();

    while ((pos = lowerContent.indexOf(lowerTerm, pos)) !== -1) {
      searchMatches.push(pos);
      pos += lowerTerm.length;
    }

    if (searchMatches.length > 0) {
      currentMatchIndex = 0;
      jumpToMatch();
    } else {
      elements.findMatchCount.textContent = "0/0";
    }
  }

  function jumpToMatch() {
    if (searchMatches.length === 0 || currentMatchIndex < 0) return;

    elements.findMatchCount.textContent = `${currentMatchIndex + 1}/${searchMatches.length}`;
    const startPos = searchMatches[currentMatchIndex];
    const endPos = startPos + elements.findInput.value.length;

    elements.chapterBody.focus();
    elements.chapterBody.setSelectionRange(startPos, endPos);
  }

  // Keyboard shortcut Ctrl+F / Cmd+F inside editor
  window.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "f") {
      e.preventDefault();
      toggleFind(true);
    }
    if (e.key === "Escape" && elements.findBar.classList.contains("active")) {
      toggleFind(false);
    }
  });

  // UI Event Bindings
  elements.toggleFindBtn.addEventListener("click", () => toggleFind());
  elements.closeFindBtn.addEventListener("click", () => toggleFind(false));
  elements.findInput.addEventListener("input", performSearch);
  elements.findNextBtn.addEventListener("click", () => {
    if (searchMatches.length > 0) {
      currentMatchIndex = (currentMatchIndex + 1) % searchMatches.length;
      jumpToMatch();
    }
  });
  elements.findPrevBtn.addEventListener("click", () => {
    if (searchMatches.length > 0) {
      currentMatchIndex = (currentMatchIndex - 1 + searchMatches.length) % searchMatches.length;
      jumpToMatch();
    }
  });

  return {
    elements,
    initNav,
    renderChapters,
    updateStats,
    setSaveStatus,
    toggleFind,
  };
})();
