const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL, // Render already has this
  ssl: { rejectUnauthorized: false }
});

if (process.env.NODE_ENV !== 'production') {
  require('dotenv').config();
}

const express = require('express');
const path = require('path');
const fs = require('fs');
// const https = require('https');
const http = require('http');
const app = express();
const PORT = process.env.PORT || 4000;

// ------------------------------------------------------------------

const bcrypt = require('bcrypt'); // Encryption
const passport = require('passport');
const flash = require('express-flash');
const session = require('express-session');
const methodOverride = require('method-override');

const initializePassport = require('./passport-config');

// =============== Rate Limiting ===============
const rateLimit = require('express-rate-limit');

// Brute Force Protection for Login
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // Max 5 attempts per IP
  message: "Too many login attempts, please try again after 15 minutes."
});
// =============================================

// ============== Account Lockout ==============
// Track failed attempts
const MAX_ATTEMPTS = 5;
const LOCKOUT_DURATION = 30 * 60 * 1000; // 30 minutes
// =============================================

const db = require('./db');

// Hash Emails
const crypto = require('crypto'); // For hashing emails securely

// Function to hash an email using SHA-256
function hashEmail(email) {
  return crypto.createHash('sha256').update(email.toLowerCase()).digest('hex');
}

initializePassport(
  passport,
  async email => {
    const hashedEmail = hashEmail(email);
    const result = await db.query('SELECT * FROM users WHERE email = $1', [hashedEmail]);
    return result.rows[0];
  },
  async id => {
    const result = await db.query('SELECT * FROM users WHERE id = $1', [id]);
    return result.rows[0];
  }
);

// Render does not work with https certificates
/*const server = https.createServer({
  key: fs.readFileSync(path.join(__dirname, 'certs/private.key')),
  cert: fs.readFileSync(path.join(__dirname, 'certs/certificate.crt'))
}, app);*/
const server = http.createServer(app);

const io = require('socket.io')(server, {
  pingInterval: 10000, // how often to ping/pong.
  pingTimeout: 30000 // time after which the connection is considered timed-out.
})

// REUQUIRES SECRET KEY FOR SESSION
/* const sessionMiddleware = session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
});*/

const sessionMiddleware = session({
  secret: process.env.SESSION_SECRET || 'fallback-secret',
  resave: false,
  saveUninitialized: false,
});


app.set('io', io)
app.set('view-engine', 'ejs')
app.use(express.urlencoded({ extended: false }))
app.use(flash())
app.use(sessionMiddleware)
app.use(passport.initialize())
app.use(passport.session())
app.use(methodOverride('_method'))
io.engine.use(sessionMiddleware);


// ------------------------------------------------------------------

// server.listen(PORT, LOCAL_IP, () => console.log(`Chat server running on https://${LOCAL_IP}:${PORT}`))
server.listen(PORT, () => console.log(`Chat server running on port ${PORT}`));


app.use(express.static(path.join(__dirname, 'public')));

let usersConnected = new Set()

const rooms = {
  general: {
    users: [],
    messages: []
  },
  general_2: {
    users: [],
    messages: []
  },
  general_3: {
    users: [],
    messages: []
  }
}

io.on('connection', onConnected);

function onConnected(socket) {
  const session = socket.request.session;
  console.log("Session Information: ", session)

  const user = {
    name: session.user,
    id: socket.id,
    rooms: Object.keys(rooms).map(String),
    currentRoom: Object.keys(rooms)[0].toString()
  }

  socket.join(user.currentRoom)

  rooms[user.currentRoom].users.push(socket.id)
  console.log(`User: ${user.name}, Socket ID: ${socket.id}`)

  console.log(user)
  usersConnected.add(user)

  io.emit('new-user', user)

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

    socket.emit('joined-room', user.name, user.currentRoom, getRoomMessagesDB(user.currentRoom))
  })

  socket.on('disconnect', () => {
    console.log('Disconnected: ', socket.id)
    usersConnected.delete(socket.id)
    io.emit("total-clients", usersConnected.size)

    user.rooms = user.rooms.filter(roomName => rooms[roomName].users.includes(socket.id))
  })

  socket.on('message', (room, data) => {
    if (room === user.currentRoom) {
      addMessageToDB(user.currentRoom, data)
      socket.to(user.currentRoom).emit('chat-message', { ...data, room: user.currentRoom })
    }
  })

  socket.on('feedback', (room, data) => {
    if (room === user.currentRoom) {
      socket.to(user.currentRoom).broadcast('feedback', data)
    }
  })

  // Database Functions for User Management
  // async function addUserToDB(user) {
  //   try {
  //     await pool.query(
  //       'INSERT INTO users (name, email, password) VALUES ($1, $2, $3)',

  // Database Functions for Message Logging
  async function getRoomMessagesDB(room) {
    try {
      const result = await pool.query('SELECT * FROM messages WHERE room = $1', [room]);
      return result.rows;
    } catch (err) {
      console.error('❌ Failed to retrieve messages from Neon DB:', err);
    }
  }
}

// Authentication
app.set('views', path.join(__dirname, 'views'));

app.get('/', checkAuthenticated, (req, res) => {
  res.render('index.ejs', { name: req.user.name, rooms: rooms });
});

// GET Login
app.get('/login', checkNotAuthenticated, (req, res) => {
  res.render('login.ejs');
});

// POST Login
app.post('/login', checkNotAuthenticated, async (req, res) => {
  const hashedEmail = hashEmail(req.body.email);

  try {
    const result = await db.query('SELECT * FROM users WHERE email = $1', [hashedEmail]);
    const user = result.rows[0];

    if (!user) {
      return res.redirect('/login');
    }

    const now = Date.now();

    // Check if account is currently locked
    if (user.lockuntil && Number(user.lockuntil) > now) {
      return res.status(403).send('Account locked. Try again later.');
    }

    const match = await bcrypt.compare(req.body.password, user.password);

    if (match) {
      // Successful login: reset failedAttempts and lockUntil
      await db.query(
        'UPDATE users SET failedattempts = 0, lockuntil = NULL WHERE id = $1',
        [user.id]
      );

      req.login(user, err => {
        if (err) return res.status(500).send('Login error');
        res.redirect('/');
      });

    } else {
      // Failed login: increment failedAttempts
      const attempts = (user.failedattempts || 0) + 1;
      const lockUntil = attempts >= MAX_ATTEMPTS ? now + LOCKOUT_DURATION : null;

      await db.query(
        'UPDATE users SET failedattempts = $1, lockuntil = $2 WHERE id = $3',
        [attempts, lockUntil, user.id]
      );

      if (lockUntil) {
        return res.status(403).send('Too many attempts. Account locked for 30 minutes.');
      }

      res.redirect('/login');
    }
  } catch (err) {
    console.error(err);
    res.redirect('/login');
  }
});


// GET Register
app.get('/register', checkNotAuthenticated, (req, res) => {
  res.render('register.ejs');
});

// POST Register
app.post('/register', checkNotAuthenticated, async (req, res) => {
  try {
    const hashedPassword = await bcrypt.hash(req.body.password, 10);
    const hashedEmail = hashEmail(req.body.email);

    await db.query(
      'INSERT INTO users (name, email, password) VALUES ($1, $2, $3)',
      [req.body.name, hashedEmail, hashedPassword]
    );

    res.redirect('/login');
  } catch (err) {
    console.error(err);
    res.redirect('/register');
  }
});

// Logout
app.delete('/logout', (req, res, next) => {
  req.logout((err) => {
    if (err) {
      return next(err); // Handle errors properly
    }
    res.redirect('/login');
  });
});

function checkAuthenticated(req, res, next) {
  if (req.isAuthenticated()) {
    req.session.user = req.user.name
    return next()
  }

  res.redirect('/login');
}

function checkNotAuthenticated(req, res, next) {
  if (req.isAuthenticated()) {
    req.session.user = req.user.name
    return res.redirect('/')
  }
  next()
}

// Database Functions
async function addUserToRoom() {
  try {
    const result = await pool.query('SELECT * FROM rooms');
    let rooms = result.rows.map(row => row.room_name);
    console.log(rooms)
    return rooms
  } catch (err) {
    console.error('Error loading rooms from database:', err);
  }
}

async function addMessageToDB(room, data) {
    app.post('/', async (req, res) => {
      const { name, message, dateTime } = data;
      const room = room;

      if (!name || !message || !dateTime) {
        return res.status(400).send('Missing required fields');
      }

      try {
        await db.query(
          'INSERT INTO messages (timeStamp, name, message, room) VALUES ($1, $2, $3, $4)',
          [data.dateTime, data.name, data.message, room]
        );
        console.log(`Message added to room: ${room}`);
        res.status(200).send('Message logged successfully');
      } catch (err) {
        console.error('❌ Failed to log message to Neon DB:', err);
        res.status(500).send('Failed to log message');
      }
    })
  }

app.listen(3000);