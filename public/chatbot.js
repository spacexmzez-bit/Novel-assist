/* chatbot.js */
// Self-contained injection and controller for AI Assistant Drawer
(function () {
  let conversationHistory = [];
  const token = localStorage.getItem("novel_token");
  const params = new URLSearchParams(window.location.search);
  const novelId = params.get("id") || localStorage.getItem("active_novel_id");

  const DRAWER_HTML = `
    <!-- Floating Trigger Button -->
    <button id="aiDrawerOpenBtn" class="chat-trigger-btn" type="button" title="Open Novel Writing Assistant" aria-label="Open Novel Writing Assistant">
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
        <path d="M8 10h.01"></path>
        <path d="M12 10h.01"></path>
        <path d="M16 10h.01"></path>
      </svg>
    </button>

    <!-- Slide-out Chat Drawer -->
    <aside id="aiChatDrawer" class="chat-drawer" aria-label="AI Writing Assistant Drawer">
      <div class="chat-header">
        <div style="display: flex; align-items: center; gap: 0.5rem;">
          <span style="font-size: 1.25rem;">✨</span>
          <div>
            <div style="font-weight: 700; font-size: 0.95rem;">Storytelling Expert</div>
            <div id="aiActiveModelLabel" style="font-size: 0.7rem; color: var(--text-muted);">gemini-3.5-flash-lite</div>
          </div>
        </div>
        <div style="display: flex; align-items: center; gap: 0.5rem;">
          <button id="clearChatHistoryBtn" class="btn btn-secondary btn-sm" type="button" title="Clear Chat History">Clear</button>
          <button id="aiDrawerCloseBtn" class="btn btn-secondary btn-sm" type="button" aria-label="Close Assistant">✕</button>
        </div>
      </div>

      <div id="aiChatMessages" class="chat-messages">
        <!-- Messages appended dynamically -->
      </div>

      <div id="aiOverviewWarning" style="display: none; padding: 0.75rem 1rem; background-color: rgba(245, 158, 11, 0.15); border-top: 1px solid var(--accent-warning); color: var(--accent-warning); font-size: 0.75rem;">
        ⚠️ Context locked: Your novel overview has fewer than 500 words. Update it in the dashboard to enable full assistant context.
      </div>

      <form id="aiChatForm" class="chat-input-area">
        <textarea id="aiChatInput" rows="1" placeholder="Ask about narrative pacing, scene craft, or voice..." style="resize: none;"></textarea>
        <button id="aiChatSendBtn" type="submit" class="btn btn-primary btn-sm">Send</button>
      </form>
    </aside>
  `;

  // Inject Drawer HTML synchronously without runtime network fetch
  function injectDrawerComponent() {
    const root = document.createElement("div");
    root.id = "aiChatbotRoot";
    root.innerHTML = DRAWER_HTML;
    document.body.appendChild(root);

    initChatbotElements();
  }

  function initChatbotElements() {
    const drawer = document.getElementById("aiChatDrawer");
    const openBtn = document.getElementById("aiDrawerOpenBtn");
    const closeBtn = document.getElementById("aiDrawerCloseBtn");
    const chatForm = document.getElementById("aiChatForm");
    const chatInput = document.getElementById("aiChatInput");
    const chatSendBtn = document.getElementById("aiChatSendBtn");
    const chatMessages = document.getElementById("aiChatMessages");
    const clearBtn = document.getElementById("clearChatHistoryBtn");
    const modelLabel = document.getElementById("aiActiveModelLabel");
    const overviewWarning = document.getElementById("aiOverviewWarning");

    // Load persisted local messages for active novel
    const storageKey = `chat_history_${novelId || "global"}`;
    const saved = localStorage.getItem(storageKey);
    if (saved) {
      try {
        conversationHistory = JSON.parse(saved);
        renderMessages();
      } catch (_) {
        conversationHistory = [];
      }
    } else {
      appendGreeting();
    }

    function appendGreeting() {
      conversationHistory = [{
        role: "assistant",
        content: "I am ready. Provide a scene, character dilemma, or narrative question and we will refine your story's execution.",
      }];
      renderMessages();
    }

    function renderMessages() {
      chatMessages.innerHTML = "";
      conversationHistory.forEach((msg) => {
        const bubble = document.createElement("div");
        bubble.className = `chat-bubble ${msg.role}`;
        bubble.textContent = msg.content;
        chatMessages.appendChild(bubble);
      });
      chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    function toggleDrawer(open) {
      if (open) {
        drawer.classList.add("open");
        chatInput.focus();
      } else {
        drawer.classList.remove("open");
      }
    }

    openBtn.addEventListener("click", () => toggleDrawer(true));
    closeBtn.addEventListener("click", () => toggleDrawer(false));

    clearBtn.addEventListener("click", () => {
      conversationHistory = [];
      localStorage.removeItem(storageKey);
      appendGreeting();
    });

    // Auto-expand textarea height
    chatInput.addEventListener("input", () => {
      chatInput.style.height = "auto";
      chatInput.style.height = Math.min(chatInput.scrollHeight, 120) + "px";
    });

    // Keydown submission (Enter to send, Shift+Enter for new line)
    chatInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        chatForm.dispatchEvent(new Event("submit"));
      }
    });

    chatForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const text = chatInput.value.trim();
      if (!text) return;

      if (!token) {
        alert("Please log in to use the writing assistant.");
        return;
      }

      overviewWarning.style.display = "none";
      chatInput.value = "";
      chatInput.style.height = "auto";

      // Append user turn
      conversationHistory.push({ role: "user", content: text });
      renderMessages();

      // Placeholder waiting bubble
      const loadingBubble = document.createElement("div");
      loadingBubble.className = "chat-bubble assistant";
      loadingBubble.textContent = "Analyzing narrative craft...";
      chatMessages.appendChild(loadingBubble);
      chatMessages.scrollTop = chatMessages.scrollHeight;

      chatSendBtn.disabled = true;

      try {
        const data = await ApiClient.post("/api/ai", {
          novelId,
          messages: conversationHistory,
        });

        modelLabel.textContent = data.modelUsed;
        loadingBubble.remove();

        conversationHistory.push({
          role: "assistant",
          content: data.message,
        });

        localStorage.setItem(storageKey, JSON.stringify(conversationHistory));
        renderMessages();
      } catch (err) {
        if (err.requiresOverview) {
          overviewWarning.style.display = "block";
          overviewWarning.textContent = `⚠️ ${err.message}`;
          loadingBubble.remove();
          conversationHistory.pop(); // Remove rejected user prompt
          renderMessages();
          return;
        }

        loadingBubble.className = "chat-bubble assistant";
        loadingBubble.style.backgroundColor = "rgba(239, 68, 68, 0.2)";
        loadingBubble.style.color = "var(--accent-danger)";
        loadingBubble.textContent = `Error: ${err.message}`;
      } finally {
        chatSendBtn.disabled = false;
      }
    });
  }

  // Load component when DOM is ready
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", injectDrawerComponent);
  } else {
    injectDrawerComponent();
  }
})();
