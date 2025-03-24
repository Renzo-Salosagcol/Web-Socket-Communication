const socket = io("wss://192.168.12.135:4000") // Replace with your local IP address

const totalClients = document.getElementById('clients-total')

const messageContainer = document.getElementById('message-container')
//const nameInput = document.getElementById('name-input')
const username = document.getElementById('name-input').value;
const messageForm = document.getElementById('message-form')
const messageInput = document.getElementById('message-input')
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

  const data = {
    name: username,
    message: formattedMessage, // Use the formatted text
    dateTime: new Date()
  };

  socket.emit('message', data);
  addMessageToUI(true, data);
  messageInput.value = '';
}


socket.on('chat-message', (data) => {
  // console.log(data)
  addMessageToUI(false, data)
})

function addMessageToUI(isOwnMessage, data) {
  clearFeedback();
  const element = `
    <li class="${isOwnMessage ? 'message-right' : 'message-left'}">
      <p class="message">
        ${data.message}
        <span>${data.name} • ${moment(data.dateTime).fromNow()}</span>
      </p>
    </li>
  `;

  messageContainer.insertAdjacentHTML('beforeend', element);  // Correctly renders formatted HTML
  scrollToBottom();
}



function scrollToBottom() {
  messageContainer.scrollTo(0, messageContainer.scrollHeight)
}

messageInput.addEventListener('focus', (e) => {
  socket.emit('feedback', {
    feedback: `${nameInput.value} is typing...`
  })
})

messageInput.addEventListener('keypress', (e) => {
  clearFeedback()
  socket.emit('feedback', {
    feedback: `${nameInput.value} is typing...`
  })
})

messageInput.addEventListener('blur', (e) => {
  socket.emit('feedback', {
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
  text = text.replace(/</g, '&lt;').replace(/>/g, '&gt;');

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