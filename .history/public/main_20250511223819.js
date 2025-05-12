const SECRET_KEY = "mySuperSecretKey123";

const socket = io("wss://yap-sessions.onrender.com/")

const totalClients = document.getElementById('clients-total')

const messageContainer = document.getElementById('message-container')
//const nameInput = document.getElementById('name-input')
const username = document.getElementById('name-input').value;
const nameInput = username
const messageForm = document.getElementById('message-form')
const messageInput = document.getElementById('message-input')

const roomButtons = document.getElementById('room-buttons')
let rooms = []
currentRoom = 'general'
const emojiButton = document.getElementById('emoji-button');
const emojiContainer = document.getElementById('emoji-container');
const picker = document.createElement('emoji-picker');
emojiContainer.appendChild(picker);


// Add the click listener ONCE
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
socket.on("total-clients", (data) => {
  totalClients.innerText = `Total Clients Connected: ${data}`
})

const rateLimitedMessage = rateLimit(sendMessage, 10000, 3)
let callCount = 0

messageForm.addEventListener('submit', (e) => {
  e.preventDefault()
  rateLimitedMessage()
})

function sendMessage() {
  if (messageInput.value === '') return;

  const formattedMessage = formatMessage(messageInput.value); // Format text before sending
  const encryptedMessage = CryptoJS.AES.encrypt(formattedMessage, SECRET_KEY).toString(); // Encrypt after formatting

  const data = {
    name: username,
    message: encryptedMessage, // Use the encrypted text
    dateTime: new Date()
  };

  console.log("Sending message:", data);

  socket.emit('message', currentRoom, data)
  try {
    const decrypted = CryptoJS.AES.decrypt(data.message, SECRET_KEY).toString(CryptoJS.enc.Utf8);
    addMessageToUI(true, { ...data, message: decrypted }, false);
  } catch (err) {
    console.error("Decryption failed in sendMessage():", err);
    addMessageToUI(true, data, false); // fallback to show encrypted if needed
  }
  messageInput.value = ''
}

socket.on('self-chat-message', (data) => {
  if (data.room === currentRoom) {
    data.message = CryptoJS.AES.decrypt(data.message, SECRET_KEY).toString(CryptoJS.enc.Utf8);
    addMessageToUI(true, data, false)
  }
})

socket.on('chat-message', (data) => {
  if (data.room === currentRoom) {
    data.message = CryptoJS.AES.decrypt(data.message, SECRET_KEY).toString(CryptoJS.enc.Utf8);
    addMessageToUI(false, data, false)
  }
})

function addMessageToUI(isOwnMessage, data, messageHistory) {
  clearFeedback()
  let element = ``
  if (!messageHistory) {
    // element = `
    //   <li class="${isOwnMessage ? 'message-right' : 'message-left'}">
    //     <p class="message">
    //       ${data.message}
    //       <span>${data.name} * ${moment(data.dateTime).fromNow()}</span>
    //     </p>
    //   </li>
    // `
    element = `
      <li class="${isOwnMessage ? 'message-right' : 'message-left'}">
        <p class="message">
          <strong>${data.name}</strong><br/>
          ${data.message}
          <span>${moment(data.dateTime).fromNow()}</span>
        </p>
      </li>
    `
  } else {
    element = `
      <li class="${isOwnMessage ? 'message-right' : 'message-left'}">
        <p class="message">
          ${data.message}
          <span>${data.name} * ${data.dateTime}</span>
        </p>
      </li>
    `
  }

  messageContainer.insertAdjacentHTML('beforeend', element);  // Correctly renders formatted HTML
  scrollToBottom();
}

function scrollToBottom() {
  messageContainer.scrollTo(0, messageContainer.scrollHeight)
}

messageInput.addEventListener('focus', (e) => {
  socket.emit('feedback', currentRoom, {
    feedback: `${username} is typing...`
  })
})

messageInput.addEventListener('keypress', (e) => {
  clearFeedback()
  socket.emit('feedback', currentRoom, {
    feedback: `${username} is typing...`
  })
})

messageInput.addEventListener('blur', (e) => {
  socket.emit('feedback', currentRoom, {
    feedback: ``
  })
})

socket.on('feedback', (data) => {
  clearFeedback()
  const element = `
    <li class="message-feedback">
      <p class="feedback" id="feedback">
        ${data.feedback}
      </p>
    </li>`

  messageContainer.innerHTML += element
})

function clearFeedback() {
  document.querySelectorAll('.message-feedback').forEach(element => {
    element.remove()
  })
}

// Function to format text with basic Markdown-like syntax
function formatMessage(text) {
  // Escape HTML tags before formatting
  text = text.replace(/<script/gi, '&lt;script').replace(/<\/script>/gi, '&lt;/script&gt;');

  // Format text using Markdown-like syntax
  text = text.replace(/\*\*(.*?)\*\*/g, '<b>$1</b>');    // **bold**
  text = text.replace(/\*(.*?)\*/g, '<i>$1</i>');         // *italic*
  text = text.replace(/__(.*?)__/g, '<u>$1</u>');         // __underline__
  text = text.replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2" target="_blank">$1</a>'); // [text](link)

  return text;
}

// Rate Limiting
function rateLimit(func, delay, maxCalls) {
  let lastCall = 0;
  return () => {
    const now = new Date().getTime();
    if (now - lastCall >= delay || callCount < maxCalls) {
      callCount++;
      lastCall = now;
      return func();
    } else {
      // Surpassed Rate Limit
      callCount = 0;
      document.getElementById('message-form').setAttribute("disabled", "true")
      alert("Rate Limit Exceeded: Messaging disabled for 5 seconds")
      document.getElementById('message-input').setAttribute("placeholder", "Messaging disabled for 5 seconds")
      setTimeout(() => {
        document.getElementById('message-form').removeAttribute("disabled")
        document.getElementById('message-input').setAttribute("placeholder", "Type a message...")
      }, 5000)
    }
  };
}

// List Joinable Rooms
socket.on('new-user', user => {
  roomButtons.innerHTML = '';

  user.rooms.forEach(room => {
    const roomButton = document.createElement('button')
    roomButton.innerText = room
    roomButtons.appendChild(roomButton)
  })
})

// Joining Rooms
socket.on('joined-room', (userName, room, messages) => {
  currentRoom = room
  messages.forEach((message) => {
    message.message = CryptoJS.AES.decrypt(message.message, SECRET_KEY).toString(CryptoJS.enc.Utf8);

    if (message.name === userName) {
      addMessageToUI(true, message, true)
    } else {
      addMessageToUI(false, message, true)
    }
  })

  rooms = user.rooms;
})

// Room Buttons
roomButtons.addEventListener('click', (e) => {
  if (e.target.tagName === 'BUTTON') {
    const roomName = e.target.innerText;
    clearMessages()
    socket.emit('join-room', roomName);
  }
});

function clearMessages() {
  messageContainer.innerHTML = '';
}

const uploadButton = document.getElementById('upload-button');
const fileInput = document.getElementById('file-input');

uploadButton.addEventListener('click', () => {
  const file = fileInput.files[0];
  if (!file) return alert("Please select a file first.");

  const formData = new FormData();
  formData.append('file', file);

  fetch('/upload', {
    method: 'POST',
    body: formData
  })
    .then(res => res.json())
    .then(data => {

      const fileMessage = `<a href="/${data.filePath}" target="_blank">${file.name}</a>`;
      messageInput.value = fileMessage;
      document.getElementById('message-form').dispatchEvent(new Event('submit'));
    })
    .catch(err => {
      console.error('Upload failed:', err);
      alert("File upload failed.");
    });
});
