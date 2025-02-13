const socket = io("http://localhost:4000")

const totalClients = document.getElementById('clients-total')

const messageContainer = document.getElementById('message-container')
const nameInput = document.getElementById('name-input')
const messageForm = document.getElementById('message-form')
const messageInput = document.getElementById('message-input')

socket.on("total-clients", (data) => {
  totalClients.innerText = `Total Clients Connected: ${data}`
})

messageForm.addEventListener('submit', (e) => {
  e.preventDefault()
  sendMessage()
})

function sendMessage() {
  console.log(messageInput.value)
  
  const data = {
    name: nameInput.value,
    message: messageInput.value,
    dateTime: new Date()
  }

  messageInput.value = ''

  socket.emit('message', data)
}

socket.on('chat-message', (data) => {
  console.log(data) 
})

function addMessageToUI(isOwnMessage, data) {
  const element = `
    <li class="${isOwnMessage ? 'message-right' : 'message-left'}">
      <p>${data.name}</p>
      <p>${data.message}</p>
      <p>${data.dateTime}</p>
    </li>
  `
}