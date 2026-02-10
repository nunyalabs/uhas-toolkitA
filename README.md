# UHAS Toolkit A - Offline Research Tool

Complete offline-first Progressive Web App for research data collection.

## 🎯 Features

- **100% Offline** - Works without internet connection
- **IndexedDB Storage** - All data stored locally on device
- **Import/Export** - JSON and CSV format support
- **Audio Recording** - Capture and store interview audio
- **PWA Ready** - Install on device, works like native app
- **Privacy First** - Data never leaves device until you export

## 📱 Data Storage

All data is stored **locally on your device** using IndexedDB:
- Participants information
- Interview responses
- Audio recording metadata
- Survey data

## 📤 Sharing Data

1. Click **Export** button
2. Choose format (JSON or CSV)
3. Download file to device
4. Send via WhatsApp to researcher

**WhatsApp**: Share exported files manually

## 🚀 Quick Start

1. Open `index.html` in browser
2. Allow storage permissions
3. Start creating participants
4. Conduct interviews
5. Export data when complete

## 📦 Tech Stack

- **IndexedDB** - Client-side database
- **Service Worker** - Offline caching
- **Web Audio API** - Audio recording
- **Vanilla JavaScript** - No frameworks

## 🛠️ Development

```bash
# Serve locally
python3 -m http.server 8000

# Or use any static server
# Open http://localhost:8000
```

## 📊 Data Structure

### Participants
```json
{
  "id": "PAT-000001",
  "name": "John Doe",
  "type": "patient",
  "gender": "male",
  "age": 45,
  "eligible": true
}
```

### Interviews
```json
{
  "id": "unique-id",
  "participantId": "PAT-000001",
  "mode": "in-depth",
  "status": "completed",
  "notes": "Interview notes..."
}
```

## 🔧 Modules

- `idb-manager.js` - IndexedDB operations
- `import-export.js` - Data import/export
- `participant.js` - Participant management
- `app.js` - Main application logic
- `sw.js` - Service worker

## ⚡ Performance

- **Load**: < 1 second (cached)
- **Storage**: Up to 50MB per origin
- **Offline**: Works indefinitely
- **Real-time**: Auto-saves to IndexedDB

## 📝 License

Research project - UHAS-HPI

## 🤝 Contributing

This is a research tool. For modifications, please contact the research team.

## 🔒 Privacy

- No cloud storage
- No external API calls
- No analytics tracking
- Data stays on device
- Manual export only

---

**UHAS Toolkit A** - Complete Offline Research Collection Tool
