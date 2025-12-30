# Demo đưa KMZ lên Web Map (Leaflet)

## Vì sao file KMZ lớn không nên đưa thẳng lên web?
KMZ bạn gửi có dung lượng rất lớn (KML bên trong ~ vài trăm MB). Nếu convert thẳng sang GeoJSON rồi load trên trình duyệt:
- rất chậm / treo máy
- tốn băng thông khi chia sẻ nhiều người
=> Cách đúng khi làm thật: chuyển sang Vector Tiles (PMTiles) để tải theo từng vùng/zoom.

## Bản demo này là gì?
- Mình đã trích ra 5.000 đối tượng (sample) từ KMZ và chuyển sang GeoJSON: data/gpmb_sample.geojson
- Web map mặc định nền vệ tinh + chữ, có lớp GPMB (sample) + ô tìm kiếm theo 'name'

## Chạy local
python -m http.server 5173
Mở: http://localhost:5173
