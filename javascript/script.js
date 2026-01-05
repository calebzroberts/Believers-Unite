// ----------------------------------------------------
// CONFIG
// ----------------------------------------------------
const JSON_URL = "/databases/churchesList.json";
const EARTH_RADIUS_MILES = 3958.8;

let map, markerClusterGroup;
let churchesCache = [];
let gpsLocation = null;
let typedLocation = null;
let usingMyLocation = false;

const placeholderText = document.getElementById("placeholder");
let pendingSearches = [];

// ----------------------------------------------------
// LAZY-LOAD LEAFLET MAP
// ----------------------------------------------------
function loadLeaflet() {
  if (window.leafletLoaded) return;
  window.leafletLoaded = true;

  // Load CSS
  const leafletCSS = document.createElement("link");
  leafletCSS.rel = "stylesheet";
  leafletCSS.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
  document.head.appendChild(leafletCSS);

  const markerCSS = document.createElement("link");
  markerCSS.rel = "stylesheet";
  markerCSS.href = "https://unpkg.com/leaflet.markercluster@1.5.3/dist/MarkerCluster.css";
  document.head.appendChild(markerCSS);

  const markerDefaultCSS = document.createElement("link");
  markerDefaultCSS.rel = "stylesheet";
  markerDefaultCSS.href = "https://unpkg.com/leaflet.markercluster@1.5.3/dist/MarkerCluster.Default.css";
  document.head.appendChild(markerDefaultCSS);

  // Load JS sequentially
  const leafletJS = document.createElement("script");
  leafletJS.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
  leafletJS.onload = () => {
    const markerJS = document.createElement("script");
    markerJS.src = "https://unpkg.com/leaflet.markercluster@1.5.3/dist/leaflet.markercluster.js";
    markerJS.onload = () => {
      initMap();
      // Run pending searches
      pendingSearches.forEach(fn => fn());
      pendingSearches = [];
    };
    document.body.appendChild(markerJS);
  };
  document.body.appendChild(leafletJS);
}

// Observe map container
const mapContainer = document.getElementById("map");
const observer = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      loadLeaflet();
      observer.disconnect();
    }
  });
}, { rootMargin: "200px" });

observer.observe(mapContainer);

// ----------------------------------------------------
// UTILITIES
// ----------------------------------------------------
function distanceMiles(lat1, lon1, lat2, lon2) {
  const toRad = x => (x * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_MILES * c;
}

function escapeHtml(s) {
  return s ? String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;") : "";
}

function escapeAttr(s) {
  return s ? String(s).replace(/"/g, "&quot;") : "#";
}

function buildGoogleMapsUrl(ch) {
  const q = encodeURIComponent(`${ch.name} ${ch.address} ${ch.city}`);
  return `https://www.google.com/maps/search/?api=1&query=${q}`;
}

// ----------------------------------------------------
// MAP INITIALIZATION
// ----------------------------------------------------
function initMap() {
  map = L.map("map", { center: [40.0, -76.6], zoom: 9 });
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: '&copy; <a href="https://www.openstreetmap.org/">OpenStreetMap</a>'
  }).addTo(map);

  markerClusterGroup = L.markerClusterGroup();
  map.addLayer(markerClusterGroup);
}

// ----------------------------------------------------
// DATA LOADING
// ----------------------------------------------------
async function fetchChurches() {
  try {
    const res = await fetch(JSON_URL);
    const data = await res.json();
    return data.filter(ch =>
      typeof ch.latitude === "number" &&
      typeof ch.longitude === "number"
    );
  } catch (err) {
    console.error(err);
    return [];
  }
}

// ----------------------------------------------------
// MAP MARKERS + RESULTS RENDERING
// ----------------------------------------------------
function clearMarkers() {
  if (markerClusterGroup) markerClusterGroup.clearLayers();
}

function addMarker(ch) {
  if (!markerClusterGroup || !ch.latitude || !ch.longitude) return;

  const marker = L.marker([ch.latitude, ch.longitude]);
  const popup = `
    <div>
      <strong>${escapeHtml(ch.name)}</strong><br/>
      ${escapeHtml(ch.address)}, ${escapeHtml(ch.city)}<br/>
      <div style="margin-top:8px;">
        <a class="btn" href="${escapeAttr(ch.website)}" target="_blank">Website</a>
        <a class="btn maps-btn" href="${escapeAttr(buildGoogleMapsUrl(ch))}" target="_blank">View on Maps</a>
      </div>
    </div>
  `;
  marker.bindPopup(popup);
  markerClusterGroup.addLayer(marker);
}

function displayResults(results) {
  const container = document.getElementById("churchResults");
  container.innerHTML = "";
  clearMarkers();

  if (results.length === 0) {
    placeholderText.innerText = "No churches found.";
    return;
  }

  const bounds = [];

  results.forEach(ch => {
    if (!ch.latitude || !ch.longitude) return;

    const card = document.createElement("div");
    card.classList.add("church-card");
    card.innerHTML = `
      <div class="info">
        <h3>${escapeHtml(ch.name)}</h3>
        <p><strong>Address:</strong> ${escapeHtml(ch.address)}, ${escapeHtml(ch.city)}, ${escapeHtml(ch.zip)}</p><br>
        <p><strong>Distance:</strong> ${ch.distance ? ch.distance.toFixed(1) : "?"} miles</p>
      </div>
      <div class="church-links">
        <a class="btn" href="${escapeAttr(ch.website)}" target="_blank">Website</a>
        <a class="btn maps-btn" href="${escapeAttr(buildGoogleMapsUrl(ch))}" target="_blank">View on Maps</a>
      </div>
    `;
    container.appendChild(card);

    addMarker(ch);
    bounds.push([ch.latitude, ch.longitude]);
  });

  if (bounds.length > 0 && map && markerClusterGroup) {
    map.fitBounds(bounds, { padding: [30, 30] });
  }

  placeholderText.innerText = `${results.length} churches found.`;
}

// ----------------------------------------------------
// GEOCODING
// ----------------------------------------------------
async function geocodeQuery(query) {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(query)}`,
      {
        headers: {
          "User-Agent": "BelieversUnite/1.0 (contact@believersunite.com)"
        }
      }
    );    
    const json = await res.json();
    if (json.length === 0) return null;
    return { lat: parseFloat(json[0].lat), lon: parseFloat(json[0].lon) };
  } catch (e) {
    console.error("Geocoding failed:", e);
    return null;
  }
}

async function reverseGeocode(lat, lon) {
  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&addressdetails=1`);
    if (!res.ok) return null;
    const data = await res.json();
    const a = data.address || {};
    return a.postcode || (a.city || a.town || a.village ? `${a.city || a.town || a.village}, ${a.state || ""}` : null);
  } catch (e) {
    console.error("Reverse geocode error:", e);
    return null;
  }
}

// ----------------------------------------------------
// BUTTON USAGE TRACKING
// ----------------------------------------------------
function trackSearchClick() {
  gtag('event', 'church_search', {
    event_category: 'Search',
    event_label: 'User searched for churches'
  });
}

function isZipCode(str) {
  return /^\d{5}(-\d{4})?$/.test(str);
}


// ----------------------------------------------------
// LOCATION BUTTONS
// ----------------------------------------------------
function setupLocateButtons() {
  const buttons = [
    { id: "useLocationBtn", target: "searchInput" },
    { id: "mapUseLocationBtn", target: "mapSearchInput" }
  ];

  buttons.forEach(cfg => {
    const btn = document.getElementById(cfg.id);
    if (!btn) return;

    btn.addEventListener("click", () => {
      if (!navigator.geolocation) { alert("Geolocation not supported."); return; }
      btn.disabled = true;
      btn.innerHTML = `
        <svg class="loading-spin" xmlns="http://www.w3.org/2000/svg" height="24" width="24" viewBox="0 0 640 640">
          <path fill="currentColor" d="M272 112C272 85.5 293.5 64 320 64C346.5 64 368 85.5 368 112C368 138.5 346.5 160 320 160C293.5 160 272 138.5 272 112zM272 528C272 501.5 293.5 480 320 480C346.5 480 368 501.5 368 528C368 554.5 346.5 576 320 576C293.5 576 272 554.5 272 528zM112 272C138.5 272 160 293.5 160 320C160 346.5 138.5 368 112 368C85.5 368 64 346.5 64 320C64 293.5 85.5 272 112 272zM480 320C480 293.5 501.5 272 528 272C554.5 272 576 293.5 576 320C576 346.5 554.5 368 528 368C501.5 368 480 346.5 480 320zM139 433.1C157.8 414.3 188.1 414.3 206.9 433.1C225.7 451.9 225.7 482.2 206.9 501C188.1 519.8 157.8 519.8 139 501C120.2 482.2 120.2 451.9 139 433.1zM139 139C157.8 120.2 188.1 120.2 206.9 139C225.7 157.8 225.7 188.1 206.9 206.9C188.1 225.7 157.8 225.7 139 206.9C120.2 188.1 120.2 157.8 139 139zM501 433.1C519.8 451.9 519.8 482.2 501 501C482.2 519.8 451.9 519.8 433.1 501C414.3 482.2 414.3 451.9 433.1 433.1C451.9 414.3 482.2 414.3 501 433.1z"/>
        </svg>
      `;



      navigator.geolocation.getCurrentPosition(async pos => {
        const lat = pos.coords.latitude;
        const lon = pos.coords.longitude;
        gpsLocation = { lat, lon };
        usingMyLocation = true;

        const address = await reverseGeocode(lat, lon);

        document.getElementById("searchInput").value = address || "";
        document.getElementById("mapSearchInput").value = address || "";

        btn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" height="24" width="24" viewBox="0 0 640 640"><!--!Font Awesome Free v7.1.0 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free Copyright 2025 Fonticons, Inc.--><path fill="#000000" d="M320 48C337.7 48 352 62.3 352 80L352 98.3C450.1 112.3 527.7 189.9 541.7 288L560 288C577.7 288 592 302.3 592 320C592 337.7 577.7 352 560 352L541.7 352C527.7 450.1 450.1 527.7 352 541.7L352 560C352 577.7 337.7 592 320 592C302.3 592 288 577.7 288 560L288 541.7C189.9 527.7 112.3 450.1 98.3 352L80 352C62.3 352 48 337.7 48 320C48 302.3 62.3 288 80 288L98.3 288C112.3 189.9 189.9 112.3 288 98.3L288 80C288 62.3 302.3 48 320 48zM160 320C160 408.4 231.6 480 320 480C408.4 480 480 408.4 480 320C480 231.6 408.4 160 320 160C231.6 160 160 231.6 160 320zM320 224C373 224 416 267 416 320C416 373 373 416 320 416C267 416 224 373 224 320C224 267 267 224 320 224z"/></svg>';
        btn.disabled = false;
      }, err => {
        console.error("Geolocation error:", err);

        if (err.code === 3) {
          alert("Location timed out. Try typing your city or ZIP instead.");
        } else if (err.code === 1) {
          alert("Location permission denied.");
        } else {
          alert("Location unavailable.");
        }

        btn.disabled = false;
      }, { enableHighAccuracy: false, timeout: 8000, maximumAge: 300000 });
    });
  });
}

// ----------------------------------------------------
// MAIN SEARCH FUNCTION
// ----------------------------------------------------
async function searchChurches() {
  const query = document.getElementById("searchInput").value.trim();
  const radius = Number(document.getElementById("radiusInput").value) || Infinity;

  const container = document.getElementById("churchResults");
  container.innerHTML = "<p class='placeholder'>Loading...</p>";

  if (churchesCache.length === 0) churchesCache = await fetchChurches();

  let locationPoint = null;

  if (usingMyLocation && gpsLocation) {
    locationPoint = gpsLocation;
  } 
  else if (query.length > 0) {

    // ZIP CODE SEARCH (NO GEOCODING)
    if (isZipCode(query)) {

      const zipMatches = churchesCache.filter(ch => ch.zip === query);

      if (!zipMatches.length) {
        displayResults([]);
        return;
      }

      // Use the average location of matching ZIP churches
      const avgLat = zipMatches.reduce((s,c)=>s+c.latitude,0) / zipMatches.length;
      const avgLon = zipMatches.reduce((s,c)=>s+c.longitude,0) / zipMatches.length;

      locationPoint = { lat: avgLat, lon: avgLon };

    } 
    // CITY / ADDRESS SEARCH
    else {
      typedLocation = await geocodeQuery(query);
      if (!typedLocation) {
        displayResults([]);
        return;
      }
      locationPoint = typedLocation;
    }
  }

  else {
    displayResults([]);
    return;
  }

  let results = churchesCache
    .map(ch => !ch.latitude || !ch.longitude ? null : ({ ...ch, distance: distanceMiles(locationPoint.lat, locationPoint.lon, ch.latitude, ch.longitude) }))
    .filter(ch => ch && ch.distance <= radius);

  const sortMode = document.getElementById("sortSelect").value;
  if (sortMode === "distance") results.sort((a,b)=>a.distance-b.distance);
  else if (sortMode === "name") results.sort((a,b)=>a.name.localeCompare(b.name));

  displayResults(results);
  if (map && markerClusterGroup) {
    document.getElementById("mapSearchControls").scrollIntoView({ behavior: "smooth" });
  } else {
    // retry after a short delay
    setTimeout(() => {
      const elem = document.getElementById("mapSearchControls");
      if (elem) elem.scrollIntoView({ behavior: "smooth" });
    }, 300);
  }

}

// Wrapper to handle searches before Leaflet loads
function searchChurchesWrapper() {
  if (!window.leafletLoaded) {
    pendingSearches.push(() => searchChurches());
  } else {
    searchChurches();
  }
}

document.getElementById("sortSelect").addEventListener("change", searchChurchesWrapper);

// ----------------------------------------------------
// INITIALIZATION
// ----------------------------------------------------
document.addEventListener("DOMContentLoaded", async () => {
  setupLocateButtons();
  churchesCache = await fetchChurches();

  // Search buttons
  document.getElementById("searchBtn").addEventListener("click", () => {
    trackSearchClick();
    searchChurchesWrapper();
  });
  document.getElementById("mapSearchBtn").addEventListener("click", () => {
    trackSearchClick();
    document.getElementById("searchInput").value = document.getElementById("mapSearchInput").value;
    document.getElementById("radiusInput").value = document.getElementById("mapRadiusInput").value;
    searchChurchesWrapper();
  });

  // Sync inputs
  ["searchInput", "mapSearchInput"].forEach(id => {
    document.getElementById(id).addEventListener("input", e => {
      const other = id === "searchInput" ? "mapSearchInput" : "searchInput";
      document.getElementById(other).value = e.target.value;
      usingMyLocation = false;
    });
  });
  typedLocation = null;

  ["radiusInput", "mapRadiusInput"].forEach(id => {
    document.getElementById(id).addEventListener("input", e => {
      const other = id === "radiusInput" ? "mapRadiusInput" : "radiusInput";
      document.getElementById(other).value = e.target.value;
    });
  });

  // Enter key for hero search
  document.getElementById("searchInput").addEventListener("keypress", e => {
    if (e.key === "Enter") { e.preventDefault(); usingMyLocation=false; searchChurchesWrapper(); }
  });

  // Contact form
  document.getElementById("contactForm").addEventListener("submit", function(e) {
    e.preventDefault();
    document.getElementById("contactSubmitBtn").innerText = "Thanks!";
    e.target.reset();
  });
});
