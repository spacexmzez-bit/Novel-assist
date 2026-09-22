// Self-contained injection and controller for AI Assistant Drawer
(function () {
  let conversationHistory = [];
  const token = localStorage.getItem("novel_token");
  const params = new URLSearchParams(window.location.search);
  const novelId = params.get("id") || localStorage.getItem("active_novel_id");

  // Load Drawer HTML Component
  async function loadDrawerComponent() {
    try {
      const res = await fetch("/components/chat-drawer.html");
      const html = await res.text();
      const div = document.createElement("div");
      div.id = "aiChatbotRoot";
      div.innerHTML = html;
      document.body.appendChild(div);

      initChatbotElements();
    } catch (err) {
      console.error("Failed to load AI Chatbot component:", err);
    }
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
        const res = await fetch("/api/ai", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${token}`,
          },
          body: JSON.stringify({
            novelId,
            messages: conversationHistory,
          }),
        });

        const data = await res.json();

        if (res.status === 403 && data.requiresOverview) {
          overviewWarning.style.display = "block";
          overviewWarning.textContent = `⚠️ ${data.error}`;
          loadingBubble.remove();
          conversationHistory.pop(); // Remove rejected user prompt
          renderMessages();
          return;
        }

        if (!res.ok) {
          throw new Error(data.error || "Failed to reach AI assistant.");
        }

        modelLabel.textContent = data.modelUsed;
        loadingBubble.remove();

        conversationHistory.push({
          role: "assistant",
          content: data.message,
        });

        localStorage.setItem(storageKey, JSON.stringify(conversationHistory));
        renderMessages();
      } catch (err) {
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
    document.addEventListener("DOMContentLoaded", loadDrawerComponent);
  } else {
    loadDrawerComponent();
  }
})();
