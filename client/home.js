document.addEventListener("DOMContentLoaded", function () {
  // --- DOM Elements ---
  const startButton = document.getElementById('myButton');
  const loginButton = document.getElementById('loginButton'); // NEW: Get the login button
  const popup = document.getElementById('signInPopup');
  const closeButton = document.querySelector('.popup .close');
  const generateButton = document.getElementById('generateRoomId');
  const roomIdInput = document.getElementById('roomId');
  const joinForm = document.getElementById('loginForm');

  // --- Event Listeners ---
  startButton.addEventListener('click', openPopup);
  loginButton.addEventListener('click', openPopup); // NEW: Add listener to login button
  closeButton.addEventListener('click', closePopup);
  generateButton.addEventListener('click', generateRoomId);
  joinForm.addEventListener("submit", function (event) {
    event.preventDefault();
    let roomId = roomIdInput.value.trim();
    if (!roomId) {
        // If the input is blank, generate a new room ID
        roomId = Math.floor(10000 + Math.random() * 90000);
    }
    window.location.href = roomId;
  });

  // --- Functions ---
  function openPopup() {
    popup.style.display = 'flex';
  }

  function closePopup() {
    popup.style.display = 'none';
  }

  function generateRoomId() {
    // Generate a simple 5-digit random room ID
    const randomRoomId = Math.floor(10000 + Math.random() * 90000);
    roomIdInput.value = randomRoomId;
  }
});