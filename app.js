config = require('./config')
db = null

const path = require('path')
const bodyParser = require('body-parser')
const http = require('http')
const express = require('express')
const app = express()
const server = http.createServer(app)

// Allow CORS
const cors = require('cors')
app.use(cors())

// API
const API = require('./API')
Helpers = API.Helpers

// view engine setup
app.set('views', path.join(__dirname, 'views'))
app.set('view engine', 'jade')
app.use(bodyParser.urlencoded({ extended: true }))
app.use(bodyParser.json())

// Check for required fields for each endpoint
app.use((req, res, next) => {
    let required = Helpers.checkRequiredFields(req.url, req.body)
    if(required) {
        return res.send({
            error: "Missing required fields: " + required.join(', ')
        })
    }

    next()
})

// Connect to database
Helpers.connectToDb()

// Start watching for addresses
Helpers.startInvoiceWatchCron()

// Define routes
// User registration and login
app.post('/api/signup', (req, res) => API.User.register(req, res))
app.post('/api/login', (req, res) => API.User.login(req, res))

// Invoice Creation
app.post('/api/invoice', (req, res) => API.Invoice.create(req, res))
// Invoice Polling
app.get('/api/invoice/status/:id', (req, res) => API.Invoice.getStatus(req, res))
// Invoice Get with CJ Price
app.get('/api/invoice/:id', (req, res) => API.Invoice.get(req, res))

// Withdraw Endpoint
app.post('/api/withdraw', (req, res) => API.Withdraw.initiate(req, res))

// Start he server
const port = process.env.PORT || 1235
server.listen(port)
console.log(`server listening on port ${port}`)