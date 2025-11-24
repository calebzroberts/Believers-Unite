// ----------------------------------------------------
// CONFIG
// ----------------------------------------------------
const JSON_URL = "/databases/churchesList.json";
const EARTH_RADIUS_MILES = 3958.8;

let map, markerClusterGroup;
let churchesCache = [];
let baseLocation = null;
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
    return await res.json();
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
    const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(query)}`);
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
      btn.innerHTML = "<i class='fas fa-spinner fa-spin'></i>";

      navigator.geolocation.getCurrentPosition(async pos => {
        const lat = pos.coords.latitude;
        const lon = pos.coords.longitude;
        baseLocation = { lat, lon };
        usingMyLocation = true;

        const address = await reverseGeocode(lat, lon);

        document.getElementById("searchInput").value = address || "";
        document.getElementById("mapSearchInput").value = address || "";

        btn.innerHTML = '<i class="fas fa-location-crosshairs"></i>';
        btn.disabled = false;
      }, err => {
        console.error("Geolocation error:", err);
        alert("Unable to retrieve location.");
        btn.innerHTML = '<i class="fas fa-location-crosshairs"></i>';
        btn.disabled = false;
      }, { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 });
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
  if (usingMyLocation && baseLocation) locationPoint = baseLocation;
  else if (query.length > 0) {
    const geo = await geocodeQuery(query);
    if (!geo) { displayResults([]); return; }
    locationPoint = geo;
    baseLocation = geo;
  } else { displayResults([]); return; }

  let results = churchesCache
    .map(ch => !ch.latitude || !ch.longitude ? null : ({ ...ch, distance: distanceMiles(locationPoint.lat, locationPoint.lon, ch.latitude, ch.longitude) }))
    .filter(ch => ch && ch.distance <= radius);

  const sortMode = document.getElementById("sortSelect").value;
  if (sortMode === "distance") results.sort((a,b)=>a.distance-b.distance);
  else if (sortMode === "name") results.sort((a,b)=>a.name.localeCompare(b.name));

  displayResults(results);
  document.getElementById("mapSearchControls").scrollIntoView({ behavior: "smooth" });
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
  document.getElementById("searchBtn").addEventListener("click", searchChurchesWrapper);
  document.getElementById("mapSearchBtn").addEventListener("click", () => {
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
