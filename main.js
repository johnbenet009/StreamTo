const path = require('path')
const express = require('express')
const http = require('http')
const WebSocket = require('ws')
const deviceManager = require('./backend/deviceManager')
const ffmpegController = require('./backend/ffmpegController')
const configManager = require('./backend/configManager')

const app = express()
const server = http.createServer(app)
const wss = new WebSocket.Server({ server })

app.use(express.static(path.join(__dirname, 'frontend')))
app.use(express.json())

app.get('/api/devices', async (req, res) => {
  try { res.json(await deviceManager.listDevices()) }
  catch (e) { res.status(500).json({ error: e.message }) }
})

app.get('/api/config', (req, res) => res.json(configManager.read()))
app.post('/api/config', (req, res) => { configManager.write(req.body); res.json({ ok: true }) })

wss.on('connection', (ws) => {
  ws.on('message', async (msg) => {
    let data; try { data = JSON.parse(msg) } catch { return }
    if (data.action === 'start') {
      try {
        ws.send(JSON.stringify({ type: 'status', payload: 'starting' }))
        const proc = await ffmpegController.startStream(data)
        ffmpegController.hookLogs(
          proc, 
          line => ws.send(JSON.stringify({ type: 'log', payload: line })),
          stats => ws.send(JSON.stringify({ type: 'stats', payload: stats }))
        )
        ffmpegController.onExit((code, signal, errorMessage) => {
          if (code !== 0 && errorMessage) {
            ws.send(JSON.stringify({ type: 'error', payload: errorMessage }))
          }
          ws.send(JSON.stringify({ type: 'status', payload: 'stopped' }))
        })
        ws.send(JSON.stringify({ type: 'status', payload: 'streaming' }))
      } catch (e) { 
        ws.send(JSON.stringify({ type: 'error', payload: e.message }))
        ws.send(JSON.stringify({ type: 'status', payload: 'idle' }))
      }
    }
    if (data.action === 'stop') { 
      ffmpegController.stopStream()
      ws.send(JSON.stringify({ type: 'status', payload: 'stopping' }))
    }
  })
  ws.send(JSON.stringify({ type: 'status', payload: ffmpegController.isStreaming() ? 'streaming' : 'idle' }))
})

const PORT = process.env.PORT || 8082
server.listen(PORT, () => {
  console.log('🚀 StreamTo Server running at http://localhost:' + PORT)
  console.log('📺 Multi-RTMP Streaming Application')
  console.log('👨‍💻 Developed by: Positive Developer')
  console.log('🔗 GitHub: https://github.com/johnbenet009')
  console.log('📱 WhatsApp: +234 901 453 2386')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
})
