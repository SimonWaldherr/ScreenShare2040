import network
import socket
import time
import gc
import json
import hub75
import machine

# Constants
HEIGHT = 64
WIDTH = 64
FRAME_BYTES = WIDTH * HEIGHT * 2
AP_SSID = 'pico_ap'
AP_PASSWORD = '12345678'
WEB_PORT = 80
CONFIG_FILE = 'config.json'

# Current brightness level (0-255)
brightness_level = 128

# Initialize the display
display = hub75.Hub75(WIDTH, HEIGHT)

# Small 5x5 character bitmaps for displaying the IP address on boot
nums = {
    '0': ["01110", "10001", "10001", "10001", "01110"],
    '1': ["00100", "01100", "00100", "00100", "01110"],
    '2': ["11110", "00001", "01110", "10000", "11111"],
    '3': ["11110", "00001", "00110", "00001", "11110"],
    '4': ["10000", "10010", "10010", "11111", "00010"],
    '5': ["11111", "10000", "11110", "00001", "11110"],
    '6': ["01110", "10000", "11110", "10001", "01110"],
    '7': ["11111", "00010", "00100", "01000", "10000"],
    '8': ["01110", "10001", "01110", "10001", "01110"],
    '9': ["01110", "10001", "01111", "00001", "01110"],
    ' ': ["00000", "00000", "00000", "00000", "00000"],
    '.': ["00000", "00000", "00000", "00000", "00001"],
    ':': ["00000", "00100", "00000", "00100", "00000"],
    '/': ["00001", "00010", "00100", "01000", "10000"],
    '-': ["00000", "00000", "11111", "00000", "00000"],
    '=': ["00000", "11111", "00000", "11111", "00000"],
    '+': ["00000", "00100", "01110", "00100", "00000"],
    '*': ["00000", "10101", "01110", "10101", "00000"],
    '(': ["00010", "00100", "00100", "00100", "00010"],
    ')': ["00100", "00010", "00010", "00010", "00100"]
}


def draw_char_small(x, y, char, r, g, b):
    if char in nums:
        matrix = nums[char]
        for row in range(5):
            for col in range(5):
                if matrix[row][col] == '1':
                    display.set_pixel(x + col, y + row, r, g, b)

def draw_text_small(x, y, text, r, g, b):
    offset_x = x
    prev_char = ''
    for char in text:
        if char == ' ': offset_x += 3
        if char == '.': offset_x -= 4
        if prev_char == ' ': offset_x -= 3
        if prev_char == '1': offset_x -= 1
        if prev_char == '.': offset_x -= 1
        if prev_char == '7' and char == '8': offset_x -= 1

        prev_char = char
        draw_char_small(offset_x, y, char, r, g, b)
        offset_x += 6

# 8x8 character bitmaps for full-size text rendering
char_dict = {'A': '3078ccccfccccc00', 'B': 'fc66667c6666fc00', 'C': '3c66c0c0c0663c00', 'D': 'f86c6666666cf800', 'E': 'fe6268786862fe00', 'F': 'fe6268786860f000', 'G': '3c66c0c0ce663e00', 'H': 'ccccccfccccccc00', 'I': '7830303030307800', 'J': '1e0c0c0ccccc7800', 'K': 'f6666c786c66f600', 'L': 'f06060606266fe00', 'M': 'c6eefefed6c6c600', 'N': 'c6e6f6decec6c600', 'O': '386cc6c6c66c3800', 'P': 'fc66667c6060f000', 'Q': '78ccccccdc781c00', 'R': 'fc66667c6c66f600', 'S': '78cce0380ccc7800', 'T': 'fcb4303030307800', 'U': 'ccccccccccccfc00', 'V': 'cccccccccc783000', 'W': 'c6c6c6d6feeec600', 'X': 'c6c66c38386cc600', 'Y': 'cccccc7830307800', 'Z': 'fec68c183266fe00', 'a': '0000780c7ccc7600', 'b': 'e060607c6666dc00', 'c': '000078ccc0cc7800', 'd': '1c0c0c7ccccc7600', 'e': '000078ccfcc07800', 'f': '386c60f06060f000', 'g': '000076cccc7c0cf8', 'h': 'e0606c766666e600', 'i': '3000703030307800', 'j': '0c000c0c0ccccc78', 'k': 'e060666c786ce600', 'l': '7030303030307800', 'm': '0000ccfefed6c600', 'n': '0000f8cccccccc00', 'o': '000078cccccc7800', 'p': '0000dc667c60f0', 'q': '000076cccc7c0c1e', 'r': '00009c766660f000', 's': '00007cc0780cf800', 't': '10307c3030341800', 'u': '0000cccccccc7600', 'v': '0000cccccc783000', 'w': '0000c6c6d6fe6c00', 'x': '0000c66c386cc600', 'y': '0000cccccc7c0cf8', 'z': '0000fc983064fc00', '0': '78ccdcfceccc7c00', '1': '307030303030fc00', '2': '78cc0c3860ccfc00', '3': '78cc0c380ccc7800', '4': '1c3c6cccfe0c1e00', '5': 'fcc0f80c0ccc7800', '6': '3860c0f8cccc7800', '7': 'fccc0c1830303000', '8': '78cccc78cccc7800', '9': '78cccc7c0c187000', '!': '3078783030003000', '#': '6c6cfe6cfe6c6c00', '$': '307cc0780cf83000', '%': '00c6cc183066c600', '&': '386c3876dccc7600', '?': '78cc0c1830003000', ' ': '0000000000000000', '.': '0000000000003000', ':': '0030000000300000','(': '0c18303030180c00', ')': '6030180c18306000', '[': '78c0c0c0c0c07800', ']': 'c06060606060c000', '{': '0c18306030180c00', '}': '6030180c18306000', '<': '0c18306030180c00', '>': '6030180c18306000', '=': '0000fc0000fc0000', '+': '0000187e18180000', '-': '0000007e00000000', '*': 'c66c3810386cc600', '/': '0000060c18306000', '\\': '00006030180c0c00', '_': '00000000000000fe', '|': '1818181818181800', ';': '0000003018003000', ',': '0000000000303000', "'": '3030300000000000', '"': 'cccc000000000000', '`': '0c18300000000000', '@': '3c66dececec07e00', '^': '183c666600000000', '█': 'ffffffffffffffff'}

def hsb_to_rgb(hue, saturation, brightness):
    hue_normalized = (hue % 360) / 60
    hue_index = int(hue_normalized)
    hue_fraction = hue_normalized - hue_index

    value1 = brightness * (1 - saturation)
    value2 = brightness * (1 - saturation * hue_fraction)
    value3 = brightness * (1 - saturation * (1 - hue_fraction))

    red, green, blue = [
        (brightness, value3, value1),
        (value2, brightness, value1),
        (value1, brightness, value3),
        (value1, value2, brightness),
        (value3, value1, brightness),
        (brightness, value1, value2)
    ][hue_index]

    return int(red * 255), int(green * 255), int(blue * 255)

def draw_pixel(x, y, r, g, b):
    display.set_pixel(x, y, r, g, b)

def draw_char(x, y, char, r, g, b):
    if char in char_dict:
        hex_string = char_dict[char]
        for row in range(8):
            hex_value = hex_string[row * 2:row * 2 + 2]
            bin_value = f"{int(hex_value, 16):08b}"
            for col in range(8):
                if bin_value[col] == '1':
                    draw_pixel(x + col, y + row, r, g, b)

def draw_text(x, y, text, r, g, b):
    offset_x = x
    for char in text:
        draw_char(offset_x, y, char, r, g, b)
        offset_x += 9

# ---------------------------------------------------------------------------
# Config helpers
# ---------------------------------------------------------------------------

def load_config():
    try:
        with open(CONFIG_FILE) as f:
            return json.load(f)
    except Exception:
        return {}

def save_config(cfg):
    with open(CONFIG_FILE, 'w') as f:
        json.dump(cfg, f)

# ---------------------------------------------------------------------------
# Network helpers
# ---------------------------------------------------------------------------

def setup_wifi(ssid, password):
    wlan = network.WLAN(network.STA_IF)
    wlan.active(True)
    wlan.connect(ssid, password)
    max_wait = 10
    while max_wait > 0:
        if wlan.status() < 0 or wlan.status() >= 3:
            break
        max_wait -= 1
        print('waiting for connection...')
        time.sleep(1)
    return wlan.status() == 3

def setup_access_point(ssid, password):
    ap = network.WLAN(network.AP_IF)
    ap.config(essid=ssid, password=password)
    ap.active(True)
    while not ap.active():
        time.sleep(1)
    return ap.ifconfig()[0]

def display_ip(ip):
    display.clear()
    draw_text_small(0, 0, ip, 255, 255, 255)

# ---------------------------------------------------------------------------
# HTTP helpers
# ---------------------------------------------------------------------------

def parse_request(data):
    """Return (method, path, headers_dict, body_start) from raw request bytes."""
    try:
        header_end = data.find(b'\r\n\r\n')
        if header_end == -1:
            return None, None, {}, 0
        header_data = data[:header_end].decode('utf-8', 'ignore')
        lines = header_data.split('\r\n')
        parts = lines[0].split(' ')
        method = parts[0] if parts else ''
        path = parts[1] if len(parts) > 1 else '/'
        # Strip query string
        if '?' in path:
            path = path.split('?')[0]
        headers = {}
        for line in lines[1:]:
            if ':' in line:
                k, v = line.split(':', 1)
                headers[k.strip().lower()] = v.strip()
        return method, path, headers, header_end + 4
    except Exception:
        return None, None, {}, 0

def read_body(cl, data, body_start, content_length):
    """Receive bytes until the full body (content_length) is buffered."""
    while len(data) - body_start < content_length:
        chunk = cl.recv(2048)
        if not chunk:
            break
        data += chunk
    return data

def send_response(cl, status, content_type, body):
    if isinstance(body, str):
        body = body.encode()
    header = (
        'HTTP/1.0 {}\r\n'
        'Content-Type: {}\r\n'
        'Access-Control-Allow-Origin: *\r\n'
        'Access-Control-Allow-Methods: GET, POST, OPTIONS\r\n'
        'Access-Control-Allow-Headers: Content-Type\r\n'
        'Content-Length: {}\r\n\r\n'
    ).format(status, content_type, len(body))
    cl.send(header.encode())
    cl.send(body)

def serve_static_chunked(cl, filename, content_type):
    """Stream a file to the client in 1 KB chunks to limit RAM usage."""
    try:
        with open(filename, 'rb') as f:
            # Send headers without Content-Length (streamed)
            cl.send((
                'HTTP/1.0 200 OK\r\n'
                'Content-Type: {}\r\n'
                'Access-Control-Allow-Origin: *\r\n\r\n'
            ).format(content_type).encode())
            while True:
                chunk = f.read(1024)
                if not chunk:
                    break
                cl.send(chunk)
    except Exception:
        send_response(cl, '404 Not Found', 'text/plain', b'Not Found')

# ---------------------------------------------------------------------------
# Request handlers
# ---------------------------------------------------------------------------

def handle_options(cl):
    cl.send(
        b'HTTP/1.0 200 OK\r\n'
        b'Access-Control-Allow-Origin: *\r\n'
        b'Access-Control-Allow-Methods: GET, POST, OPTIONS\r\n'
        b'Access-Control-Allow-Headers: Content-Type\r\n\r\n'
    )

def handle_pixels(cl, data, body_start):
    """Render a raw RGB565 frame (64×64 = 8192 bytes) sent via POST."""
    while len(data) - body_start < FRAME_BYTES:
        chunk = cl.recv(2048)
        if not chunk:
            break
        data += chunk
    pos = body_start
    for y in range(HEIGHT):
        for x in range(WIDTH):
            rgb = data[pos] | (data[pos + 1] << 8)
            r = (rgb & 31) << 3
            g = ((rgb >> 5) & 63) << 2
            b = (rgb >> 11) << 3
            display.set_pixel(x, y, r, g, b)
            pos += 2
    send_response(cl, '200 OK', 'text/plain', b'OK')

def handle_clear(cl):
    display.clear()
    send_response(cl, '200 OK', 'application/json', b'{"status":"ok"}')

def handle_text(cl, data, body_start, content_length):
    """POST /api/text – JSON body: {text, x, y, r, g, b, size, clear}"""
    data = read_body(cl, data, body_start, content_length)
    body = data[body_start:body_start + content_length]
    try:
        params = json.loads(body)
        text  = str(params.get('text', ''))
        x     = int(params.get('x', 0))
        y     = int(params.get('y', 0))
        r     = int(params.get('r', 255))
        g     = int(params.get('g', 255))
        b     = int(params.get('b', 255))
        size  = params.get('size', 'large')
        clear = bool(params.get('clear', False))
        if clear:
            display.clear()
        if size == 'small':
            draw_text_small(x, y, text, r, g, b)
        else:
            draw_text(x, y, text, r, g, b)
        send_response(cl, '200 OK', 'application/json', b'{"status":"ok"}')
    except Exception as e:
        send_response(cl, '400 Bad Request', 'application/json', b'{"error":"invalid json"}')

def handle_brightness(cl, data, body_start, content_length):
    """POST /api/brightness – JSON body: {level: 0-255}"""
    global brightness_level
    data = read_body(cl, data, body_start, content_length)
    body = data[body_start:body_start + content_length]
    try:
        params = json.loads(body)
        level = int(params.get('level', 128))
        level = max(0, min(255, level))
        brightness_level = level
        try:
            display.set_brightness(level)
        except Exception:
            pass  # not all firmware builds expose this method
        send_response(cl, '200 OK', 'application/json', b'{"status":"ok"}')
    except Exception:
        send_response(cl, '400 Bad Request', 'application/json', b'{"error":"invalid request"}')

def handle_status(cl):
    """GET /api/status – return device info as JSON."""
    wlan = network.WLAN(network.STA_IF)
    info = {
        'connected': wlan.isconnected(),
        'ip': wlan.ifconfig()[0] if wlan.isconnected() else '',
        'brightness': brightness_level,
        'width': WIDTH,
        'height': HEIGHT,
        'version': '2.0'
    }
    send_response(cl, '200 OK', 'application/json', json.dumps(info))

def handle_config_get(cl):
    """GET /api/config – return current WiFi config (password omitted)."""
    cfg = load_config()
    safe = {'ssid': cfg.get('ssid', ''), 'ap_mode': not cfg.get('ssid')}
    send_response(cl, '200 OK', 'application/json', json.dumps(safe))

def handle_config_post(cl, data, body_start, content_length):
    """POST /api/config – save new WiFi credentials and reboot."""
    data = read_body(cl, data, body_start, content_length)
    body = data[body_start:body_start + content_length]
    try:
        params = json.loads(body)
        cfg = load_config()
        if 'ssid' in params:
            cfg['ssid'] = params['ssid']
        if 'password' in params:
            cfg['password'] = params['password']
        save_config(cfg)
        send_response(
            cl, '200 OK', 'application/json',
            b'{"status":"ok","message":"Config saved. Rebooting..."}'
        )
        time.sleep(1)
        machine.reset()
    except Exception:
        send_response(cl, '400 Bad Request', 'application/json', b'{"error":"invalid request"}')

# ---------------------------------------------------------------------------
# Main request dispatcher
# ---------------------------------------------------------------------------

def handle_request(cl):
    try:
        data = cl.recv(2048)
        if not data:
            return
        method, path, headers, body_start = parse_request(data)
        if method is None:
            return
        content_length = int(headers.get('content-length', 0))

        if method == 'OPTIONS':
            handle_options(cl)
        elif method == 'GET':
            if path in ('/', '/index.html'):
                serve_static_chunked(cl, 'index.html', 'text/html')
            elif path == '/app.js':
                serve_static_chunked(cl, 'app.js', 'application/javascript')
            elif path == '/api/status':
                handle_status(cl)
            elif path == '/api/config':
                handle_config_get(cl)
            else:
                send_response(cl, '404 Not Found', 'text/plain', b'Not Found')
        elif method == 'POST':
            if path in ('/', '/api/pixels'):
                handle_pixels(cl, data, body_start)
            elif path == '/api/clear':
                handle_clear(cl)
            elif path == '/api/text':
                handle_text(cl, data, body_start, content_length)
            elif path == '/api/brightness':
                handle_brightness(cl, data, body_start, content_length)
            elif path == '/api/config':
                handle_config_post(cl, data, body_start, content_length)
            else:
                send_response(cl, '404 Not Found', 'text/plain', b'Not Found')
        else:
            send_response(cl, '405 Method Not Allowed', 'text/plain', b'Method Not Allowed')
    except Exception as e:
        print('Request error:', e)
    finally:
        cl.close()

def start_server(ip):
    addr = socket.getaddrinfo(ip, WEB_PORT)[0][-1]
    s = socket.socket()
    s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    s.bind(addr)
    s.listen(3)
    print('Listening on', addr)

    while True:
        try:
            cl, addr = s.accept()
            handle_request(cl)
        except OSError as e:
            print('Connection error:', e)
        gc.collect()

# ---------------------------------------------------------------------------
# Startup – try stored WiFi first, fall back to soft-AP
# ---------------------------------------------------------------------------

config = load_config()
connected = False

if config.get('ssid') and config.get('password'):
    print('Connecting to WiFi:', config['ssid'])
    connected = setup_wifi(config['ssid'], config['password'])

if not connected:
    print('Starting access point:', AP_SSID)
    ip = setup_access_point(AP_SSID, AP_PASSWORD)
else:
    wlan = network.WLAN(network.STA_IF)
    ip = wlan.ifconfig()[0]

display.start()
display_ip(ip)
start_server(ip)
