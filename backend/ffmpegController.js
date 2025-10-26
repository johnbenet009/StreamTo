const { spawn, exec } = require('child_process')
const path = require('path')
const fs = require('fs')

let currentProc = null; let exitHandlers = []

function buildTee(rtmps){ 
  // Correct tee syntax: [f=format:onfail=ignore]url1|[f=format:onfail=ignore]url2
  return rtmps.map(u => `[f=flv:onfail=ignore]${u}`).join('|')
}

function getFFmpegPath() {
  // Try bundled FFmpeg first
  const bundledFFmpeg = path.join(__dirname, '..', 'ffmpeg', 'ffmpeg.exe')
  if (fs.existsSync(bundledFFmpeg)) {
    return bundledFFmpeg
  }
  
  // Fallback to system FFmpeg
  return 'ffmpeg'
}

function checkFFmpeg() {
  return new Promise((resolve) => {
    const ffmpegPath = getFFmpegPath()
    exec(`"${ffmpegPath}" -version`, { windowsHide: true }, (err) => {
      resolve(!err)
    })
  })
}

function startStream(o){
  if(currentProc) throw new Error('Stream already running')
  const {video,audio,rtmps} = o
  if(!video||!audio||!rtmps.length) throw new Error('Missing video, audio, or RTMP destinations')
  
  return new Promise(async (resolve, reject) => {
    // Check if FFmpeg is available
    const ffmpegAvailable = await checkFFmpeg()
    if (!ffmpegAvailable) {
      reject(new Error('FFmpeg not found. Please install FFmpeg and add it to your PATH.'))
      return
    }

    const ffmpegPath = getFFmpegPath()
    
    // Simplified approach - use tee for multiple outputs
    const inputString = `video=${video}:audio=${audio}`
    
    let args
    if (rtmps.length === 1) {
      // Single destination - simple and reliable
      args = [
        '-y',
        '-f', 'dshow',
        '-rtbufsize', '100M',
        '-i', inputString,
        '-c:v', 'libx264',
        '-preset', 'ultrafast',
        '-tune', 'zerolatency',
        '-pix_fmt', 'yuv420p',
        '-b:v', '800k',
        '-maxrate', '800k',
        '-bufsize', '1600k',
        '-g', '50',
        '-r', '25',
        '-c:a', 'aac',
        '-b:a', '128k',
        '-f', 'flv',
        rtmps[0]
      ]
    } else {
      // Multiple destinations - use tee muxer with proper syntax
      const teeOutput = rtmps.map(url => `[f=flv:onfail=ignore]${url}`).join('|')
      args = [
        '-y',
        '-f', 'dshow',
        '-rtbufsize', '200M',
        '-i', inputString,
        '-c:v', 'libx264',
        '-preset', 'ultrafast',
        '-tune', 'zerolatency',
        '-pix_fmt', 'yuv420p',
        '-b:v', '600k',
        '-maxrate', '600k',
        '-bufsize', '1200k',
        '-g', '50',
        '-r', '20',
        '-c:a', 'aac',
        '-b:a', '96k',
        '-f', 'tee',
        '-map', '0:v',
        '-map', '0:a',
        teeOutput
      ]
    }
    
    console.log('🚀 Starting FFmpeg with command:')
    console.log(`${ffmpegPath} ${args.join(' ')}`)
    console.log('📹 Video device:', JSON.stringify(video))
    console.log('🎤 Audio device:', JSON.stringify(audio))
    console.log('📡 RTMP URLs:', rtmps.length, 'destinations')
    console.log('🔧 Input string:', JSON.stringify(inputString))
    
    try {
      const p = spawn(ffmpegPath, args, {windowsHide: true})
      currentProc = p
      
      let errorOutput = ''
      
      // Capture stderr for error analysis
      p.stderr.on('data', (data) => {
        errorOutput += data.toString()
      })
      
      p.on('error', (err) => {
        console.error('❌ FFmpeg spawn error:', err.message)
        currentProc = null
        reject(new Error(`FFmpeg spawn error: ${err.message}`))
      })
      
      p.on('exit', (code, signal) => {
        console.log(`🔚 FFmpeg exited with code: ${code}, signal: ${signal}`)
        currentProc = null  // Always clear the process reference
        
        if (code !== 0 && code !== null) {
          console.error('❌ FFmpeg error output:', errorOutput)
          
          // Parse common error types
          let errorMessage = 'Streaming failed - check logs for details'
          if (errorOutput.includes('Error in the pull function') || errorOutput.includes('IO error: End of file')) {
            errorMessage = 'RTMP connection failed - check stream key and network connection'
          } else if (errorOutput.includes('Error number -10053')) {
            errorMessage = 'Network connection lost - one RTMP server may be unreachable'
          } else if (errorOutput.includes('Connection refused')) {
            errorMessage = 'RTMP server connection refused - check URL and network'
          } else if (errorOutput.includes('No such file or directory')) {
            errorMessage = 'Device not found - camera or microphone unavailable'
          } else if (errorOutput.includes('Permission denied')) {
            errorMessage = 'Device access denied - check permissions'
          } else if (errorOutput.includes('already in use') || errorOutput.includes('Could not run graph')) {
            errorMessage = 'Device busy - close other applications using camera/mic (Chrome, Skype, Teams, etc.)'
          } else if (errorOutput.includes('Could not find audio only device')) {
            errorMessage = 'Audio device not found - try refreshing devices or check microphone connection'
          } else if (errorOutput.includes('Invalid data found')) {
            errorMessage = 'Invalid RTMP stream key or URL format'
          } else if (errorOutput.includes('real-time buffer') && errorOutput.includes('too full')) {
            errorMessage = 'Camera buffer overflow - try reducing video quality or closing other apps'
          } else if (errorOutput.includes('baseline profile doesn\'t support')) {
            errorMessage = 'Camera format incompatible - switching to main profile'
          } else if (errorOutput.includes('Error setting profile')) {
            errorMessage = 'Video encoding profile error - using compatible settings'
          }
          
          // Send specific error to frontend
          exitHandlers.forEach(h => h(code, signal, errorMessage))
        } else {
          exitHandlers.forEach(h => h(code, signal))
        }
      })
      
      // Give it a moment to start and check if it's still running
      setTimeout(() => {
        if (currentProc && !currentProc.killed) {
          console.log('✅ FFmpeg started successfully')
          resolve(p)
        } else {
          console.error('❌ FFmpeg failed to start or exited immediately')
          reject(new Error('FFmpeg failed to start - check device names and RTMP URL'))
        }
      }, 2000)
      
    } catch (err) {
      console.error('❌ FFmpeg startup error:', err.message)
      currentProc = null
      reject(new Error(`Failed to start FFmpeg: ${err.message}`))
    }
  })
}

function hookLogs(p, cb, statsCallback){ 
  if(!p) return
  
  p.stderr.on('data', d => {
    const output = d.toString()
    
    // Filter out repetitive buffer messages to reduce log spam
    if (!output.includes('real-time buffer') || !output.includes('Last message repeated')) {
      console.log('FFmpeg stderr:', output)
    }
    
    output.split(/\r?\n/).forEach(l => {
      if(l.trim()) {
        const line = l.trim()
        
        // Extract and send stats separately if callback provided
        if (statsCallback && line.includes('frame=') && line.includes('fps=') && line.includes('bitrate=')) {
          const stats = parseFFmpegStats(line)
          if (stats) {
            statsCallback(stats)
          }
        }
        
        // Send important messages to frontend, filter buffer spam
        if (!line.includes('Last message repeated') && 
            !(line.includes('real-time buffer') && line.includes('frame dropped'))) {
          cb(line)
        } else if (line.includes('real-time buffer') && !line.includes('repeated')) {
          // Only send the first buffer warning, not the repeats
          cb('⚠️ Camera buffer warning - consider reducing quality if persistent')
        }
      }
    })
  })
  
  p.stdout.on('data', d => {
    const output = d.toString()
    console.log('FFmpeg stdout:', output)
    output.split(/\r?\n/).forEach(l => {
      if(l.trim()) cb(l.trim())
    })
  })
}

function parseFFmpegStats(line) {
  // Parse FFmpeg progress line: frame= 1234 fps= 30 q=28.0 size= 1024kB time=00:00:41.23 bitrate= 203.4kbits/s speed=1.0x
  const frameMatch = line.match(/frame=\s*(\d+)/)
  const fpsMatch = line.match(/fps=\s*(\d+(?:\.\d+)?)/)
  const bitrateMatch = line.match(/bitrate=\s*(\d+(?:\.\d+)?)kbits\/s/)
  const timeMatch = line.match(/time=(\d{2}):(\d{2}):(\d{2})\.(\d{2})/)
  const sizeMatch = line.match(/size=\s*(\d+)kB/)
  const speedMatch = line.match(/speed=\s*(\d+(?:\.\d+)?)x/)
  
  if (!fpsMatch && !bitrateMatch && !timeMatch) return null
  
  const stats = {}
  
  if (frameMatch) stats.frame = parseInt(frameMatch[1])
  if (fpsMatch) stats.fps = parseFloat(fpsMatch[1])
  if (bitrateMatch) stats.bitrate = parseFloat(bitrateMatch[1])
  if (sizeMatch) stats.size = parseInt(sizeMatch[1])
  if (speedMatch) stats.speed = parseFloat(speedMatch[1])
  
  if (timeMatch) {
    const hours = parseInt(timeMatch[1])
    const minutes = parseInt(timeMatch[2])
    const seconds = parseInt(timeMatch[3])
    stats.duration = hours * 3600 + minutes * 60 + seconds
  }
  
  return stats
}

function stopStream(){ 
  if(!currentProc) return
  console.log('🛑 Stopping FFmpeg process...')
  
  const proc = currentProc
  currentProc = null  // Clear reference immediately
  
  try {
    proc.kill('SIGTERM')
    setTimeout(() => {
      if (proc && !proc.killed) {
        console.log('🔥 Force killing FFmpeg process...')
        try {
          proc.kill('SIGKILL')
        } catch (err) {
          console.log('Process already terminated')
        }
      }
    }, 2000)
  } catch (err) {
    console.error('Error stopping FFmpeg:', err)
    try {
      proc.kill('SIGKILL')
    } catch {}
  }
}

function isStreaming(){ return !!currentProc }
function onExit(fn){ exitHandlers.push(fn) }

module.exports={startStream,hookLogs,stopStream,isStreaming,onExit}
