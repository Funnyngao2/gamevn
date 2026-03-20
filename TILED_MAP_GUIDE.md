# Hướng dẫn Custom Map & Tasks (Tiled Editor)

Tài liệu này hướng dẫn cách thiết lập các Object trong **Tiled Map Editor** để game nhận diện được nhiệm vụ (Tasks) và các điểm tương tác đặc biệt.

---

## 1. Thiết lập Layer
Trong Tiled, bạn nên tạo một **Object Layer** riêng biệt:
- **Tên Layer ưu tiên**: `Tasks` (hoặc `tasks`)
- **Layer dự phòng**: `Obstacles` (Game sẽ tìm ở đây nếu không có layer Tasks)

---

## 2. Các thuộc tính tùy chỉnh (Custom Properties)
Khi tạo một Object (Rectangle hoặc Point), bạn cần nhấn nút **"+"** trong bảng Properties để thêm các thuộc tính sau:

| Thuộc tính | Kiểu dữ liệu | Ví dụ | Mô tả |
| :--- | :--- | :--- | :--- |
| **`kind`** | `string` | `fix_wiring` | **Bắt buộc**: Loại mini-game sẽ hiện ra (Xem danh sách bên dưới) |
| **`label`** | `string` | `Sửa dây điện` | Tên hiển thị khi người chơi đứng gần |
| **`id`** | `string` | `task_01` | ID duy nhất để server quản lý tiến độ (Không được trùng) |

---

## 3. Danh sách các `kind` nhiệm vụ khả dụng
Nhập chính xác các giá trị này vào ô `kind`:

### Nhóm nhiệm vụ Crewmate:
- **`fix_wiring`**: Nối 4 dây điện cùng màu (Đã nâng cấp hiệu ứng kéo dây).
- **`picture_puzzle`**: **(Mới)** Game ghép tranh 3x3 khôi phục bản đồ.
- **`clear_asteroids`**: **(Mới)** Bắn thiên thạch bay tự do (Dùng chuột click).
- **`upload_data`**: Tải dữ liệu lên hệ thống (Chờ thanh tiến độ).
- **`empty_garbage`**: Đổ rác (Giữ cần gạt để xả).
- **`inspect_sample`**: Quét mẫu thử (Đếm ngược thời gian).
- **`fuel_engines`**: Nạp nhiên liệu (Giữ nút nạp).
- **`unlock_manifolds`**: Nhấn các số theo thứ tự từ 1 đến 10.
- **`chart_course`**: Điều hướng tàu theo đường kẻ có sẵn.
- **`stabilize_steering`**: Kéo tâm ngắm vào giữa vòng tròn.
- **`prime_shields`**: Kích hoạt lá chắn (Nhấn các ô đỏ).
- **`calibrate_distributor`**: Nhấn nút đúng lúc vòng xoay khớp vị trí.
- **`align_output`**: Căn chỉnh thanh gạt đầu ra.

---

## 4. Các điểm tương tác đặc biệt (Special IDs)
Dùng các `id` sau để thiết lập các vị trí chức năng:

### Phá hoại (Sabotage):
- **`lights_fix`**: Điểm để Crewmate sửa điện khi Impostor tắt đèn.
- **`reactor_a`**: Điểm sửa Reactor thứ nhất (Cần người giữ cùng lúc với reactor_b).
- **`reactor_b`**: Điểm sửa Reactor thứ hai.

### Nút họp khẩn cấp:
- Đặt một object tên là `emerg_btn` hoặc `emergency_btn` tại vị trí nút bấm.
- Game mặc định nút họp tại tọa độ: `x: 3320, y: 716` (Nếu không tìm thấy object).

---

## 5. Lưu ý khi Export
1. Lưu file dưới định dạng `.tmx` để chỉnh sửa.
2. **Export** ra file `.json` (chọn định dạng Map JSON).
3. Copy file `.json` đè vào: `public/assets/Maps/map.json`.
4. Nếu có thay đổi về hình ảnh Tileset, hãy đảm bảo file ảnh nằm trong `public/assets/Maps/` và đường dẫn trong file JSON là chính xác.
