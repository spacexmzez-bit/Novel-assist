// State and visual rendering for Timeline Tool
(function () {
  const novelId = ApiClient.getNovelId();
  if (!novelId) {
    window.location.href = "/index.html";
    return;
  }

  // DOM Elements
  const navBackDashboard = document.getElementById("navBackDashboard");
  const timelineEventsContainer = document.getElementById("timelineEventsContainer");
  const timelineZoomRange = document.getElementById("timelineZoomRange");
  const openAddEventBtn = document.getElementById("openAddEventBtn");
  const eventModal = document.getElementById("eventModal");
  const eventModalTitle = document.getElementById("eventModalTitle");
  const closeEventModalBtn = document.getElementById("closeEventModalBtn");
  const cancelEventModalBtn = document.getElementById("cancelEventModalBtn");
  const deleteEventBtn = document.getElementById("deleteEventBtn");
  const eventForm = document.getElementById("eventForm");
  const eventIdInput = document.getElementById("eventIdInput");
  const eventTitleInput = document.getElementById("eventTitleInput");
  const eventTimePeriodInput = document.getElementById("eventTimePeriodInput");
  const eventLevelInput = document.getElementById("eventLevelInput");
  const eventPovInput = document.getElementById("eventPovInput");
  const eventLocationInput = document.getElementById("eventLocationInput");
  const eventConsequenceInput = document.getElementById("eventConsequenceInput");
  const eventPosRange = document.getElementById("eventPosRange");
  const eventPosLabel = document.getElementById("eventPosLabel");
  const eventFormError = document.getElementById("eventFormError");
  const saveEventBtn = document.getElementById("saveEventBtn");

  navBackDashboard.href = `/dashboard.html?id=${novelId}`;

  let timelineEvents = [];

  // Helper: Escape HTML strings
  function escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text || "";
    return div.innerHTML;
  }

  // Handle Dynamic Track Canvas Width Zoom
  timelineZoomRange.addEventListener("input", (e) => {
    timelineEventsContainer.style.minWidth = `${e.target.value}px`;
  });

  // Slider label sync
  eventPosRange.addEventListener("input", (e) => {
    eventPosLabel.textContent = `${e.target.value}%`;
  });

  // Load events from KV
  async function loadEvents() {
    try {
      const data = await ApiClient.get(`/api/content?novelId=${novelId}&type=timeline`);
      timelineEvents = data.items || [];
      renderTimeline();
    } catch (err) {
      alert("Failed to load timeline events: " + err.message);
    }
  }

  // Render nodes along timeline track
  function renderTimeline() {
    // Retain central track line
    timelineEventsContainer.innerHTML = '<div class="timeline-track-line"></div>';

    // Sort chronologically by position percent
    timelineEvents.sort((a, b) => (a.positionPercent || 50) - (b.positionPercent || 50));

    timelineEvents.forEach((ev, idx) => {
      const isTop = idx % 2 === 0;
      const node = document.createElement("div");
      node.className = `timeline-node ${isTop ? "top" : "bottom"}`;
      node.style.left = `${ev.positionPercent || 50}%`;

      let levelClass = "level-main";
      if (ev.eventLevel === "Side event") levelClass = "level-side";
      if (ev.eventLevel === "Filler") levelClass = "level-filler";

      node.innerHTML = `
        <div class="node-card">
          <div class="node-card-title">${escapeHtml(ev.title)}</div>
          <div class="node-card-period">${escapeHtml(ev.timePeriod)}</div>
          <span class="level-badge ${levelClass}">${escapeHtml(ev.eventLevel || "Main event")}</span>
          ${ev.povCharacter ? `<div style="font-size: 0.7rem; color: var(--text-muted); margin-top: 0.25rem;">POV: ${escapeHtml(ev.povCharacter)}</div>` : ""}
        </div>
        <div class="timeline-pin"></div>
      `;

      node.onclick = () => openEditModal(ev);
      timelineEventsContainer.appendChild(node);
    });
  }

  // Modal open/close controls
  function openAddModal() {
    eventForm.reset();
    eventIdInput.value = "";
    eventPosRange.value = 50;
    eventPosLabel.textContent = "50%";
    eventModalTitle.textContent = "Add Timeline Event";
    deleteEventBtn.style.display = "none";
    eventFormError.style.display = "none";
    eventModal.classList.add("active");
  }

  function openEditModal(ev) {
    eventIdInput.value = ev.id;
    eventTitleInput.value = ev.title || "";
    eventTimePeriodInput.value = ev.timePeriod || "";
    eventLevelInput.value = ev.eventLevel || "Main event";
    eventPovInput.value = ev.povCharacter || "";
    eventLocationInput.value = ev.location || "";
    eventConsequenceInput.value = ev.consequence || "";
    eventPosRange.value = ev.positionPercent || 50;
    eventPosLabel.textContent = `${ev.positionPercent || 50}%`;

    eventModalTitle.textContent = "Edit Timeline Event";
    deleteEventBtn.style.display = "inline-block";
    eventFormError.style.display = "none";
    eventModal.classList.add("active");
  }

  function closeModal() {
    eventModal.classList.remove("active");
  }

  openAddEventBtn.addEventListener("click", openAddModal);
  closeEventModalBtn.addEventListener("click", closeModal);
  cancelEventModalBtn.addEventListener("click", closeModal);

  // Form submission (Add / Update)
  eventForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    eventFormError.style.display = "none";

    const title = eventTitleInput.value.trim();
    const timePeriod = eventTimePeriodInput.value.trim();

    if (!title || !timePeriod) {
      eventFormError.textContent = "Title and Time/Period are mandatory.";
      eventFormError.style.display = "block";
      return;
    }

    const eventPayload = {
      title,
      timePeriod,
      eventLevel: eventLevelInput.value,
      povCharacter: eventPovInput.value.trim(),
      location: eventLocationInput.value.trim(),
      consequence: eventConsequenceInput.value.trim(),
      positionPercent: Number(eventPosRange.value),
    };

    saveEventBtn.disabled = true;
    saveEventBtn.textContent = "Saving...";

    try {
      const isEditing = Boolean(eventIdInput.value);

      if (isEditing) {
        eventPayload.id = eventIdInput.value;
        await ApiClient.put("/api/content", {
          novelId,
          type: "timeline",
          item: eventPayload,
        });

        const index = timelineEvents.findIndex((item) => item.id === eventPayload.id);
        if (index !== -1) timelineEvents[index] = { ...timelineEvents[index], ...eventPayload };
      } else {
        const res = await ApiClient.post("/api/content", {
          novelId,
          type: "timeline",
          item: eventPayload,
        });
        timelineEvents.push(res.item);
      }

      closeModal();
      renderTimeline();
    } catch (err) {
      eventFormError.textContent = err.message;
      eventFormError.style.display = "block";
    } finally {
      saveEventBtn.disabled = false;
      saveEventBtn.textContent = "Save Event";
    }
  });

  // Delete event
  deleteEventBtn.addEventListener("click", async () => {
    const eventId = eventIdInput.value;
    if (!eventId) return;

    const confirmed = confirm("Are you sure you want to delete this timeline event?");
    if (!confirmed) return;

    try {
      await ApiClient.delete(`/api/content?novelId=${novelId}&type=timeline&itemId=${eventId}`);
      timelineEvents = timelineEvents.filter((item) => item.id !== eventId);
      closeModal();
      renderTimeline();
    } catch (err) {
      alert("Failed to delete event: " + err.message);
    }
  });

  document.addEventListener("DOMContentLoaded", loadEvents);
})();
