# Mini-game nhiệm vụ (`tasks/`)

UI React cho nhiệm vụ crewmate. **Phaser** gọi `onOpenTask(id, label, kind)` → `TaskOverlay` render component theo `kind`.

## 12 `kind` đã có

| `kind` | Component | Gợi ý Among Us |
|--------|-----------|----------------|
| `fix_wiring` | FixWiring | Fix Wiring |
| `upload_data` | UploadData | Upload / Download |
| `empty_garbage` | EmptyGarbage | Empty Garbage / Clean |
| `clear_asteroids` | ClearAsteroids | Clear Asteroids |
| `inspect_sample` | InspectSample | Inspect Sample |
| `fuel_engines` | FuelEngines | Fuel Engines |
| `align_output` | AlignOutput | Align Engine Output |
| `calibrate_distributor` | CalibrateDistributor | Calibrate Distributor |
| `unlock_manifolds` | UnlockManifolds | Unlock Manifolds |
| `chart_course` | ChartCourse | Chart Course |
| `stabilize_steering` | StabilizeSteering | Stabilize Steering |
| `prime_shields` | PrimeShields | Prime Shields |

Đăng ký tập hợp: `taskRegistry.js` (`TASK_MINIGAME_COMPONENTS`, `TASK_MINIGAME_KINDS`).

## Tích hợp (đã bật)

- **`taskKindResolve.js`**: alias từ tên object map (`fuel_engine` → `fuel_engines`, `scan_manifest` → `inspect_sample`, …) + fallback `fix_wiring`.
- **`GameScene`**: `tasksFromMap` và `taskList` dùng `resolveTaskKind`; `id` ưu tiên `task_{tiledObjectId}` để không trùng id (ví dụ hai `reboot_wifi_nav`).
- **`server.js`**: `TASK_POOL` chuẩn hóa `kind` giống client khi đọc `map.json`.
- **`map.json`**: một số điểm có property `kind` / `label` tiếng Việt để gán đủ loại mini-game trên bản đồ hiện tại.

## Nối thêm trong Tiled

Đặt property `kind` (một trong các chuỗi bảng trên) và tùy chọn `label`. Nếu không có `kind`, tên object dạng `tên_phòng` vẫn được suy ra `kind` (phần trước segment cuối).

## Style

- `taskMiniShared.css` — khung `.mini-*` dùng chung.
- `minigames.css` — layout từng game (prefix `mu-`, `mg-`, `as-`, …).
