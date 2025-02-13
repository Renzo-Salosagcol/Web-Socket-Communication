const socket = io("http://localhost:4000")

const totalClients = document.getElementById("clients-total")

socket.on("total-clients", (data) => {
  totalClients.innerText = `Total Clients Connected: ${data}`
})