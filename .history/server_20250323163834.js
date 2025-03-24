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

const io = require('socket.io')(server)

const sessionMiddleware = session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
});

app.set('io', io)
app.set('view-engine', 'ejs')
app.use(express.urlencoded({ extended: false}))
app.use(flash())
app.use(sessionMiddleware)
app.use(passport.initialize())
app.use(passport.session())
app.use(methodOverride('_method'))
io.engine.use(sessionMiddleware);


// ------------------------------------------------------------------

server.listen(PORT, LOCAL_IP, () => console.log(`Chat server running on https://${LOCAL_IP}:${PORT}`))

app.use(express.static(path.join(__dirname, 'public')))

let usersConnected = new Set()

const rooms = {
  general: { users: [], messages: [] },
  general2: { users: [], messages: [] },
}

io.on('connection', onConnected)

function onConnected(socket) {
  const session = socket.request.session;

  const user = {
    name: session.user,
    id: socket.id,
    rooms: ['general'],
    currentRoom: 'general'
  }
    
  socket.join('general')
  rooms['general'].users.push(socket.id)
  console.log(`User: ${user.name}, Socket ID: ${socket.id}`)

  verifyRooms()
  session.user = user

  console.log(user)
  usersConnected.add(user)

  socket.on("join-room", (roomName, cb) => {
    rooms[user.currentRoom].users = rooms[user.currentRoom].users.filter((user) => user !== socket.id)
    socket.join(roomName)
    user.currentRoom = roomName

    if (!user.rooms.includes(roomName)) {
      user.rooms.push(roomName)
    }

    if (!rooms[roomName].users.includes(socket.id)) {
      rooms[roomName].users.push(socket.id)
    }
  })

  socket.on('disconnect', () => {
    console.log('Disconnected: ', socket.id)
    usersConnected.delete(socket.id)
    io.emit("total-clients", usersConnected.size)
  })

  socket.on('message', (data) => {
    console.log(data)
    rooms[user.currentRoom].messages.push(data)
    socket.broadcast.to(user.currentRoom).emit('chat-message', data)
  })

  socket.on('feedback', (data) => {
    socket.broadcast.to(user.currentRoom).emit('feedback', data)
  })

  function verifyRooms() {
    Object.keys(rooms).forEach(roomName => {
      const room = rooms[roomName]
      if (room.users.includes(socket.id)) {
        room.users = room.users.filter((user) => user !== socket.id)
      }
  
      if (roomName.includes(socket.id)) {
        user.rooms.push(roomName)
      }
    })
  
    if (usersConnected.size > 1) {
      usersConnected.forEach((user) => {
        if (user.id !== socket.id) {
          const privateRoom = [user.id, socket.id].sort().join('-')
          rooms[privateRoom] = { users: [user.id, socket.id], messages: [] }
  
          if (!user.rooms.includes(privateRoom)) {
            user.rooms.push(privateRoom)
          }
        }
      })
    }
  }
}

// Authentication

app.set('views', path.join(__dirname, 'views'))

app.get('/', checkAuthenticated, (req, res) => {
  res.render('index.ejs', { name: req.user.name, rooms: rooms });
});

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
    req.session.user = req.user.name
    return next()
  }

  res.redirect('/login')
}

function checkNotAuthenticated(req,res,next){
   if (req.isAuthenticated()) {
    req.session.user = req.user.name
    return res.redirect('/')
   }
   next()
}

app.listen(3000)