// YouTube Shield Ad Blocker - Content Script

let settings = {
  adblock_enabled: true,
  video_skip_enabled: true,
  layout_hide_enabled: true
};

// CSS to hide ad layouts on YouTube
const AD_CSS = `
  ytd-action-companion-ad-renderer,
  ytd-display-ad-renderer,
  ytd-ad-slot-renderer,
  ytd-promoted-sparkles-web-renderer,
  ytd-companion-card-renderer,
  ytd-banner-promo-renderer,
  ytd-statement-banner-renderer,
  ytd-video-masthead-ad-renderer,
  ytd-carousel-ad-renderer,
  ytd-brand-video-singleton-renderer,
  .ytd-ad-layout,
  #masthead-ad,
  #player-ads,
  .ytp-ad-overlay-container,
  .ytp-ad-message-container,
  .ytp-ad-image-overlay,
  ytd-ad-slot-renderer,
  #rendering-content > ytd-ad-slot-renderer,
  .video-ads,
  .ytp-ad-module {
    display: none !important;
    width: 0 !important;
    height: 0 !important;
    opacity: 0 !important;
    pointer-events: none !important;
  }
`;

let styleElement = null;

// Inject CSS styles to hide layout ads
function injectAdStyles() {
  if (settings.adblock_enabled && settings.layout_hide_enabled) {
    if (!styleElement) {
      styleElement = document.createElement("style");
      styleElement.id = "yt-shield-ad-blocker-styles";
      styleElement.textContent = AD_CSS;
      (document.head || document.documentElement).appendChild(styleElement);
    }
  } else {
    removeAdStyles();
  }
}

// Remove injected styles
function removeAdStyles() {
  if (styleElement) {
    styleElement.remove();
    styleElement = null;
  }
}

// Sync settings attribute to DOM for inject.js to read
function updateDOMAttribute() {
  document.documentElement.setAttribute("yt-shield-enabled", settings.adblock_enabled);
}

// Load settings from Chrome storage
function loadSettings() {
  try {
    chrome.storage.local.get(["adblock_enabled", "video_skip_enabled", "layout_hide_enabled"], (result) => {
      if (chrome.runtime.lastError) return;

      settings.adblock_enabled = result.adblock_enabled !== false;
      settings.video_skip_enabled = result.video_skip_enabled !== false;
      settings.layout_hide_enabled = result.layout_hide_enabled !== false;

      updateDOMAttribute();
      injectAdStyles();
    });
  } catch (e) {
    console.error("YouTube Shield: Failed to load settings:", e);
  }
}

// Monitor changes to settings
try {
  chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === "local") {
      let changed = false;
      if (changes.adblock_enabled !== undefined) {
        settings.adblock_enabled = changes.adblock_enabled.newValue;
        changed = true;
      }
      if (changes.video_skip_enabled !== undefined) {
        settings.video_skip_enabled = changes.video_skip_enabled.newValue;
        changed = true;
      }
      if (changes.layout_hide_enabled !== undefined) {
        settings.layout_hide_enabled = changes.layout_hide_enabled.newValue;
        changed = true;
      }

      if (changed) {
        updateDOMAttribute();
        injectAdStyles();
      }
    }
  });
} catch (e) {
  console.error("YouTube Shield: Failed to listen for settings changes:", e);
}

// Initialize settings
loadSettings();

// Video ad skipping variables
let wasAdPlaying = false;
let originalSpeed = 1.0;
let originalMuted = false;
let originalVolume = 1.0;
let adDuration = 15;

// Selectors for video skip buttons
const SKIP_BUTTON_SELECTORS = [
  ".ytp-ad-skip-button",
  ".ytp-ad-skip-button-modern",
  ".ytp-skip-ad-button",
  ".ytp-ad-skip-button-slot",
  "button[class*='skip-ad']",
  "div[class*='skip-ad']"
];

// Perform ad detection and manipulation loop
function checkVideoAd() {
  // If adblock is globally disabled, do nothing
  if (!settings.adblock_enabled) {
    if (wasAdPlaying) {
      restorePlayerState();
    }
    return;
  }

  const video = document.querySelector("video");
  if (!video) return;

  // Detect if an ad is showing
  const isAdPlaying = !!(
    document.querySelector(".ad-showing") ||
    document.querySelector(".ad-interrupting") ||
    document.querySelector(".ytp-ad-player-overlay") ||
    document.querySelector(".ytp-ad-message-container")
  );

  if (isAdPlaying && settings.video_skip_enabled) {
    if (!wasAdPlaying) {
      wasAdPlaying = true;

      // Store original player settings before speeding up (making sure we don't store 16x)
      if (video.playbackRate !== 16.0) {
        originalSpeed = video.playbackRate;
      }
      originalMuted = video.muted;
      originalVolume = video.volume;
      adDuration = isNaN(video.duration) || !isFinite(video.duration) ? 15 : video.duration;

      console.log(`YouTube Shield: Ad detected! Duration: ${adDuration}s. Speeding up & muting.`);
    }

    // Apply ad skipping changes
    video.muted = true;
    video.playbackRate = 16.0;

    // Direct skip if video duration is loaded
    if (video.duration && !isNaN(video.duration) && isFinite(video.duration)) {
      // Seek straight to the end
      video.currentTime = video.duration - 0.02;
    }

    // Trigger click on any skip buttons found
    for (const selector of SKIP_BUTTON_SELECTORS) {
      const skipButton = document.querySelector(selector);
      if (skipButton) {
        try {
          skipButton.click();
          console.log("YouTube Shield: Clicked skip button!");
        } catch (e) {
          console.warn("YouTube Shield: Failed to click skip button:", e);
        }
      }
    }
  } else {
    // Ad has finished or video_skip is disabled
    if (wasAdPlaying) {
      restorePlayerState();

      // Update statistics in background storage
      try {
        chrome.runtime.sendMessage({
          action: "adBlocked",
          duration: Math.round(adDuration)
        }, (response) => {
          if (chrome.runtime.lastError) {
            // Context invalidated or background inactive, ignore
            return;
          }
          if (response && response.success) {
            console.log(`YouTube Shield: Ad bypassed successfully! Total blocked count: ${response.newCount}`);
          }
        });
      } catch (e) {
        console.warn("YouTube Shield: Message sending failed (likely extension reload):", e);
      }

      wasAdPlaying = false;
    }
  }
}

// Restore original volume and speed to player
function restorePlayerState() {
  const video = document.querySelector("video");
  if (!video) return;

  video.muted = originalMuted;
  video.volume = originalVolume;
  if (originalSpeed && originalSpeed !== 16.0) {
    video.playbackRate = originalSpeed;
  } else {
    video.playbackRate = 1.0;
  }
  console.log("YouTube Shield: Ad completed. Restored volume & playback speed.");
}

// Run the check loop continuously (every 200ms) to detect ads quickly
const checkInterval = setInterval(checkVideoAd, 200);

// Also clean layout elements using interval to catch dynamically rendered elements
function cleanDynamicAds() {
  if (!settings.adblock_enabled || !settings.layout_hide_enabled) return;

  // Remove overlay ads inside the player that can block video viewing
  const overlays = document.querySelectorAll(".ytp-ad-overlay-container, .ytp-ad-image-overlay");
  overlays.forEach(overlay => {
    if (overlay.style.display !== "none") {
      overlay.style.display = "none";
      console.log("YouTube Shield: Removed active ad overlay");
    }
  });
}
const cleanInterval = setInterval(cleanDynamicAds, 1000);

// Clear intervals on unload if page is refreshed or extension reloaded
window.addEventListener("unload", () => {
  clearInterval(checkInterval);
  clearInterval(cleanInterval);
});

// Listen for interception events from inject.js running in MAIN world
window.addEventListener("yt-shield-ad-intercepted", () => {
  try {
    chrome.runtime.sendMessage({
      action: "adBlocked",
      duration: 15 // average estimated ad duration saved per blocked ad request
    }, (response) => {
      if (chrome.runtime.lastError) return;
      if (response && response.success) {
        console.log(`YouTube Shield: Network Ad intercepted! Count: ${response.newCount}`);
      }
    });
  } catch (e) {
    // context invalidated or extension reloaded, ignore
  }
});
