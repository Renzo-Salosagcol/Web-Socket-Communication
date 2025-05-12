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

const io = require('socket.io')(server)

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
  general: { users: [], messages: [] },
  general2: { users: [], messages: [] },
  general3: { users: [], messages: [] },
}

io.on('connection', onConnected);

function onConnected(socket) {
  const session = socket.request.session;

  const user = {
    name: session.user,
    id: socket.id,
    rooms: Object.keys(rooms).map(String),
    currentRoom: 'general'
  }

  socket.join('general')
  rooms['general'].users.push(socket.id)
  console.log(`User: ${user.name}, Socket ID: ${socket.id}`)

  session.user = user

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

    socket.emit('joined-room', user.name, user.currentRoom, rooms[user.currentRoom].messages)
  })

  socket.on('disconnect', () => {
    console.log('Disconnected: ', socket.id)
    usersConnected.delete(socket.id)
    io.emit("total-clients", usersConnected.size)

    user.rooms = user.rooms.filter(roomName => rooms[roomName].users.includes(socket.id))
  })

  socket.on('message', (room, data) => {
    if (room === user.currentRoom) {
      console.log(data)
      rooms[user.currentRoom].messages.push(data)
      socket.to(user.currentRoom).emit('chat-message', { ...data, room: user.currentRoom })
      logMessage(user.currentRoom, data); // Log the message
      console.log(rooms[user.currentRoom].messages)
    }
  })

  socket.on('feedback', (room, data) => {
    if (room === user.currentRoom) {
      io.to(user.currentRoom).emit('feedback', data)
    }
  })

  // Function to verify and update rooms
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

  // Function to log messages to a file
  async function logMessage(room, data) {
  try {
    await pool.query(
      'INSERT INTO messages (room, name, message, timestamp) VALUES ($1, $2, $3, $4)',
      [room, data.name, data.message, data.dateTime]
    );
  } catch (err) {
    console.error('❌ Failed to log message to Neon DB:', err);
  }}
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

app.listen(3000);