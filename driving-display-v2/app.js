import "./maplibre-gl.js";

const middleOfGermany = [10.4515, 51.1657];
let isDarkMode = window.matchMedia("(prefers-color-scheme: dark)").matches;
let map = null;
let marker = null;
let lastPosition = null;
let currentPosition = null;
let firstCall = true;

let lastTimestamp = null;
let animationStart = null;
let animationDuration = 1000;
const durations = [];
const MAX_SAMPLES = 5;

function serviceWorkerRegistration() {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker
      .register("/sw.js")
      .then(() => console.log("Service Worker registered"))
      .catch((err) => console.error("Service Worker registration failed", err));
  }

  // Automatically re-request wake lock on visibility change
  document.addEventListener("visibilitychange", () => {
    if (wakeLock !== null && document.visibilityState === "visible") {
      requestWakeLock();
    }
  });
}

async function getLocation() {
  // Get user's location using Geolocation API
  if ("geolocation" in navigator) {
    return new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          resolve(position);
        },
        (error) => {
          console.error("Geolocation error:", error);
          resolve(middleOfGermany); // Fallback if permission is denied or error occurs
        }
      );
    });
  }
  // Fallback to a static location if Geolocation is not available or permission is denied
  return middleOfGermany;
}

async function watchPosition(callback) {
  if ("geolocation" in navigator) {
    return new Promise((resolve, reject) => {
      navigator.geolocation.watchPosition(
        (position) => {
          callback(position);
          resolve(position);
        },
        (error) => {
          console.error("Geolocation watch error:", error);
          resolve(middleOfGermany); // Fallback if permission is denied or error occurs
        },
        { enableHighAccuracy: true, maximumAge: 0, timeout: 5000 }
      );
    });
  }
  // Fallback to a static location if Geolocation is not available or permission is denied
  return middleOfGermany;
}

function customMarker() {
  const customMarker = document.createElement("div");
  customMarker.className = "marker";
  customMarker.innerHTML = `<svg fill="${
    isDarkMode ? "#fff" : "#000"
  }" version="1.1" id="Capa_1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 963 963" xml:space="preserve" transform="rotate(270)"><g id="SVGRepo_bgCarrier" stroke-width="0"></g><g id="SVGRepo_tracerCarrier" stroke-linecap="round" stroke-linejoin="round"></g><g id="SVGRepo_iconCarrier"> <g> <path d="M0,481.5C0,747.4,215.6,963,481.5,963C747.4,963,963,747.4,963,481.5C963,215.6,747.4,0,481.5,0C215.5,0,0,215.6,0,481.5z M691.601,543.3L478.2,776.601C460.4,796,436.101,805.8,411.8,805.8c-21.699,0-43.5-7.8-60.699-23.6 c-36.7-33.6-39.2-90.5-5.601-127.2l157.8-172.399L340.601,305.3c-33.601-36.6-31.101-93.6,5.5-127.2 c36.6-33.6,93.6-31.1,127.199,5.5l218.2,238.1C723,456.101,723.101,508.9,691.601,543.3z"></path> </g> </g></svg>`;
  return customMarker;
}

async function initMap() {
  map = new maplibregl.Map({
    style: "styles/light.json",
    center: middleOfGermany,
    zoom: 5,
    container: "map",
    attributionControl: {
      compact: true,
    },
    pitch: 45,
  });

  // map.addControl(new maplibregl.NavigationControl(), "top-right");

  map.setPadding({ top: 400, bottom: 0, left: 0, right: 0 });

  if (isDarkMode) {
    map.setStyle("styles/dark.json");
  }
}

function createMarker(position) {
  const location = [position.coords.longitude, position.coords.latitude];
  const bearing = position.coords.heading || 90;

  marker = new maplibregl.Marker({
    element: customMarker(),
  })
    .setLngLat(location)
    .addTo(map);

  marker.setPitchAlignment("map");
  marker.setRotationAlignment("map");
  marker.setRotation(bearing - 90);
}

async function updateMarker(timestamp) {
  // For animation
  if (!lastPosition || !currentPosition) return;

  let elapsed = timestamp - animationStart;
  let t = Math.min(elapsed / animationDuration, 1);

  let ease = t; // t * (2 - t);

  let lng =
    lastPosition.coords.longitude +
    (currentPosition.coords.longitude - lastPosition.coords.longitude) * ease;
  let lat =
    lastPosition.coords.latitude +
    (currentPosition.coords.latitude - lastPosition.coords.latitude) * ease;

  // Set variables
  const location = [lng, lat];
  const bearing = currentPosition.coords.heading || 0;
  const speedMS = currentPosition.coords.speed || 0;
  const speedKMH = speedMS * 3.6;

  // Update the marker
  marker.setLngLat(location);
  marker.setRotation(bearing - 90);

  // Update map
  if (firstCall) {
    map.flyTo({
      center: location,
      zoom: 16,
    });
  } else {
    map.easeTo({
      center: location,
      zoom: 16,
      bearing: bearing,
      duration: 1000,
    });
  }

  firstCall = false;

  // Update speed
  document.getElementById("speed").innerText = `${Math.round(speedKMH)} km/h`;
  if (t < 1) {
    requestAnimationFrame(updateMarker);
  }
}

function updateDuration(newDuration) {
  durations.push(newDuration);
  if (durations.length > MAX_SAMPLES) {
    durations.shift(); // remove oldest
  }

  const sum = durations.reduce((total, value) => total + value, 0);
  const avg = sum / durations.length;
  return Math.max(300, Math.min(avg, 5000));
}

function updateData() {
  // console.log(`Lat: ${currentPosition.coords.latitude}, Lng: ${currentPosition.coords.longitude}`);

  fetchWays(
    currentPosition.coords.latitude, // 53.54836270448066,
    currentPosition.coords.longitude // 9.983297349885174
  ).then((ways) => {
    // console.log("Ways:", ways);
    drawWays(ways);

    const closestWay = chooseWay(
      ways,
      currentPosition.coords.latitude,
      currentPosition.coords.longitude,
      currentPosition.coords.heading
    );

    let maxSpeed = closestWay.tags.maxspeed || "";

    if (maxSpeed) {
      document.getElementById(
        "speed-limit"
      ).innerText = `MAX ${maxSpeed.toString()}`;
    } else {
      document.getElementById("speed-limit").innerText = "";
    }
  });
}

function drawWays(ways) {
  if (!ways || ways.length === 0) {
    console.warn("No ways found");
    return;
  }

  // Build LineString features for ways
  const lineFeatures = ways.map((way) => {
    const coordinates = way.geometry.map((point) => [point.lon, point.lat]);
    return {
      type: "Feature",
      geometry: {
        type: "LineString",
        coordinates: coordinates,
      },
      properties: {
        id: way.id,
        name: way.tags.name || "Unnamed Way",
        closest:
          chooseWay(
            ways,
            currentPosition.coords.latitude,
            currentPosition.coords.longitude,
            currentPosition.coords.heading
          ) === way,
      },
    };
  });

  // Build Point features for endpoints
  const endpointFeatures = ways.flatMap((way) => {
    if (!way.geometry || way.geometry.length < 2) return [];
    const start = way.geometry[0];
    const end = way.geometry[way.geometry.length - 1];
    return [
      {
        type: "Feature",
        geometry: {
          type: "Point",
          coordinates: [start.lon, start.lat],
        },
        properties: {
          id: way.id + "_start",
          endpoint: "start",
        },
      },
      {
        type: "Feature",
        geometry: {
          type: "Point",
          coordinates: [end.lon, end.lat],
        },
        properties: {
          id: way.id + "_end",
          endpoint: "end",
        },
      },
    ];
  });

  // GeoJSON collections
  const linesGeojson = {
    type: "FeatureCollection",
    features: lineFeatures,
  };
  const endpointsGeojson = {
    type: "FeatureCollection",
    features: endpointFeatures,
  };

  // Draw lines
  if (map.getSource("ways")) {
    map.getSource("ways").setData(linesGeojson);
  } else {
    map.addSource("ways", {
      type: "geojson",
      data: linesGeojson,
    });

    map.addLayer({
      id: "ways",
      type: "line",
      source: "ways",
      layout: {
        "line-join": "round",
        "line-cap": "round",
      },
      paint: {
        "line-color": [
          "case",
          ["boolean", ["get", "closest"], false],
          "#00ff00", // Green for the closest way
          "#ff0000", // Red for others
        ],
        "line-width": 4,
        "line-opacity": 0.7,
      },
    });
  }

  // Draw endpoints
  if (map.getSource("way-endpoints")) {
    map.getSource("way-endpoints").setData(endpointsGeojson);
  } else {
    map.addSource("way-endpoints", {
      type: "geojson",
      data: endpointsGeojson,
    });

    map.addLayer({
      id: "way-endpoints",
      type: "circle",
      source: "way-endpoints",
      paint: {
        "circle-radius": 6,
        "circle-color": [
          "match",
          ["get", "endpoint"],
          "start",
          "#ff0000",
          "end",
          "#00ff00",
          "#888888",
        ],
        "circle-stroke-width": 2,
        "circle-stroke-color": "#fff",
      },
    });
  }
}

async function fetchWays(lat, lng, radius = 5) {
  const body = `
                [out:json];
                way(around:${radius}, ${lat}, ${lng})["highway"~"motorway|trunk|primary|secondary|tertiary|unclassified|residential|motorway_link|trunk_link|primary_link|secondary_link|tertiary_link"];
                out body geom;
            `;

  const data = await fetchData(body);

  const ways = data.elements;
  return ways;
}

async function fetchData(body) {
  const url = "https://overpass-api.de/api/interpreter";

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: body,
    });

    if (!response.ok) {
      throw new Error("Network response was not ok");
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error("Error fetching speed limit:", error);
    return null;
  }
}

// Function calls
serviceWorkerRegistration();
initMap();

map.on("load", () => {
  getLocation().then((position) => {
    createMarker(position);

    // Continuously watch the user's position
    watchPosition(async (position) => {
      const now = performance.now();

      // TODO: Actually use closest point (TO FIX)
      // const closestPoint = await snapToClosestRoad({
      //   lat: position.coords.latitude,
      //   lon: position.coords.longitude,
      // });
      const closestPoint = {
        lat: position.coords.latitude,
        lon: position.coords.longitude,
      };

      lastPosition = currentPosition || {
        coords: {
          longitude: closestPoint.lon,
          latitude: closestPoint.lat,
          heading: position.coords.heading || 0,
          speed: position.coords.speed || 0,
        },
      };

      currentPosition = {
        coords: {
          longitude: closestPoint.lon,
          latitude: closestPoint.lat,
          heading: position.coords.heading || 0,
          speed: position.coords.speed || 0,
        },
      };

      // Dynamically calculate duration
      if (lastTimestamp !== null) {
        const interval = now - lastTimestamp;
        animationDuration = updateDuration(interval);
      }

      lastTimestamp = now;
      animationStart = now;

      updateData();

      requestAnimationFrame(updateMarker);
    });
  });
});

// https://maplibre.org/maplibre-gl-js/docs/API/#markers-and-controls

function getWayHeading(way, lat, lng) {
  if (!way.geometry || way.geometry.length < 2) {
    console.warn("Way does not have enough points to calculate heading");
    return 0; // Default heading if not enough points
  }

  const geometry = way.geometry;

  // Make sure the first point of the geometry is the closest to the given point
  const firstPoint = geometry[0];
  const lastPoint = geometry[geometry.length - 1];

  function distance(a, b) {
    const dx = a.lon - b.lon;
    const dy = a.lat - b.lat;
    return Math.sqrt(dx * dx + dy * dy);
  }

  const refPoint = { lon: lng, lat: lat };
  const distToFirst = distance(firstPoint, refPoint);
  const distToLast = distance(lastPoint, refPoint);

  if (distToLast < distToFirst) {
    geometry.reverse();
  }

  const headings = [];
  // Calculate heading for each segment of the way
  for (let i = 0; i < geometry.length - 1; i++) {
    if (geometry[i].lon === undefined || geometry[i].lat === undefined) {
      console.warn("Way point does not have lon/lat properties");
      return 0; // Default heading if point is invalid
    }
    if (isNaN(geometry[i].lon) || isNaN(geometry[i].lat)) {
      console.warn("Way point has NaN values for lon/lat");
      return 0; // Default heading if point is invalid
    }
    const start = geometry[i];
    const end = geometry[i + 1];
    const dx = end.lon - start.lon;
    const dy = end.lat - start.lat;
    const heading = Math.atan2(dy, dx) * (180 / Math.PI);
    headings.push((heading + 360) % 360); // Normalize to [0, 360) range
  }

  // Calculate average heading
  const averageHeading =
    headings.reduce((sum, h) => sum + h, 0) / headings.length;

  return averageHeading;
}

function chooseWay(ways, lat, lng, hdg) {
  let closestHeading = null;
  let closestWay = null;
  for (const way of ways) {
    // Choose the way with the closest heading to the given heading
    const wayHeading = getWayHeading(way, lat, lng) - 90;
    if (
      closestHeading === null ||
      Math.abs(wayHeading - hdg) < Math.abs(closestHeading - hdg)
    ) {
      closestHeading = wayHeading;
      closestWay = way;
    }
  }

  // drawWays(ways);

  return closestWay;
}

/*** HELPER FUNCTIONS ***/

/* Functions for snapping to the closest road segment */

// Convert degrees to radians
function toRad(deg) {
  return (deg * Math.PI) / 180;
}

// Approximate Earth distance between two lat/lon points (Haversine)
function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371000; // Earth radius in meters
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;

  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Project point P onto line segment AB
function closestPointOnSegment(A, B, P) {
  const toXY = ({ lat, lon }) => ({
    x: lon * 111320 * Math.cos(toRad(lat)), // rough equirectangular projection
    y: lat * 110540,
  });

  const a = toXY(A);
  const b = toXY(B);
  const p = toXY(P);

  const ab = { x: b.x - a.x, y: b.y - a.y };
  const ap = { x: p.x - a.x, y: p.y - a.y };

  const ab2 = ab.x ** 2 + ab.y ** 2;
  const dot = ap.x * ab.x + ap.y * ab.y;
  const t = Math.max(0, Math.min(1, dot / ab2)); // clamp to [0,1]

  const closest = {
    x: a.x + t * ab.x,
    y: a.y + t * ab.y,
  };

  // Convert back to lat/lon
  return {
    lat: closest.y / 110540,
    lon: closest.x / (111320 * Math.cos(toRad(P.lat))),
  };
}

// Main function: find closest point on all ways
async function snapToClosestRoad(inputPoint) {
  let minDist = Infinity;
  let closestPoint = null;
  let closestWay = null;

  console.log("Snapping to closest road...");
  console.log(`Input Point: lat=${inputPoint.lat}, lon=${inputPoint.lon}`);

  const ways = await fetchWays(inputPoint.lat, inputPoint.lon, 50);

  ways.forEach((way) => {
    const geometry = way.geometry;
    for (let i = 0; i < geometry.length - 1; i++) {
      const A = geometry[i];
      const B = geometry[i + 1];
      const projected = closestPointOnSegment(A, B, inputPoint);
      const dist = haversineDistance(
        inputPoint.lat,
        inputPoint.lon,
        projected.lat,
        projected.lon
      );

      if (dist < minDist) {
        minDist = dist;
        closestPoint = projected;
        closestWay = way;
      }
    }
  });

  // return closestWay;
  return closestPoint;
}
