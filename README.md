# StreamTo

**Lightweight Multi-RTMP Streaming Application for Windows**

Stream to multiple platforms simultaneously with minimal CPU usage and a modern web-based interface.

## Description

StreamTo is a Node.js-based streaming application that allows you to broadcast to multiple RTMP destinations (YouTube, Facebook, Twitch, custom servers) simultaneously. Built with performance in mind, it uses FFmpeg for encoding and a lightweight web interface for control.

## Requirements

- **Windows 10/11**
- **Node.js 18+**
- **FFmpeg** (see installation below)
- **UVC-compatible camera**
- **Audio input device**

## Installation

### 1. Install Node.js
Download and install Node.js 18+ from [nodejs.org](https://nodejs.org/)

### 2. Install FFmpeg
Choose one of the following methods:

**Option A: Using Winget (Recommended)**
```bash
winget install Gyan.FFmpeg
```

**Option B: Using Chocolatey**
```bash
choco install ffmpeg
```

**Option C: Manual Installation**
1. Download from [gyan.dev/ffmpeg/builds](https://www.gyan.dev/ffmpeg/builds/)
2. Extract to `C:\ffmpeg`
3. Add `C:\ffmpeg\bin` to your PATH environment variable

### 3. Clone and Setup
```bash
git clone https://github.com/johnbenet009/StreamTo.git
cd StreamTo
npm install
```

## Usage

### 1. Start the Application
```bash
npm start
```

### 2. Open Web Interface
Navigate to: http://localhost:8081

### 3. Configure Streaming
- Select your camera and microphone
- Add RTMP destinations (YouTube, Facebook, Twitch, or custom)
- Click "Start Stream"

## Testing Platforms

### YouTube Live
- Get stream key from YouTube Studio → Go Live
- URL format: `rtmps://a.rtmp.youtube.com/live2/YOUR_STREAM_KEY`

### Facebook Live
- Get stream key from Facebook Live Producer
- URL format: `rtmps://live-api-s.facebook.com:443/rtmp/YOUR_STREAM_KEY`

### Test RTMP Server
- Use: https://antmedia.io/webrtc-samples/rtmp-publish-webrtc-play/
- Generate test RTMP URL for development

## Configuration

Settings are automatically saved locally in `config.json` (not tracked by git for security).

## License & Terms

**Open Source - MIT License**

### Terms of Use:
- ✅ **Free to use and modify**
- ✅ **Commercial use allowed**
- ❌ **Not for resale as standalone product**
- 🔄 **Contributions encouraged** - Push updates back to this repository
- 🤝 **Open for community support and collaboration**

### Contributing
We welcome contributions! Please:
- Fork the repository
- Make your improvements
- Submit pull requests to help StreamTo grow
- Report issues and suggest features

## Support

- **Repository**: https://github.com/johnbenet009/StreamTo
- **Issues**: Report bugs and feature requests via GitHub Issues
- **Developer**: [Positive Developer](https://github.com/johnbenet009)
- **Contact**: +234 901 453 2386 (WhatsApp/Call)

---

**Built with ❤️ for the streaming community**