const socket = io("http://localhost:4000")

socket.on("total-clients", (num-clients) => {
  console.log(num-clients)
})