updatePosition();

/*** FUNCTION DEFINITIONS ***/

function updatePosition() {
    const latDiv = document.getElementById("lat");
    const lngDiv = document.getElementById("lng");
    const speedDiv = document.getElementById("speed");

    if ("geolocation" in navigator) {
        navigator.geolocation.watchPosition(
            (position) => {
                latDiv.textContent = position.coords.latitude;
                lngDiv.textContent = position.coords.longitude;
                speedDiv.textContent = position.coords.speed ? position.coords.speed.toFixed(2) : "0.00";
                updateSpeedLimit(position.coords.latitude, position.coords.longitude);
            },
            (error) => {
                console.error("Error watching location:", error.message);
            }
        );
    } else {
        console.error("Geolocation is not supported by this browser.");
    }
}

async function updateSpeedLimit(lat, lng) {
    const data = await fetchData(lat, lng, 50);
    if (data) {
        // console.log("1. Fetched data:", {
        //     position: { lat, lng },
        //     data
        // });
        const closestPoint = snapToClosestRoad({ lat: lat, lon: lng }, data.elements);

        const updatedData = await fetchData(closestPoint.lat, closestPoint.lon);
        if (updatedData) {
            // console.log("2. Fetched updated data:", {
            //     position: { lat: closestPoint.lat, lon: closestPoint.lon },
            //     updatedData
            // });
            const speedLimit = parseInt(updatedData.elements[0].tags.maxspeed, 10);
            document.getElementById("speedLimit").textContent = speedLimit ? speedLimit : "No speed limit found";
            console.log("Speed Limit:", speedLimit);
        } else {
            console.error("Failed to fetch updated osm data.");
        }
    } else {
        console.error("Failed to fetch osm data.");
    }
}

/*** HELPER FUNCTIONS ***/

/* Functions for snapping to the closest road segment */

// Convert degrees to radians
function toRad(deg) {
    return deg * Math.PI / 180;
}
  
// Approximate Earth distance between two lat/lon points (Haversine)
function haversineDistance(lat1, lon1, lat2, lon2) {
    const R = 6371000; // Earth radius in meters
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;

    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Project point P onto line segment AB
function closestPointOnSegment(A, B, P) {
    const toXY = ({ lat, lon }) => ({
        x: lon * 111320 * Math.cos(toRad(lat)), // rough equirectangular projection
        y: lat * 110540
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
        y: a.y + t * ab.y
    };

    // Convert back to lat/lon
    return {
        lat: closest.y / 110540,
        lon: closest.x / (111320 * Math.cos(toRad(P.lat)))
    };
}

// Main function: find closest point on all ways
function snapToClosestRoad(inputPoint, ways) {
    let minDist = Infinity;
    let closestPoint = null;

    ways.forEach(way => {
        const geometry = way.geometry;
        for (let i = 0; i < geometry.length - 1; i++) {
            const A = geometry[i];
            const B = geometry[i + 1];
            const projected = closestPointOnSegment(A, B, inputPoint);
            const dist = haversineDistance(inputPoint.lat, inputPoint.lon, projected.lat, projected.lon);

            if (dist < minDist) {
                minDist = dist;
                closestPoint = projected;
            }
        }
    });

    return closestPoint;
}

/* Functions for fetching data from Overpass API */

async function fetchData(lat, lng, radius = 5) {
    const url = "https://overpass-api.de/api/interpreter";

    try {
        const response = await fetch(url, {
            method: "POST",
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
            },
            body: `
                [out:json];
                way(around:${radius}, ${lat}, ${lng})["highway"~"motorway|trunk|primary|secondary|tertiary|unclassified|residential|motorway_link|trunk_link|primary_link|secondary_link|tertiary_link"];
                out body geom;
            `
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

