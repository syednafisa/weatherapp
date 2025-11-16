 // debug-friendly weatherapp.js
const API_KEY = "981f8b25565bfdba54f873323ebd7455";
const API_BASE = 'https://api.openweathermap.org/data/2.5';

let currentWeatherData = null;

// tiny debug overlay so you don't have to open devtools every time
function ensureDebugPanel() {
  if (document.getElementById('debugPanel')) return;
  const panel = document.createElement('div');
  panel.id = 'debugPanel';
  panel.style = 'position:fixed;right:12px;bottom:12px;z-index:9999;background:rgba(0,0,0,.75);color:#fff;padding:8px;border-radius:8px;font-size:12px;max-width:300px;max-height:200px;overflow:auto;';
  panel.innerHTML = '<b>Debug</b><div id="debugText" style="margin-top:6px;white-space:pre-wrap;"></div>';
  document.body.appendChild(panel);
}
function debugLog(...args) {
  console.error(...args); // also in browser console
  ensureDebugPanel();
  const el = document.getElementById('debugText');
  const t = args.map(a => (typeof a === 'object' ? JSON.stringify(a, null, 2) : String(a))).join(' ');
  el.textContent = `${new Date().toLocaleTimeString()} — ${t}\n\n` + el.textContent;
}

// improved showError that shows the message on UI and in debug panel
function showError(message, details) {
  document.getElementById('loadingState').classList.add('hidden');
  document.getElementById('errorState').classList.remove('hidden');
  document.getElementById('mainContent').classList.add('hidden');
  document.getElementById('errorMessage').textContent = message;
  if (details) debugLog(details);
}

// helpers (icons + background) — keep same as before (I shortened for brevity)
function getWeatherIcon(main, size = 96) {
  const icons = {
    'Clear': `<svg style="width:${size}px;height:${size}px;color:hsl(43,100%,60%)" class="icon" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="5"></circle></svg>`,
    'Clouds': `<svg style="width:${size}px;height:${size}px;color:hsl(215,20%,55%)" class="icon" viewBox="0 0 24 24"><path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"></path></svg>`,
    'Rain': `<svg style="width:${size}px;height:${size}px;color:hsl(210,100%,50%)" class="icon" viewBox="0 0 24 24"><path d="M20 16.58A5 5 0 0 0 18 7h-1.26A8 8 0 1 0 4 15.25"></path></svg>`,
    'Drizzle': `<svg style="width:${size}px;height:${size}px;color:hsl(210,100%,50%)" class="icon" viewBox="0 0 24 24"><path d="M20 16.58A5 5 0 0 0 18 7h-1.26A8 8 0 1 0 4 15.25"></path></svg>`
  };
  return icons[main] || icons['Clouds'];
}
function setBackgroundGradient(main) {
  const body = document.body;
  body.className = '';
  switch ((main || '').toLowerCase()) {
    case 'clear': body.classList.add('bg-sunny'); break;
    case 'clouds': body.classList.add('bg-cloudy'); break;
    case 'rain':
    case 'drizzle': body.classList.add('bg-rainy'); break;
    default: body.classList.add('bg-default');
  }
}
function showLoading() {
  document.getElementById('loadingState').classList.remove('hidden');
  document.getElementById('errorState').classList.add('hidden');
  document.getElementById('mainContent').classList.add('hidden');
}
function showMain() {
  document.getElementById('loadingState').classList.add('hidden');
  document.getElementById('errorState').classList.add('hidden');
  document.getElementById('mainContent').classList.remove('hidden');
}

// display helpers
function displayWeather(data) {
  if (!data) return;
  document.getElementById('cityName').textContent = data.name || '—';
  document.getElementById('weatherDescription').textContent = (data.weather?.[0]?.description) || '-';
  document.getElementById('temperature').textContent = Math.round(data.main.temp) + '°';
  document.getElementById('feelsLike').textContent = `Feels like ${Math.round(data.main.feels_like)}°`;
  document.getElementById('humidity').textContent = data.main.humidity + '%';
  document.getElementById('windSpeed').textContent = (data.wind?.speed ?? '--') + ' m/s';
  document.getElementById('visibility').textContent = (data.visibility ? (data.visibility / 1000).toFixed(1) + ' km' : '-- km');
  document.getElementById('mainWeatherIcon').innerHTML = getWeatherIcon(data.weather?.[0]?.main || 'Clouds');
  setBackgroundGradient(data.weather?.[0]?.main || '');
  currentWeatherData = data;
}

// displayForecast same as before (kept compact)
function displayForecast(data) {
  const dailyData = {};
  data.list.forEach(item => {
    const date = new Date(item.dt * 1000);
    const key = date.toISOString().split('T')[0];
    if (!dailyData[key]) {
      dailyData[key] = { date, tempMax: item.main.temp_max, tempMin: item.main.temp_min, description: item.weather[0].description, main: item.weather[0].main };
    } else {
      dailyData[key].tempMax = Math.max(dailyData[key].tempMax, item.main.temp_max);
      dailyData[key].tempMin = Math.min(dailyData[key].tempMin, item.main.temp_min);
    }
  });
  const forecasts = Object.values(dailyData).slice(0, 5);
  const forecastGrid = document.getElementById('forecastGrid');
  forecastGrid.innerHTML = '';
  const dayNames = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'], monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  forecasts.forEach(forecast => {
    const dayName = dayNames[forecast.date.getDay()];
    const monthName = monthNames[forecast.date.getMonth()];
    const dayNum = forecast.date.getDate();
    const node = document.createElement('div');
    node.className = 'forecast-item';
    node.innerHTML = `<p class="forecast-day">${dayName}</p><p class="forecast-date">${monthName} ${dayNum}</p><div class="forecast-icon">${getWeatherIcon(forecast.main,40)}</div><p class="forecast-temp-high">${Math.round(forecast.tempMax)}°</p><p class="forecast-temp-low">${Math.round(forecast.tempMin)}°</p><p class="forecast-desc">${forecast.description}</p>`;
    forecastGrid.appendChild(node);
  });
  document.getElementById('forecastCard').style.display = 'block';
}

/*
  Important: when fetch returns non-OK, OpenWeather returns JSON like:
  { "cod": 401, "message": "Invalid API key." }
  We'll parse it and include the server message in our thrown error.
*/
async function fetchJsonOrThrow(res) {
  const contentType = res.headers.get('content-type') || '';
  if (res.ok) {
    if (contentType.includes('application/json')) return res.json();
    return res.text();
  }
  // try parse body for a clearer message
  let body = null;
  try { body = contentType.includes('application/json') ? await res.json() : await res.text(); } catch (e) { body = null; }
  const serverMsg = body && body.message ? body.message : (typeof body === 'string' && body.length ? body : '');
  const err = new Error(`HTTP ${res.status} ${res.statusText} ${serverMsg ? '- ' + serverMsg : ''}`);
  err.status = res.status;
  err.serverBody = body;
  throw err;
}

// Fetch by coords
async function fetchWeatherByCoords(lat, lon) {
  try {
    showLoading();
    debugLog('Fetching weather by coords', { lat, lon });
    const weatherRes = await fetch(`${API_BASE}/weather?lat=${lat}&lon=${lon}&appid=${API_KEY}&units=metric`);
    const weatherData = await fetchJsonOrThrow(weatherRes);
    displayWeather(weatherData);

    const forecastRes = await fetch(`${API_BASE}/forecast?lat=${lat}&lon=${lon}&appid=${API_KEY}&units=metric`);
    const forecastData = await fetchJsonOrThrow(forecastRes);
    displayForecast(forecastData);

    showMain();
  } catch (error) {
    // include more context for debugging
    debugLog('fetchWeatherByCoords error', error);
    if (error.status === 401) showError('API key rejected (401). Check your API key.', error);
    else if (error.status === 429) showError('Rate limit hit (429). Try again later or use a different key.', error);
    else showError('Unable to fetch weather data. See debug panel (bottom-right).', error);
  }
}

// Fetch by city
async function fetchWeatherByCity(city) {
  try {
    showLoading();
    debugLog('Fetching weather for city', city);
    const weatherRes = await fetch(`${API_BASE}/weather?q=${encodeURIComponent(city)}&appid=${API_KEY}&units=metric`);
    const weatherData = await fetchJsonOrThrow(weatherRes);
    displayWeather(weatherData);

    const forecastRes = await fetch(`${API_BASE}/forecast?q=${encodeURIComponent(city)}&appid=${API_KEY}&units=metric`);
    const forecastData = await fetchJsonOrThrow(forecastRes);
    displayForecast(forecastData);

    showMain();
  } catch (error) {
    debugLog('fetchWeatherByCity error', error);
    if (error.status === 401) showError('API key rejected (401). Check your API key.', error);
    else if (error.status === 404 || error.status === 400) showError(`City not found: "${city}".`, error);
    else if (error.status === 429) showError('Rate limit hit (429). Try again later or use a different key.', error);
    else showError(`Unable to find weather for "${city}". See debug panel.`, error);
  }
}

// Geolocation
function getCurrentLocation() {
  if (!navigator.geolocation) {
    showError('Geolocation not supported by this browser.');
    return;
  }
  navigator.geolocation.getCurrentPosition(
    pos => {
      fetchWeatherByCoords(pos.coords.latitude, pos.coords.longitude);
    },
    err => {
      debugLog('Geolocation error', err);
      // show a clearer message so you know it isn't the API at all
      showError('Unable to get your location. Permission denied or running from file://? Use the search box.', err);
    },
    { timeout: 10000 }
  );
}

// event handlers
function searchCity() {
  const city = document.getElementById('cityInput').value.trim();
  if (city) { fetchWeatherByCity(city); document.getElementById('cityInput').value = ''; }
}
function useCurrentLocation() { getCurrentLocation(); }
function handleSearchKeypress(event) { if (event.key === 'Enter') searchCity(); }
function retryFetch() { getCurrentLocation(); }

// convenience test function you can run in console: testApiKey()
async function testApiKey() {
  try {
    debugLog('Running API key test (requesting London)');
    const res = await fetch(`${API_BASE}/weather?q=London&appid=${API_KEY}&units=metric`);
    const bodyText = await res.text();
    debugLog('testApiKey response', { status: res.status, ok: res.ok, body: bodyText });
  } catch (e) {
    debugLog('testApiKey network error', e);
  }
}

// init
document.addEventListener('DOMContentLoaded', () => {
  ensureDebugPanel();
  getCurrentLocation();
});
