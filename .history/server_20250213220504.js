const express = require('express')
const path = require('path')
const fs = require('fs')
const https = require('https')
const app = express()
const PORT = process.env.PORT || 4000

const server = https.createServer({
  key: fs.readFileSync('path/to/your/private.key'),
  cert: fs.readFileSync('path/to/your/certificate.crt')
}, app)

const io = require('socket.io')(server)

server.listen(PORT, () => console.log(`Chat server running on port ${PORT}`))

app.use(express.static(path.join(__dirname, 'public')))

let socketsConnected = new Set()

io.on('connection', onConnected)

function onConnected(socket) {
  console.log(socket.id)
  socketsConnected.add(socket.id)

  io.emit("total-clients", socketsConnected.size)

  socket.on('disconnect', () => {
    console.log('Disconnected: ', socket.id)
    socketsConnected.delete(socket.id)
    io.emit("total-clients", socketsConnected.size)
  })

  socket.on('message', (data) => {
    console.log(data)
    socket.broadcast.emit('chat-message', data)
  })

  socket.on('feedback', (data) => {
    socket.broadcast.emit('feedback', data)
  })
}