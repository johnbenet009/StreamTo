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
    
    // Build args for multiple outputs (better than tee for RTMP)
    // Don't quote in spawn args - Node.js handles this automatically
    const inputString = `video=${video}:audio=${audio}`
    // Optimize settings based on number of destinations
    const isMultiStream = rtmps.length > 1
    const bufferSize = isMultiStream ? '200M' : '300M'  // Increased buffer size
    const preset = isMultiStream ? 'ultrafast' : 'fast'
    const bitrate = isMultiStream ? '800k' : '1200k'    // Reduced bitrate to prevent overload
    
    const baseArgs = [
      '-y',  // Overwrite output files without asking
      '-f','dshow',
      '-rtbufsize', bufferSize,
      '-thread_queue_size', '2048',
      '-i',inputString,
      '-c:v','libx264',
      '-preset', preset,
      '-tune','zerolatency',
      '-profile:v','baseline',
      '-b:v', bitrate,
      '-maxrate', bitrate,
      '-bufsize', `${parseInt(bitrate) * 2}k`,
      '-g', '50',
      '-r', '25',  // Output framerate
      '-s', '1280x720',  // Output resolution
      '-c:a','aac',
      '-b:a','96k',
      '-ar','44100',
      '-ac','2',
      '-reconnect','1',
      '-reconnect_streamed','1',
      '-reconnect_delay_max','5'
    ]
    
    // Add each RTMP destination as separate output
    const outputArgs = []
    
    // Add test recording for debugging (optional)
    if (process.env.DEBUG_RECORD) {
      outputArgs.push('-t', '10', '-f', 'mp4', 'test_recording.mp4')
    }
    
    // Add RTMP outputs with optimized settings for multi-streaming
    rtmps.forEach((url, index) => {
      if (isMultiStream) {
        // For multi-streaming, use copy for first stream, re-encode for others
        if (index === 0) {
          // First stream: higher quality
          outputArgs.push(
            '-map', '0:v', '-map', '0:a',
            '-c:v', 'libx264', '-preset', 'ultrafast',
            '-b:v', '800k', '-maxrate', '800k', '-bufsize', '1600k',
            '-c:a', 'aac', '-b:a', '96k',
            '-f', 'flv'
          )
        } else {
          // Additional streams: lower quality to reduce CPU load
          outputArgs.push(
            '-map', '0:v', '-map', '0:a',
            '-c:v', 'libx264', '-preset', 'ultrafast',
            '-b:v', '600k', '-maxrate', '600k', '-bufsize', '1200k',
            '-s', '960x540',  // Lower resolution for additional streams
            '-c:a', 'aac', '-b:a', '64k',
            '-f', 'flv'
          )
        }
      } else {
        // Single stream: use the base encoding settings
        outputArgs.push('-f', 'flv')
      }
      
      // Add connection options for RTMPS
      if (url.includes('rtmps://')) {
        outputArgs.push('-rtmp_conn', 'S:allowPublish')
      }
      outputArgs.push(url)
    })
    
    const args = [...baseArgs, ...outputArgs]
    
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
        if (code !== 0 && code !== null) {
          console.error('❌ FFmpeg error output:', errorOutput)
          
          // Parse common error types
          let errorMessage = 'Streaming failed - check logs for details'
          if (errorOutput.includes('Error number -10053')) {
            errorMessage = 'Network connection lost - one RTMP server may be unreachable'
          } else if (errorOutput.includes('Connection refused')) {
            errorMessage = 'RTMP server connection refused - check URL and network'
          } else if (errorOutput.includes('No such file or directory')) {
            errorMessage = 'Device not found - camera or microphone unavailable'
          } else if (errorOutput.includes('Permission denied')) {
            errorMessage = 'Device access denied - check permissions'
          } else if (errorOutput.includes('already in use')) {
            errorMessage = 'Device busy - close other applications using camera/mic'
          } else if (errorOutput.includes('Invalid data found')) {
            errorMessage = 'Invalid RTMP stream key or URL format'
          } else if (errorOutput.includes('real-time buffer') && errorOutput.includes('too full')) {
            errorMessage = 'Camera buffer overflow - try reducing video quality or closing other apps'
          }
          
          // Send specific error to frontend
          exitHandlers.forEach(h => h(code, signal, errorMessage))
        } else {
          currentProc = null
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

function hookLogs(p,cb){ 
  if(!p) return
  
  p.stderr.on('data', d => {
    const output = d.toString()
    
    // Filter out repetitive buffer messages to reduce log spam
    if (!output.includes('real-time buffer') || !output.includes('Last message repeated')) {
      console.log('FFmpeg stderr:', output)
    }
    
    output.split(/\r?\n/).forEach(l => {
      if(l.trim()) {
        // Send important messages to frontend, filter buffer spam
        if (!l.includes('Last message repeated') && 
            !(l.includes('real-time buffer') && l.includes('frame dropped'))) {
          cb(l.trim())
        } else if (l.includes('real-time buffer') && !l.includes('repeated')) {
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

function stopStream(){ 
  if(!currentProc) return
  console.log('🛑 Stopping FFmpeg process...')
  try {
    currentProc.kill('SIGTERM')
    setTimeout(() => {
      if (currentProc && !currentProc.killed) {
        console.log('🔥 Force killing FFmpeg process...')
        currentProc.kill('SIGKILL')
      }
    }, 3000)
  } catch (err) {
    console.error('Error stopping FFmpeg:', err)
    try {
      currentProc.kill('SIGKILL')
    } catch {}
  }
}

function isStreaming(){ return !!currentProc }
function onExit(fn){ exitHandlers.push(fn) }

module.exports={startStream,hookLogs,stopStream,isStreaming,onExit}
