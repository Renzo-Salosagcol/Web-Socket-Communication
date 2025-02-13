const express = require('express')
const path = require('path')
const app = express()
const PORT = process.env.PORT || 4000
const server = app.listen(PORT, () => console.log(`Server running on port ${PORT}`))

const io = require('socket.io')(server)

app.use(express.static(path.join(__dirname, 'public')))

io.on('connection', (socket) => {
  console.log('New connection:', socket.id)
  socket.on('chat', (data) => {
    io.sockets.emit('chat', data)
  })
  socket.on('typing', (data) => {
    socket.broadcast.emit('typing', data)
  })
})