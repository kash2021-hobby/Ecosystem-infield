export type MapPerson = {
  userId: string;
  person: string;
  lat: number;
  lng: number;
  site: string | null;
};

export type MapSite = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  radiusM: number;
};

export function fenceHtml(site: MapSite) {
  const data = JSON.stringify(site).replace(/</g, "\\u003c");
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
<link href="https://unpkg.com/maplibre-gl@5.6.1/dist/maplibre-gl.css" rel="stylesheet" />
<style>html, body, #map { margin: 0; height: 100%; background: #EFEAE0; }</style>
</head>
<body>
<div id="map"></div>
<script src="https://unpkg.com/maplibre-gl@5.6.1/dist/maplibre-gl.js"></script>
<script>
const site = ${data};
const map = new maplibregl.Map({
  container: "map",
  style: "https://tiles.openfreemap.org/styles/liberty",
  center: [site.lng, site.lat],
  zoom: 15,
});
function ring(lat, lng, radiusM) {
  const points = [];
  const earth = 6378137;
  for (let i = 0; i <= 64; i++) {
    const bearing = (i / 64) * Math.PI * 2;
    const lat1 = lat * Math.PI / 180;
    const lng1 = lng * Math.PI / 180;
    const d = radiusM / earth;
    const lat2 = Math.asin(Math.sin(lat1) * Math.cos(d) + Math.cos(lat1) * Math.sin(d) * Math.cos(bearing));
    const lng2 = lng1 + Math.atan2(Math.sin(bearing) * Math.sin(d) * Math.cos(lat1), Math.cos(d) - Math.sin(lat1) * Math.sin(lat2));
    points.push([lng2 * 180 / Math.PI, lat2 * 180 / Math.PI]);
  }
  return points;
}
function fence(radiusM) {
  return {
    type: "FeatureCollection",
    features: [{ type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [ring(site.lat, site.lng, radiusM)] } }],
  };
}
map.on("load", () => {
  map.addSource("fences", { type: "geojson", data: fence(site.radiusM) });
  map.addLayer({ id: "fence-fill", type: "fill", source: "fences", paint: { "fill-color": "#3DDC6A", "fill-opacity": 0.18 } });
  map.addLayer({ id: "fence-line", type: "line", source: "fences", paint: { "line-color": "#0E7A3D", "line-width": 2, "line-dasharray": [2, 2] } });
  new maplibregl.Marker({ color: "#1C2430" }).setLngLat([site.lng, site.lat]).addTo(map);
});
window.setRadius = (meters) => {
  const source = map.getSource("fences");
  if (source) source.setData(fence(meters));
};
</script>
</body>
</html>`;
}

export function mapHtml(people: MapPerson[], sites: MapSite[]) {
  const data = JSON.stringify({ people, sites }).replace(/</g, "\\u003c");
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
<link href="https://unpkg.com/maplibre-gl@5.6.1/dist/maplibre-gl.css" rel="stylesheet" />
<style>
  html, body, #map { margin: 0; height: 100%; background: #EFEAE0; }
  .pin {
    width: 28px; height: 28px; border-radius: 50%;
    border: 3px solid #fff; box-shadow: 0 2px 8px rgba(0,0,0,.25);
    color: #1C2430; font: 700 12px sans-serif;
    display: flex; align-items: center; justify-content: center;
  }
  .maplibregl-ctrl-attrib { font-size: 10px; }
</style>
</head>
<body>
<div id="map"></div>
<script src="https://unpkg.com/maplibre-gl@5.6.1/dist/maplibre-gl.js"></script>
<script>
const data = ${data};
const first = data.people[0] || data.sites[0];
const map = new maplibregl.Map({
  container: "map",
  style: "https://tiles.openfreemap.org/styles/liberty",
  center: first ? [first.lng, first.lat] : [77.5946, 12.9716],
  zoom: first ? 13 : 5,
});
function ring(lat, lng, radiusM) {
  const points = [];
  const earth = 6378137;
  for (let i = 0; i <= 64; i++) {
    const bearing = (i / 64) * Math.PI * 2;
    const lat1 = lat * Math.PI / 180;
    const lng1 = lng * Math.PI / 180;
    const d = radiusM / earth;
    const lat2 = Math.asin(Math.sin(lat1) * Math.cos(d) + Math.cos(lat1) * Math.sin(d) * Math.cos(bearing));
    const lng2 = lng1 + Math.atan2(Math.sin(bearing) * Math.sin(d) * Math.cos(lat1), Math.cos(d) - Math.sin(lat1) * Math.sin(lat2));
    points.push([lng2 * 180 / Math.PI, lat2 * 180 / Math.PI]);
  }
  return points;
}
const markers = {};
map.on("load", () => {
  map.addSource("fences", {
    type: "geojson",
    data: {
      type: "FeatureCollection",
      features: data.sites.map((site) => ({
        type: "Feature",
        properties: { name: site.name },
        geometry: { type: "Polygon", coordinates: [ring(site.lat, site.lng, site.radiusM)] },
      })),
    },
  });
  map.addLayer({ id: "fence-fill", type: "fill", source: "fences", paint: { "fill-color": "#3DDC6A", "fill-opacity": 0.15 } });
  map.addLayer({ id: "fence-line", type: "line", source: "fences", paint: { "line-color": "#0E7A3D", "line-width": 2, "line-dasharray": [2, 2] } });
  for (const site of data.sites) {
    new maplibregl.Marker({ color: "#0E7A3D" }).setLngLat([site.lng, site.lat]).setPopup(new maplibregl.Popup({ offset: 16 }).setText(site.name + " · " + site.radiusM + " m")).addTo(map);
  }
  for (const person of data.people) {
    const el = document.createElement("button");
    el.className = "pin";
    el.style.background = person.site ? "#3DDC6A" : "#E2B043";
    el.textContent = (person.person || "?").slice(0, 1).toUpperCase();
    el.onclick = () => {
      if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(person.userId);
    };
    markers[person.userId] = new maplibregl.Marker({ element: el }).setLngLat([person.lng, person.lat]).addTo(map);
  }
  const bounds = new maplibregl.LngLatBounds();
  for (const point of [...data.people, ...data.sites]) bounds.extend([point.lng, point.lat]);
  if (!bounds.isEmpty()) map.fitBounds(bounds, { padding: 48, maxZoom: 15 });
});
window.focusPerson = (userId) => {
  const marker = markers[userId];
  if (!marker) return;
  map.flyTo({ center: marker.getLngLat(), zoom: 15 });
};
</script>
</body>
</html>`;
}

export function visitsHtml(stops: { lat: number; lng: number; label: string }[]) {
  const data = JSON.stringify(stops).replace(/</g, "\\u003c");
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
<link href="https://unpkg.com/maplibre-gl@5.6.1/dist/maplibre-gl.css" rel="stylesheet" />
<style>
  html, body, #map { margin: 0; height: 100%; background: #EFEAE0; }
  .pin {
    width: 28px; height: 28px; border-radius: 50%;
    border: 3px solid #fff; box-shadow: 0 2px 8px rgba(0,0,0,.25);
    background: #3DDC6A; color: #1C2430; font: 700 12px sans-serif;
    display: flex; align-items: center; justify-content: center;
  }
</style>
</head>
<body>
<div id="map"></div>
<script src="https://unpkg.com/maplibre-gl@5.6.1/dist/maplibre-gl.js"></script>
<script>
const stops = ${data};
const first = stops[0];
const map = new maplibregl.Map({
  container: "map",
  style: "https://tiles.openfreemap.org/styles/liberty",
  center: first ? [first.lng, first.lat] : [77.5946, 12.9716],
  zoom: first ? 13 : 5,
});
map.on("load", () => {
  if (stops.length > 1) {
    map.addSource("route", {
      type: "geojson",
      data: { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: stops.map((stop) => [stop.lng, stop.lat]) } },
    });
    map.addLayer({ id: "route", type: "line", source: "route", paint: { "line-color": "#0E7A3D", "line-width": 3, "line-dasharray": [2, 1] } });
  }
  for (const stop of stops) {
    const el = document.createElement("div");
    el.className = "pin";
    el.textContent = stop.label;
    new maplibregl.Marker({ element: el }).setLngLat([stop.lng, stop.lat]).addTo(map);
  }
  const bounds = new maplibregl.LngLatBounds();
  for (const stop of stops) bounds.extend([stop.lng, stop.lat]);
  if (!bounds.isEmpty()) map.fitBounds(bounds, { padding: 40, maxZoom: 15 });
});
</script>
</body>
</html>`;
}
