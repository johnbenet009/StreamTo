const { execSync } = require('child_process')
const fs = require('fs')
const path = require('path')

console.log('🏗️  Building StreamTo executable...')

// Check if pkg is installed
try {
  execSync('pkg --version', { stdio: 'ignore' })
} catch (error) {
  console.log('📦 Installing pkg...')
  execSync('npm install -g pkg', { stdio: 'inherit' })
}

// Check if FFmpeg is bundled
const ffmpegPath = path.join(__dirname, '..', 'ffmpeg', 'ffmpeg.exe')
if (!fs.existsSync(ffmpegPath)) {
  console.log('❌ FFmpeg not found!')
  console.log('Please run: npm run setup')
  console.log('And place ffmpeg.exe in the ./ffmpeg/ folder')
  process.exit(1)
}

console.log('✅ FFmpeg found, building executable...')

// Build the executable
try {
  const buildCmd = 'pkg . --target node18-win-x64 --output dist/StreamTo.exe'
  execSync(buildCmd, { stdio: 'inherit' })
  
  // Create dist directory structure
  const distDir = path.join(__dirname, '..', 'dist')
  const distFFmpegDir = path.join(distDir, 'ffmpeg')
  const distFrontendDir = path.join(distDir, 'frontend')
  
  // Copy FFmpeg
  if (!fs.existsSync(distFFmpegDir)) {
    fs.mkdirSync(distFFmpegDir, { recursive: true })
  }
  fs.copyFileSync(ffmpegPath, path.join(distFFmpegDir, 'ffmpeg.exe'))
  
  // Copy frontend files
  const frontendSrc = path.join(__dirname, '..', 'frontend')
  if (fs.existsSync(frontendSrc)) {
    execSync(`xcopy "${frontendSrc}" "${distFrontendDir}" /E /I /Y`, { stdio: 'inherit' })
  }
  
  console.log('🎉 Build complete!')
  console.log('📁 Files created in ./dist/')
  console.log('🚀 You can now distribute StreamTo.exe with the dist folder')
  
} catch (error) {
  console.error('❌ Build failed:', error.message)
  console.log('\n💡 Make sure you have:')
  console.log('1. FFmpeg in ./ffmpeg/ffmpeg.exe')
  console.log('2. All dependencies installed (npm install)')
}