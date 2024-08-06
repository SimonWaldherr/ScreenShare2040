document.addEventListener('DOMContentLoaded', () => {
    const canvas = document.getElementById('c');
    const ctx = canvas.getContext('2d');
    const video = document.querySelector('video');
    let ip = localStorage.getItem('ip') || '';
    let debounceTimer;
    let drawing = false;
    let currentMode = 'draw';
    let clockType = 'minimal';
    let trimData = null;

    // set default pen color   
    document.querySelector('#color').value = '#ffffff';

    window.setClockType = (type) => {
        clockType = type;
        currentMode = 'clock';
    };

    window.changeMode = (mode) => {
        if (currentMode === 'share') {
            video.srcObject.getTracks().forEach(track => track.stop());
        }
        currentMode = mode;

        if (mode === 'draw') {
            canvas.style.pointerEvents = 'auto';
            video.style.display = 'none';
            canvas.width = 64;
            canvas.height = 64;
            ctx.fillStyle = 'black';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
        } else if (mode === 'upload') {
            canvas.style.pointerEvents = 'none';
            video.style.display = 'none';
            document.getElementById('upload').click();
        } else if (mode === 'share') {
            canvas.style.pointerEvents = 'none';
            video.style.display = 'none';
            startCapture();
        }
    };

    const getCanvasScale = () => {
        const style = window.getComputedStyle(canvas);
        const scaleX = parseFloat(style.transform.split(',')[0].replace('matrix(', '')) || 1;
        const scaleY = parseFloat(style.transform.split(',')[3]) || 1;
        return { scaleX, scaleY };
    };

    const convertCanvas16Bit = (canvas, width, height) => {
        const imageData = canvas.getImageData(0, 0, width, height);
        const data = imageData.data;
        const output = new Uint8Array(2 * (width * height));

        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const index = 4 * (x + y * width);
                const r = data[index] >> 3;
                const g = data[index + 1] >> 2;
                const b = data[index + 2] >> 3;
                const color = r | (g << 5) | (b << 11);
                output[2 * (y * width + x)] = color & 255;
                output[2 * (y * width + x) + 1] = color >> 8;
            }
        }

        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
            const xhr = new XMLHttpRequest();
            xhr.open('POST', `http://${ip}`, true);
            xhr.setRequestHeader('Accept-Language', '');
            xhr.setRequestHeader('Accept', '');
            xhr.send(output);
        }, 25);
    };

    const trimVideoFrame = (video) => {
        return new Promise((resolve) => {
            const tempCanvas = document.createElement('canvas');
            const tempCtx = tempCanvas.getContext('2d');
            tempCanvas.width = video.videoWidth;
            tempCanvas.height = video.videoHeight;

            tempCtx.drawImage(video, 0, 0);
            const imageData = tempCtx.getImageData(0, 0, tempCanvas.width, tempCanvas.height);
            const trimmed = trimImageData(imageData);

            trimData = trimmed;
            resolve();
        });
    };

    const trimImageData = (imageData) => {
        const { data, width, height } = imageData;
        let minX = width, maxX = 0, minY = height, maxY = 0;

        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const index = (y * width + x) * 4;
                const r = data[index];
                const g = data[index + 1];
                const b = data[index + 2];

                if (isSignificantColor(r, g, b)) {
                    if (x < minX) minX = x;
                    if (x > maxX) maxX = x;
                    if (y < minY) minY = y;
                    if (y > maxY) maxY = y;
                }
            }
        }

        return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
    };

    const isSignificantColor = (r, g, b) => {
        return !(r === 0 && g === 0 && b === 0) && !(r === 255 && g === 255 && b === 255);
    };

    const drawVideo = () => {
        const draw = () => {
            if (video.readyState >= video.HAVE_CURRENT_DATA) {
                ctx.clearRect(0, 0, canvas.width, canvas.height);

                if (trimData) {
                    const { x, y, width, height } = trimData;
                    const scaleX = canvas.width / width;
                    const scaleY = canvas.height / height;

                    const drawWidth = canvas.width;
                    const drawHeight = canvas.height;

                    const dx = (canvas.width - drawWidth) / 2;
                    const dy = (canvas.height - drawHeight) / 2;

                    ctx.drawImage(video, x, y, width, height, dx, dy, drawWidth, drawHeight);
                    convertCanvas16Bit(ctx, 64, 64);
                }
            }

            requestAnimationFrame(draw);
        };

        draw();
    };

    const startCapture = async () => {
        ip = document.querySelector('#ip').value;
        localStorage.setItem('ip', ip);
        try {
            video.srcObject = await navigator.mediaDevices.getDisplayMedia({
                video: { cursor: 'always' },
                audio: false
            });
            video.onloadedmetadata = async () => {
                await trimVideoFrame(video);
                video.play();
                drawVideo();
            };
        } catch (error) {
            console.error('Error accessing display media:', error);
        }
    };

    let tool = 'pen';

    window.setTool = (t) => {
        tool = t;
    };

    window.action = (a) => {
        if (a === 'clear') {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.fillStyle = 'black';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            convertCanvas16Bit(ctx, 64, 64);
        } else if (a === 'save') {
            const link = document.createElement('a');
            link.download = 'image.png';
            link.href = canvas.toDataURL('image/png');
            link.click();
        } else if (a === 'invert') {
            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const data = imageData.data;

            for (let i = 0; i < data.length; i += 4) {
                data[i] = 255 - data[i];
                data[i + 1] = 255 - data[i + 1];
                data[i + 2] = 255 - data[i + 2];
            }

            ctx.putImageData(imageData, 0, 0);
            convertCanvas16Bit(ctx, 64, 64);
        }
    }

    const draw = (event) => {
        if (!drawing) return;
        const { scaleX, scaleY } = getCanvasScale();
        const rect = canvas.getBoundingClientRect();
        const x = (event.clientX - rect.left) / scaleX;
        const y = (event.clientY - rect.top) / scaleY;

        ctx.lineWidth = 2;
        ctx.lineCap = 'round';

        if (tool === 'pen') {
            ctx.strokeStyle = 'white';
            ctx.strokeStyle = document.querySelector('#color').value;
        } else if (tool === 'eraser') {
            ctx.strokeStyle = 'black';
        }
        ctx.lineTo(x, y);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(x, y);
    };

    const startPosition = (event) => {
        drawing = true;
        draw(event);
    };

    const endPosition = () => {
        if (drawing) {
            drawing = false;
            ctx.beginPath();
            convertCanvas16Bit(ctx, 64, 64);
        }
    };

    const handleImage = (event) => {
        const file = event.target.files[0];
        const reader = new FileReader();

        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                canvas.width = 64;
                canvas.height = 64;
                ctx.drawImage(img, 0, 0, 64, 64);
                convertCanvas16Bit(ctx, 64, 64);
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    };
    
    const radius = canvas.width / 2;

    const drawClock = () => {
        if (currentMode !== 'clock') return;

        ctx.clearRect(0, 0, canvas.width, canvas.height);
        const now = new Date();
        const [hour, minute, second] = [now.getHours(), now.getMinutes(), now.getSeconds()];
        
        if (clockType === 'digital') {
            const timeString = [hour, minute, second].map(val => val.toString().padStart(2, '0')).join(':');
            //ctx.font = '16px Arial';
            ctx.fontWeight = 'thinner';
            ctx.font = '16px sans-serif';
            
            ctx.fillStyle = '#fff';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(timeString, radius, radius);
        } else if (clockType === 'abstract') {
            drawCircle(hour % 12, radius * 0.5, radius * 0.1);
            drawCircle(minute, radius * 0.7, radius * 0.05);
            drawCircle(second, radius * 0.9, radius * 0.02);
        } else if (clockType === 'binary') {
            [hour, minute, second].forEach((val, idx) => drawBinary(val, idx * 20 + 10));
        } else if (clockType === 'raster') {
            [hour, minute, second].forEach((val, idx) => drawBinary(val, idx * 20 + 10));
        } else if (clockType === 'bar') {
            drawBar(hour, 0, 'red');
            drawBar(minute, 1, 'green');
            drawBar(second, 2, 'blue');
        } else if (clockType === 'segment') {
            drawSegment(hour % 12, radius * 0.6, radius * 0.4, 'red');
            drawSegment(minute, radius * 0.8, radius * 0.6, 'green');
            drawSegment(second, radius * 1, radius * 0.8, 'blue');
        } else if (clockType === 'dot') {
            drawDot(hour % 12, radius * 0.5);
            drawDot(minute, radius * 0.7);
            drawDot(second, radius * 0.9);
        }

        convertCanvas16Bit(ctx, 64, 64);
    };

    const drawHand = (pos, length, width) => {
        ctx.beginPath();
        ctx.lineWidth = width;
        ctx.lineCap = 'round';
        ctx.moveTo(radius, radius);
        ctx.rotate(pos);
        ctx.lineTo(radius, radius - length);
        ctx.strokeStyle = '#fff';
        ctx.stroke();
        ctx.rotate(-pos);
    };

    const drawCircle = (value, distance, size) => {
        const angle = (value * Math.PI / 30) - Math.PI / 2;
        const x = radius + distance * Math.cos(angle);
        const y = radius + distance * Math.sin(angle);
        ctx.beginPath();
        ctx.arc(x, y, size, 0, 2 * Math.PI);
        ctx.fillStyle = '#fff';
        ctx.fill();
    };

    const drawBinary = (value, offset) => {
        const binaryString = value.toString(2).padStart(6, '0');
        for (let i = 0; i < 6; i++) {
            ctx.fillStyle = binaryString[i] === '1' ? '#fff' : '#333';
            ctx.fillRect(i * 10 + 2, offset, 8, 8);
        }
    };

    const drawBar = (value, row, color) => {
        const barWidth = canvas.width * (value / 60);
        ctx.fillStyle = color;
        ctx.fillRect(0, row * 10 + 5, barWidth, 10);
    };

    const drawSegment = (value, outerRadius, innerRadius, color) => {
        const angle = (value * Math.PI / 30) - Math.PI / 2;
        ctx.beginPath();
        ctx.arc(radius, radius, outerRadius, -Math.PI / 2, angle, false);
        ctx.lineTo(radius + innerRadius * Math.cos(angle), radius + innerRadius * Math.sin(angle));
        ctx.arc(radius, radius, innerRadius, angle, -Math.PI / 2, true);
        ctx.closePath();
        ctx.fillStyle = color;
        ctx.fill();
    };

    const drawDot = (value, distance) => {
        const angle = (value * Math.PI / 30) - Math.PI / 2;
        const x = radius + distance * Math.cos(angle);
        const y = radius + distance * Math.sin(angle);
        ctx.beginPath();
        ctx.arc(x, y, 2, 0, 2 * Math.PI);
        ctx.fillStyle = '#fff';
        ctx.fill();
    };

    setInterval(drawClock, 250);

    canvas.addEventListener('mousedown', startPosition);
    canvas.addEventListener('mouseup', endPosition);
    canvas.addEventListener('mousemove', draw);

    if (ip) {
        document.querySelector('#ip').value = ip;
    }

    document.querySelector('#upload').addEventListener('change', handleImage);
});
