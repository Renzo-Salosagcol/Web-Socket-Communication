const express = require('express')
const app = express()
const PORT = process.env.PORT || 4000
const server = app.listen(PORT, () => console.log(`Server running on port ${PORT}`))

app.use(express.static('public'))