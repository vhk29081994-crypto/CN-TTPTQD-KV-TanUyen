# Demo thửa + ảnh vệ tinh (mặc định)

## Chạy local (miễn phí)
Cách 1 (Python):
  python -m http.server 5173
Mở: http://localhost:5173

Cách 2 (Node):
  npx serve

## Điểm nổi bật
- Mặc định nền vệ tinh + chữ (Esri Imagery + Labels) để nhìn giống kiểu Google hơn.
- Thửa đất viền trắng để nổi trên nền vệ tinh (hover/click có popup).
- Có tìm tờ/thửa, bật/tắt lớp, lọc tin rao.

## Thay dữ liệu
- data/parcels.geojson: thửa (polygon) + so_to, so_thua, dien_tich, loai_dat, ghi_chu
- data/planning.geojson: quy hoạch (polygon)
- data/route.geojson: trục tuyến (line)
- data/listings.geojson: tin rao (points)
