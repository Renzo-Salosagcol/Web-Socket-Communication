const socket = io("http://localhost:4000")

socket.on("total-clients", (numClients) => {
  document.getElementById("total-clients").innerText = numClients
})