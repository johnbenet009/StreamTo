class MultiRTMPStreamer {
    constructor() {
        this.ws = null;
        this.devices = { video: [], audio: [] };
        this.rtmpUrls = [];
        this.isStreaming = false;
        this.micStream = null;
        this.micAnalyzer = null;
        this.previewStream = null;
        this.streamStats = {
            fps: 0,
            bitrate: 0,
            duration: 0,
            startTime: null
        };
        this.statsInterval = null;
        this.autoScroll = true;
        this.speedTestInProgress = false;
        
        this.init();
    }

    async init() {
        this.setupWebSocket();
        this.setupEventListeners();
        await this.loadDevices();
        await this.loadConfig();
        this.setupMicLevelMeter();
    }

    setupWebSocket() {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        this.ws = new WebSocket(`${protocol}//${window.location.host}`);
        
        this.ws.onopen = () => {
            console.log('WebSocket connected');
        };
        
        this.ws.onmessage = (event) => {
            const data = JSON.parse(event.data);
            this.handleWebSocketMessage(data);
        };
        
        this.ws.onclose = () => {
            console.log('WebSocket disconnected');
            setTimeout(() => this.setupWebSocket(), 3000);
        };
    }

    handleWebSocketMessage(data) {
        switch (data.type) {
            case 'status':
                this.updateStatus(data.payload);
                break;
            case 'log':
                this.addLog(data.payload);
                this.parseStreamStats(data.payload);
                break;
            case 'error':
                this.showError(data.payload);
                break;
            case 'stats':
                this.updateStreamStats(data.payload);
                break;
        }
    }

    parseStreamStats(logLine) {
        // Parse FFmpeg output for FPS and bitrate
        // Example: frame= 1234 fps= 30 q=28.0 size= 1024kB time=00:00:41.23 bitrate= 203.4kbits/s speed=1.0x
        const fpsMatch = logLine.match(/fps=\s*(\d+(?:\.\d+)?)/);
        const bitrateMatch = logLine.match(/bitrate=\s*(\d+(?:\.\d+)?)kbits\/s/);
        const timeMatch = logLine.match(/time=(\d{2}):(\d{2}):(\d{2})\.(\d{2})/);
        const frameMatch = logLine.match(/frame=\s*(\d+)/);
        
        let statsUpdated = false;
        
        if (fpsMatch) {
            this.streamStats.fps = parseFloat(fpsMatch[1]);
            statsUpdated = true;
        }
        
        if (bitrateMatch) {
            this.streamStats.bitrate = parseFloat(bitrateMatch[1]);
            statsUpdated = true;
        }
        
        if (timeMatch) {
            const hours = parseInt(timeMatch[1]);
            const minutes = parseInt(timeMatch[2]);
            const seconds = parseInt(timeMatch[3]);
            this.streamStats.duration = hours * 3600 + minutes * 60 + seconds;
            statsUpdated = true;
        }
        
        // Only update display if we actually parsed some stats
        if (statsUpdated) {
            this.updateStatsDisplay();
        }
    }

    updateStreamStats(stats) {
        Object.assign(this.streamStats, stats);
        this.updateStatsDisplay();
    }

    updateStatsDisplay() {
        document.getElementById('fps-display').textContent = this.streamStats.fps.toFixed(1);
        document.getElementById('bitrate-display').textContent = `${this.streamStats.bitrate.toFixed(1)} kbps`;
        
        const duration = this.streamStats.duration;
        const hours = Math.floor(duration / 3600);
        const minutes = Math.floor((duration % 3600) / 60);
        const seconds = duration % 60;
        document.getElementById('duration-display').textContent = 
            `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }

    setupEventListeners() {
        // Device selection
        document.getElementById('camera-select').addEventListener('change', (e) => {
            this.updatePreview(e.target.value);
        });

        document.getElementById('mic-select').addEventListener('change', (e) => {
            this.updateMicInput(e.target.value);
        });

        // Stream controls
        document.getElementById('start-stream').addEventListener('click', () => {
            this.startStream();
        });

        document.getElementById('stop-stream').addEventListener('click', () => {
            this.stopStream();
        });

        // RTMP management
        document.getElementById('add-rtmp').addEventListener('click', () => {
            this.showAddRTMPForm();
        });

        document.getElementById('save-rtmp').addEventListener('click', () => {
            this.saveRTMP();
        });

        document.getElementById('cancel-rtmp').addEventListener('click', () => {
            this.hideAddRTMPForm();
        });

        // Log panel
        document.getElementById('toggle-logs').addEventListener('click', () => {
            this.toggleLogPanel();
        });

        document.getElementById('close-logs').addEventListener('click', () => {
            this.hideLogPanel();
        });

        document.getElementById('auto-scroll-toggle').addEventListener('click', () => {
            this.toggleAutoScroll();
        });

        document.getElementById('clear-logs').addEventListener('click', () => {
            this.clearLogs();
        });

        // Network Speed Test
        document.getElementById('network-speed-test').addEventListener('click', () => {
            this.showNetworkSpeedModal();
        });

        document.getElementById('start-speed-test').addEventListener('click', () => {
            this.startNetworkSpeedTest();
        });

        document.getElementById('close-speed-modal').addEventListener('click', () => {
            this.hideNetworkSpeedModal();
        });

        // Refresh Devices
        document.getElementById('refresh-devices').addEventListener('click', () => {
            this.refreshDevices();
        });

        // Developer modal
        document.getElementById('developer-link').addEventListener('click', () => {
            this.showDeveloperModal();
        });

        document.getElementById('close-developer-modal').addEventListener('click', () => {
            this.hideDeveloperModal();
        });

        // Close modal when clicking outside
        document.getElementById('developer-modal').addEventListener('click', (e) => {
            if (e.target.id === 'developer-modal') {
                this.hideDeveloperModal();
            }
        });

        document.getElementById('network-speed-modal').addEventListener('click', (e) => {
            if (e.target.id === 'network-speed-modal') {
                this.hideNetworkSpeedModal();
            }
        });

        // Platform presets
        document.getElementById('rtmp-platform').addEventListener('change', (e) => {
            this.handlePlatformChange(e.target.value);
        });

        // Auto-scroll detection
        document.getElementById('log-content').addEventListener('scroll', (e) => {
            const element = e.target;
            const isAtBottom = element.scrollHeight - element.clientHeight <= element.scrollTop + 1;
            
            // If user scrolled up, disable auto-scroll
            if (!isAtBottom && this.autoScroll) {
                this.autoScroll = false;
                const button = document.getElementById('auto-scroll-toggle');
                button.textContent = '🔓 Manual';
                button.className = 'px-2 py-1 text-xs bg-gray-600 text-white rounded hover:bg-gray-700 transition-colors';
            }
            // If user scrolled to bottom, enable auto-scroll
            else if (isAtBottom && !this.autoScroll) {
                this.autoScroll = true;
                const button = document.getElementById('auto-scroll-toggle');
                button.textContent = '🔒 Auto-scroll';
                button.className = 'px-2 py-1 text-xs bg-green-600 text-white rounded hover:bg-green-700 transition-colors';
            }
        });
    }

    async loadDevices() {
        try {
            // Try to get devices from backend first
            const response = await fetch('/api/devices');
            this.devices = await response.json();
            
            // Also try to get browser devices for better selection
            try {
                await this.loadBrowserDevices();
            } catch (browserError) {
                console.log('Browser device enumeration failed:', browserError);
            }
            
            this.populateDeviceSelects();
        } catch (error) {
            console.error('Failed to load devices:', error);
            this.addLog('FFmpeg not detected. Using browser device detection...');
            
            // Fallback to browser-only device detection
            try {
                await this.loadBrowserDevices();
                this.populateDeviceSelects();
                this.addLog('Browser devices loaded successfully');
            } catch (browserError) {
                this.showError('No device access available. Please check permissions and install FFmpeg.');
                this.addLog('ERROR: Device detection failed completely');
            }
        }
    }

    async loadBrowserDevices() {
        // Request permissions first
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
            stream.getTracks().forEach(track => track.stop()); // Stop immediately
        } catch (permError) {
            console.log('Permission request failed:', permError);
        }

        // Now enumerate devices
        const devices = await navigator.mediaDevices.enumerateDevices();
        
        const browserVideo = devices
            .filter(device => device.kind === 'videoinput' && device.label)
            .map(device => device.label);
            
        const browserAudio = devices
            .filter(device => device.kind === 'audioinput' && device.label)
            .map(device => device.label);

        // Merge with backend devices, avoiding duplicates
        if (browserVideo.length > 0) {
            this.devices.video = [...new Set([...this.devices.video, ...browserVideo])];
        }
        if (browserAudio.length > 0) {
            this.devices.audio = [...new Set([...this.devices.audio, ...browserAudio])];
        }
    }

    populateDeviceSelects() {
        const cameraSelect = document.getElementById('camera-select');
        const micSelect = document.getElementById('mic-select');

        // Clear existing options
        cameraSelect.innerHTML = '<option value="">Select camera...</option>';
        micSelect.innerHTML = '<option value="">Select microphone...</option>';

        // Populate cameras
        this.devices.video.forEach(device => {
            const option = document.createElement('option');
            option.value = device;
            option.textContent = device;
            cameraSelect.appendChild(option);
        });

        // Populate microphones
        this.devices.audio.forEach(device => {
            const option = document.createElement('option');
            option.value = device;
            option.textContent = device;
            micSelect.appendChild(option);
        });
    }

    async loadConfig() {
        try {
            const response = await fetch('/api/config');
            const config = await response.json();
            this.rtmpUrls = config.rtmps || [];
            
            // Migrate old config format to new numbered format
            this.migrateRTMPConfig();
            
            this.renderRTMPList();
        } catch (error) {
            console.error('Failed to load config:', error);
        }
    }

    migrateRTMPConfig() {
        // Add basePlatform property and numbering to existing configs
        this.rtmpUrls.forEach(rtmp => {
            if (!rtmp.basePlatform) {
                // Determine platform type from existing platform name
                const platformName = rtmp.platform.toLowerCase();
                if (platformName.includes('custom')) {
                    rtmp.basePlatform = 'custom';
                } else if (platformName.includes('youtube')) {
                    rtmp.basePlatform = 'youtube';
                } else if (platformName.includes('facebook')) {
                    rtmp.basePlatform = 'facebook';
                } else if (platformName.includes('twitch')) {
                    rtmp.basePlatform = 'twitch';
                } else {
                    rtmp.basePlatform = 'custom'; // Default fallback
                }
            }
            
            // Clean up old numbering formats for migration
            rtmp.platform = rtmp.platform.replace(/^\d+\.\s*/, ''); // Remove "1. " format
            rtmp.platform = rtmp.platform.replace(/\s*\(\d+\)$/, ''); // Remove " (1)" format
        });
        
        // Renumber all destinations with new format
        this.renumberRTMPDestinations();
    }

    async saveConfig() {
        try {
            await fetch('/api/config', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ rtmps: this.rtmpUrls })
            });
        } catch (error) {
            console.error('Failed to save config:', error);
        }
    }

    renderRTMPList() {
        const container = document.getElementById('rtmp-list');
        container.innerHTML = '';

        if (this.rtmpUrls.length === 0) {
            container.innerHTML = '<div class="text-gray-500 text-center py-8">No RTMP destinations configured</div>';
            return;
        }

        this.rtmpUrls.forEach((rtmp, index) => {
            const item = document.createElement('div');
            item.className = 'rtmp-item';
            
            // Show masked URL for security (hide stream keys)
            let displayUrl = rtmp.url;
            if (rtmp.key) {
                displayUrl = rtmp.url.replace(rtmp.key, '***KEY***');
            }
            
            item.innerHTML = `
                <div class="flex items-center justify-between">
                    <div class="flex-1 min-w-0">
                        <div class="text-sm font-medium text-white truncate">${rtmp.platform || 'Custom'}</div>
                        <div class="text-xs text-gray-400 truncate">${displayUrl}</div>
                    </div>
                    <button onclick="app.removeRTMP(${index})" class="ml-2 text-red-400 hover:text-red-300 text-sm">
                        ✕
                    </button>
                </div>
            `;
            container.appendChild(item);
        });
    }

    showAddRTMPForm() {
        document.getElementById('add-rtmp-form').classList.remove('hidden');
        document.getElementById('rtmp-url').focus();
    }

    hideAddRTMPForm() {
        document.getElementById('add-rtmp-form').classList.add('hidden');
        document.getElementById('rtmp-url').value = '';
        document.getElementById('stream-key').value = '';
        document.getElementById('rtmp-platform').value = 'custom';
        this.handlePlatformChange('custom'); // Reset to custom view
    }

    handlePlatformChange(platform) {
        const customUrlInput = document.getElementById('custom-url-input');
        const streamKeyInput = document.getElementById('stream-key-input');
        const platformHelpText = document.getElementById('platform-help-text');
        const urlInput = document.getElementById('rtmp-url');
        const keyInput = document.getElementById('stream-key');
        
        // Clear previous values
        urlInput.value = '';
        keyInput.value = '';
        
        if (platform === 'custom') {
            // Show URL input, hide stream key input
            customUrlInput.classList.remove('hidden');
            streamKeyInput.classList.add('hidden');
            urlInput.placeholder = 'rtmp://your-server.com/live';
        } else {
            // Show stream key input, hide URL input
            customUrlInput.classList.add('hidden');
            streamKeyInput.classList.remove('hidden');
            
            // Set platform-specific help text and placeholders
            const platformInfo = {
                youtube: {
                    help: 'Get your stream key from YouTube Studio → Go Live → Stream',
                    placeholder: 'xxxx-xxxx-xxxx-xxxx-xxxx'
                },
                facebook: {
                    help: 'Get your stream key from Facebook → Live Producer → Stream Key',
                    placeholder: 'FB-xxxxxxxxx-x-xxxxxxxxx'
                },
                twitch: {
                    help: 'Get your stream key from Twitch Creator Dashboard → Settings → Stream',
                    placeholder: 'live_xxxxxxxxx_xxxxxxxxx'
                }
            };
            
            if (platformInfo[platform]) {
                platformHelpText.textContent = platformInfo[platform].help;
                keyInput.placeholder = platformInfo[platform].placeholder;
            }
        }
    }

    saveRTMP() {
        const platform = document.getElementById('rtmp-platform').value;
        const customUrl = document.getElementById('rtmp-url').value.trim();
        const streamKey = document.getElementById('stream-key').value.trim();
        
        let finalUrl = '';
        let basePlatformName = '';
        
        if (platform === 'custom') {
            if (!customUrl) {
                this.showError('Please enter an RTMP URL');
                return;
            }
            finalUrl = customUrl;
            basePlatformName = 'Custom RTMP';
        } else {
            if (!streamKey) {
                this.showError('Please enter your stream key');
                return;
            }
            
            // Build the complete RTMP URL with stream key
            const platformUrls = {
                youtube: 'rtmps://a.rtmp.youtube.com/live2/',
                facebook: 'rtmps://live-api-s.facebook.com:443/rtmp/',
                twitch: 'rtmp://live.twitch.tv/app/'
            };
            
            finalUrl = platformUrls[platform] + streamKey;
            
            // Set base platform names
            const platformNames = {
                youtube: 'YouTube Live',
                facebook: 'Facebook Live',
                twitch: 'Twitch'
            };
            
            basePlatformName = platformNames[platform];
        }

        // Check for duplicate URLs
        const isDuplicate = this.rtmpUrls.some(existing => existing.url === finalUrl);
        if (isDuplicate) {
            this.showError('This RTMP destination is already added. Each stream key must be unique.');
            return;
        }

        // Check for duplicate stream keys (for same platform)
        if (platform !== 'custom') {
            const duplicateKey = this.rtmpUrls.some(existing => 
                existing.key === streamKey && existing.basePlatform === platform
            );
            if (duplicateKey) {
                this.showError(`This ${basePlatformName} stream key is already added. Use a different stream key.`);
                return;
            }
        }

        // Generate numbered display name
        const displayName = this.generateNumberedPlatformName(basePlatformName, platform);

        this.rtmpUrls.push({
            platform: displayName,
            basePlatform: platform,
            url: finalUrl,
            key: platform !== 'custom' ? streamKey : null
        });

        this.renderRTMPList();
        this.saveConfig();
        this.hideAddRTMPForm();
    }

    generateNumberedPlatformName(baseName, platformType) {
        // Count existing platforms of the same type
        const existingCount = this.rtmpUrls.filter(rtmp => 
            rtmp.basePlatform === platformType
        ).length;
        
        // Generate the numbered name with parentheses format
        const number = existingCount + 1;
        return `${baseName} (${number})`;
    }

    removeRTMP(index) {
        this.rtmpUrls.splice(index, 1);
        this.renumberRTMPDestinations();
        this.renderRTMPList();
        this.saveConfig();
    }

    renumberRTMPDestinations() {
        // Group by platform type and renumber each group
        const platformCounts = {};
        
        this.rtmpUrls.forEach(rtmp => {
            const platformType = rtmp.basePlatform;
            
            // Initialize counter for this platform type
            if (!platformCounts[platformType]) {
                platformCounts[platformType] = 0;
            }
            
            // Increment counter and update display name
            platformCounts[platformType]++;
            const number = platformCounts[platformType];
            
            // Get base name without number (handle both old and new formats)
            let baseName = rtmp.platform.replace(/^\d+\.\s*/, ''); // Remove "1. " format
            baseName = baseName.replace(/\s*\(\d+\)$/, ''); // Remove " (1)" format
            
            rtmp.platform = `${baseName} (${number})`;
        });
    }

    async updatePreview(cameraName) {
        const video = document.getElementById('preview-video');
        const placeholder = document.getElementById('preview-placeholder');

        if (this.previewStream) {
            this.previewStream.getTracks().forEach(track => track.stop());
        }

        if (!cameraName) {
            video.style.display = 'none';
            placeholder.style.display = 'flex';
            return;
        }

        try {
            // Try to get the camera stream
            const constraints = {
                video: {
                    deviceId: { exact: await this.getCameraDeviceId(cameraName) }
                }
            };

            this.previewStream = await navigator.mediaDevices.getUserMedia(constraints);
            video.srcObject = this.previewStream;
            video.style.display = 'block';
            placeholder.style.display = 'none';
        } catch (error) {
            console.error('Failed to access camera:', error);
            video.style.display = 'none';
            placeholder.style.display = 'flex';
            placeholder.innerHTML = `
                <div class="text-center text-red-400">
                    <div class="text-4xl mb-2">⚠️</div>
                    <p>Camera access failed</p>
                    <p class="text-xs mt-1">Check permissions</p>
                </div>
            `;
        }
    }

    async getCameraDeviceId(cameraName) {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const camera = devices.find(device => 
            device.kind === 'videoinput' && device.label.includes(cameraName)
        );
        return camera ? camera.deviceId : undefined;
    }

    async setupMicLevelMeter() {
        // Initial setup with default microphone
        try {
            await this.updateMicInput();
        } catch (error) {
            console.error('Failed to setup mic level meter:', error);
        }
    }

    async updateMicInput(micName = null) {
        // Stop existing stream
        if (this.micStream) {
            this.micStream.getTracks().forEach(track => track.stop());
            this.micStream = null;
            this.micAnalyzer = null;
        }

        if (!micName) {
            // Reset mic level display
            const levelBar = document.getElementById('mic-level-bar');
            const levelText = document.getElementById('mic-level-text');
            levelBar.style.width = '0%';
            levelText.textContent = '0%';
            return;
        }

        try {
            // Get the device ID for the selected microphone
            const deviceId = await this.getMicDeviceId(micName);
            
            const constraints = {
                audio: deviceId ? { deviceId: { exact: deviceId } } : true
            };

            const stream = await navigator.mediaDevices.getUserMedia(constraints);
            const audioContext = new (window.AudioContext || window.webkitAudioContext)();
            const source = audioContext.createMediaStreamSource(stream);
            const analyzer = audioContext.createAnalyser();
            
            analyzer.fftSize = 256;
            source.connect(analyzer);
            
            this.micStream = stream;
            this.micAnalyzer = analyzer;
            
            this.updateMicLevel();
        } catch (error) {
            console.error('Failed to access selected microphone:', error);
            this.addLog(`Failed to access microphone: ${micName}`);
        }
    }

    async getMicDeviceId(micName) {
        try {
            const devices = await navigator.mediaDevices.enumerateDevices();
            const mic = devices.find(device => 
                device.kind === 'audioinput' && 
                (device.label.includes(micName) || device.label === micName)
            );
            return mic ? mic.deviceId : null;
        } catch (error) {
            console.error('Failed to get mic device ID:', error);
            return null;
        }
    }

    updateMicLevel() {
        if (!this.micAnalyzer) return;

        const dataArray = new Uint8Array(this.micAnalyzer.frequencyBinCount);
        this.micAnalyzer.getByteFrequencyData(dataArray);
        
        const average = dataArray.reduce((a, b) => a + b) / dataArray.length;
        const percentage = Math.min(100, (average / 255) * 100);
        
        const levelBar = document.getElementById('mic-level-bar');
        const levelText = document.getElementById('mic-level-text');
        
        levelBar.style.width = `${percentage}%`;
        levelText.textContent = `${Math.round(percentage)}%`;
        
        // Color coding
        if (percentage < 30) {
            levelBar.className = 'h-full bg-green-500 transition-all duration-100';
        } else if (percentage < 70) {
            levelBar.className = 'h-full bg-yellow-500 transition-all duration-100';
        } else {
            levelBar.className = 'h-full bg-red-500 transition-all duration-100';
        }
        
        requestAnimationFrame(() => this.updateMicLevel());
    }

    startStream() {
        const camera = document.getElementById('camera-select').value;
        const mic = document.getElementById('mic-select').value;

        if (!camera || !mic) {
            this.showError('Please select both camera and microphone');
            return;
        }

        if (this.rtmpUrls.length === 0) {
            this.showError('Please add at least one RTMP destination');
            return;
        }

        // Stop camera preview to avoid device conflicts
        this.stopCameraPreview();

        const data = {
            action: 'start',
            video: camera,
            audio: mic,
            rtmps: this.rtmpUrls.map(r => r.url)
        };

        this.ws.send(JSON.stringify(data));
    }

    stopCameraPreview() {
        const video = document.getElementById('preview-video');
        const placeholder = document.getElementById('preview-placeholder');
        
        if (this.previewStream) {
            this.previewStream.getTracks().forEach(track => track.stop());
            this.previewStream = null;
        }
        
        video.srcObject = null;
        video.style.display = 'none';
        placeholder.style.display = 'flex';
        placeholder.innerHTML = `
            <div class="text-center text-gray-400 max-w-sm mx-auto">
                <div class="text-5xl mb-3">📡</div>
                <h3 class="text-lg font-semibold mb-2 text-white">Preview Closed</h3>
                <p class="text-sm leading-relaxed">Camera freed for streaming to save system resources. Monitor your stream on the platforms you're broadcasting to.</p>
            </div>
        `;
    }

    stopStream() {
        this.ws.send(JSON.stringify({ action: 'stop' }));
        
        // Restart camera preview after stopping stream
        setTimeout(() => {
            const camera = document.getElementById('camera-select').value;
            if (camera && !this.isStreaming) {
                this.updatePreview(camera);
            }
        }, 2000);
    }

    updateStatus(status) {
        const indicator = document.getElementById('status-indicator');
        const text = document.getElementById('status-text');
        const startBtn = document.getElementById('start-stream');
        const stopBtn = document.getElementById('stop-stream');

        // Remove all status classes
        indicator.className = 'w-3 h-3 rounded-full';
        
        switch (status) {
            case 'idle':
                indicator.classList.add('status-idle');
                text.textContent = 'Idle';
                startBtn.disabled = false;
                stopBtn.disabled = true;
                this.isStreaming = false;
                this.stopStatsTimer();
                this.resetStats();
                break;
            case 'starting':
                indicator.classList.add('status-stopping');
                text.textContent = 'Starting...';
                startBtn.disabled = true;
                stopBtn.disabled = true;
                break;
            case 'streaming':
                indicator.classList.add('status-streaming');
                text.textContent = 'Streaming';
                startBtn.disabled = true;
                stopBtn.disabled = false;
                this.isStreaming = true;
                this.streamStats.startTime = Date.now();
                this.startStatsTimer();
                break;
            case 'stopping':
                indicator.classList.add('status-stopping');
                text.textContent = 'Stopping...';
                startBtn.disabled = true;
                stopBtn.disabled = true;
                break;
            case 'stopped':
                this.updateStatus('idle');
                break;
        }
    }

    toggleLogPanel() {
        const panel = document.getElementById('log-panel');
        const button = document.getElementById('toggle-logs');
        
        if (panel.classList.contains('hidden')) {
            panel.classList.remove('hidden');
            button.textContent = '📊 Hide';
        } else {
            panel.classList.add('hidden');
            button.textContent = '📊 Log';
        }
    }

    hideLogPanel() {
        document.getElementById('log-panel').classList.add('hidden');
        document.getElementById('toggle-logs').textContent = '📊 Log';
    }

    showDeveloperModal() {
        document.getElementById('developer-modal').classList.remove('hidden');
    }

    hideDeveloperModal() {
        document.getElementById('developer-modal').classList.add('hidden');
    }

    addLog(message) {
        const logContent = document.getElementById('log-content');
        const logLine = document.createElement('div');
        const timestamp = new Date().toLocaleTimeString();
        
        // Determine log type and color
        let logClass = 'text-gray-300'; // default
        let prefix = '';
        
        if (message.includes('ERROR') || message.includes('❌') || message.includes('failed') || message.includes('error')) {
            logClass = 'text-red-400';
            prefix = '🔴 ';
        } else if (message.includes('WARNING') || message.includes('⚠️') || message.includes('warning') || message.includes('buffer')) {
            logClass = 'text-yellow-400';
            prefix = '🟡 ';
        } else if (message.includes('✅') || message.includes('started') || message.includes('success') || message.includes('connected')) {
            logClass = 'text-green-400';
            prefix = '🟢 ';
        } else if (message.includes('🚀') || message.includes('Starting') || message.includes('Stopping')) {
            logClass = 'text-blue-400';
            prefix = '🔵 ';
        } else if (message.includes('frame=') || message.includes('fps=') || message.includes('bitrate=')) {
            logClass = 'text-cyan-400';
            prefix = '📊 ';
        } else if (message.includes('🔄') || message.includes('ready')) {
            logClass = 'text-white';
            prefix = '⚪ ';
        }
        
        logLine.innerHTML = `<span class="text-gray-500">[${timestamp}]</span> ${prefix}<span class="${logClass}">${message}</span>`;
        logLine.className = 'text-xs leading-relaxed mb-1';
        
        logContent.appendChild(logLine);
        
        // Auto-scroll to bottom only if auto-scroll is enabled
        if (this.autoScroll) {
            logContent.scrollTop = logContent.scrollHeight;
        }
        
        // Keep only last 100 log lines
        while (logContent.children.length > 100) {
            logContent.removeChild(logContent.firstChild);
        }
    }

    toggleAutoScroll() {
        this.autoScroll = !this.autoScroll;
        const button = document.getElementById('auto-scroll-toggle');
        
        if (this.autoScroll) {
            button.textContent = '🔒 Auto-scroll';
            button.className = 'px-2 py-1 text-xs bg-green-600 text-white rounded hover:bg-green-700 transition-colors';
            // Scroll to bottom when re-enabling
            const logContent = document.getElementById('log-content');
            logContent.scrollTop = logContent.scrollHeight;
        } else {
            button.textContent = '🔓 Manual';
            button.className = 'px-2 py-1 text-xs bg-gray-600 text-white rounded hover:bg-gray-700 transition-colors';
        }
    }

    clearLogs() {
        const logContent = document.getElementById('log-content');
        logContent.innerHTML = '<div class="text-gray-500">🔄 Logs cleared - Activity will appear here when streaming...</div>';
    }

    startStatsTimer() {
        this.statsInterval = setInterval(() => {
            if (this.streamStats.startTime) {
                const elapsed = Math.floor((Date.now() - this.streamStats.startTime) / 1000);
                this.streamStats.duration = elapsed;
                this.updateStatsDisplay();
            }
        }, 1000);
    }

    stopStatsTimer() {
        if (this.statsInterval) {
            clearInterval(this.statsInterval);
            this.statsInterval = null;
        }
    }

    resetStats() {
        this.streamStats = {
            fps: 0,
            bitrate: 0,
            duration: 0,
            startTime: null
        };
        this.updateStatsDisplay();
    }

    showNetworkSpeedModal() {
        document.getElementById('network-speed-modal').classList.remove('hidden');
        this.resetSpeedTestDisplay();
    }

    hideNetworkSpeedModal() {
        document.getElementById('network-speed-modal').classList.add('hidden');
        this.speedTestInProgress = false;
    }

    resetSpeedTestDisplay() {
        document.getElementById('speed-test-idle').classList.remove('hidden');
        document.getElementById('speed-test-loading').classList.add('hidden');
        document.getElementById('speed-test-results').classList.add('hidden');
        document.getElementById('start-speed-test').disabled = false;
        document.getElementById('start-speed-test').textContent = 'Start Test';
    }

    async startNetworkSpeedTest() {
        if (this.speedTestInProgress) return;
        
        this.speedTestInProgress = true;
        document.getElementById('start-speed-test').disabled = true;
        document.getElementById('start-speed-test').textContent = 'Testing...';
        
        // Show loading state
        document.getElementById('speed-test-idle').classList.add('hidden');
        document.getElementById('speed-test-results').classList.add('hidden');
        document.getElementById('speed-test-loading').classList.remove('hidden');
        
        try {
            // Test ping first
            document.getElementById('speed-test-progress').textContent = 'Testing ping...';
            const ping = await this.testPing();
            
            // Test download speed
            document.getElementById('speed-test-progress').textContent = 'Testing download speed...';
            const downloadSpeed = await this.testDownloadSpeed();
            
            // Test upload speed
            document.getElementById('speed-test-progress').textContent = 'Testing upload speed...';
            const uploadSpeed = await this.testUploadSpeed();
            
            // Show results
            this.displaySpeedTestResults(downloadSpeed, uploadSpeed, ping);
            
        } catch (error) {
            console.error('Speed test failed:', error);
            this.addLog(`Network speed test failed: ${error.message}`);
            document.getElementById('speed-test-progress').textContent = 'Test failed - check connection';
        } finally {
            this.speedTestInProgress = false;
            document.getElementById('start-speed-test').disabled = false;
            document.getElementById('start-speed-test').textContent = 'Test Again';
        }
    }

    async testPing() {
        const startTime = performance.now();
        try {
            // Use a small image request to test latency
            await fetch('https://www.google.com/favicon.ico?t=' + Date.now(), { 
                method: 'HEAD',
                mode: 'no-cors',
                cache: 'no-cache'
            });
            const endTime = performance.now();
            return Math.round(endTime - startTime);
        } catch (error) {
            // Fallback ping test
            const startTime2 = performance.now();
            await new Promise(resolve => setTimeout(resolve, 10));
            return Math.round(performance.now() - startTime2 + 20); // Estimated
        }
    }

    async testDownloadSpeed() {
        const testSizes = [
            { url: 'https://httpbin.org/bytes/100000', size: 100000 }, // 100KB
            { url: 'https://httpbin.org/bytes/500000', size: 500000 }, // 500KB
            { url: 'https://httpbin.org/bytes/1000000', size: 1000000 } // 1MB
        ];
        
        let totalSpeed = 0;
        let validTests = 0;
        
        for (const test of testSizes) {
            try {
                const startTime = performance.now();
                const response = await fetch(test.url + '?t=' + Date.now());
                await response.blob();
                const endTime = performance.now();
                
                const duration = (endTime - startTime) / 1000; // seconds
                const speedMbps = (test.size * 8) / (duration * 1000000); // Mbps
                
                totalSpeed += speedMbps;
                validTests++;
            } catch (error) {
                console.log('Download test failed for size:', test.size);
            }
        }
        
        return validTests > 0 ? totalSpeed / validTests : 0;
    }

    async testUploadSpeed() {
        try {
            // Create test data
            const testData = new Blob([new ArrayBuffer(100000)]); // 100KB
            
            const startTime = performance.now();
            await fetch('https://httpbin.org/post', {
                method: 'POST',
                body: testData
            });
            const endTime = performance.now();
            
            const duration = (endTime - startTime) / 1000; // seconds
            const speedMbps = (100000 * 8) / (duration * 1000000); // Mbps
            
            return speedMbps;
        } catch (error) {
            console.log('Upload test failed:', error);
            return 0;
        }
    }

    displaySpeedTestResults(downloadSpeed, uploadSpeed, ping) {
        // Hide loading, show results
        document.getElementById('speed-test-loading').classList.add('hidden');
        document.getElementById('speed-test-results').classList.remove('hidden');
        
        // Format speeds
        const formatSpeed = (mbps) => {
            if (mbps >= 1000) {
                return `${(mbps / 1000).toFixed(1)} Gbps`;
            } else if (mbps >= 1) {
                return `${mbps.toFixed(1)} Mbps`;
            } else {
                return `${(mbps * 1000).toFixed(0)} Kbps`;
            }
        };
        
        // Update display
        document.getElementById('download-speed').textContent = formatSpeed(downloadSpeed);
        document.getElementById('upload-speed').textContent = formatSpeed(uploadSpeed);
        document.getElementById('ping-result').textContent = `${ping}ms`;
        
        // Log results
        this.addLog(`🌐 Network Speed Test: ↓${formatSpeed(downloadSpeed)} ↑${formatSpeed(uploadSpeed)} ${ping}ms`);
    }

    async refreshDevices() {
        this.addLog('🔄 Refreshing device list...');
        
        // Show loading state
        const button = document.getElementById('refresh-devices');
        const originalText = button.textContent;
        button.textContent = '⏳';
        button.disabled = true;
        
        try {
            // Stop any existing streams
            if (this.previewStream) {
                this.previewStream.getTracks().forEach(track => track.stop());
                this.previewStream = null;
            }
            if (this.micStream) {
                this.micStream.getTracks().forEach(track => track.stop());
                this.micStream = null;
            }
            
            // Clear current selections
            document.getElementById('camera-select').innerHTML = '<option value="">Loading cameras...</option>';
            document.getElementById('mic-select').innerHTML = '<option value="">Loading microphones...</option>';
            
            // Reload devices
            await this.loadDevices();
            
            this.addLog('✅ Device list refreshed successfully');
            
        } catch (error) {
            console.error('Failed to refresh devices:', error);
            this.addLog(`❌ Failed to refresh devices: ${error.message}`);
        } finally {
            // Restore button state
            button.textContent = originalText;
            button.disabled = false;
        }
    }

    showError(message) {
        // Simple error display - you could enhance this with a proper modal
        const indicator = document.getElementById('status-indicator');
        const text = document.getElementById('status-text');
        
        indicator.className = 'w-3 h-3 rounded-full status-error';
        text.textContent = 'Error';
        
        this.addLog(`ERROR: ${message}`);
        
        // Show logs panel if there's an error
        if (document.getElementById('log-panel').classList.contains('hidden')) {
            this.toggleLogPanel();
        }
        
        // Reset status after 5 seconds
        setTimeout(() => {
            if (!this.isStreaming) {
                this.updateStatus('idle');
            }
        }, 5000);
    }
}

// Initialize the app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.app = new MultiRTMPStreamer();
});

// Handle page unload
window.addEventListener('beforeunload', () => {
    if (window.app && window.app.previewStream) {
        window.app.previewStream.getTracks().forEach(track => track.stop());
    }
    if (window.app && window.app.micStream) {
        window.app.micStream.getTracks().forEach(track => track.stop());
    }
});