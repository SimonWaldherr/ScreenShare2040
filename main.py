import network
import socket
import time
import gc
import hub75
from machine import Pin

# Constants
HEIGHT = 64
WIDTH = 64

frameBytes = WIDTH * HEIGHT * 2

# Initialize the display
display = hub75.Hub75(WIDTH, HEIGHT)

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

# Character dictionary for text
char_dict = {'A': '3078ccccfccccc00', 'B': 'fc66667c6666fc00', 'C': '3c66c0c0c0663c00', 'D': 'f86c6666666cf800', 'E': 'fe6268786862fe00', 'F': 'fe6268786860f000', 'G': '3c66c0c0ce663e00', 'H': 'ccccccfccccccc00', 'I': '7830303030307800', 'J': '1e0c0c0ccccc7800', 'K': 'f6666c786c66f600', 'L': 'f06060606266fe00', 'M': 'c6eefefed6c6c600', 'N': 'c6e6f6decec6c600', 'O': '386cc6c6c66c3800', 'P': 'fc66667c6060f000', 'Q': '78ccccccdc781c00', 'R': 'fc66667c6c66f600', 'S': '78cce0380ccc7800', 'T': 'fcb4303030307800', 'U': 'ccccccccccccfc00', 'V': 'cccccccccc783000', 'W': 'c6c6c6d6feeec600', 'X': 'c6c66c38386cc600', 'Y': 'cccccc7830307800', 'Z': 'fec68c183266fe00', 'a': '0000780c7ccc7600', 'b': 'e060607c6666dc00', 'c': '000078ccc0cc7800', 'd': '1c0c0c7ccccc7600', 'e': '000078ccfcc07800', 'f': '386c60f06060f000', 'g': '000076cccc7c0cf8', 'h': 'e0606c766666e600', 'i': '3000703030307800', 'j': '0c000c0c0ccccc78', 'k': 'e060666c786ce600', 'l': '7030303030307800', 'm': '0000ccfefed6c600', 'n': '0000f8cccccccc00', 'o': '000078cccccc7800', 'p': '0000dc667c60f0', 'q': '000076cccc7c0c1e', 'r': '00009c766660f000', 's': '00007cc0780cf800', 't': '10307c3030341800', 'u': '0000cccccccc7600', 'v': '0000cccccc783000', 'w': '0000c6c6d6fe6c00', 'x': '0000c66c386cc600', 'y': '0000cccccc7c0cf8', 'z': '0000fc983064fc00', '0': '78ccdcfceccc7c00', '1': '307030303030fc00', '2': '78cc0c3860ccfc00', '3': '78cc0c380ccc7800', '4': '1c3c6cccfe0c1e00', '5': 'fcc0f80c0ccc7800', '6': '3860c0f8cccc7800', '7': 'fccc0c1830303000', '8': '78cccc78cccc7800', '9': '78cccc7c0c187000', '!': '3078783030003000', '#': '6c6cfe6cfe6c6c00', '$': '307cc0780cf83000', '%': '00c6cc183066c600', '&': '386c3876dccc7600', '?': '78cc0c1830003000', ' ': '0000000000000000', '.': '0000000000003000', ':': '0030000000300000','(': '0c18303030180c00', ')': '6030180c18306000', '[': '78c0c0c0c0c07800', ']': 'c06060606060c000', '{': '0c18306030180c00', '}': '6030180c18306000', '<': '0c18306030180c00', '>': '6030180c18306000', '=': '0000fc0000fc0000', '+': '0000187e18180000', '-': '0000007e00000000', '*': 'c66c3810386cc600', '/': '0000060c18306000', '\\': '00006030180c0c00', '_': '00000000000000fe', '|': '1818181818181800', ';': '0000003018003000', ',': '0000000000303000', "'": '3030300000000000', '"': 'cccc000000000000', '`': '0c18300000000000', '@': '3c66dececec07e00', '^': '183c666600000000', '█': 'ffffffffffffffff'}

# Helper functions
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

# Connect to WiFi
ssid = 'SSID'
password = 'PASSWORD'

wlan = network.WLAN(network.STA_IF)
wlan.active(True)
wlan.connect(ssid, password)

# Wait for connection
max_wait = 10
while max_wait > 0:
    if wlan.status() < 0 or wlan.status() >= 3:
        break
    max_wait -= 1
    print('waiting for connection...')
    time.sleep(1)

if wlan.status() != 3:
    raise RuntimeError('network connection failed')
else:
    print('connected')
    status = wlan.ifconfig()
    ip_address = status[0]
    print('ip = ' + ip_address)

# Display IP address on the Hub75 matrix
def display_ip(ip):
    first_octet = ip.split('.')[0]
    second_octet = ip.split('.')[1]
    third_octet = ip.split('.')[2]
    fourth_octet = ip.split('.')[3]
    display.clear()
    draw_text_small(0, 0, ip, 255, 255, 255)
    #draw_text(20, 10, first_octet, 255, 255, 255)
    #draw_text(20, 20, second_octet, 255, 255, 255)
    #draw_text(20, 30, third_octet, 255, 255, 255)
    #draw_text(20, 40, fourth_octet, 255, 255, 255)

display.start()

display_ip(ip_address)

addr = socket.getaddrinfo('0.0.0.0', 80)[0][-1]

s = socket.socket()
s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
s.bind(addr)
s.listen(1)

print('listening on', addr)

# Listen for connections
while True:
    try:
        cl, addr = s.accept()
        request = cl.recv(2048)
        if len(request) >= 1:
            # receive frame data on POST request
            if request[0] == 80:
                for i in range(len(request) - 3):
                    if (request[i] == 13 and request[i + 1] == 10 and request[i + 2] == 13 and request[i + 3] == 10):
                        # found frame start
                        start = i + 4
                        while (len(request) - start < frameBytes):
                            request += cl.recv(2048)
                        for y in range(HEIGHT):
                            for x in range(WIDTH):
                                rgb = request[start] | (request[start + 1] << 8)
                                r = (rgb & 31) << 3
                                g = ((rgb >> 5) & 63) << 2
                                b = (rgb >> 11) << 3
                                draw_pixel(x, y, r, g, b)
                                start += 2
                        cl.send('HTTP/1.0 200 OK\r\nAccess-Control-Allow-Origin:*\r\n')
                        break
            # Serve index.html on GET request
            if request[0] == 71:
                URL = request.split(b' ')[1]
                if URL == b'/':
                    f = open('index.html', 'r')
                    cl.send('HTTP/1.0 200 OK\r\nContent-type: text/html\r\n\r\n' + f.read())
                    f.close()
                    cl.close()
                else:
                    cl.send('HTTP/1.0 404 Not Found\r\n')
                    cl.close()
        cl.close()
        gc.collect()
    except OSError as e:
        cl.close()
        print('connection closed')
