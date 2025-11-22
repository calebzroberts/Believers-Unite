document.getElementById('signupForm').addEventListener('submit', async (e) => {
    e.preventDefault();

    const email = document.getElementById('signupEmail').value;
    const msg = document.getElementById('signupMessage');
    const submitBtn = document.getElementById("signUpBtn");

    msg.textContent = "Submitting...";
    submitBtn.disabled = true;

    try {
        const res = await fetch("https://script.google.com/macros/s/AKfycbwUveipFA9_qLjXgqAP9F06UdEwv4jTFlCajIsNbUoQtj2kaKDbH2-YVEsOR5WwFlSy/exec", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ email })
        });

        msg.textContent = "Thank you! You're signed up.";
        document.getElementById('signupForm').reset();

    } catch (err) {
        msg.textContent = "Something went wrong. Try again.";
    }

    submitBtn.disabled = false;
});
