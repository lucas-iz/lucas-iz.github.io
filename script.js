// Check if geolocation is available in the browser
if ("geolocation" in navigator) {
    navigator.geolocation.getCurrentPosition(
        (position) => {
            console.log("Latitude:", position.coords.latitude);
            console.log("Longitude:", position.coords.longitude);

            const latDiv = document.getElementById("lat");
            const lngDiv = document.getElementById("lng");

            latDiv.textContent = position.coords.latitude;
            lngDiv.textContent = position.coords.longitude;
        },
        (error) => {
            console.error("Error getting location:", error.message);
        }
    );
} else {
    console.error("Geolocation is not supported by this browser.");
}