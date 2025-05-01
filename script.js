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

function updateSpeedLimit(lat, lng) {
    const url = "https://overpass-api.de/api/interpreter";
    fetch(url, {
        method: "POST",
        headers: {
            "Content-Type": "application/x-www-form-urlencoded",
        },
        body: `
            [out:json];
            way(around:50,${lat},${lng})["highway"];
            out body;
        `
    })
        .then((response) => {
            if (!response.ok) {
                throw new Error("Network response was not ok");
            }
            return response.json();
        })
        .then((data) => {
            console.log(data);
            
            const speedLimits = data.elements.map((element) => {
                const tags = element.tags;
                if (tags && tags.maxspeed) {
                    return parseInt(tags.maxspeed, 10);
                }
                return null;
            }).filter((limit) => limit !== null);

            console.log("Speed Limits:", speedLimits);

            // document.getElementById("speed-limit").textContent = speedLimit;
        })
        .catch((error) => {
            console.error("Error fetching speed limit:", error);
        });
}