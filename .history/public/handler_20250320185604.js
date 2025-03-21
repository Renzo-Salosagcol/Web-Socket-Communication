import 'emoji-picker-element';


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