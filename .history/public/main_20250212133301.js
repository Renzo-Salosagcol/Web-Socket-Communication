const socket = io("http://localhost:4000")

socket.on("total-clients", (data) => {
  console.log(data)
})