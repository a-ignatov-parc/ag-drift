const express = require('express')
const app = express()
const http = require('http').Server(app)
const io = require('socket.io')(http)
const path = require('path')
const ip = require('ip')
const TelegramBot = require('node-telegram-bot-api')

const Game = require('../common/Game.js')
const C = require('../common/constants.js')

app.use(express.static('public'))
app.get('/', function (req, res) {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'))
})

const map = [
  '111111111111111',
  '100001110000001',
  '101000000111001',
  '101111111111101',
  '101111111111001',
  '100000000000001',
  '111111111111111'
].map((row) => row.split('').map(Number))

const game = new Game(map, true)
let timerId
function tickAndSchedule () {
  game.tick()
  timerId = setTimeout(tickAndSchedule, Date.now() + C.TIME_STEP - game.lastTick)
}
tickAndSchedule()

io.on('connection', function (socket) {
  console.log(`${socket.client.id} connected`)

  socket.on('game:join', (debug) => game.onPlayerJoin(socket, debug))

  socket.on('player:events', (events, turnIndex) => {
    const shipId = game.getShipIdForSocket(socket)
    if (shipId == null) return // TO-DO: some kind of error sent to the client
    try {
      game.onPlayerEvents(shipId, events, turnIndex)
    } catch (e) {
      if (e instanceof C.InvalidTurnError) {
        console.log(`${socket.client.id} got lost`)
        game.bootstrapSocket(socket)
      }
    }
  })

  socket.on('player:lost', () => {
    console.log(`${socket.client.id} requesting bootstrap`)
    game.bootstrapSocket(socket)
  })

  socket.on('game:ping', () => socket.emit('game:pong', Date.now()))
})

const PORT = process.env.PORT || 3000
http.listen(PORT, function () {
  console.log(`listening on ${ip.address()}:${PORT}`)
})

const { TELEGRAM_TOKEN, TELEGRAM_CHAT_ID } = process.env
let bot
if (TELEGRAM_TOKEN != null) {
  bot = new TelegramBot(TELEGRAM_TOKEN)
  bot.sendMessage(TELEGRAM_CHAT_ID, 'server up! beep boop')
}

function beforeExit () {
  console.log('beforeExit')
  if (TELEGRAM_TOKEN == null) return
  console.log('sending reb00t notification via telegram')
  bot.sendMessage(TELEGRAM_CHAT_ID, 'reb00ting')
  .then(function () { console.log(arguments) })
  .catch(function () { console.log(arguments) })
}
process.on('beforeExit', beforeExit)

process.on('SIGTERM', () => {
  console.log('got SIGTERM')
  clearTimeout(timerId)
  http.close((err) => {
    if (err) throw err
    console.log('closed server')
    beforeExit()
  })
})
