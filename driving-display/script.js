serviceWorkerRegistration();
updatePosition();

/*** VARIABLES ***/
let previousWays = [
  {
    type: "way",
    id: 202156994,
    bounds: {
      minlat: 52.5193794,
      minlon: 13.4037577,
      maxlat: 52.5199179,
      maxlon: 13.4048107,
    },
    nodes: [341340986, 4036910494, 3792411146, 3792418589, 29221506],
    geometry: [
      { lat: 52.5193794, lon: 13.4037577 },
      { lat: 52.5194592, lon: 13.4039173 },
      { lat: 52.5198265, lon: 13.4046354 },
      { lat: 52.5198521, lon: 13.4046833 },
      { lat: 52.5199179, lon: 13.4048107 },
    ],
    tags: {
      "access:lanes": "yes|yes|yes|no|yes",
      "bus:lanes": "no|no|no|designated|no",
      "cycleway:left": "no",
      "cycleway:right": "share_busway",
      foot: "use_sidepath",
      highway: "primary",
      lanes: "5",
      "lanes:psv": "1",
      lit: "yes",
      maxspeed: "50",
      name: "Karl-Liebknecht-Straße",
      "name:etymology:wikidata": "Q75886",
      oneway: "yes",
      "parking:both": "no",
      ref: "B 2;B 5",
      "sidewalk:left": "no",
      "sidewalk:right": "separate",
      smoothness: "good",
      surface: "asphalt",
      "turn:lanes": "left|through|through|none|right",
      wikidata: "Q551773",
      wikimedia_commons: "Category:Karl-Liebknecht-Straße (Berlin-Mitte)",
      wikipedia: "en:Karl-Liebknecht-Straße",
      "zone:traffic": "DE:urban",
    },
  },
];
let previousSpeedlimits = [];
let wakeLock = null;

/*** MAP ***/

var map = L.map("map").fitWorld();
let positionMarker = null;
let positionCircle = null;
let closestPointMarker = null;

L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19,
}).addTo(map);

map.removeControl(map.zoomControl);
map.removeControl(map.attributionControl);
map.removeControl(map.scaleControl);

map.locate({ setView: true, maxZoom: 15 });

/*** FUNCTION DEFINITIONS ***/

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

function updatePosition() {
  const speedDiv = document.getElementById("speed");
  const hdgDiv = document.getElementById("heading");

  if ("geolocation" in navigator) {
    navigator.geolocation.watchPosition(
      (position) => {
        const speedMS = position.coords.speed;
        const speedKPH = speedMS ? speedMS * 3.6 : 0; // Convert m/s to km/h
        speedDiv.textContent = speedKPH.toFixed(0);
        hdgDiv.textContent = position.coords.heading
          ? position.coords.heading.toFixed(0) + " °"
          : "-";

        updateData(position);

        // Update Map
        if (positionMarker) {
          positionMarker.setLatLng([
            position.coords.latitude,
            position.coords.longitude,
          ]);
        } else {
          positionMarker = L.circleMarker(
            [position.coords.latitude, position.coords.longitude],
            {
              radius: 8,
              fillColor: "#3388ff",
              color: "#3388ff",
              weight: 1,
              opacity: 1,
              fillOpacity: 1,
            }
          ).addTo(map);
        }
        if (positionCircle) {
          positionCircle.setLatLng([
            position.coords.latitude,
            position.coords.longitude,
          ]);
          positionCircle.setRadius(position.coords.accuracy);
        } else {
          positionCircle = L.circle(
            [position.coords.latitude, position.coords.longitude],
            {
              radius: position.coords.accuracy,
            }
          ).addTo(map);
        }
        map.setView([position.coords.latitude, position.coords.longitude], 15);
      },
      (error) => {
        console.error("Error watching location:", error.message);
      }
    );
  } else {
    console.error("Geolocation is not supported by this browser.");
  }
}

async function updateData(position) {
  lat = position.coords.latitude;
  lng = position.coords.longitude;
  hdg = position.coords.heading; // maybe null

  const data = await fetchWays(lat, lng, 50);

  if (data) {
    const closestPoint = snapToClosestRoad(
      { lat: lat, lon: lng },
      data.elements
    );

    if (!closestPoint) {
      console.warn("Too far away from any road.");
      // document.getElementById("speedlimit").textContent = "Too far away from any road";
      return;
    }

    // TEST: Display closest point on map
    if (haversineDistance(lat, lng, closestPoint.lat, closestPoint.lon) > 10) {
      // Display closest point on map
      if (closestPointMarker) {
        closestPointMarker.setLatLng([closestPoint.lat, closestPoint.lon]);
      } else {
        closestPointMarker = L.circleMarker(
          [closestPoint.lat, closestPoint.lon],
          {
            radius: 6,
            fillColor: "#ff0000",
            color: "#800000",
            weight: 1,
            opacity: 1,
            fillOpacity: 1,
          }
        ).addTo(map);
      }
    }

    const updatedData = await fetchWays(closestPoint.lat, closestPoint.lon);
    console.log("Updated data:", updatedData);
    if (
      updatedData ||
      updatedData.elements ||
      updatedData.elements.length > 0
    ) {
      updateSpeedLimit(lat, lng, updatedData);
      updateOvertakingBan(updatedData);
    } else {
      console.error("Failed to fetch updated osm data.");
    }
  } else {
    console.error("Failed to fetch osm data.");
  }
}

async function requestWakeLock() {
  try {
    wakeLock = await navigator.wakeLock.request("screen");
    console.log("Wake Lock is active");

    // Reapply wake lock if it is released (e.g., screen orientation change)
    wakeLock.addEventListener("release", () => {
      console.log("Wake Lock was released");
      requestWakeLock(); // Reapply the lock
    });
  } catch (err) {
    console.error(`${err.name}, ${err.message}`);
  }
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
function snapToClosestRoad(inputPoint, ways, returnWay = false) {
  let minDist = Infinity;
  let closestPoint = null;
  let closestWay = null;

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

  if (returnWay) {
    return closestWay;
  } else {
    return closestPoint;
  }
}

/* Functions for fetching data from Overpass API */

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

async function fetchWays(lat, lng, radius = 5) {
  const body = `
                [out:json];
                way(around:${radius}, ${lat}, ${lng})["highway"~"motorway|trunk|primary|secondary|tertiary|unclassified|residential|motorway_link|trunk_link|primary_link|secondary_link|tertiary_link"];
                out body geom;
            `;

  return fetchData(body);
}

async function fetchNextWay(currentWay) {
  if (!previousWays.some((way) => way.id === currentWay.id)) {
    previousWays.push(currentWay);
  }

  const nodesIds = currentWay.nodes;
  // console.log("Nodes:", nodesIds);
  const streetName = currentWay.tags.name;
  // console.log("Street Name:", streetName);

  const body = `
                [out:json];
                node(id:${nodesIds.join(",")});
                way(bn)["name"="${streetName}"];
                out body geom;
            `;
  const data = await fetchData(body);

  dataWithoutCurrentOrPreviousWays = data.elements.filter((way) => {
    // Current way is already in previousWays
    return !previousWays.some((previousWay) => previousWay.id === way.id);
  });

  return dataWithoutCurrentOrPreviousWays;
}

/* Functions to change the speedlimit, overtaking bans, and other road attributes */

async function updateSpeedLimit(lat, lng, data) {
  const currentWay = snapToClosestRoad(
    { lat: lat, lon: lng },
    data.elements,
    true
  );
  console.log("Current way:", currentWay);
  showWaysOnMap([currentWay], "blue");

  const nextWay = await predictNextWay(currentWay);
  console.log("Predicted next way:", nextWay);
  showWaysOnMap(nextWay, "red");

  // TODO: To something with the predicted next way. Check with speedlimit from current way (???)

  let speedLimit = currentWay.tags.maxspeed;

  if (speedLimit) {
    document.getElementById("heading").textContent += ` | ${speedLimit}`;
  }

  const speedlimitDiv = document.getElementById("speedlimit");

  if (!speedLimit) {
    console.log("No speed limit found");
    speedlimitDiv.innerHTML = "";
  } else if (speedLimit === "none") {
    console.log("Speed Limit: None");

    const speedlimitImg = document.createElement("img");
    speedlimitImg.src = `verkehrszeichen/282.png`;
    speedlimitImg.alt = `Speed Limit: None`;

    speedlimitDiv.innerHTML = "";
    speedlimitDiv.appendChild(speedlimitImg);
  } else {
    if (speedLimit.includes("mph")) {
      speedLimit = speedLimit.replace("mph", "").trim();
    }
    speedLimit = parseInt(speedLimit, 10);

    const amountOfPreviousSpeedlimitsToCheck = 3;

    // Update speed display if last 3 values of previousSpeedlimits are equal to current speed limit
    if (previousSpeedlimits.length >= amountOfPreviousSpeedlimitsToCheck) {
      const allEqual = previousSpeedlimits.every(
        (val, i, arr) => val === arr[0]
      );
      const speedlimitSameAsPrevious = previousSpeedlimits[0] === speedLimit;
      if (allEqual && speedlimitSameAsPrevious) {
        // Change speedlimit
        const speedlimitImg = document.createElement("img");

        if (speedLimit == 5 || speedLimit % 10 == 0) {
          speedlimitImg.src = `verkehrszeichen/274-${speedLimit}.png`; // Only display speedlimits-signs that exist
        }
        speedlimitImg.alt = `Speed Limit: ${speedLimit}`;

        document.getElementById("speedlimit").innerHTML = "";
        document.getElementById("speedlimit").appendChild(speedlimitImg);
      }
    }

    // Add speedKPH to front of previousSpeedlimits
    previousSpeedlimits.unshift(speedLimit);

    // Remove last element of previousSpeedlimits if it has more than 3 elements
    if (previousSpeedlimits.length > amountOfPreviousSpeedlimitsToCheck) {
      previousSpeedlimits.pop();
    }
  }
}

function updateOvertakingBan(data) {
  const overtakingBanDiv = document.getElementById("overtakingBan");

  const overtakingBanForTrucks = data.elements[0].tags["overtaking:hgv"];
  const overtakingBan = data.elements[0].tags["overtaking"];

  const overtakingBanImg = document.createElement("img");
  if (overtakingBan === "no") {
    overtakingBanImg.src = "verkehrszeichen/276.png";
    overtakingBanImg.alt = "Overtaking Ban";
    overtakingBanDiv.innerHTML = "";
    overtakingBanDiv.appendChild(overtakingBanImg);
  } else if (overtakingBanForTrucks === "no") {
    overtakingBanImg.src = "verkehrszeichen/277.png";
    overtakingBanImg.alt = "Overtaking Ban for Trucks";
    overtakingBanDiv.innerHTML = "";
    overtakingBanDiv.appendChild(overtakingBanImg);
  } else {
    overtakingBanDiv.innerHTML = "";
    console.log("No overtaking ban");
  }
}

/* Map functions */

function onLocationFound(e) {
  var radius = e.accuracy;
  let heading = e.coords.heading; // may be null
  console.log("Location found:", e);

  positionMarker = L.marker(e.latlng).addTo(map);
  positionCircle = L.circle(e.latlng, radius).addTo(map);
}

function onLocationError(e) {
  alert(e.message);
}

function showWaysOnMap(ways, color = "blue") {
  ways.forEach((way) => {
    const latlngs = way.geometry.map((coord) => [coord.lat, coord.lon]);
    L.polyline(latlngs, { color }).addTo(map);
  });
}

async function predictNextWay(currentWay) {
  const possibleNextWays = await fetchNextWay(currentWay);

  // console.log("Possible next ways:", possibleNextWays);

  return possibleNextWays;
}
