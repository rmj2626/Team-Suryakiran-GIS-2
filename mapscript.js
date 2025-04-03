let recognition;
let locationsData;
let isSpacebarPressed = false;
let isRecording = false;
let isNlpInputFocused = false;
let locationMarker; // Global variable to store the current location marker

//remove later
const removalKeywords = ['remove', 'delete', 'hide', 'erase', 'clear', 'disable'];
const layerKeywords = {
  'highway': ['highway', 'road', 'nh'],
  'railway': ['railway', 'rail', 'train'],
  'airport': ['airport', 'airfield', 'aerodrome'],
  'land use': ['land use', 'lulc', 'land cover'],
  // Add more layer keywords as needed
};

var view = new ol.View({
  center: ol.proj.fromLonLat([78.9629, 22.5937]),
  zoom: 5,
});

var osmLayer = new ol.layer.Tile({
  source: new ol.source.OSM(),
  visible: true,
});

var map = new ol.Map({
  target: "map",
  layers: [osmLayer],
  view: view,
});

var wmsLayers = [];
var layerConfig;

function initializeSpeechRecognition() {
  if ('webkitSpeechRecognition' in window) {
    recognition = new webkitSpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = 'en-US';

    recognition.onresult = function(event) {
      const transcript = event.results[0][0].transcript;
      document.getElementById('nlpInput').value = transcript;
      processNLPInput();
    };

    recognition.onerror = function(event) {
      console.error('Speech recognition error:', event.error);
    };

    recognition.onend = function() {
      isRecording = false;
      console.log('Speech recognition ended');
    };
  } else {
    console.error('Web Speech API is not supported in this browser');
  }
}

async function loadLocationsData() {
  try {
    const response = await fetch('locations_data.json');
    locationsData = await response.json();
    console.log('Locations data loaded successfully');
  } catch (error) {
    console.error('Error loading locations data:', error);
    locationsData = { locations: [] }; // Initialize with empty data if loading fails
  }
}

async function loadLayerConfig() {
  try {
    const [layerConfigResponse, _] = await Promise.all([
      fetch("layer_config.json"),
      loadLocationsData()
    ]);

    if (!layerConfigResponse.ok) {
      throw new Error(`HTTP error! status: ${layerConfigResponse.status}`);
    }

    const data = await layerConfigResponse.json();
    layerConfig = data.layers.map(layer => normalizeLayerConfig(layer));
    populateLayerSelect();
    console.log('Layer configuration loaded successfully');
  } catch (error) {
    console.error("Error loading configurations:", error);
    layerConfig = []; // Initialize with empty array if loading fails
  }
}

function normalizeLayerConfig(layer) {
  // This function normalizes the layer config to a consistent format
  if (layer.states) {
    // Old format
    return {
      ...layer,
      layerType: 'stateWMS',
      layerParams: {
        LAYERS: layer.states[0].layerName.split(':')[0], // Assuming all states have the same prefix
        VERSION: '1.3.0', // You may need to adjust this
        CRS: 'EPSG:4326'
      },
      format: 'image/png'
    };
  } else {
    // New format
    return {
      ...layer,
      layerType: layer.layerType || 'imageWMS',
      states: null
    };
  }
}

function populateLayerSelect() {
  var layerSelect = document.getElementById("layerSelect");
  layerSelect.innerHTML = ''; // Clear existing options

  layerConfig.forEach((layer, index) => {
    var option = document.createElement("option");
    option.value = index;
    option.textContent = layer.name;
    layerSelect.appendChild(option);
  });

  // If there are layers, populate the state select for the first layer
  if (layerConfig.length > 0) {
    populateStateSelect();
  }
}

function populateStateSelect() {
  var layerSelect = document.getElementById("layerSelect");
  var stateSelect = document.getElementById("stateSelect");
  var selectedLayer = layerConfig[layerSelect.value];

  stateSelect.innerHTML = ""; // Clear existing options

  if (selectedLayer.states) {
    // Show state select only for layers with states
    stateSelect.style.display = 'block';
    selectedLayer.states.forEach((state, index) => {
      var option = document.createElement("option");
      option.value = index;
      option.textContent = state.name;
      stateSelect.appendChild(option);
    });
  } else {
    // Hide state select for layers without states
    stateSelect.style.display = 'none';
  }
}

function loadWmsLayer(layerConfig) {
  let newWmsLayer;

  if (layerConfig.states) {
    // Old format
    var layerSelect = document.getElementById("layerSelect");
    var stateSelect = document.getElementById("stateSelect");

    var selectedLayer = layerConfig;
    var selectedState = selectedLayer.states[stateSelect.value];

    newWmsLayer = new ol.layer.Tile({
      source: new ol.source.TileWMS({
        url: selectedLayer.rootUrl,
        params: {
          LAYERS: selectedState.layerName,
          TILED: true,
        },
        serverType: "geoserver",
      }),
      title: `${selectedLayer.name} - ${selectedState.name}`,
    });
  } else {
    // New format
    newWmsLayer = new ol.layer.Tile({
      source: new ol.source.TileWMS({
        url: layerConfig.rootUrl,
        params: {
          ...layerConfig.layerParams,
          TILED: true,
        },
        serverType: "geoserver",
      }),
      title: layerConfig.name,
    });

    if (layerConfig.zIndex !== undefined) {
      newWmsLayer.setZIndex(layerConfig.zIndex);
    }
  }

  let errorShown = false;

  newWmsLayer.getSource().on("tileloaderror", function (event) {
    console.error("Error loading WMS tile:", event);
    if (!errorShown) {
      console.error("Error loading WMS layer. Please check the console for details.");
      errorShown = true;
    }
  });

  map.addLayer(newWmsLayer);
  wmsLayers.push(newWmsLayer);

  console.log("WMS Layer added:", layerConfig.rootUrl, layerConfig.layerParams ? layerConfig.layerParams.LAYERS : selectedState.layerName);
  updateLayerList();
}

function updateLayerList() {
  var layerListElement = document.getElementById("layerList");
  layerListElement.innerHTML = "";
  wmsLayers.forEach((layer, index) => {
    var layerItem = document.createElement("div");
    layerItem.innerHTML = `
      <input type="checkbox" ${
        layer.getVisible() ? "checked" : ""
      } onchange="toggleWmsLayerVisibility(${index})">
      ${layer.get("title")}
      <button onclick="removeWmsLayer(${index})">Remove</button>
    `;
    layerListElement.appendChild(layerItem);
  });
}

function toggleWmsLayerVisibility(index) {
  if (index >= 0 && index < wmsLayers.length) {
    var layer = wmsLayers[index];
    layer.setVisible(!layer.getVisible());
    updateLayerList();
  }
}

// function removeWmsLayer(index) {
//   if (index >= 0 && index < wmsLayers.length) {
//     map.removeLayer(wmsLayers[index]);
//     wmsLayers.splice(index, 1);
//     updateLayerList();
//   }
// }

// Modify the existing removeWmsLayer function to log the removal
function removeWmsLayer(index) {
  if (index >= 0 && index < wmsLayers.length) {
    const removedLayer = wmsLayers[index];
    map.removeLayer(removedLayer);
    wmsLayers.splice(index, 1);
    updateLayerList();
    console.log(`Removed layer: ${removedLayer.get('title')}`);
  }
}



function generateLayerSearchQueries(layerWords) {
  const searchQueries = [];
  searchQueries.push(layerWords.join(" "));
  if (layerWords.length > 0) {
    searchQueries.push(layerWords[0]);
  }
  return searchQueries;
}

async function setWmsLayer(matchingLayer) {
  console.log(`Setting WMS layer:`, matchingLayer);
  return new Promise((resolve) => {
    const { layer, stateIndex } = matchingLayer;

    // Check for existing layer
    const layerTitle = layer.states ? `${layer.name} - ${layer.states[stateIndex].name}` : layer.name;
    const existingLayer = wmsLayers.find(wmsLayer => 
      wmsLayer.get('title') === layerTitle
    );

    if (existingLayer) {
      console.log('Layer already exists, not adding duplicate');
      resolve();
      return;
    }

    console.log(`Creating new WMS layer: ${layerTitle}`);
    var newWmsLayer;

    if (layer.states) {
      // For layers with states
      const selectedState = layer.states[stateIndex];
      newWmsLayer = new ol.layer.Tile({
        source: new ol.source.TileWMS({
          url: layer.rootUrl,
          params: {
            LAYERS: selectedState.layerName,
            TILED: true,
          },
          serverType: "geoserver",
        }),
        title: layerTitle,
      });
    } else {
      // For layers without states
      newWmsLayer = new ol.layer.Tile({
        source: new ol.source.TileWMS({
          url: layer.layerFactoryParams.urlTemplate,
          params: {
            ...layer.layerFactoryParams.layerParams,
            TILED: true,
          },
          serverType: "geoserver",
        }),
        title: layerTitle,
      });
    }

    let errorShown = false;

    newWmsLayer.getSource().on("tileloaderror", function (event) {
      console.error("Error loading WMS tile:", event);
      if (!errorShown) {
        console.error("Error loading WMS layer. Please check the console for details.");
        errorShown = true;
      }
    });

    console.log("Adding new WMS layer to map");
    map.addLayer(newWmsLayer);
    wmsLayers.push(newWmsLayer);

    console.log("WMS Layer added:", layerTitle);
    updateLayerList();

    if (layer.states) {
      console.log(`Zooming to state: ${layer.states[stateIndex].name}`);
      zoomToState(layer.states[stateIndex].name);
    } else {
      console.log(`Layer doesn't have states, not zooming to a specific state`);
    }

    resolve();
  });
}

async function genericSearch(searchItems, searchFunction, selectionFunction) {
  if (searchItems.length === 0) {
    return;
  }

  const searchQueries = [searchItems.join(" ")];
  if (searchItems.length > 0) {
    searchQueries.push(searchItems[0]);
  }

  for (let query of searchQueries) {
    try {
      const results = await searchFunction(query);
      if (results.length > 0) {
        await selectionFunction(results);
        return;
      }
    } catch (error) {
      console.error(`Error in search: ${error}`);
    }
  }

  console.log("No matching results found");
}

async function getStateFromLocation(locationName) {
  console.log(`Getting state for location: ${locationName}`);
  
  // Check local data first
  const localMatch = locationsData.locations.find(loc => 
    loc.name.toLowerCase() === locationName.toLowerCase()
  );
  
  if (localMatch) {
    console.log(`Location found in local data: ${localMatch.name}, State: ${localMatch.state}`);
    return { state: localMatch.state, source: 'local' };
  }

  // If not found in local data, use Nominatim API
  const apiUrl = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(locationName)}&format=json&addressdetails=1&limit=1`;
  
  try {
    const response = await fetch(apiUrl, {
      headers: {
        'User-Agent': 'GeoCoding Project'
      }
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    console.log(`Raw API response:`, data);

    if (data.length === 0) {
      console.log('No results found for the location');
      return { state: "Location not found", source: 'api' };
    }

    const address = data[0].address;
    console.log(`Address object:`, address);
    
    const state = address.state || address.province || address.region || "State not found";
    console.log(`State found: ${state}`);

    return { state, source: 'api' };

  } catch (error) {
    console.error(`Error fetching location data: ${error.message}`);
    return { state: "Error occurred while fetching data", source: 'error' };
  }
}

async function searchLayer(layerWords, locationWords) {
  console.log(`Searching layer:`, { layerWords, locationWords });
  const isAutomatic = document.getElementById("automaticCheckbox").checked;
  console.log(`Automatic loading is ${isAutomatic ? 'enabled' : 'disabled'}`);

  try {
    const query = layerWords.join(" ");
    console.log(`Searching for layer: ${query}`);

    const matchingLayers = [];
    for (let i = 0; i < layerConfig.length; i++) {
      const layer = layerConfig[i];
      console.log(`Checking layer: ${layer.name}`);
      const layerSimilarity = await window.runSimilaritySearch(query, layer.description);
      console.log(`Layer similarity for "${layer.name}": ${layerSimilarity}`);
      
      if (layerSimilarity > 0) {
        if (layer.states) {
          // For layers with states
          for (const location of locationWords) {
            const stateResult = await findBestMatchingState([location], layer.states);
            if (stateResult) {
              matchingLayers.push({
                layer,
                layerIndex: i,
                stateIndex: stateResult.index,
                layerSimilarity,
                stateSimilarity: stateResult.similarity,
                totalSimilarity: (layerSimilarity + stateResult.similarity) / 2,
                location: location
              });
              console.log(`Added matching layer: ${layer.name} for state: ${layer.states[stateResult.index].name}`);
              console.log(`Layer similarity: ${layerSimilarity}, State similarity: ${stateResult.similarity}, Total similarity: ${(layerSimilarity + stateResult.similarity) / 2}`);
            }
          }
        } else {
          // For layers without states
          matchingLayers.push({
            layer,
            layerIndex: i,
            layerSimilarity,
            totalSimilarity: layerSimilarity,
            location: null
          });
          console.log(`Added matching layer: ${layer.name} (no state)`);
          console.log(`Layer similarity: ${layerSimilarity}, Total similarity: ${layerSimilarity}`);
        }
      }
    }
    
    console.log(`Matching layers:`, matchingLayers);

    if (matchingLayers.length > 0) {
      // Group layers by layer name
      const groupedLayers = matchingLayers.reduce((acc, layer) => {
        if (!acc[layer.layer.name]) {
          acc[layer.layer.name] = [];
        }
        acc[layer.layer.name].push(layer);
        return acc;
      }, {});

      // Sort grouped layers by average similarity
      const sortedGroups = Object.entries(groupedLayers).sort((a, b) => {
        const avgSimilarityA = a[1].reduce((sum, layer) => sum + layer.totalSimilarity, 0) / a[1].length;
        const avgSimilarityB = b[1].reduce((sum, layer) => sum + layer.totalSimilarity, 0) / b[1].length;
        return avgSimilarityB - avgSimilarityA;
      });

      // Select the most relevant layer group
      const mostRelevantGroup = sortedGroups[0][1];
      
      if (isAutomatic) {
        for (const match of mostRelevantGroup) {
          console.log(`Setting WMS layer automatically: ${match.layer.name}${match.layer.states ? ` for state: ${match.layer.states[match.stateIndex].name}` : ''}`);
          await setWmsLayer(match);
        }
      } else {
        console.log("Showing layer selection dialog");
        const selectedLayers = await showLayerSelectionDialog(mostRelevantGroup);
        for (let layer of selectedLayers) {
          console.log(`Setting selected WMS layer: ${layer.layer.name}${layer.layer.states ? ` for state: ${layer.layer.states[layer.stateIndex].name}` : ''}`);
          await setWmsLayer(layer);
        }
      }
    } else {
      console.log("No matching layers found");
    }
  } catch (error) {
    console.error(`Error in searchLayer:`, error);
  }
  console.log("searchLayer finished");
}

async function findBestMatchingState(locationWords, states) {
  if (!states) return null;  // Return null if the layer doesn't have states

  const fullLocation = locationWords.join(' ');
  
  // First, try to find an exact match
  const exactMatch = states.findIndex(state => 
    state.name.toLowerCase() === fullLocation.toLowerCase()
  );
  
  if (exactMatch !== -1) {
    return { index: exactMatch, similarity: 1 };
  }
  
  // If no exact match, use getStateFromLocation and similarity search
  const apiState = await getStateFromLocation(fullLocation);
  console.log(`API returned state for "${fullLocation}": ${apiState.state}`);

  let bestMatch = { index: -1, similarity: 0 };
  
  for (let i = 0; i < states.length; i++) {
    const similarity = await window.runSimilaritySearch(apiState.state, states[i].name);
    console.log(`State similarity between "${apiState.state}" and "${states[i].name}": ${similarity}`);
    
    if (similarity > bestMatch.similarity) {
      bestMatch = { index: i, similarity };
    }
  }
  
  // Only return a match if the similarity is above a threshold
  return bestMatch.similarity > 0.7 ? bestMatch : null;
}

function showLayerSelectionDialog(matchingLayers) {
  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.style.position = "fixed";
    overlay.style.left = "0";
    overlay.style.top = "0";
    overlay.style.width = "100%";
    overlay.style.height = "100%";
    overlay.style.backgroundColor = "rgba(0,0,0,0.5)";
    overlay.style.zIndex = "999";

    const modal = document.createElement("div");
    modal.style.position = "fixed";
    modal.style.left = "50%";
    modal.style.top = "50%";
    modal.style.transform = "translate(-50%, -50%)";
    modal.style.backgroundColor = "white";
    modal.style.padding = "20px";
    modal.style.border = "1px solid black";
    modal.style.borderRadius = "5px";
    modal.style.zIndex = "1000";
    modal.style.maxWidth = "80%";
    modal.style.maxHeight = "80%";
    modal.style.overflowY = "auto";

    const heading = document.createElement("h2");
    heading.textContent = "Select layers to load:";
    modal.appendChild(heading);

    const list = document.createElement("ul");
    list.style.listStyleType = "none";
    list.style.padding = "0";

    const selectedLayers = new Set();

    matchingLayers.forEach((matchingLayer, index) => {
      const item = document.createElement("li");
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.id = `layer-${index}`;
      checkbox.style.marginRight = "10px";
      
      const label = document.createElement("label");
      label.htmlFor = `layer-${index}`;
      const layerName = matchingLayer.layer.name;
      const stateName = matchingLayer.layer.states ? matchingLayer.layer.states[matchingLayer.stateIndex].name : "All India";
      const totalSimilarity = matchingLayer.totalSimilarity.toFixed(2);
      label.textContent = `${layerName}${matchingLayer.layer.states ? ` - ${stateName}` : ''} (Total Similarity: ${totalSimilarity})`;
      
      item.appendChild(checkbox);
      item.appendChild(label);
      list.appendChild(item);

      checkbox.onchange = () => {
        if (checkbox.checked) {
          selectedLayers.add(matchingLayer);
        } else {
          selectedLayers.delete(matchingLayer);
        }
      };
    });

    modal.appendChild(list);

    const loadButton = document.createElement("button");
    loadButton.textContent = "Load Selected Layers";
    loadButton.onclick = () => {
      document.body.removeChild(overlay);
      resolve(Array.from(selectedLayers));
    };
    modal.appendChild(loadButton);

    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    overlay.onclick = (event) => {
      if (event.target === overlay) {
        document.body.removeChild(overlay);
        resolve([]);  // Return an empty array if the overlay is clicked
      }
    };
  });
}

async function processStateResult(stateResult, layer, layerIndex, layerSimilarity, location, matchingLayers) {
  if (!layer.states) {
    // For layers without states, add the layer directly
    matchingLayers.push({
      layer,
      layerIndex,
      layerSimilarity,
      totalSimilarity: layerSimilarity,
      location: null
    });
    console.log(`Added matching layer without state: ${layer.name}`);
    console.log(`Layer similarity: ${layerSimilarity}, Total similarity: ${layerSimilarity}`);
    return true;
  }

  const apiStateName = stateResult.state;
  console.log(`Processing state result for: ${apiStateName}`);

  for (let i = 0; i < layer.states.length; i++) {
    const configStateName = layer.states[i].name;
    const stateSimilarity = await window.runSimilaritySearch(apiStateName, configStateName);
    console.log(`State similarity between "${apiStateName}" and "${configStateName}": ${stateSimilarity}`);

    if (stateSimilarity > 0.7) { // You can adjust this threshold
      const totalSimilarity = (layerSimilarity + stateSimilarity) / 2; // Average of layer and state similarity
      matchingLayers.push({
        layer,
        layerIndex,
        stateIndex: i,
        layerSimilarity,
        stateSimilarity,
        totalSimilarity,
        location: location
      });
      console.log(`Added matching layer: ${layer.name} for state: ${configStateName}`);
      console.log(`Layer similarity: ${layerSimilarity}, State similarity: ${stateSimilarity}, Total similarity: ${totalSimilarity}`);
      return true;
    }
  }

  console.log(`No sufficiently matching state found for ${apiStateName} in layer ${layer.name}`);
  return false;
}

function zoomToState(stateName) {
  // Check local data first
  const stateMatch = locationsData.locations.find(loc => 
    loc.state.toLowerCase() === stateName.toLowerCase()
  );
  
  if (stateMatch) {
    const center = ol.proj.fromLonLat([stateMatch.longitude, stateMatch.latitude]);
    map.getView().animate({
      center: center,
      zoom: 8,
      duration: 1000,
    });
    return;
  }

  // If not found in local data, use Nominatim API
  const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
    stateName + ", India"
  )}`;

  fetch(url)
    .then((response) => response.json())
    .then((data) => {
      if (data.length > 0) {
        const lon = parseFloat(data[0].lon);
        const lat = parseFloat(data[0].lat);
        const center = ol.proj.fromLonLat([lon, lat]);
        map.getView().animate({
          center: center,
          zoom: 8,
          duration: 1000,
        });
      } else {
        console.log("State not found in API data");
      }
    })
    .catch((error) => {
      console.error("Error zooming to state:", error);
    });
}

function checkWmsCapabilities(url) {
  var capabilitiesUrl = url + "?SERVICE=WMS&REQUEST=GetCapabilities";
  fetch(capabilitiesUrl)
    .then((response) => response.text())
    .then((text) => {
      console.log("WMS Capabilities:", text);
    })
    .catch((error) => {
      console.error("Error fetching WMS Capabilities:", error);
    });
}

// async function searchLocation(locationWords) {
//   const query = locationWords.join(" ");
//   console.log(`Searching for location: ${query}`);

//   // Check local data first
//   const localMatch = locationsData.locations.find(loc => 
//     loc.name.toLowerCase() === query.toLowerCase()
//   );
  
//   if (localMatch) {
//     console.log(`Location found in local data: ${localMatch.name}`);
//     goToLocation({
//       lon: localMatch.longitude,
//       lat: localMatch.latitude,
//       display_name: localMatch.name
//     });
//     return;
//   }

//   // If not found in local data, use Nominatim API
//   const locationSearchFunction = async (query) => {
//     const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}`;
//     const response = await fetch(url);
//     return response.json();
//   };

//   const locationSelectionFunction = async (locations) => {
//     if (locations.length > 0) {
//       // Always go to the first result
//       goToLocation(locations[0]);
//     } else {
//       console.log("No matching locations found");
//     }
//   };

//   await genericSearch([query], locationSearchFunction, locationSelectionFunction);
// }

// async function searchLocation(locationName) {
//   console.log(`Searching for location: ${locationName}`);
//   const apiUrl = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(locationName)}&format=json&addressdetails=1&limit=1`;
  
//   try {
//     const response = await fetch(apiUrl, {
//       headers: {
//         'User-Agent': 'Geospatial Project v1' // Replace with your app name
//       }
//     });

//     if (!response.ok) {
//       throw new Error(`HTTP error! status: ${response.status}`);
//     }

//     const data = await response.json();
//     console.log(`Raw API response:`, data);

//     if (data.length === 0) {
//       console.log('No results found for the location');
//       return null;
//     }

//     const result = data[0];
//     const lat = parseFloat(result.lat);
//     const lon = parseFloat(result.lon);
//     const placeRank = result.place_rank;

//     console.log(`Location found: ${result.display_name}, Coordinates: ${lat}, ${lon}, Place Rank: ${placeRank}`);

//     // Determine zoom level based on place_rank
//     let zoomLevel = getZoomLevelFromPlaceRank(placeRank);

//     // Center the map on the found location and zoom
//     map.getView().animate({
//       center: ol.proj.fromLonLat([lon, lat]),
//       zoom: zoomLevel,
//       duration: 1000
//     });

//     return { lat, lon, placeRank, name: result.display_name };

//   } catch (error) {
//     console.error(`Error fetching location data: ${error.message}`);
//     return null;
//   }
// }

// function getZoomLevelFromPlaceRank(placeRank) {
//   // Adjust these values based on your preferences
//   if (placeRank >= 28) return 20; // Building
//   if (placeRank >= 26) return 18; // Street
//   if (placeRank >= 20) return 16; // Village
//   if (placeRank >= 16) return 14; // City
//   if (placeRank >= 12) return 14; // County
//   if (placeRank >= 8) return 8;   // State
//   if (placeRank >= 4) return 6;   // Country
//   return 4; // Continent or default
// }

async function searchLocation(locationName) {
  console.log(`Searching for location: ${locationName}`);
  const apiUrl = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(locationName)}&format=json&addressdetails=1&limit=1`;
  
  try {
    const response = await fetch(apiUrl, {
      headers: {
        'User-Agent': 'YourAppName/1.0' // Replace with your app name
      }
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    console.log(`Raw API response:`, data);

    if (data.length === 0) {
      console.log('No results found for the location');
      return null;
    }

    const result = data[0];
    const lat = parseFloat(result.lat);
    const lon = parseFloat(result.lon);
    const placeRank = parseInt(result.place_rank);
    const type = result.type;

    console.log(`Location found: ${result.display_name}, Coordinates: ${lat}, ${lon}, Place Rank: ${placeRank}, Type: ${type}, ${result.placeRank}`);

    // Determine zoom level based on place_rank and type
    let zoomLevel = getZoomLevel(placeRank, type);

    // Center the map on the found location and zoom
    map.getView().animate({
      center: ol.proj.fromLonLat([lon, lat]),
      zoom: zoomLevel,
      duration: 1000
    });

    return { lat, lon, placeRank, type, name: result.display_name };

  } catch (error) {
    console.error(`Error fetching location data: ${error.message}`);
    return null;
  }
}

function getZoomLevel(placeRank, type) {
  // Base zoom level on place_rank
  let zoomLevel;
  if (placeRank >= 30) zoomLevel = 18;
  else if (placeRank >= 26) zoomLevel = 16;
  else if (placeRank >= 21) zoomLevel = 14;
  else if (placeRank >= 16) zoomLevel = 12;
  else if (placeRank >= 11) zoomLevel = 10;
  else if (placeRank >= 5) zoomLevel = 8;
  else zoomLevel = 6;

  // Adjust zoom level based on type
  switch(type) {
    case 'country':
      return Math.min(zoomLevel, 6);
    case 'state':
      return Math.min(zoomLevel, 8);
    case 'county':
    case 'municipality':
      return Math.min(zoomLevel, 10);
    case 'city':
    case 'town':
      return Math.min(zoomLevel, 12);
    case 'village':
    case 'hamlet':
      return Math.min(zoomLevel, 14);
    case 'suburb':
    case 'quarter':
      return Math.min(zoomLevel, 15);
    case 'neighbourhood':
      return Math.min(zoomLevel, 16);
    case 'street':
      return Math.min(zoomLevel, 17);
    case 'house':
      return Math.min(zoomLevel, 18);
    default:
      return zoomLevel;
  }
}

function goToLocation(location) {
  const lon = parseFloat(location.lon);
  const lat = parseFloat(location.lat);
  const center = ol.proj.fromLonLat([lon, lat]);
  map.getView().animate({
    center: center,
    zoom: 10,
    duration: 1000,
  });
}

function zoomIn() {
  var view = map.getView();
  var zoom = view.getZoom();
  view.animate({ zoom: zoom + 1, duration: 1000 });
}

function zoomOut() {
  var view = map.getView();
  var zoom = view.getZoom();
  view.animate({ zoom: zoom - 1, duration: 1000 });
}

function panRight() {
  var view = map.getView();
  var center = view.getCenter();
  var resolution = view.getResolution();
  var panDistance = resolution * 100;
  view.animate({
    center: [center[0] + panDistance, center[1]],
    duration: 1000,
  });
}

function panLeft() {
  var view = map.getView();
  var center = view.getCenter();
  var resolution = view.getResolution();
  var panDistance = resolution * 100;
  view.animate({
    center: [center[0] - panDistance, center[1]],
    duration: 1000,
  });
}

function panUp() {
  var view = map.getView();
  var center = view.getCenter();
  var resolution = view.getResolution();
  var panDistance = resolution * 100;
  view.animate({
    center: [center[0], center[1] + panDistance],
    duration: 1000,
  });
}

function panDown() {
  var view = map.getView();
  var center = view.getCenter();
  var resolution = view.getResolution();
  var panDistance = resolution * 100;
  view.animate({
    center: [center[0], center[1] - panDistance],
    duration: 1000,
  });
}

function parseNLPOutput(nlpOutput) {
  return nlpOutput.map((item) => item.entity);
}

function extractWords(nlpOutput, entityTypes) {
  console.log("NLP Output for word extraction:", nlpOutput);

  let words = {
    layer: [],
    locations: [],
  };
  let currentWord = "";
  let currentType = "";

  nlpOutput.forEach((item, index) => {
    if (entityTypes.includes(item.entity)) {
      if (item.word.startsWith("##")) {
        currentWord += item.word.slice(2);
      } else {
        if (currentWord) {
          if (currentType === "location") {
            words.locations.push(currentWord);
          } else {
            words[currentType].push(currentWord);
          }
          currentWord = "";
        }
        currentWord = item.word;
        currentType = item.entity.startsWith("B-layer") || item.entity.startsWith("I-layer")
          ? "layer"
          : "location";
      }
    } else {
      if (currentWord) {
        if (currentType === "location") {
          words.locations.push(currentWord);
        } else {
          words[currentType].push(currentWord);
        }
        currentWord = "";
        currentType = "";
      }
    }
  });

  if (currentWord) {
    if (currentType === "location") {
      words.locations.push(currentWord);
    } else {
      words[currentType].push(currentWord);
    }
  }

  console.log("Extracted words:", words);
  return words;
}

let isProcessing = false;

// async function processNLPInput() {
//   if (isProcessing) return; // Prevent multiple simultaneous processes
//   isProcessing = true;

//   console.log("processNLPInput started");
//   try {
//     const inputElement = document.getElementById("nlpInput");
//     const inputText = inputElement.value.trim();
//     console.log(`Input text: ${inputText}`);

//     if (inputText) {
//       try {
//         console.log("Running NLP model");
//         const nlpOutput = await window.runNLPModel(inputText);
//         console.log("NLP Model Output:", nlpOutput);

//         if (nlpOutput) {
//           console.log("Parsing NLP output");
//           const entities = parseNLPOutput(nlpOutput);
//           console.log("Parsed entities:", entities);

//           console.log("Extracting words");
//           const words = extractWords(nlpOutput, [
//             "B-layer",
//             "I-layer",
//             "B-location",
//             "I-location",
//           ]);
//           console.log("Extracted words:", words);

//           if (words.layer.length > 0) {
//             console.log("Searching layer:", words.layer, words.locations);
//             await searchLayer(words.layer, words.locations);
//           } else if (words.locations.length > 0) {
//             console.log("Searching location:", words.locations);
//             await searchLocation(words.locations);
//           } else {
//             console.log("No layer or location words found");
//           }

//           console.log("Performing actions");
//           performActions(entities);
//         } else {
//           console.log("NLP output is null or undefined");
//         }
//       } catch (error) {
//         console.error("Error processing NLP input:", error);
//       }
//     } else {
//       console.log("Please enter a command.");
//     }
//   } catch (error) {
//     console.error("Error in processNLPInput:", error);
//   } finally {
//     isProcessing = false;
//     console.log("processNLPInput finished");
//   }
// }

async function processNLPInput() {
  console.log("processNLPInput started");
  try {
    const inputElement = document.getElementById("nlpInput");
    const inputText = inputElement.value.trim().toLowerCase();
    console.log(`Input text: ${inputText}`);

    if (inputText) {
      // Check for removal commands
      const removalCommand = checkRemovalCommand(inputText);
      if (removalCommand) {
        executeRemovalCommand(removalCommand);
        return;
      }

      // If not a removal command, proceed with NER processing
      try {
        console.log("Running NLP model");
        const nlpOutput = await window.runNLPModel(inputText);
        console.log("NLP Model Output:", nlpOutput);

        if (nlpOutput) {
          console.log("Parsing NLP output");
          const entities = parseNLPOutput(nlpOutput);
          console.log("Parsed entities:", entities);

          console.log("Extracting words");
          const words = extractWords(nlpOutput, [
            "B-layer",
            "I-layer",
            "B-location",
            "I-location",
          ]);
          console.log("Extracted words:", words);

          if (words.layer.length > 0) {
            console.log("Searching layer:", words.layer, words.locations);
            await searchLayer(words.layer, words.locations);
          } else if (words.locations.length > 0) {
            console.log("Searching location:", words.locations);
            await searchLocation(words.locations);
          } else {
            console.log("No layer or location words found");
          }

          console.log("Performing actions");
          performActions(entities);
        } else {
          console.log("NLP output is null or undefined");
        }
      } catch (error) {
        console.error("Error processing NLP input:", error);
      }
    } else {
      console.log("Please enter a command.");
    }
  } catch (error) {
    console.error("Error in processNLPInput:", error);
  }
  console.log("processNLPInput finished");
}

function checkRemovalCommand(inputText) {
  for (const keyword of removalKeywords) {
    if (inputText.includes(keyword)) {
      for (const [layerType, keywords] of Object.entries(layerKeywords)) {
        if (keywords.some(k => inputText.includes(k))) {
          // Extract location (this is a simplistic approach, you might want to use a more robust method)
          const words = inputText.split(' ');
          const locationIndex = words.findIndex(w => w === 'for') + 1;
          const location = locationIndex ? words.slice(locationIndex).join(' ') : null;
          return { action: keyword, layerType: layerType, location: location };
        }
      }
    }
  }
  return null;
}

function executeRemovalCommand(command) {
  console.log(`Executing removal command: ${command.action} ${command.layerType} ${command.location ? `for ${command.location}` : ''}`);
  
  const layerIndex = wmsLayers.findIndex(layer => {
    const layerTitle = layer.get('title').toLowerCase();
    return layerTitle.includes(command.layerType) && 
           (!command.location || layerTitle.includes(command.location.toLowerCase()));
  });

  if (layerIndex !== -1) {
    removeWmsLayer(layerIndex);
    console.log(`Removed ${command.layerType} layer ${command.location ? `for ${command.location}` : ''}`);
  } else {
    console.log(`${command.layerType} layer ${command.location ? `for ${command.location}` : ''} not found or already removed`);
  }
}

function handleProcessCommandUnique() {
  console.log("Process command button clicked");
  processNLPInput();
}

function performActions(entities) {
  const actionDelay = 1000;
  const actionQueue = [];

  entities.forEach((entity) => {
    switch (entity) {
      case "B-zoomIn":
        actionQueue.push(zoomIn);
        break;
      case "B-zoomOut":
        actionQueue.push(zoomOut);
        break;
      case "B-panLeft":
      case "B-panWest":
        actionQueue.push(panLeft);
        break;
      case "B-panRight":
      case "B-panEast":
        actionQueue.push(panRight);
        break;
      case "B-panUp":
      case "B-panNorth":
        actionQueue.push(panUp);
        break;
      case "B-panDown":
      case "B-panSouth":
        actionQueue.push(panDown);
        break;
    }
  });

  function executeNextAction(index) {
    if (index < actionQueue.length) {
      actionQueue[index]();
      setTimeout(() => executeNextAction(index + 1), actionDelay);
    }
  }

  executeNextAction(0);
}

// Event listener for form submission
document.getElementById("wmsForm").addEventListener("submit", function (event) {
  event.preventDefault();
  const layerSelect = document.getElementById("layerSelect");
  const selectedLayer = layerConfig[layerSelect.value];
  setWmsLayer({ layer: selectedLayer, layerIndex: layerSelect.value });
});


loadLayerConfig();

// function startRecording() {
//   if (recognition) {
//     recognition.start();
//     isRecording = true;
//     console.log('Started recording');
//   }
// }

// function stopRecording() {
//   if (recognition) {
//     recognition.stop();
//     isRecording = false;
//     console.log('Stopped recording');
//   }
// }

// Make necessary functions global
window.processNLPInput = processNLPInput;
window.populateStateSelect = populateStateSelect;
window.removeWmsLayer = removeWmsLayer;
window.toggleWmsLayerVisibility = toggleWmsLayerVisibility;
window.handleProcessCommandUnique = handleProcessCommandUnique;

function startRecording() {
  if (recognition && !isRecording) {
    recognition.start();
    isRecording = true;
    console.log('Started recording');
    if (recordButton) {
      recordButton.classList.add('recording');
    }
  }
}

function stopRecording() {
  if (recognition && isRecording) {
    recognition.stop();
    isRecording = false;
    console.log('Stopped recording');
    if (recordButton) {
      recordButton.classList.remove('recording');
    }
  }
}

document.addEventListener('DOMContentLoaded', async function() {
  const loadingOverlay = document.getElementById('loadingOverlay');
  const loadingText = document.getElementById('loadingText');
  const recordButton = document.getElementById('recordButton');
  const processCommandButton = document.getElementById('processCommandButton');
  const nlpInput = document.getElementById('nlpInput');
  const layerButton = document.getElementById('layer-button');
  const layerBox = document.getElementById('layer-box');

  try {
    // Loading location data
    loadingText.textContent = 'Loading location data...';
    loadingOverlay.style.display = 'flex';
    await loadLocationsData();
    console.log('Locations data loaded successfully');

    // Initializing Web Speech API
    loadingText.textContent = 'Initializing speech recognition...';
    initializeSpeechRecognition();
    console.log('Speech recognition initialized successfully');

    // Set up record button event listener
    if (recordButton) {
      recordButton.addEventListener('click', () => {
        if (isRecording) {
          stopRecording();
        } else {
          startRecording();
        }
      });
    } else {
      console.error('Record button not found');
    }

    // Set up process command button event listener
    if (processCommandButton) {
      processCommandButton.addEventListener('click', function() {
        console.log("Process Command button clicked (event listener)");
        handleProcessCommandUnique();
      });
    } else {
      console.error("Process Command button not found");
    }

    // Set up nlpInput focus and blur event listeners
    if (nlpInput) {
      nlpInput.addEventListener('focus', function() {
        isNlpInputFocused = true;
        console.log('nlpInput focused');
      });

      nlpInput.addEventListener('blur', function() {
        isNlpInputFocused = false;
        console.log('nlpInput blurred');
      });
    } else {
      console.error('nlpInput field not found');
    }

    // Spacebar keydown event for push-to-talk
    document.addEventListener('keydown', function(event) {
      if (event.code === 'Space' && !isSpacebarPressed && !isNlpInputFocused) {
        event.preventDefault();
        isSpacebarPressed = true;
        startRecording();
      }
    });

    // Spacebar keyup event for push-to-talk
    document.addEventListener('keyup', function(event) {
      if (event.code === 'Space' && isSpacebarPressed && !isNlpInputFocused) {
        event.preventDefault();
        isSpacebarPressed = false;
        stopRecording();
      }
    });

    // Handle cases where the user switches tabs/windows while holding Spacebar
    document.addEventListener('visibilitychange', function() {
      if (document.hidden && isRecording) {
        isSpacebarPressed = false;
        stopRecording();
        console.log('Stopped recording due to tab/window switch');
      }
    });

    // Toggle visibility of the layer box
    if (layerButton && layerBox) {
      layerButton.addEventListener('click', function(event) {
        event.stopPropagation();
        if (layerBox.style.display === 'none' || layerBox.style.display === '') {
          layerBox.style.display = 'block';
        } else {
          layerBox.style.display = 'none';
        }
      });

      // Close layer box when clicking outside
      document.addEventListener('click', function(event) {
        if (!layerBox.contains(event.target) && event.target !== layerButton) {
          layerBox.style.display = 'none';
        }
      });
    } else {
      console.error('Layer button or layer box not found');
    }

  } catch (error) {
    console.error('Error during initialization:', error);
  } finally {
    loadingOverlay.style.display = 'none';
  }
});
