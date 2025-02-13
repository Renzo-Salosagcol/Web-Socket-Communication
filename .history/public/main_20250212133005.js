const socket = io("http://localhost:4000")

socket.on("total-clients", (num-clients) => {
  document.getElementById("total-clients").innerText = num-clients
})