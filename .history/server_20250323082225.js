if (process.env.NODE_ENV !== 'production') {
  require('dotenv').config()
}

const express = require('express')
const path = require('path')
const fs = require('fs')
const https = require('https')
const app = express()
const PORT = process.env.PORT || 4000
const LOCAL_IP = '192.168.1.23' // Replace with your local IP address

// ------------------------------------------------------------------

const bcrypt = require('bcrypt') // Encryption
const passport = require('passport')
const flash = require('express-flash')
const session = require('express-session')
const methodOverride = require('method-override')

const initializePassport = require('./passport-config')

initializePassport(
  passport,
  email => users.find(user => user.email === email),
  id => users.find(user => user.id === id)
)

const users = [] // User Storage NO Database

const server = https.createServer({
  key: fs.readFileSync(path.join(__dirname, 'certs/private.key')),
  cert: fs.readFileSync(path.join(__dirname, 'certs/certificate.crt'))
}, app)

app.set('view engine', 'ejs')
app.use(express.urlencoded({ extended: false}))
app.use(flash())
app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false
}))
app.use(passport.initialize())
app.use(passport.session())
app.use(methodOverride('_method'))


// ------------------------------------------------------------------

const io = require('socket.io')(server)

server.listen(PORT, LOCAL_IP, () => console.log(`Chat server running on https://${LOCAL_IP}:${PORT}`))

app.use(express.static(path.join(__dirname, 'public')))

let socketsConnected = new Set()

// Rooms
const rooms = {
  general: [],
  general2: []
}

const userSockets = [];

io.on('connection', onConnected);

function onConnected(socket) {
  console.log(socket.id)
  socketsConnected.add(socket.id)

  io.emit("total-clients", socketsConnected.size)

  socket.on('disconnect', () => {
    console.log('Disconnected: ', socket.id)
    socketsConnected.delete(socket.id)
    io.emit("total-clients", socketsConnected.size)
  })

  socket.on('message', (room, data) => {
    console.log(data)
    socket.to(room).broadcast.emit('chat-message', data)
    rooms[room].push(data)
  })

  socket.on('feedback', (room, data) => {
    socket.to(room).broadcast.emit('feedback', data)
  })
}

function createConnectedUserRooms(socketId) {
  const connectedUsers = Array.from(socketsConnected)

  connectedUsers.forEach(userSocketId => {
    if (userSocketId !== socketId) {
      const roomNumber = [socketId, userSocketId].sort().join('-')
      rooms.push(room)
    }
  })
}

function disconnectRooms(socketId) {
  rooms.forEach(roomNumber => {
    if (roomNumber.has(socketId)) {
      rooms.remove(roomNumber)
    }
  })
}

app.set('views', path.join(__dirname, 'views'))

// Authentication

app.get('/', checkAuthenticated, (req, res) => {
  res.render('index.ejs', { name : req.user.name, rooms: rooms})
})

// GET Login
app.get('/login', checkNotAuthenticated, (req, res) => {
  res.render('login.ejs')
})

// POST Login
app.post('/login', checkNotAuthenticated, passport.authenticate('local', {
  successRedirect: '/',
  failureRedirect: '/login',
  failureFlash: true
}))

// GET Register
app.get('/register', checkNotAuthenticated, (req, res) => {
  res.render('register.ejs')
})

// POST Register
app.post('/register', checkNotAuthenticated, async (req, res) =>{
  try {
    const hashedPassword = await bcrypt.hash(req.body.password,10)
    users.push({
      id: Date.now().toString(),
      name: req.body.name,
      email: req.body.email,
      password: hashedPassword
    })
    res.redirect('/login')
  }catch{
    res.redirect('/register')
  }
})

// Logout
app.delete('/logout', (req, res, next) => {
  req.logout((err) => {
    if (err) {
      return next(err) // Handle errors properly
    }
    res.redirect('/login')
  })
})


function checkAuthenticated(req, res, next){
  if (req.isAuthenticated()) {
    return next()
  }

  res.redirect('/login')
}

function checkNotAuthenticated(req,res,next){
   if (req.isAuthenticated()) {
    return res.redirect('/')
   }
   next()
}

// Rooms

app.get('/:room', checkAuthenticated, (req, res, socket) => {
  res.render('room', { name: req.user.name, roomName: req.params.room, rooms: rooms })
});

app.listen(3000)