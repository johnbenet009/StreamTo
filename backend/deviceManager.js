const { exec } = require('child_process')
const path = require('path')
const fs = require('fs')

function getFFmpegPath() {
  // Try bundled FFmpeg first
  const bundledFFmpeg = path.join(__dirname, '..', 'ffmpeg', 'ffmpeg.exe')
  if (fs.existsSync(bundledFFmpeg)) {
    return bundledFFmpeg
  }
  
  // Fallback to system FFmpeg
  return 'ffmpeg'
}

function parseDevices(ffout) {
  const lines = ffout.split(/\r?\n/)
  const video = [], audio = []
  
  for (const line of lines) {
    const trimmed = line.trim()
    
    // Look for device lines that contain quoted device names
    // Format: [dshow @ address] "Device Name" (video) or (audio)
    const deviceMatch = trimmed.match(/^\[dshow[^\]]*\]\s+"([^"]+)"\s+\((video|audio|none)\)/)
    
    if (deviceMatch) {
      const deviceName = deviceMatch[1]
      const deviceType = deviceMatch[2]
      
      if (deviceType === 'video' && !video.includes(deviceName)) {
        video.push(deviceName)
      } else if (deviceType === 'audio' && !audio.includes(deviceName)) {
        audio.push(deviceName)
      }
    }
  }
  
  console.log('Parsed devices:', { video: video.length, audio: audio.length })
  return { video, audio }
}

function listDevices() {
  return new Promise((resolve, reject) => {
    const ffmpegPath = getFFmpegPath()
    const isUsingBundled = ffmpegPath.includes('ffmpeg.exe')
    
    // Check if ffmpeg is available
    exec(`"${ffmpegPath}" -version`, { windowsHide: true }, (versionErr) => {
      if (versionErr) {
        // FFmpeg not found, return mock devices for testing
        console.log(`FFmpeg not found at ${ffmpegPath}, returning mock devices`)
        resolve({
          video: ['Integrated Camera', 'USB Camera', 'Virtual Camera'],
          audio: ['Microphone (Built-in)', 'USB Microphone', 'Line In']
        })
        return
      }

      console.log(`Using FFmpeg: ${isUsingBundled ? 'Bundled' : 'System'} (${ffmpegPath})`)

      // FFmpeg is available, try to list real devices
      exec(`"${ffmpegPath}" -list_devices true -f dshow -i dummy`, { windowsHide: true }, (err, out, errout) => {
        const txt = out + '\n' + errout
        try { 
          const devices = parseDevices(txt)
          // If no devices found, provide fallback
          if (devices.video.length === 0 && devices.audio.length === 0) {
            resolve({
              video: ['Default Camera'],
              audio: ['Default Microphone']
            })
          } else {
            resolve(devices)
          }
        } catch (e) { 
          console.error('Device parsing error:', e)
          // Fallback devices
          resolve({
            video: ['Default Camera'],
            audio: ['Default Microphone']
          })
        }
      })
    })
  })
}

module.exports = { listDevices }
