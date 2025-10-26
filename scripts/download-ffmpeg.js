const fs = require('fs')
const path = require('path')

const FFMPEG_DIR = path.join(__dirname, '..', 'ffmpeg')
const FFMPEG_EXE = path.join(FFMPEG_DIR, 'ffmpeg.exe')

console.log('🔍 Checking FFmpeg for StreamTo...')

// Check if FFmpeg already exists
if (fs.existsSync(FFMPEG_EXE)) {
  console.log('✅ FFmpeg already bundled with StreamTo')
  process.exit(0)
}

// Create ffmpeg directory
if (!fs.existsSync(FFMPEG_DIR)) {
  fs.mkdirSync(FFMPEG_DIR, { recursive: true })
}

console.log('📋 FFmpeg Setup Required:')
console.log('')
console.log('StreamTo needs FFmpeg to function. You have 2 options:')
console.log('')
console.log('🎯 OPTION 1 - Bundled FFmpeg (Recommended):')
console.log('   1. Download: https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip')
console.log('   2. Extract the zip file')
console.log('   3. Copy ffmpeg.exe from the bin folder to: ./ffmpeg/ffmpeg.exe')
console.log('   4. Run: npm start')
console.log('')
console.log('🌐 OPTION 2 - System FFmpeg:')
console.log('   1. Install: winget install Gyan.FFmpeg')
console.log('   2. Run: npm start')
console.log('')
console.log('💡 With Option 1, your compiled app will work on any Windows PC!')
console.log('💡 With Option 2, users need to install FFmpeg separately.')

// Create a placeholder file with instructions
const instructionsFile = path.join(FFMPEG_DIR, 'PLACE_FFMPEG_HERE.txt')
fs.writeFileSync(instructionsFile, `StreamTo FFmpeg Setup
====================

To bundle FFmpeg with StreamTo:

1. Download FFmpeg from: https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip
2. Extract the zip file
3. Copy ffmpeg.exe from the extracted bin folder to this directory
4. Delete this instruction file
5. Run: npm start

The file should be located at:
${FFMPEG_EXE}

This allows StreamTo to work on any Windows PC without requiring FFmpeg installation.
`)

console.log(`📝 Instructions saved to: ${instructionsFile}`)