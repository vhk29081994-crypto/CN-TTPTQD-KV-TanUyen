// Demo: đưa KMZ lên web map bằng cách chuyển KMZ -> GeoJSON (ở đây là file mẫu gpmb_sample.geojson)
// Lưu ý: KMZ bạn gửi rất lớn (hàng trăm MB) => cần vector tiles/PMTiles để chạy mượt khi làm thật.

const map = L.map('map', { zoomControl: true }).setView([10.7925, 106.664], 13);

// ===== Base maps =====
const osm = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19, attribution: '&copy; OpenStreetMap contributors'
});

const esriImagery = L.tileLayer(
  'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
  { maxZoom: 19, attribution: 'Tiles &copy; Esri' }
);

const esriLabels = L.tileLayer(
  'https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',
  { maxZoom: 19, attribution: 'Labels &copy; Esri' }
);

// Mặc định vệ tinh + chữ
esriImagery.addTo(map);
esriLabels.addTo(map);

// ===== UI helpers =====
const panel = document.getElementById('panel');
document.getElementById('btnTogglePanel').onclick = () => panel.classList.toggle('hidden');
document.getElementById('btnClosePanel').onclick = () => panel.classList.add('hidden');

function toast(msg){
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toast._t);
  toast._t = setTimeout(()=>{ el.hidden = true; }, 2600);
}

async function loadJSON(url){
  const r = await fetch(url);
  if(!r.ok) throw new Error('Không tải được: ' + url);
  return await r.json();
}

// ===== Layers =====
let parcelsLayer, planningLayer, routeLayer;
let gpmbLayer;
let clusterLayer;
let allListings = [];
const parcelIndex = new Map();
const objIndex = new Map(); // name->layer OR name->[layers]

function pushIndex(key, layer){
  if(!key) return;
  const k = key.trim().toLowerCase();
  if(!k) return;
  const cur = objIndex.get(k);
  if(!cur) objIndex.set(k, layer);
  else if(Array.isArray(cur)) cur.push(layer);
  else objIndex.set(k, [cur, layer]);
}

// ===== Marker badge CSS (demo tin rao) =====
const style = document.createElement('style');
style.textContent = `
.price-badge .badge{
  transform: translate(-10px, -20px);
  background: #ffd76a;
  border: 2px solid #fff;
  border-radius: 999px;
  padding: 6px 10px;
  box-shadow: 0 6px 18px rgba(0,0,0,.15);
  font-size: 12px;
  line-height: 1.05;
  text-align: center;
  white-space: nowrap;
}
.price-badge .b1{ font-weight: 800; }
.price-badge .b2{ font-weight: 700; opacity: .85; margin-top: 2px; }
`;
document.head.appendChild(style);

function listingMarker(f, latlng){
  const p = f.properties;
  const divIcon = L.divIcon({
    className: 'price-badge',
    html: `<div class="badge"><div class="b1">${p.price_ty_m2} tỷ/m²</div><div class="b2">${p.total_ty} tỷ</div></div>`,
    iconSize: [0,0]
  });
  return L.marker(latlng, { icon: divIcon });
}

function bindListingPopup(feature, layer){
  const p = feature.properties;
  layer.on('click', () => toast(`Đã chọn: ${p.title} • ${p.area_m2}m² • ${p.price_ty_m2} tỷ/m²`));
  layer.bindPopup(
    `<b>${p.title}</b><br/>
     <div>Loại: ${p.type}</div>
     <div>Diện tích: <b>${p.area_m2}</b> m²</div>
     <div>Giá: <b>${p.price_ty_m2}</b> tỷ/m²</div>
     <div>Tổng: <b>${p.total_ty}</b> tỷ</div>`
  );
}

function planningStyle(f){
  return { color:'#f5f5f5', weight:1, fillColor: f.properties.color || '#ff66cc', fillOpacity: 0.22 };
}
function onEachPlanning(f, layer){
  const p = f.properties || {};
  layer.bindPopup(`<b>${p.name || 'Quy hoạch'}</b><br/>Kế hoạch: ${p.plan || '-'}<br/>Loại: ${p.zone || '-'}`);
}

function routeStyle(f){
  return { color: f.properties?.color || '#00ff00', weight: f.properties?.width || 5 };
}
function onEachRoute(f, layer){
  layer.bindPopup(`<b>${f.properties?.name || 'Trục tuyến'}</b>`);
}

// Viền thửa nổi trên nền vệ tinh
function parcelStyle(){
  return { color:'#ffffff', weight:2, opacity:0.95, fillColor:'#00aaff', fillOpacity: 0.10 };
}
function onEachParcel(feature, layer){
  const p = feature.properties || {};
  const key = `${p.so_to || ''}-${p.so_thua || ''}`.trim();
  if(key && key !== '-') parcelIndex.set(key, layer);
  layer.bindPopup(
    `<b>Thửa ${p.so_thua || ''} - Tờ ${p.so_to || ''}</b><br/>
     Diện tích: <b>${p.dien_tich || ''}</b> m²<br/>
     Loại đất: <b>${p.loai_dat || ''}</b><br/>
     Ghi chú: ${p.ghi_chu || '-'}`
  );
  layer.on('mouseover', () => layer.setStyle({ weight: 4, fillOpacity: 0.18 }));
  layer.on('mouseout', () => layer.setStyle({ weight: 2, fillOpacity: 0.10 }));
}

// ===== GPMB layer (from KMZ sample) =====
function gpmbStyle(feature){
  const t = feature.geometry?.type;
  if(t === 'LineString' || t === 'MultiLineString') return { color:'#ff3b3b', weight: 3, opacity: 0.9 };
  if(t === 'Point') return { };
  // Polygon
  return { color:'#ffd000', weight: 2, opacity: 0.95, fillColor:'#ffd000', fillOpacity: 0.06 };
}

function gpmbPointToLayer(feature, latlng){
  return L.circleMarker(latlng, { radius: 6, weight:2, opacity: 0.95, fillOpacity: 0.3 });
}

function onEachGPMB(feature, layer){
  const p = feature.properties || {};
  const name = p.name || p.id || p.code || 'Đối tượng';
  pushIndex(name, layer);

  // popup show up to 12 fields
  const keys = Object.keys(p);
  const rows = keys.slice(0, 12).map(k => `<div><b>${k}</b>: ${String(p[k])}</div>`).join('');
  layer.bindPopup(`<b>${name}</b><br/><div style="margin-top:6px">${rows}</div>`);

  layer.on('mouseover', ()=>{ if(layer.setStyle) layer.setStyle({ weight: 4 }); });
  layer.on('mouseout', ()=>{ if(layer.setStyle) layer.setStyle({ weight: 2 }); });
}

// ===== Filters (demo tin rao) =====
let priceRange = [0.06, 0.25];
let areaRange = [50, 250];

function applyFilters(){
  if(!clusterLayer) return;
  clusterLayer.clearLayers();

  const filtered = allListings.filter(f => {
    const p = f.properties;
    return p.price_ty_m2 >= priceRange[0] && p.price_ty_m2 <= priceRange[1]
        && p.area_m2 >= areaRange[0] && p.area_m2 <= areaRange[1];
  });

  const geo = { type:'FeatureCollection', features: filtered };
  const listingsLayer = L.geoJSON(geo, { pointToLayer: listingMarker, onEachFeature: bindListingPopup });
  clusterLayer.addLayer(listingsLayer);

  toast(`Đang hiển thị ${filtered.length} tin`);
}

function setupSliders(features){
  const prices = features.map(f=>f.properties.price_ty_m2);
  const areas = features.map(f=>f.properties.area_m2);
  const pmin = Math.min(...prices), pmax = Math.max(...prices);
  const amin = Math.min(...areas), amax = Math.max(...areas);

  priceRange = [pmin, pmax];
  areaRange = [amin, amax];

  const priceSlider = document.getElementById('priceSlider');
  noUiSlider.create(priceSlider, { start: priceRange, connect: true, step: 0.001, range: { min: pmin, max: pmax }});
  const priceMinEl = document.getElementById('priceMin');
  const priceMaxEl = document.getElementById('priceMax');

  priceSlider.noUiSlider.on('update', (v)=>{
    priceRange = [parseFloat(v[0]), parseFloat(v[1])];
    priceMinEl.textContent = priceRange[0].toFixed(3) + ' tỷ/m²';
    priceMaxEl.textContent = priceRange[1].toFixed(3) + ' tỷ/m²';
  });
  priceSlider.noUiSlider.on('change', applyFilters);

  const areaSlider = document.getElementById('areaSlider');
  noUiSlider.create(areaSlider, { start: areaRange, connect: true, step: 1, range: { min: amin, max: amax }});
  const areaMinEl = document.getElementById('areaMin');
  const areaMaxEl = document.getElementById('areaMax');

  areaSlider.noUiSlider.on('update', (v)=>{
    areaRange = [parseInt(v[0]), parseInt(v[1])];
    areaMinEl.textContent = areaRange[0] + ' m²';
    areaMaxEl.textContent = areaRange[1] + ' m²';
  });
  areaSlider.noUiSlider.on('change', applyFilters);
}

// ===== Simple measure (2 clicks) =====
let measurePts = [];
let measureLine;
map.on('click', (e) => {
  const {lat, lng} = e.latlng;
  measurePts.push([lat, lng]);
  if(measurePts.length > 2) measurePts = [measurePts[1], measurePts[2]];

  if(measureLine) map.removeLayer(measureLine);
  if(measurePts.length === 2){
    measureLine = L.polyline(measurePts, { weight: 3, color:'#ffffff' }).addTo(map);
    const d = map.distance(measurePts[0], measurePts[1]);
    toast(`Đo nhanh: ${(d/1000).toFixed(2)} km`);
  }
});

// ===== Init =====
(async function init(){
  // GPMB (KMZ sample) - bật mặc định
  const gpmb = await loadJSON('./data/gpmb_sample.geojson');
  gpmbLayer = L.geoJSON(gpmb, { style: gpmbStyle, pointToLayer: gpmbPointToLayer, onEachFeature: onEachGPMB }).addTo(map);

  const c = gpmb.properties?._counts;
  const statsEl = document.getElementById('gpmbStats');
  if(c){
    statsEl.textContent = `GPMB: ${gpmb.features.length.toLocaleString()} đối tượng (sample). Polygon: ${c.Polygon || 0}, Line: ${c.LineString || 0}, Point: ${c.Point || 0}`;
  } else {
    statsEl.textContent = `GPMB: ${gpmb.features.length.toLocaleString()} đối tượng (sample)`;
  }

  // Demo layers (tắt mặc định để nhẹ)
  const parcels = await loadJSON('./data/parcels.geojson');
  parcelsLayer = L.geoJSON(parcels, { style: parcelStyle, onEachFeature: onEachParcel });

  const planning = await loadJSON('./data/planning.geojson');
  planningLayer = L.geoJSON(planning, { style: planningStyle, onEachFeature: onEachPlanning });

  const route = await loadJSON('./data/route.geojson');
  routeLayer = L.geoJSON(route, { style: routeStyle, onEachFeature: onEachRoute });

  const listings = await loadJSON('./data/listings.geojson');
  allListings = listings.features;
  clusterLayer = L.markerClusterGroup({ showCoverageOnHover:false, disableClusteringAtZoom: 18 });

  setupSliders(allListings);

  // Fit view to gpmb
  try { map.fitBounds(gpmbLayer.getBounds(), { padding:[20,20], maxZoom: 16 }); } catch(e){}

  // Layer toggles
  document.getElementById('chkGPMB').addEventListener('change', (e)=>{
    if(e.target.checked) gpmbLayer.addTo(map); else map.removeLayer(gpmbLayer);
  });

  document.getElementById('chkParcels').addEventListener('change', (e)=>{
    if(e.target.checked) parcelsLayer.addTo(map); else map.removeLayer(parcelsLayer);
  });
  document.getElementById('chkPlanning').addEventListener('change', (e)=>{
    if(e.target.checked) planningLayer.addTo(map); else map.removeLayer(planningLayer);
  });
  document.getElementById('chkRoute').addEventListener('change', (e)=>{
    if(e.target.checked) routeLayer.addTo(map); else map.removeLayer(routeLayer);
  });
  document.getElementById('chkListings').addEventListener('change', (e)=>{
    if(e.target.checked){ clusterLayer.addTo(map); applyFilters(); } else map.removeLayer(clusterLayer);
  });

  // Basemap toggles
  const rbOSM = document.getElementById('rbOSM');
  const rbSat = document.getElementById('rbSat');

  rbOSM.addEventListener('change', ()=>{
    if(rbOSM.checked){
      if(map.hasLayer(esriImagery)) map.removeLayer(esriImagery);
      if(map.hasLayer(esriLabels)) map.removeLayer(esriLabels);
      if(!map.hasLayer(osm)) osm.addTo(map);
    }
  });
  rbSat.addEventListener('change', ()=>{
    if(rbSat.checked){
      if(map.hasLayer(osm)) map.removeLayer(osm);
      if(!map.hasLayer(esriImagery)) esriImagery.addTo(map);
      if(!map.hasLayer(esriLabels)) esriLabels.addTo(map);
    }
  });

  // Find parcel
  document.getElementById('btnFind').onclick = ()=>{
    const to = (document.getElementById('inpTo').value || '').trim();
    const thua = (document.getElementById('inpThua').value || '').trim();
    const key = `${to}-${thua}`;
    const layer = parcelIndex.get(key);
    if(!layer){ toast('Không tìm thấy (demo: thử tờ 12/13/21 và thửa 100-111)'); return; }
    map.fitBounds(layer.getBounds(), { maxZoom: 18 });
    layer.openPopup();
  };

  // Find object (GPMB)
  document.getElementById('btnObjFind').onclick = ()=>{
    const q = (document.getElementById('inpObj').value || '').trim().toLowerCase();
    if(!q){ toast('Nhập từ khóa'); return; }
    const hit = objIndex.get(q);
    if(!hit){ toast('Không tìm thấy đối tượng'); return; }
    const layer = Array.isArray(hit) ? hit[0] : hit;
    try { map.fitBounds(layer.getBounds(), { maxZoom: 18 }); } catch(e){ try { map.setView(layer.getLatLng(), 18); } catch(e2){} }
    layer.openPopup();
    if(Array.isArray(hit)) toast(`Có ${hit.length} đối tượng trùng tên, đang zoom cái đầu`);
  };
})().catch(err => {
  console.error(err);
  toast('Lỗi: ' + err.message);
});
