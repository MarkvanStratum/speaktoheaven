const backendUrl = "https://speaktoheaven.onrender.com";

const params = new URLSearchParams(window.location.search);
let characterId = Number(params.get("character"));
if (!characterId) characterId = 1; // default to God or any ID you want


const token = localStorage.getItem("token");

if (!token) {
  alert("Please login first.");
  window.location.href = "/login.html";
}

if (!characterId) {
  alert("Error: No character selected.");
}

const chatBox = document.getElementById("chatBox");
const chatName = document.getElementById("chatName");

// Load profile info
async function loadProfile() {
  const res = await fetch(`${backendUrl}/api/profiles`);
  const profiles = await res.json();
  const profile = profiles.find(p => p.id === characterId);

  if (profile) {
    chatName.textContent = profile.name;
  }
}

// Load messages
async function loadMessages() {
  const res = await fetch(`${backendUrl}/api/messages/${characterId}`, {
    headers: {
      "Authorization": `Bearer ${token}`
    }
  });

  const data = await res.json();
  chatBox.innerHTML = "";

  data.forEach(msg => {
    addMessage(msg.text, msg.from_user ? "user" : "bot");
  });

  chatBox.scrollTop = chatBox.scrollHeight;
}

function addMessage(text, sender) {
  const div = document.createElement("div");
  div.className = `message ${sender}`;
  div.textContent = text;
  chatBox.appendChild(div);
}

async function sendMessage() {
  const input = document.getElementById("messageInput");
  const text = input.value.trim();
  if (!text) return;

  addMessage(text, "user");
  input.value = "";

  const res = await fetch(`${backendUrl}/api/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`
    },
    body: JSON.stringify({
      characterId,
      message: text
    })
  });

  const data = await res.json();

  addMessage(data.reply || "(No response)", "bot");

  chatBox.scrollTop = chatBox.scrollHeight;
}

// Initialize
loadProfile();
loadMessages();