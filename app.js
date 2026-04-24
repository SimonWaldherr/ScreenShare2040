document.addEventListener('DOMContentLoaded', () => {
    const canvas   = document.getElementById('c');
    const ctx      = canvas.getContext('2d');
    const video    = document.querySelector('video');
    const statusDot = document.getElementById('statusDot');

    // ── State ────────────────────────────────────────────────────────────────
    let ip          = localStorage.getItem('ip') || '';
    let currentMode = 'draw';
    let clockType   = 'minimal';
    let tool        = 'pen';
    let drawing     = false;
    let lineStart   = null;
    let rectStart   = null;
    let sendTimer   = null;
    let brightTimer = null;
    let shareAnimId = null;
    let trimData    = null;

    const MAX_UNDO  = 5;
    const undoStack = [];

    // ── Boot ─────────────────────────────────────────────────────────────────
    scaleCanvas();
    ctx.fillStyle = 'black';
    ctx.fillRect(0, 0, 64, 64);
    if (ip) {
        document.getElementById('ip').value = ip;
        testConnection();
    }
    window.addEventListener('resize', scaleCanvas);

    // Scale the 64×64 canvas to fill the available area while keeping aspect ratio.
    function scaleCanvas() {
        const wrap = document.getElementById('canvasWrap');
        const area = document.querySelector('.canvas-area');
        const maxW = area.clientWidth  - 24;
        const maxH = area.clientHeight - 24;
        const side = Math.floor(Math.min(maxW, maxH) / 64) * 64 || 64;
        canvas.style.width  = side + 'px';
        canvas.style.height = side + 'px';
        wrap.style.width    = side + 'px';
        wrap.style.height   = side + 'px';
    }

    // ── Connection ───────────────────────────────────────────────────────────
    window.testConnection = async () => {
        ip = document.getElementById('ip').value.trim();
        localStorage.setItem('ip', ip);
        statusDot.className = 'status-dot';
        try {
            const res = await fetch(`http://${ip}/api/status`,
                { signal: AbortSignal.timeout(4000) });
            if (res.ok) {
                statusDot.className = 'status-dot online';
                const data = await res.json();
                const bv = data.brightness ?? 128;
                document.getElementById('brightness').value = bv;
                document.getElementById('brightnessVal').textContent = bv;
            } else {
                statusDot.className = 'status-dot offline';
            }
        } catch {
            statusDot.className = 'status-dot offline';
        }
    };

    // ── Send pixel frame ─────────────────────────────────────────────────────
    const sendPixels = (immediate = false) => {
        clearTimeout(sendTimer);
        sendTimer = setTimeout(() => {
            const imageData = ctx.getImageData(0, 0, 64, 64);
            const data      = imageData.data;
            const output    = new Uint8Array(64 * 64 * 2);
            for (let y = 0; y < 64; y++) {
                for (let x = 0; x < 64; x++) {
                    const i   = (y * 64 + x) * 4;
                    const r   = data[i]     >> 3;
                    const g   = data[i + 1] >> 2;
                    const b   = data[i + 2] >> 3;
                    const c   = r | (g << 5) | (b << 11);
                    const out = (y * 64 + x) * 2;
                    output[out]     = c & 0xff;
                    output[out + 1] = c >> 8;
                }
            }
            fetch(`http://${ip}`, {
                method: 'POST',
                headers: { 'Accept-Language': '', Accept: '' },
                body: output
            }).then(() => {
                statusDot.className = 'status-dot online';
            }).catch(() => {
                statusDot.className = 'status-dot offline';
            });
        }, immediate ? 0 : 30);
    };

    // ── Mode switching ───────────────────────────────────────────────────────
    const ALL_MODES  = ['draw', 'upload', 'share', 'text', 'clock', 'wifi'];
    const ALL_PANELS = ['draw', 'text', 'clock', 'wifi'];

    window.changeMode = (mode) => {
        // Stop screen-share if leaving that mode
        if (currentMode === 'share' && video.srcObject) {
            video.srcObject.getTracks().forEach(t => t.stop());
            video.srcObject = null;
            video.style.display = 'none';
            if (shareAnimId) { cancelAnimationFrame(shareAnimId); shareAnimId = null; }
        }

        currentMode = mode;

        // Update sidebar mode buttons
        ALL_MODES.forEach(m => {
            const btn = document.getElementById(`mode-${m}`);
            if (btn) btn.classList.toggle('active', m === mode);
        });

        // Show relevant tool panel
        ALL_PANELS.forEach(p => {
            const el = document.getElementById(`panel-${p}`);
            if (el) el.style.display = 'none';
        });
        if (ALL_PANELS.includes(mode)) {
            document.getElementById(`panel-${mode}`).style.display = '';
        }

        if (mode === 'draw') {
            canvas.style.pointerEvents = 'auto';
            video.style.display = 'none';
        } else if (mode === 'upload') {
            canvas.style.pointerEvents = 'none';
            video.style.display = 'none';
            document.getElementById('uploadInput').click();
        } else if (mode === 'share') {
            canvas.style.pointerEvents = 'none';
            startCapture();
        } else {
            canvas.style.pointerEvents = 'none';
            video.style.display = 'none';
        }
    };

    // ── Tool selection ───────────────────────────────────────────────────────
    window.setTool = (t) => {
        tool = t;
        ['pen', 'eraser', 'fill', 'line', 'rect'].forEach(n => {
            const btn = document.getElementById(`tool-${n}`);
            if (btn) btn.classList.toggle('active', n === t);
        });
    };

    // ── Undo ─────────────────────────────────────────────────────────────────
    const saveState = () => {
        undoStack.push(ctx.getImageData(0, 0, 64, 64));
        if (undoStack.length > MAX_UNDO) undoStack.shift();
    };

    window.undo = () => {
        if (undoStack.length) {
            ctx.putImageData(undoStack.pop(), 0, 0);
            sendPixels();
        }
    };

    // ── Actions ──────────────────────────────────────────────────────────────
    window.action = (a) => {
        if (a === 'clear') {
            saveState();
            ctx.fillStyle = 'black';
            ctx.fillRect(0, 0, 64, 64);
            sendPixels(true);
        } else if (a === 'save') {
            const link = document.createElement('a');
            link.download = 'led-canvas.png';
            link.href = canvas.toDataURL('image/png');
            link.click();
        } else if (a === 'invert') {
            saveState();
            const img = ctx.getImageData(0, 0, 64, 64);
            for (let i = 0; i < img.data.length; i += 4) {
                img.data[i]     = 255 - img.data[i];
                img.data[i + 1] = 255 - img.data[i + 1];
                img.data[i + 2] = 255 - img.data[i + 2];
            }
            ctx.putImageData(img, 0, 0);
            sendPixels();
        }
    };

    // ── Flood fill ───────────────────────────────────────────────────────────
    const floodFill = (startX, startY, [fr, fg, fb]) => {
        const img   = ctx.getImageData(0, 0, 64, 64);
        const d     = img.data;
        const W     = 64;

        const idx   = (x, y) => (y * W + x) * 4;
        const ti    = idx(startX, startY);
        const [tr, tg, tb] = [d[ti], d[ti + 1], d[ti + 2]];

        // Nothing to do if target already matches fill colour
        if (tr === fr && tg === fg && tb === fb) return;

        const stack = [startX + startY * W];
        const seen  = new Uint8Array(W * W);

        while (stack.length) {
            const p = stack.pop();
            const x = p % W;
            const y = (p - x) / W;
            if (x < 0 || x >= W || y < 0 || y >= 64) continue;
            if (seen[p]) continue;
            const i = p * 4;
            if (d[i] !== tr || d[i + 1] !== tg || d[i + 2] !== tb) continue;
            seen[p] = 1;
            d[i] = fr; d[i + 1] = fg; d[i + 2] = fb; d[i + 3] = 255;
            stack.push(p + 1, p - 1, p + W, p - W);
        }
        ctx.putImageData(img, 0, 0);
    };

    // ── Canvas coordinate helper ─────────────────────────────────────────────
    const canvasXY = (e) => {
        const rect = canvas.getBoundingClientRect();
        const src  = e.touches ? e.touches[0] : e;
        return {
            x: Math.max(0, Math.min(63, Math.floor((src.clientX - rect.left) * 64 / rect.width))),
            y: Math.max(0, Math.min(63, Math.floor((src.clientY - rect.top)  * 64 / rect.height)))
        };
    };

    const hexToRgb = (hex) => [
        parseInt(hex.slice(1, 3), 16),
        parseInt(hex.slice(3, 5), 16),
        parseInt(hex.slice(5, 7), 16)
    ];

    // ── Drawing events ───────────────────────────────────────────────────────
    const onStart = (e) => {
        if (currentMode !== 'draw') return;
        e.preventDefault();
        const { x, y } = canvasXY(e);

        if (tool === 'fill') {
            saveState();
            floodFill(x, y, hexToRgb(document.getElementById('penColor').value));
            sendPixels();
            return;
        }
        if (tool === 'line')  { lineStart = { x, y }; return; }
        if (tool === 'rect')  { rectStart = { x, y }; return; }

        drawing = true;
        saveState();
        ctx.beginPath();
        ctx.moveTo(x, y);
    };

    const onMove = (e) => {
        if (currentMode !== 'draw' || !drawing) return;
        e.preventDefault();
        const { x, y } = canvasXY(e);
        ctx.lineWidth  = 1;
        ctx.lineCap    = 'round';
        ctx.strokeStyle = tool === 'eraser'
            ? 'black'
            : document.getElementById('penColor').value;
        ctx.lineTo(x, y);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(x, y);
        sendPixels();
    };

    const onEnd = (e) => {
        if (currentMode !== 'draw') return;
        e.preventDefault();
        const { x, y } = canvasXY(e.changedTouches ? { touches: e.changedTouches } : e);

        if (tool === 'line' && lineStart) {
            saveState();
            ctx.beginPath();
            ctx.lineWidth   = 1;
            ctx.strokeStyle = document.getElementById('penColor').value;
            ctx.moveTo(lineStart.x, lineStart.y);
            ctx.lineTo(x, y);
            ctx.stroke();
            lineStart = null;
            sendPixels();
        } else if (tool === 'rect' && rectStart) {
            saveState();
            ctx.lineWidth   = 1;
            ctx.strokeStyle = document.getElementById('penColor').value;
            ctx.strokeRect(rectStart.x, rectStart.y, x - rectStart.x, y - rectStart.y);
            rectStart = null;
            sendPixels();
        } else if (drawing) {
            drawing = false;
            ctx.beginPath();
            sendPixels();
        }
    };

    canvas.addEventListener('mousedown',  onStart);
    canvas.addEventListener('mousemove',  onMove);
    canvas.addEventListener('mouseup',    onEnd);
    canvas.addEventListener('mouseleave', onEnd);
    canvas.addEventListener('touchstart', onStart, { passive: false });
    canvas.addEventListener('touchmove',  onMove,  { passive: false });
    canvas.addEventListener('touchend',   onEnd,   { passive: false });

    // ── Image upload ─────────────────────────────────────────────────────────
    document.getElementById('uploadInput').addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
            const img = new Image();
            img.onload = () => {
                saveState();
                ctx.drawImage(img, 0, 0, 64, 64);
                sendPixels(true);
            };
            img.src = ev.target.result;
        };
        reader.readAsDataURL(file);
        e.target.value = '';
    });

    // ── Screen share ─────────────────────────────────────────────────────────
    const trimImageData = (imageData) => {
        const { data, width, height } = imageData;
        let minX = width, maxX = 0, minY = height, maxY = 0;
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const i = (y * width + x) * 4;
                const r = data[i], g = data[i + 1], b = data[i + 2];
                if (r > 8 || g > 8 || b > 8) {
                    if (x < minX) minX = x;
                    if (x > maxX) maxX = x;
                    if (y < minY) minY = y;
                    if (y > maxY) maxY = y;
                }
            }
        }
        return (maxX > minX && maxY > minY)
            ? { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 }
            : null;
    };

    const drawVideoFrame = () => {
        if (currentMode !== 'share') return;
        if (video.readyState >= video.HAVE_CURRENT_DATA) {
            ctx.clearRect(0, 0, 64, 64);
            if (trimData) {
                const { x, y, width, height } = trimData;
                ctx.drawImage(video, x, y, width, height, 0, 0, 64, 64);
            } else {
                ctx.drawImage(video, 0, 0, 64, 64);
            }
            sendPixels();
        }
        shareAnimId = requestAnimationFrame(drawVideoFrame);
    };

    const startCapture = async () => {
        ip = document.getElementById('ip').value.trim();
        localStorage.setItem('ip', ip);
        try {
            video.srcObject = await navigator.mediaDevices.getDisplayMedia({
                video: { cursor: 'always' }, audio: false
            });
            video.onloadedmetadata = async () => {
                const tmp    = document.createElement('canvas');
                const tmpCtx = tmp.getContext('2d');
                tmp.width  = video.videoWidth;
                tmp.height = video.videoHeight;
                tmpCtx.drawImage(video, 0, 0);
                trimData = trimImageData(tmpCtx.getImageData(0, 0, tmp.width, tmp.height));
                await video.play();
                drawVideoFrame();
            };
            video.srcObject.getVideoTracks()[0].addEventListener('ended', () => changeMode('draw'));
        } catch {
            changeMode('draw');
        }
    };

    // ── Text mode ────────────────────────────────────────────────────────────
    window.sendText = async (clearFirst = false) => {
        ip = document.getElementById('ip').value.trim();
        const text  = document.getElementById('textInput').value;
        const x     = parseInt(document.getElementById('textX').value, 10);
        const y     = parseInt(document.getElementById('textY').value, 10);
        const color = hexToRgb(document.getElementById('textColor').value);
        const size  = document.getElementById('textSize').value;
        try {
            const res = await fetch(`http://${ip}/api/text`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text, x, y, r: color[0], g: color[1], b: color[2], size, clear: clearFirst })
            });
            statusDot.className = res.ok ? 'status-dot online' : 'status-dot offline';
        } catch {
            statusDot.className = 'status-dot offline';
        }
    };

    // ── Brightness ───────────────────────────────────────────────────────────
    window.updateBrightness = (val) => {
        document.getElementById('brightnessVal').textContent = val;
        clearTimeout(brightTimer);
        brightTimer = setTimeout(async () => {
            ip = document.getElementById('ip').value.trim();
            try {
                await fetch(`http://${ip}/api/brightness`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ level: parseInt(val, 10) })
                });
            } catch { /* ignore */ }
        }, 200);
    };

    // ── WiFi config ──────────────────────────────────────────────────────────
    window.saveWifi = async () => {
        ip = document.getElementById('ip').value.trim();
        const ssid = document.getElementById('wifiSsid').value.trim();
        const pass = document.getElementById('wifiPass').value;
        if (!ssid) { alert('SSID is required.'); return; }
        try {
            const res = await fetch(`http://${ip}/api/config`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ssid, password: pass })
            });
            if (res.ok) {
                alert('Saved! The Pico will reboot and try to connect to "' + ssid + '".');
            } else {
                alert('Failed to save config.');
            }
        } catch {
            alert('Could not reach the Pico.');
        }
    };

    // ── Clock ────────────────────────────────────────────────────────────────
    window.setClockType = (type, btn) => {
        clockType = type;
        document.querySelectorAll('#panel-clock .sb-btn').forEach(b => b.classList.remove('active'));
        if (btn) btn.classList.add('active');
    };

    const drawHand = (angle, len, width, color) => {
        const a = angle - Math.PI / 2;
        ctx.beginPath();
        ctx.lineWidth   = width;
        ctx.lineCap     = 'round';
        ctx.strokeStyle = color;
        ctx.moveTo(32, 32);
        ctx.lineTo(32 + Math.cos(a) * len, 32 + Math.sin(a) * len);
        ctx.stroke();
    };

    const drawBinary = (value, offsetY) => {
        const bin = value.toString(2).padStart(6, '0');
        for (let i = 0; i < 6; i++) {
            ctx.fillStyle = bin[i] === '1' ? '#4cf' : '#1a1a2e';
            ctx.fillRect(i * 10 + 2, offsetY, 8, 12);
        }
    };

    const drawBar = (value, row, color, max) => {
        ctx.fillStyle = '#111';
        ctx.fillRect(0, row * 20 + 2, 64, 16);
        ctx.fillStyle = color;
        ctx.fillRect(1, row * 20 + 3, Math.round(62 * value / max), 14);
    };

    const drawSegmentArc = (value, outerR, innerR, color) => {
        const endAngle = (value / 30 * Math.PI) - Math.PI / 2;
        ctx.beginPath();
        ctx.arc(32, 32, outerR, -Math.PI / 2, endAngle, false);
        ctx.arc(32, 32, innerR,  endAngle, -Math.PI / 2, true);
        ctx.closePath();
        ctx.fillStyle = color;
        ctx.fill();
    };

    const drawDot = (value, max, dist) => {
        const a = (value / max * Math.PI * 2) - Math.PI / 2;
        ctx.beginPath();
        ctx.arc(32 + dist * Math.cos(a), 32 + dist * Math.sin(a), 2, 0, Math.PI * 2);
        ctx.fillStyle = '#fff';
        ctx.fill();
    };

    const drawCircleMarker = (value, max, dist, size) => {
        const a = (value / max * Math.PI * 2) - Math.PI / 2;
        ctx.beginPath();
        ctx.arc(32 + dist * Math.cos(a), 32 + dist * Math.sin(a), size, 0, Math.PI * 2);
        ctx.fillStyle = '#fff';
        ctx.fill();
    };

    const drawClock = () => {
        if (currentMode !== 'clock') return;
        ctx.fillStyle = 'black';
        ctx.fillRect(0, 0, 64, 64);

        const now    = new Date();
        const hour   = now.getHours();
        const minute = now.getMinutes();
        const second = now.getSeconds();
        const ms     = now.getMilliseconds();

        if (clockType === 'minimal') {
            // Clock face outline
            ctx.strokeStyle = '#333';
            ctx.lineWidth   = 1;
            ctx.beginPath();
            ctx.arc(32, 32, 30, 0, Math.PI * 2);
            ctx.stroke();
            // Hour dots
            for (let i = 0; i < 12; i++) {
                const a = (i / 12) * Math.PI * 2 - Math.PI / 2;
                ctx.beginPath();
                ctx.arc(32 + 27 * Math.cos(a), 32 + 27 * Math.sin(a), 1, 0, Math.PI * 2);
                ctx.fillStyle = '#555';
                ctx.fill();
            }
            const hAngle  = ((hour % 12) / 12 + minute / 720) * Math.PI * 2;
            const mAngle  = (minute / 60  + second / 3600)     * Math.PI * 2;
            const sAngle  = (second / 60  + ms / 60000)        * Math.PI * 2;
            drawHand(hAngle, 17, 2, '#ffffff');
            drawHand(mAngle, 24, 1, '#aaaaaa');
            drawHand(sAngle, 27, 1, '#e94560');
            ctx.beginPath();
            ctx.arc(32, 32, 2, 0, Math.PI * 2);
            ctx.fillStyle = '#fff';
            ctx.fill();
        } else if (clockType === 'digital') {
            const t = [hour, minute, second].map(v => String(v).padStart(2, '0')).join(':');
            ctx.font          = '10px monospace';
            ctx.fillStyle     = '#00ff88';
            ctx.textAlign     = 'center';
            ctx.textBaseline  = 'middle';
            ctx.fillText(t, 32, 32);
        } else if (clockType === 'abstract') {
            drawCircleMarker(hour % 12, 12, 16, 3);
            drawCircleMarker(minute,    60, 22, 2);
            drawCircleMarker(second,    60, 28, 1.5);
        } else if (clockType === 'binary') {
            drawBinary(hour,   4);
            drawBinary(minute, 24);
            drawBinary(second, 44);
        } else if (clockType === 'bar') {
            drawBar(hour % 24, 0, '#ff4444', 24);
            drawBar(minute,    1, '#44ff44', 60);
            drawBar(second,    2, '#4488ff', 60);
        } else if (clockType === 'segment') {
            drawSegmentArc(hour % 12, 28, 20, '#ff4444');
            drawSegmentArc(minute,    18, 10, '#44ff44');
            drawSegmentArc(second,     8,  1, '#4488ff');
        } else if (clockType === 'dot') {
            drawDot(hour % 12, 12, 20);
            drawDot(minute,    60, 14);
            drawDot(second,    60,  8);
        }

        sendPixels();
    };

    setInterval(drawClock, 250);
});
