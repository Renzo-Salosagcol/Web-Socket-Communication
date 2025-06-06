const socket = io("wss://192.168.1.23:4000") // Replace with your local IP address

const totalClients = document.getElementById('clients-total')

const messageContainer = document.getElementById('message-container')
//const nameInput = document.getElementById('name-input')
const username = document.getElementById('name-input').value;
const messageForm = document.getElementById('message-form')
const messageInput = document.getElementById('message-input')
const roomButtons = document.getElementById('room-buttons')
let rooms = []
currentRoom = 'general'

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
  if (messageInput.value === '') return
  console.log(messageInput.value)
  
  const data = {
    //name: nameInput.value,
    name: username,
    message: messageInput.value,
    dateTime: new Date()
  }

  socket.emit('message', currentRoom, username, data)
  messageInput.value = ''
}

socket.on('chat-message', (isOwnMessage, data) => {
  addMessageToUI(isOwnMessage, data, false)
})

function addMessageToUI(isOwnMessage, data, messageHistory) {
  clearFeedback()
let element = ``
  if (!messageHistory) {
    element = `
      <li class="${isOwnMessage ? 'message-right' : 'message-left'}">
        <p class="message">
          ${data.message}
          <span>${data.name} * ${moment(data.dateTime).fromNow()}</span>
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

  messageContainer.innerHTML += element
  scrollToBottom()
}

function scrollToBottom() {
  messageContainer.scrollTo(0, messageContainer.scrollHeight)
}

messageInput.addEventListener('focus', (e) => {
  socket.emit('feedback', currentRoom, {
    feedback: `${nameInput.value} is typing...`
  })
})

messageInput.addEventListener('keypress', (e) => { 
  clearFeedback()
  socket.emit('feedback', currentRoom, {
    feedback: `${nameInput.value} is typing...`
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
socket.on('joined-room', (userName, messages) => {
  messages.forEach((message) => {
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
