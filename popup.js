// YouTube Shield - Popup Script

document.addEventListener("DOMContentLoaded", () => {
  // DOM Elements
  const toggleAdblock = document.getElementById("toggle-adblock");
  const toggleVideoSkip = document.getElementById("toggle-video-skip");
  const toggleLayoutHide = document.getElementById("toggle-layout-hide");

  const statAdsCount = document.getElementById("stat-ads-count");
  const statTimeSaved = document.getElementById("stat-time-saved");

  const statusBadge = document.getElementById("status-badge");
  const statusLbl = statusBadge.querySelector(".status-lbl");

  // Helper to format time saved
  function formatTimeSaved(seconds) {
    if (!seconds || seconds <= 0) return "0s";
    if (seconds < 60) return `${seconds}s`;

    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;

    if (minutes < 60) {
      return remainingSeconds > 0 ? `${minutes}m ${remainingSeconds}s` : `${minutes}m`;
    }

    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;

    return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
  }

  // Helper to update status badge UI
  function updateStatusUI(isEnabled) {
    if (isEnabled) {
      statusBadge.classList.remove("disabled");
      statusLbl.textContent = "Shield Active";
    } else {
      statusBadge.classList.add("disabled");
      statusLbl.textContent = "Shield Paused";
    }
  }

  // Load and apply current values from storage
  chrome.storage.local.get(
    ["adblock_enabled", "video_skip_enabled", "layout_hide_enabled", "ads_blocked_count", "time_saved_sec"],
    (result) => {
      // Set toggles (defaulting to true)
      toggleAdblock.checked = result.adblock_enabled !== false;
      toggleVideoSkip.checked = result.video_skip_enabled !== false;
      toggleLayoutHide.checked = result.layout_hide_enabled !== false;

      // Update badge UI
      updateStatusUI(toggleAdblock.checked);

      // Display stats
      statAdsCount.textContent = result.ads_blocked_count || 0;
      statTimeSaved.textContent = formatTimeSaved(result.time_saved_sec || 0);
    }
  );

  // Set up click listeners for the toggles to persist settings
  toggleAdblock.addEventListener("change", () => {
    const isEnabled = toggleAdblock.checked;
    chrome.storage.local.set({ adblock_enabled: isEnabled }, () => {
      updateStatusUI(isEnabled);
    });
  });

  toggleVideoSkip.addEventListener("change", () => {
    chrome.storage.local.set({ video_skip_enabled: toggleVideoSkip.checked });
  });

  toggleLayoutHide.addEventListener("change", () => {
    chrome.storage.local.set({ layout_hide_enabled: toggleLayoutHide.checked });
  });

  // Listen for storage updates to refresh stats in real-time (if popup is open)
  chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === "local") {
      if (changes.ads_blocked_count) {
        statAdsCount.textContent = changes.ads_blocked_count.newValue;
      }
      if (changes.time_saved_sec) {
        statTimeSaved.textContent = formatTimeSaved(changes.time_saved_sec.newValue);
      }
      if (changes.adblock_enabled) {
        toggleAdblock.checked = changes.adblock_enabled.newValue;
        updateStatusUI(changes.adblock_enabled.newValue);
      }
      if (changes.video_skip_enabled) {
        toggleVideoSkip.checked = changes.video_skip_enabled.newValue;
      }
      if (changes.layout_hide_enabled) {
        toggleLayoutHide.checked = changes.layout_hide_enabled.newValue;
      }
    }
  });
});
