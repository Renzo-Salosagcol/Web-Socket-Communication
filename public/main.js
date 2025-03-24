//---------------------------------------------------
// main.js
//---------------------------------------------------

// 1) DOM ELEMENTS & SOCKET
const socket = io("wss://192.168.199.1:4000"); // Replace with your local IP address
const totalClients = document.getElementById('clients-total');
const messageContainer = document.getElementById('message-container');
const username = document.getElementById('name-input').value;
const messageForm = document.getElementById('message-form');
const messageInput = document.getElementById('message-input');

// Emoji UI elements
const emojiButton = document.getElementById('emoji-button');
const emojiContainer = document.getElementById('emoji-container');
const picker = document.createElement('emoji-picker');
emojiContainer.appendChild(picker);

// Show/hide emoji picker
picker.addEventListener('emoji-click', (event) => {
  messageInput.value += event.detail.unicode;
});
emojiButton.addEventListener('click', () => {
  emojiContainer.style.display =
    (emojiContainer.style.display === 'none' || emojiContainer.style.display === '')
      ? 'block'
      : 'none';
});

//--------------------------------------
// SHARED AES KEY IMPORT
//--------------------------------------
// 32 bytes of random data. Everyone using this code uses the same key.
const rawSharedKey = new Uint8Array([
  54, 108, 172, 88, 240, 13, 29, 77,
  94, 33, 201, 21, 127, 180, 66, 9,
  1,  245, 62, 9,  11, 10, 232, 204,
  55, 191, 220, 193, 100, 6, 22, 204
]);

let aesKey; // Will hold the imported AES key object

async function importSharedKey() {
  aesKey = await window.crypto.subtle.importKey(
    "raw",
    rawSharedKey.buffer,             // The raw key bytes
    { name: "AES-GCM" },
    true,                            // extractable
    ["encrypt", "decrypt"]           // usage
  );
  console.log("Imported shared AES key:", aesKey);
}

// On page load, import the shared key
importSharedKey();

//--------------------------------------
// ENCRYPT & DECRYPT
//--------------------------------------
async function encryptMessage(plainText) {
  // Convert plaintext to bytes
  const encoded = new TextEncoder().encode(plainText);
  // Create random IV for AES-GCM
  const iv = window.crypto.getRandomValues(new Uint8Array(12));

  // Encrypt using aesKey
  const encryptedBuffer = await window.crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    aesKey,
    encoded
  );

  return {
    iv: Array.from(iv),
    ciphertext: Array.from(new Uint8Array(encryptedBuffer))
  };
}

async function decryptMessage({ iv, ciphertext }) {
  const ivArray = new Uint8Array(iv);
  const ctArray = new Uint8Array(ciphertext);

  const decryptedBuffer = await window.crypto.subtle.decrypt(
    { name: "AES-GCM", iv: ivArray },
    aesKey,
    ctArray
  );
  return new TextDecoder().decode(decryptedBuffer);
}

//--------------------------------------
// SOCKET EVENTS
//--------------------------------------
socket.on("total-clients", (data) => {
  totalClients.innerText = `Total Clients Connected: ${data}`;
});

// Receiving a chat message
socket.on('chat-message', async (data) => {
  try {
    // data contains { name, dateTime, encrypted: { iv, ciphertext } }
    const decryptedText = await decryptMessage(data.encrypted);
    addMessageToUI(false, {
      message: decryptedText,
      name: data.name,
      dateTime: data.dateTime
    });
  } catch (err) {
    console.error("Decryption failed:", err);
  }
});

//--------------------------------------
// SEND MESSAGE
//--------------------------------------
const rateLimitedMessage = rateLimit(sendMessage, 10000, 3);
let callCount = 0;

messageForm.addEventListener('submit', (e) => {
  e.preventDefault();
  rateLimitedMessage();
});

async function sendMessage() {
  if (messageInput.value === '') return;

  const rawText = messageInput.value.trim();
  console.log("Sending raw text:", rawText);

  // Encrypt the user’s typed message
  const encryptedPayload = await encryptMessage(rawText);

  console.log("Encrypted payload:", encryptedPayload);

  // Build data with the encrypted message + user info
  const data = {
    name: username,
    encrypted: encryptedPayload,
    dateTime: new Date()
  };

  // Emit to the server
  socket.emit('message', data);

  // Display your own message in plaintext locally
  addMessageToUI(true, {
    message: rawText,
    name: username,
    dateTime: data.dateTime
  });

  messageInput.value = '';
}

//--------------------------------------
// UI & SCROLL
//--------------------------------------
function addMessageToUI(isOwnMessage, data) {
  clearFeedback();
  const element = `
    <li class="${isOwnMessage ? 'message-right' : 'message-left'}">
      <p class="message">
        ${data.message}
        <span>${data.name} * ${moment(data.dateTime).fromNow()}</span>
      </p>
    </li>
  `;
  messageContainer.innerHTML += element;
  scrollToBottom();
}

function scrollToBottom() {
  messageContainer.scrollTo(0, messageContainer.scrollHeight);
}

// Feedback events
messageInput.addEventListener('focus', () => {
  socket.emit('feedback', {
    feedback: `${username} is typing...`
  });
});

messageInput.addEventListener('keypress', () => {
  clearFeedback();
  socket.emit('feedback', {
    feedback: `${username} is typing...`
  });
});

messageInput.addEventListener('blur', () => {
  socket.emit('feedback', {
    feedback: ``
  });
});

socket.on('feedback', (data) => {
  clearFeedback();
  const element = `
    <li class="message-feedback">
      <p class="feedback" id="feedback">
        ${data.feedback}
      </p>
    </li>
  `;
  messageContainer.innerHTML += element;
});

function clearFeedback() {
  document.querySelectorAll('.message-feedback').forEach(element => {
    element.remove();
  });
}

//--------------------------------------
// RATE LIMITING LOGIC
//--------------------------------------
function rateLimit(func, delay, maxCalls) {
  let lastCall = 0;
  return () => {
    const now = new Date().getTime();
    if (now - lastCall >= delay || callCount < maxCalls) {
      callCount++;
      lastCall = now;
      return func();
    } else {
      callCount = 0;
      document.getElementById('message-form').setAttribute("disabled", "true");
      alert("Rate Limit Exceeded: Messaging disabled for 5 seconds");
      document.getElementById('message-input').setAttribute("placeholder", "Messaging disabled for 5 seconds");
      setTimeout(() => {
        document.getElementById('message-form').removeAttribute("disabled");
        document.getElementById('message-input').setAttribute("placeholder", "Type a message...");
      }, 5000);
    }
  };
}
