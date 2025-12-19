# Google Maps API Setup Guide

## Problem
If you see "Google Maps API Key not available" in your Driver Service app, you need to configure the Google Maps API key in your backend.

## Solution

### Step 1: Get Google Maps API Key

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Enable the following APIs:
   - **Maps JavaScript API** (for displaying maps)
   - **Geocoding API** (for address to coordinates conversion)
   - **Places API** (for place search and autocomplete)
   - **Directions API** (for route directions)
   - **Distance Matrix API** (for distance calculations)
4. Go to **Credentials** → **Create Credentials** → **API Key**
5. Copy your API key
6. (Recommended) Restrict your API key:
   - Click on the API key to edit it
   - Under "API restrictions", select "Restrict key"
   - Choose the APIs you enabled above
   - Under "Application restrictions", add your domain/IP

### Step 2: Configure Backend

You have two options:

#### Option A: Using .env file (Recommended)

Create a `.env` file in the `HOTELNEW` directory:

```env
GOOGLE_MAPS_API_KEY=your_api_key_here
VITE_GOOGLE_MAPS_API_KEY=your_api_key_here
```

#### Option B: Using ecosystem.config.js

Edit `HOTELNEW/ecosystem.config.js` and uncomment/add the API key:

```javascript
env: {
  // ... other config ...
  VITE_GOOGLE_MAPS_API_KEY: 'your_api_key_here',
  GOOGLE_MAPS_API_KEY: 'your_api_key_here'
},
env_production: {
  // ... other config ...
  VITE_GOOGLE_MAPS_API_KEY: 'your_api_key_here',
  GOOGLE_MAPS_API_KEY: 'your_api_key_here'
}
```

### Step 3: Restart Backend Server

If using PM2:
```bash
pm2 restart hotelNew
```

If running directly:
```bash
# Stop the server (Ctrl+C) and restart
node app.js
```

### Step 4: Configure Frontend (Hotelapp)

Make sure your frontend has the backend URL configured. Check `Hotelapp/.env` or environment variables:

```env
VITE_SOCKET_SERVER_URL=http://localhost:5001
# OR
VITE_MAPS_API_BASE=http://localhost:5001/api/maps
```

### Step 5: Test the API

Test the backend endpoint:
```bash
curl http://localhost:5001/api/maps/api-key
```

You should get a response like:
```json
{
  "success": true,
  "apiKey": "your_api_key_here",
  "data": {
    "apiKey": "your_api_key_here"
  }
}
```

## Troubleshooting

### Error: "Google Maps API key is not configured"
- Make sure the environment variable is set correctly
- Restart the backend server after setting the environment variable
- Check that the variable name matches: `VITE_GOOGLE_MAPS_API_KEY` or `GOOGLE_MAPS_API_KEY`

### Error: "Maps API base URL not configured"
- Set `VITE_MAPS_API_BASE` or `VITE_SOCKET_SERVER_URL` in your frontend environment
- Make sure the backend is running and accessible

### Error: "API key not valid"
- Check that you've enabled the required APIs in Google Cloud Console
- Verify the API key is correct (no extra spaces)
- Check API key restrictions if you've set them

## API Endpoints

The backend provides these map-related endpoints:

- `GET /api/maps/api-key` - Get Google Maps API key
- `GET /api/maps/geocode?address=...` - Convert address to coordinates
- `GET /api/maps/reverse-geocode?lat=...&lng=...` - Convert coordinates to address
- `GET /api/maps/places/search?query=...` - Search for places
- `GET /api/maps/places/details?placeId=...` - Get place details
- `GET /api/maps/directions?origin=...&destination=...` - Get directions
- `GET /api/maps/distance-matrix?origins=...&destinations=...` - Calculate distance
- `GET /api/maps/autocomplete?input=...` - Get autocomplete suggestions

