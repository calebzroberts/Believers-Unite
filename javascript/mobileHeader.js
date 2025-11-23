const mobileBtn = document.getElementById("mobileMenuBtn");
const nav = document.querySelector("nav");

mobileBtn.addEventListener("click", () => {
  nav.classList.toggle("open");
});
