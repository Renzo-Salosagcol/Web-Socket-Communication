import 'emoji-picker-element';

const messageContainer = document.getElementById('message-container')
const username = document.getElementById('name-input').value;
const messageForm = document.getElementById('message-form')
const messageInput = document.getElementById('message-input')

// Emoji Picker
document.getElementById('emoji-button').addEventListener('click', function() {
  try {
    const emojiPicker = document.querySelector('emoji-picker');
    document.body.removeChild(emojiPicker);
  } catch {
    const picker = new Picker({emojiVersion: 15.0});
    messageForm.appendChild(picker);
  }
});

document.querySelector('emoji-picker').addEventListener('emoji-click', event => 
  console.log(event.detail));