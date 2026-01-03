# GPS Data Forwarding Configuration

## Overview

Ang system ay may capability na mag-forward ng GPS data sa **pro.sinotrack.com** habang naka-save pa rin sa hotel system. Parehong TCP at HTTP/HTTPS protocols ay supported.

## Configuration

Para ma-enable ang forwarding, i-add ang mga sumusunod na environment variables sa `.env` file:

### Basic Configuration

```env
# Enable forwarding to pro.sinotrack.com
FORWARD_TO_SINOTRACK=true

# Sinotrack server host (IP address or domain)
# IMPORTANT: Use the correct Sinotrack server IP: 45.112.204.246
SINOTRACK_HOST=45.112.204.246

# Sinotrack server port (default: 8090)
SINOTRACK_PORT=8090

# Protocol to use: 'tcp', 'http', or 'https' (default: tcp)
SINOTRACK_PROTOCOL=tcp
```

### TCP Configuration (Recommended)

Kung ang pro.sinotrack.com ay naka-configure na mag-receive ng TCP connections sa port 8090:

```env
FORWARD_TO_SINOTRACK=true
SINOTRACK_HOST=45.112.204.246
SINOTRACK_PORT=8090
SINOTRACK_PROTOCOL=tcp
```

### HTTP/HTTPS Configuration

Kung ang pro.sinotrack.com ay may HTTP/HTTPS API endpoint:

```env
FORWARD_TO_SINOTRACK=true
SINOTRACK_HOST=45.112.204.246
SINOTRACK_PORT=443
SINOTRACK_PROTOCOL=https
SINOTRACK_API_PATH=/api/gps/location

# Optional: Send raw message format instead of JSON
SINOTRACK_SEND_RAW=false
```

## How It Works

1. **GPS Device** → Sends data to your hotel system (port 8090 TCP or HTTP POST)
2. **Hotel System** → Saves data to database
3. **Hotel System** → Forwards data to pro.sinotrack.com (if enabled)
4. **pro.sinotrack.com** → Receives the forwarded data

## Testing

Pagkatapos i-configure, i-restart ang server:

```bash
pm2 restart all
# or
npm restart
```

Check ang logs para makita kung successful ang forwarding:

```bash
pm2 logs
# or
tail -f logs/app.log
```

Look for messages like:
- `📤 Forwarding GPS data to pro.sinotrack.com:8090 via TCP`
- `✅ Sinotrack TCP response: OK`

## Troubleshooting

### Forwarding not working?

1. **Check if forwarding is enabled:**
   ```env
   FORWARD_TO_SINOTRACK=true
   ```

2. **Check network connectivity:**
   ```bash
   telnet pro.sinotrack.com 8090
   # or
   curl -v https://pro.sinotrack.com
   ```

3. **Check logs for errors:**
   - Look for `❌ Sinotrack` error messages
   - Check if there are connection timeout errors

4. **Verify configuration:**
   - Make sure `SINOTRACK_HOST` and `SINOTRACK_PORT` are correct
   - Verify `SINOTRACK_PROTOCOL` matches the server setup

### Data not appearing in pro.sinotrack.com?

1. Verify na ang GPS device ay nagse-send ng data sa hotel system
2. Check kung may errors sa forwarding logs
3. Contact pro.sinotrack.com support para i-verify ang configuration nila

## Notes

- Ang forwarding ay **non-blocking** - kung may error sa forwarding, hindi maaapektuhan ang hotel system
- Ang original GPS data ay naka-save pa rin sa hotel system database
- Parehong TCP at HTTP endpoints ay may forwarding capability

