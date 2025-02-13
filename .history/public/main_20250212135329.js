const socket = io("http://localhost:4000")

const totalClients = document.getElementById('clients-total')

const messageContainer = document.getElementById('message-container')
const nameInput = document.getElementById('name-input')
const messageForm = document.getElementById('send-container')
const messageInput = document.getElementById('message-input')

messageForm.addEventListener('submit', (e) => {
  e.preventDefault()
  sendMessage()
})

socket.on("total-clients", (data) => {
  totalClients.innerText = `Total Clients Connected: ${data}`
})

function sendMessage() {
  console.log(messageInput.value)
  // const name = nameInput.value
  // const message = messageInput.value
  // if (message) {
  //   socket.emit('send-chat-message', { name, message })
  //   messageInput.value = ''
  //   appendMessage({ name, message })
  // }
}