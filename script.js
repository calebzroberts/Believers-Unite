// Simulated church data (replace with Google Sheet later)
const churches = [
  {
    name: "Grace Fellowship Church",
    zipcode: "17055",
    image: "Images/church1.webp",
    address: "123 Main St, Mechanicsburg, PA",
    pastor: "Pastor John Smith",
    website: "https://gracefellowship.org"
  },
  {
    name: "Living Word Ministries",
    zipcode: "17112",
    image: "Images/church2.webp",
    address: "456 Oak Ave, Harrisburg, PA",
    pastor: "Rev. Mary Johnson",
    website: "https://livingword.org"
  },
  {
    name: "Community Bible Church",
    zipcode: "17055",
    image: "Images/church3.webp",
    address: "789 Elm St, Mechanicsburg, PA",
    pastor: "Pastor Alan Brown",
    website: "https://cbcpa.org"
  }
];

function searchChurches() {
  const zip = document.getElementById("zipcode").value.trim();
  const resultsContainer = document.getElementById("churchResults");

  resultsContainer.innerHTML = "";

  if (zip === "") {
    resultsContainer.innerHTML = "<p class='placeholder'>Please enter a ZIP code to search.</p>";
    return;
  }

  const results = churches.filter(ch => ch.zipcode === zip);

  if (results.length === 0) {
    resultsContainer.innerHTML = "<p class='placeholder'>No churches found for that ZIP code.</p>";
    return;
  }

  results.forEach(church => {
    const card = document.createElement("div");
    card.classList.add("church-card");
    card.innerHTML = `
      <img src="${church.image}" alt="${church.name}">
      <div class="info">
        <h3>${church.name}</h3>
        <p><strong>Pastor:</strong> ${church.pastor}</p>
        <p><strong>Address:</strong> ${church.address}</p>
        <a href="${church.website}" class="btn" target="_blank">More Info</a>
      </div>
    `;
    resultsContainer.appendChild(card);
  });
}
