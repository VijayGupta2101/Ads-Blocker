// Default configurations
const DEFAULT_SETTINGS = {
  adblock_enabled: true,
  video_skip_enabled: true,
  layout_hide_enabled: true,
  ads_blocked_count: 0,
  time_saved_sec: 0
};

// Initialize settings on installation
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get(Object.keys(DEFAULT_SETTINGS), (result) => {
    const updates = {};
    for (const key in DEFAULT_SETTINGS) {
      if (result[key] === undefined) {
        updates[key] = DEFAULT_SETTINGS[key];
      }
    }
    if (Object.keys(updates).length > 0) {
      chrome.storage.local.set(updates, () => {
        console.log("YouTube Shield Ad Blocker initialized with default settings:", updates);
      });
    }
  });
});

// Update the extension badge to show the number of ads blocked
function updateBadge() {
  chrome.storage.local.get(["ads_blocked_count", "adblock_enabled"], (result) => {
    if (!result.adblock_enabled) {
      chrome.action.setBadgeText({ text: "OFF" });
      chrome.action.setBadgeBackgroundColor({ color: "#6e6e6e" });
      return;
    }

    const count = result.ads_blocked_count || 0;
    if (count > 0) {
      // Format count (e.g., 1.2k if > 1000)
      let badgeText = count.toString();
      if (count >= 1000) {
        badgeText = (count / 1000).toFixed(1) + "k";
      }
      chrome.action.setBadgeText({ text: badgeText });
      chrome.action.setBadgeBackgroundColor({ color: "#ff0055" });
    } else {
      chrome.action.setBadgeText({ text: "" });
    }
  });
}

// Keep badge updated when storage changes
chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === "local" && (changes.ads_blocked_count || changes.adblock_enabled)) {
    updateBadge();
  }
});

// Initial badge update
updateBadge();

// Listen for messages from the content script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "adBlocked") {
    const duration = request.duration || 5; // Default to 5 seconds saved if not provided
    chrome.storage.local.get(["ads_blocked_count", "time_saved_sec"], (result) => {
      const currentCount = result.ads_blocked_count || 0;
      const currentTimeSaved = result.time_saved_sec || 0;

      chrome.storage.local.set({
        ads_blocked_count: currentCount + 1,
        time_saved_sec: currentTimeSaved + duration
      }, () => {
        sendResponse({ success: true, newCount: currentCount + 1 });
      });
    });
    return true; // Keep message channel open for async response
  }
});
