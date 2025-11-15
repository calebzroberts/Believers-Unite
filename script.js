// ---------- CONFIG ----------
const JSON_URL = "churchesList.json";
const EARTH_RADIUS_MILES = 3958.8;
// -----------------------------

let map, markerClusterGroup;
let churchesCache = [];
let baseLocation = null; 
let usingMyLocation = false; // track whether radius mode is active


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


// ---------- MAP INIT ----------
function initMap() {
  map = L.map("map", { center: [40.0, -76.6], zoom: 9 });
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/">OpenStreetMap</a>'
  }).addTo(map);

  markerClusterGroup = L.markerClusterGroup();
  map.addLayer(markerClusterGroup);
}


// ---------- LOAD DATA ----------
async function fetchChurches() {
  try {
    const res = await fetch(JSON_URL);
    return await res.json();
  } catch (err) {
    console.error(err);
    return [];
  }
}


// ---------- RENDER ----------
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
    container.innerHTML = "<p class='placeholder'>No churches found.</p>";
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
  });

  if (bounds.length > 0) {
    map.fitBounds(bounds, { padding: [30, 30] });
  }
}

async function geocodeQuery(query) {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(query)}`
    );
    const json = await res.json();
    if (json.length === 0) return null;

    return {
      lat: parseFloat(json[0].lat),
      lon: parseFloat(json[0].lon)
    };
  } catch (e) {
    console.error("Geocoding failed:", e);
    return null;
  }
}



// ---------- SEARCH ----------
async function searchChurches() {
  const query = document.getElementById("searchInput").value.trim();
  const radius = Number(document.getElementById("radiusInput").value) || Infinity;

  const container = document.getElementById("churchResults");
  container.innerHTML = "<p class='placeholder'>Loading...</p>";

  if (churchesCache.length === 0) {
    churchesCache = await fetchChurches();
  }

  // Determine user base location:

  let locationPoint = null;

  if (usingMyLocation && baseLocation) {
    locationPoint = baseLocation;
  } else if (query.length > 0) {
    // geocode the user’s input
    const geo = await geocodeQuery(query);
    if (!geo) {
      displayResults([]);
      return;
    }
    locationPoint = geo;
    baseLocation = geo; // save it
  } else {
    displayResults([]);
    return;
  }

  // Now do real radius filtering
  const results = churchesCache.filter(ch => {
    if (!ch.latitude || !ch.longitude) return false;
    const dist = distanceMiles(locationPoint.lat, locationPoint.lon, ch.latitude, ch.longitude);
    return dist <= radius;
  });

  displayResults(results);

  document.getElementById("get-involved").scrollIntoView({ behavior: "smooth" });
}



// ---------- LOCATION BUTTON ----------
// reverse geocode helper (Nominatim)
async function reverseGeocode(lat, lon) {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&addressdetails=1`
    );
    if (!res.ok) return null;

    const data = await res.json();
    const a = data.address || {};

    const zip = a.postcode || null;
    const town =
      a.city ||
      a.town ||
      a.village ||
      a.hamlet ||
      a.suburb ||
      null;
    const state = a.state || null;

    // Priority:
    // 1. ZIP (best for your dataset)
    // 2. town,state (if ZIP missing)
    if (zip) {
      return zip;
    }
    if (town && state) {
      return `${town}, ${state}`;
    }

    return null;

  } catch (e) {
    console.error("Reverse geocode error:", e);
    return null;
  }
}



function setupLocateButton() {
  const btn = document.getElementById("useLocationBtn");
  if (!btn) return;

  btn.addEventListener("click", () => {
    if (!navigator.geolocation) {
      alert("Geolocation not supported.");
      return;
    }

    btn.disabled = true;
    btn.innerHTML = "Locating…";

    navigator.geolocation.getCurrentPosition(
      // SUCCESS (async allowed)
      async (pos) => {
        const lat = pos.coords.latitude;
        const lon = pos.coords.longitude;

        baseLocation = { lat, lon };
        usingMyLocation = true;

        // reverse geocode into readable address (fallback to coords)
        const address = await reverseGeocode(lat, lon);
        document.getElementById("searchInput").value =
          address || `${lat.toFixed(5)}, ${lon.toFixed(5)}`;

        // restore button text (keeps location mode enabled)
        btn.innerHTML = '<i class="fas fa-location-crosshairs"></i>';
        btn.disabled = false;
      },

      // ERROR
      (err) => {
        console.warn("Geolocation error:", err);
        alert("Unable to retrieve location.");
        btn.innerHTML = '<i class="fas fa-location-crosshairs"></i>';
        btn.disabled = false;
      },

      // OPTIONS
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  });
}


// ---------- INIT ----------
document.addEventListener("DOMContentLoaded", async () => {
  initMap();
  setupLocateButton();
  churchesCache = await fetchChurches();

  document.getElementById("searchBtn").addEventListener("click", () => {
    usingMyLocation = document.getElementById("searchInput").value === "My Location";
    searchChurches();
  });

  document.getElementById("searchInput").addEventListener("input", () => {
    usingMyLocation = false; // Always disable location when typing
  });

  document.getElementById("searchInput").addEventListener("keypress", e => {
    if (e.key === "Enter") {
      e.preventDefault();
      usingMyLocation = document.getElementById("searchInput").value === "My Location";
      searchChurches();
    }
  });
});
