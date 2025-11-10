// Fetch churches from JSON
async function fetchChurches() {
  try {
    const response = await fetch("churchesList.json");
    if (!response.ok) throw new Error("Failed to load churchesList.json");
    return await response.json();
  } catch (err) {
    console.error(err);
    return [];
  }
}

// Search churches by ZIP code
async function searchChurches() {
  const zipInput = document.getElementById("zipcode").value.trim();
  const resultsContainer = document.getElementById("churchResults");
  resultsContainer.innerHTML = "<p class='placeholder'>Loading...</p>";

  if (!zipInput) {
    resultsContainer.innerHTML = "<p class='placeholder'>Please enter a ZIP code.</p>";
    return;
  }

  const churches = await fetchChurches();
  const results = churches.filter(ch => String(ch.Zip) === zipInput);

  if (results.length === 0) {
    resultsContainer.innerHTML = "<p class='placeholder'>No churches found for that ZIP code.</p>";
    return;
  }

  resultsContainer.innerHTML = "";
  results.forEach(ch => {
    const card = document.createElement("div");
    card.classList.add("church-card");
    card.innerHTML = `
      <div class="info">
        <h3>${ch.Name}</h3>
        <p><strong>Address:</strong> ${ch.Address}, ${ch.City}, ${ch.Zip}</p>
        <div class="church-links">
          <a href="${ch.Website}" class="btn" target="_blank">Website</a>
          <a href="${ch.Mapslink}" class="btn" target="_blank">View on Maps</a>
        </div>
      </div>
    `;
    resultsContainer.appendChild(card);
  });
}
