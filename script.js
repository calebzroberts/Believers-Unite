// ---------- CONFIG ----------
const JSON_URL = "churchesList.json";
const EARTH_RADIUS_MILES = 3958.8;
// -----------------------------

let map, markerClusterGroup;
let churchesCache = [];
let userLocation = null;

// ---------- UTILITIES ----------
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
  return s
    ? String(s)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
    : "";
}

function escapeAttr(s) {
  return s ? String(s).replace(/"/g, "&quot;") : "#";
}

function buildGoogleMapsUrl(ch) {
  const q = encodeURIComponent(`${ch.name} ${ch.address} ${ch.city}`);
  return `https://www.google.com/maps/search/?api=1&query=${q}`;
}
// --------------------------------

// ---------- MAP SETUP ----------
function initMap() {
  map = L.map("map", { center: [40.0, -76.6], zoom: 9 });
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/">OpenStreetMap</a> contributors'
  }).addTo(map);

  markerClusterGroup = L.markerClusterGroup();
  map.addLayer(markerClusterGroup);
}
// --------------------------------

// ---------- DATA ----------
async function fetchChurches() {
  try {
    const res = await fetch(JSON_URL);
    if (!res.ok) throw new Error("Failed to load churchesList.json");
    return await res.json();
  } catch (err) {
    console.error(err);
    return [];
  }
}
// --------------------------------

// ---------- DISPLAY ----------
function clearMarkers() {
  markerClusterGroup.clearLayers();
}

function addMarker(ch) {
  if (!ch.latitude || !ch.longitude) return;

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
    container.innerHTML =
      "<p class='placeholder'>No churches found for that ZIP code.</p>";
    return;
  }

  const radius = Number(document.getElementById("radiusInput").value) || Infinity;
  const bounds = [];
  const visible = [];

  results.forEach(ch => {
    if (!ch.latitude || !ch.longitude) return;

    // Filter by radius if user location is set
    if (userLocation) {
      const dist = distanceMiles(
        userLocation.lat,
        userLocation.lon,
        ch.latitude,
        ch.longitude
      );
      if (dist > radius) return;
    }

    // Add card
    const card = document.createElement("div");
    card.classList.add("church-card");
    card.innerHTML = `
      <div class="info">
        <h3>${escapeHtml(ch.name)}</h3>
        <p><strong>Address:</strong> ${escapeHtml(ch.address)}, ${escapeHtml(ch.city)}, ${escapeHtml(ch.zip)}</p>
        <div class="church-links">
          <a class="btn" href="${escapeAttr(ch.website)}" target="_blank">Website</a>
          <a class="btn maps-btn" href="${escapeAttr(buildGoogleMapsUrl(ch))}" target="_blank">View on Maps</a>
        </div>
      </div>
    `;
    container.appendChild(card);

    addMarker(ch);
    bounds.push([ch.latitude, ch.longitude]);
    visible.push(ch);
  });

  if (bounds.length > 0) {
    map.fitBounds(bounds, { padding: [30, 30] });
  }

  if (visible.length === 0) {
    container.innerHTML =
      "<p class='placeholder'>No churches found within that radius.</p>";
  }
}
// --------------------------------

async function searchChurches() {
  const query = document.getElementById("searchInput").value.trim().toLowerCase();
  const radius = Number(document.getElementById("radiusInput").value) || Infinity;
  const container = document.getElementById("churchResults");
  container.innerHTML = "<p class='placeholder'>Loading...</p>";

  if (churchesCache.length === 0) {
    churchesCache = await fetchChurches();
  }

  let results = [];

  // If user location set, base radius filter off that location
  if (userLocation) {
    results = churchesCache.filter(ch => {
      if (!ch.latitude || !ch.longitude) return false;
      const dist = distanceMiles(
        userLocation.lat,
        userLocation.lon,
        ch.latitude,
        ch.longitude
      );
      return dist <= radius;
    });
  } else if (query) {
    results = churchesCache.filter(ch => {
      const combined = `${ch.name} ${ch.address} ${ch.city} ${ch.zip}`.toLowerCase();
      return combined.includes(query);
    });
  }

  displayResults(results);

  // Scroll to results
  document.getElementById("get-involved").scrollIntoView({ behavior: "smooth" });
}

function setupLocateButton() {
  const btn = document.getElementById("locateBtn");
  btn.addEventListener("click", () => {
    if (!navigator.geolocation) {
      alert("Geolocation not supported.");
      return;
    }

    btn.disabled = true;
    btn.textContent = "Locating…";

    navigator.geolocation.getCurrentPosition(
      pos => {
        userLocation = { lat: pos.coords.latitude, lon: pos.coords.longitude };
        btn.textContent = "Location set";
        btn.disabled = false;
        console.log("Your location has been set. You can now search by radius.");
      },
      err => {
        console.warn(err);
        alert("Unable to retrieve your location.");
        btn.textContent = "Use My Location";
        btn.disabled = false;
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  });
}

// Hook up button listeners
document.addEventListener("DOMContentLoaded", async () => {
  initMap();
  setupLocateButton();
  churchesCache = await fetchChurches();

  document.getElementById("searchBtn").addEventListener("click", searchChurches);
  document.getElementById("searchInput").addEventListener("keypress", e => {
    if (e.key === "Enter") {
      e.preventDefault();
      searchChurches();
    }
  });
});