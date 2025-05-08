// db.js
const mysql = require('mysql2');

const pool = mysql.createPool({
    host: 'sql109.infinity.com',      // replace with your actual host
    user: 'if0_38874660',         // replace with your InfinityFree username
    password: 'vF6Q11hUHg5jHbF',      // replace with your InfinityFree password
    database: 'if0_38874660_yap_data'   // replace with your database name
});

module.exports = pool.promise();
