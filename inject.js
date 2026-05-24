// YouTube Shield - Page Context Injection (MAIN World)

(function() {
  // Helper to check if adblock is enabled by reading document attribute set by content.js
  const isEnabled = () => {
    const attr = document.documentElement.getAttribute("yt-shield-enabled");
    return attr === null || attr === "true";
  };

  // Clean ads from player response data
  function cleanPlayerResponse(json) {
    if (!json) return json;

    let modified = false;

    // 1. Remove ad placements
    if (json.adPlacements && json.adPlacements.length > 0) {
      json.adPlacements = [];
      modified = true;
    }

    // 2. Remove ad slots
    if (json.adSlots && json.adSlots.length > 0) {
      json.adSlots = [];
      modified = true;
    }

    // 3. Remove player ads
    if (json.playerAds && json.playerAds.length > 0) {
      json.playerAds = [];
      modified = true;
    }

    // 4. Remove display overlays and layout promotions
    if (json.annotationsMap) {
      delete json.annotationsMap;
      modified = true;
    }

    if (modified) {
      console.log("YouTube Shield: Blocked ads by cleaning Player Response payload.");
    }

    return json;
  }

  // Intercept ytInitialPlayerResponse global variable
  let rawPlayerResponse = undefined;
  Object.defineProperty(window, "ytInitialPlayerResponse", {
    get() {
      return rawPlayerResponse;
    },
    set(val) {
      if (isEnabled()) {
        val = cleanPlayerResponse(val);
        // Signal content script to log stats
        window.dispatchEvent(new CustomEvent("yt-shield-ad-intercepted"));
      }
      rawPlayerResponse = val;
    },
    configurable: true
  });

  // Intercept window.ytplayer config
  let rawYtPlayer = undefined;
  Object.defineProperty(window, "ytplayer", {
    get() {
      return rawYtPlayer;
    },
    set(val) {
      if (isEnabled() && val && val.config && val.config.args && val.config.args.raw_player_response) {
        try {
          let response = JSON.parse(val.config.args.raw_player_response);
          response = cleanPlayerResponse(response);
          val.config.args.raw_player_response = JSON.stringify(response);
          window.dispatchEvent(new CustomEvent("yt-shield-ad-intercepted"));
        } catch (e) {}
      }
      rawYtPlayer = val;
    },
    configurable: true
  });

  // Intercept window.fetch to capture /youtubei/v1/player calls
  const originalFetch = window.fetch;
  window.fetch = async function(...args) {
    const requestUrl = args[0];
    const urlStr = typeof requestUrl === "string" ? requestUrl : (requestUrl instanceof Request ? requestUrl.url : "");

    if (isEnabled() && urlStr && urlStr.includes("/youtubei/v1/player")) {
      try {
        const response = await originalFetch.apply(this, args);
        const clone = response.clone();
        let json = await clone.json();

        json = cleanPlayerResponse(json);

        // Signal content script to log stats
        window.dispatchEvent(new CustomEvent("yt-shield-ad-intercepted"));

        return new Response(JSON.stringify(json), {
          status: response.status,
          statusText: response.statusText,
          headers: response.headers
        });
      } catch (e) {
        console.warn("YouTube Shield: Failed to patch fetch player response. Using fallback.", e);
      }
    }
    return originalFetch.apply(this, args);
  };

  // Intercept XMLHttpRequest to capture any XHR player config calls
  const originalOpen = XMLHttpRequest.prototype.open;
  const originalSend = XMLHttpRequest.prototype.send;
  
  XMLHttpRequest.prototype.open = function(method, url) {
    this._url = typeof url === 'string' ? url : (url ? url.toString() : '');
    return originalOpen.apply(this, arguments);
  };
  
  XMLHttpRequest.prototype.send = function() {
    if (isEnabled() && this._url && this._url.includes("/youtubei/v1/player")) {
      const originalOnreadystatechange = this.onreadystatechange;
      this.onreadystatechange = function() {
        if (this.readyState === 4 && this.status === 200) {
          try {
            let responseText = this.responseText;
            let json = JSON.parse(responseText);
            json = cleanPlayerResponse(json);
            
            // Override response properties
            Object.defineProperty(this, "responseText", {
              get() { return JSON.stringify(json); },
              configurable: true
            });
            Object.defineProperty(this, "response", {
              get() { return JSON.stringify(json); },
              configurable: true
            });
            
            window.dispatchEvent(new CustomEvent("yt-shield-ad-intercepted"));
          } catch (e) {
            console.warn("YouTube Shield: XHR parsing failed.", e);
          }
        }
        if (originalOnreadystatechange) {
          return originalOnreadystatechange.apply(this, arguments);
        }
      };
    }
    return originalSend.apply(this, arguments);
  };
})();
