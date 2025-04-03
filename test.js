import { pipeline, env } from "@xenova/transformers";

env.localModelPath = "./"

let classifier = await pipeline('token-classification','bert-small-onnx-v3', {local_files_only: true, quantized: false});

let text = "Zoom to Pune, and show me places where planes can land";
let result = await classifier(text);
console.log(result);

// const coord = [12.9716, 77.5946] 
// fetch(`https://nominatim.openstreetmap.org/reverse?lat=${coord[0]}&lon=${coord[1]}&format=json`, {
//   headers: {
//     'User-Agent': 'ID of your APP/service/website/etc. v0.1'
//   }
// }).then(res => res.json())
//   .then(res => {
//     console.log(res.display_name)
//     console.log(res.address)
// })

// async function getStateFromLocation(locationName) {
//   const apiUrl = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(locationName)}&format=json&addressdetails=1&limit=1`;
  
//   try {
//     const response = await fetch(apiUrl, {
//       headers: {
//         'User-Agent': 'GeoCoding Project'  // Replace with your app's identifier
//       }
//     });

//     if (!response.ok) {
//       throw new Error(`HTTP error! status: ${response.status}`);
//     }

//     const data = await response.json();

//     if (data.length === 0) {
//       return "Location not found";
//     }

//     const address = data[0].address;
    
//     // Check for state in different possible fields
//     const state = address.state || address.province || address.region || "State not found";

//     return state;

//   } catch (error) {
//     console.error("There was a problem with the fetch operation:", error.message);
//     return "Error occurred while fetching data";
//   }
// }

// // Example usage
// async function testGetState() {
//   const locations = ["Pune", "Bidar", "Bengaluru", "Solapur"];
  
//   for (const location of locations) {
//     const state = await getStateFromLocation(location);
//     console.log(`${location}: ${state}`);
//   }
// }

// testGetState();
