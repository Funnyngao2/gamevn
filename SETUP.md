# Setup Guide

## 1. Copy Assets

Copy từ project Python vào `among-us-web/public/assets/`:

```
public/
  assets/
    images/
      menu/        ← từ Assets/Images/menu/
      alerts/      ← từ Assets/Images/Alerts/
      items/       ← từ Assets/Images/Items/
      meeting/     ← từ Assets/Images/Meeting/
      player/      ← từ Assets/Images/Player/
    sounds/
      general/     ← từ Assets/Sounds/General/
      footsteps/   ← từ Assets/Sounds/Footsteps/
      background/  ← từ Assets/Sounds/Background/
    maps/
      map.json     ← export từ Tiled (File > Export As > JSON)
```

## 2. Export Map từ Tiled

Mở `Assets/Maps/map.tmx` trong Tiled Map Editor, sau đó:
- File > Export As > chọn JSON format
- Lưu vào `public/assets/maps/map.json`

## 3. Chạy game

```bash
# Terminal 1 - Game client
npm run dev

# Terminal 2 - Multiplayer server (nếu cần)
cd server
node server.js
```

Mở http://localhost:8080
