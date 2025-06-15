import "./maplibre-gl.js";

const middleOfGermany = [10.4515, 51.1657];
const isDarkMode = !window.matchMedia("(prefers-color-scheme: dark)").matches;
let map = null;
let marker = null;

async function getLocation() {
  // For testing - TODO: Remove next line in production
  // return [10.174104370648651, 54.31653015028949];

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

function customMarker({ rotation = 0 } = {}) {
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

  map.setPadding({ top: 300, bottom: 0, left: 0, right: 0 });

  if (isDarkMode) {
    map.setStyle("styles/dark.json");
  }
}

async function updatePositionOnMap(position) {
  // Add delay to ensure the map is initialized
  await new Promise((resolve) => setTimeout(resolve, 5000));

  // Set variables
  const location = [position.coords.longitude, position.coords.latitude];
  const bearing = position.coords.heading || 0;
  const speedMS = position.coords.speed || 0;
  const speedKMH = speedMS * 3.6;

  // Update the marker
  if (marker) {
    marker.setLngLat(location);
  } else {
    marker = new maplibregl.Marker({
      element: customMarker(),
    })
      .setLngLat(location)
      .addTo(map);

    marker.setPitchAlignment("map");
    marker.setRotationAlignment("map");
    marker.setRotation(0);
  }
  marker.setRotation(bearing);

  // Update map
  map.easeTo({
    center: location,
    zoom: 16,
    bearing: bearing,
    duration: 1000,
  });

  // Update speed
  // TODO
}

initMap();
map.on("load", () => {
  getLocation().then((position) => {
    updatePositionOnMap(position);
  });
});

// Continuously watch the user's position
watchPosition((position) => {
  updatePositionOnMap(position);
});

// https://maplibre.org/maplibre-gl-js/docs/API/#markers-and-controls
