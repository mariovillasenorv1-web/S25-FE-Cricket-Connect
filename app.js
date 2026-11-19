const API_BASE = 'https://api.open-meteo.com/v1';
const GEOCODING_BASE = 'https://geocoding-api.open-meteo.com/v1';
const state = { unit: 'C', current: null, forecast: null, place: null };

const $ = (selector) => document.querySelector(selector);
const searchForm = $('#search-form');
const searchInput = $('#city-search');
const suggestions = $('#suggestions');
const statusBox = $('#status');

function weatherInfo(code, isDay = true) {
  if (code === 0) return { label: 'Clear sky', icon: isDay ? '☀️' : '🌙' };
  if ([1, 2].includes(code)) return { label: code === 1 ? 'Mainly clear' : 'Partly cloudy', icon: isDay ? '🌤️' : '☁️' };
  if (code === 3) return { label: 'Overcast', icon: '☁️' };
  if ([45, 48].includes(code)) return { label: 'Foggy', icon: '🌫️' };
  if ([51, 53, 55, 56, 57].includes(code)) return { label: 'Drizzle', icon: '🌦️' };
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return { label: 'Rain', icon: '🌧️' };
  if ([71, 73, 75, 77, 85, 86].includes(code)) return { label: 'Snow', icon: '🌨️' };
  if ([ r = 95, 96, 99 ].includes(code)) return { label: 'Thunderstorm', icon: '⛈️' };
  return { label: 'Cloudy', icon: '☁️' };
}

function temperature(value) {
  if (value == null || Number.isNaN(Number(value))) return '—';
  const converted = state.unit === 'F' ? (Number(value) * 9) / 5 + 32 : Number(value);
  return Math.round(converted);
}

function showStatus(message = '') {
  statusBox.textContent = message;
  statusBox.hidden = !message;
}

function placeLabel(place) {
  return [place.name, place.admin1, place.country].filter(Boolean).filter((value, index, list) => list.indexOf(value) === index).join(', ');
}

async function findPlaces(name) {
  const response = await fetch(`${GEOCODING_BASE}/search?name=${encodeURIComponent(name)}&count=6&language=en&format=json`);
  if (!response.ok) throw new Error('Could not search for that location. Please try again.');
  const data = await response.json();
  return data.results || [];
}

function renderSuggestions(places) {
  suggestions.replaceChildren();
  if (!places.length) {
    showStatus('No matching cities found. Try another search.');
    suggestions.hidden = true;
    return;
  }
  showStatus('');
  places.forEach((place) => {
    const button = document.createElement('button');
    button.className = 'suggestion';
    button.type = 'button';
    button.setAttribute('role', 'option');
    button.innerHTML = `${escapeHTML(place.name)}<small>${escapeHTML([place.admin1, place.country].filter(Boolean).join(', '))}</small>`;
    button.addEventListener('click', () => {
      suggestions.hidden = true;
      loadWeather(place);
    });
    suggestions.append(button);
  });
  suggestions.hidden = false;
}

function escapeHTML(value = '') {
  return String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
}

async function loadWeather(place) {
  showStatus('');
  $('#updated-at').textContent = 'Fetching the latest forecast...';
  searchInput.blur();
  const params = new URLSearchParams({
    latitude: place.latitude,
    longitude: place.longitude,
    current: 'temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,weather_code,wind_speed_10m',
    hourly: 'temperature_2m,precipitation_probability,weather_code',
    daily: 'weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset,uv_index_max',
    temperature_unit: 'celsius',
    wind_speed_unit: 'kmh',
    timezone: 'auto',
    forecast_days: '7'
  });

  try {
    const response = await fetch(`${API_BASE}/forecast?${params}`);
    if (!response.ok) throw new Error('Weather data is temporarily unavailable. Please try again.');
    const data = await response.json();
    if (!data.current || !data.daily || !data.hourly) throw new Error('The forecast response was incomplete. Please try another location.');
    state.current = data.current;
    state.forecast = data;
    state.place = place;
    renderDashboard();
  } catch (error) {
    showStatus(error.message || 'Something went wrong while loading the forecast.');
    $('#updated-at').textContent = 'Forecast unavailable';
  }
}

function renderDashboard() {
  const { current, forecast, place } = state;
  const weather = weatherInfo(current.weather_code, Boolean(current.is_day));
  $('#place-name').textContent = place.name;
  $('#place-region').textContent = [place.admin1, place.country].filter(Boolean).join(' · ') || placeLabel(place);
  $('#current-icon').textContent = weather.icon;
  $('#current-temp').textContent = temperature(current.temperature_2m);
  $('#current-condition').textContent = weather.label;
  $('#feels-like').textContent = temperature(current.apparent_temperature);
  $('#humidity').textContent = `${Math.round(current.relative_humidity_2m)}%`;
  $('#wind').textContent = `${Math.round(current.wind_speed_10m)} km/h`;
  $('#rain-chance').textContent = `${forecast.hourly.precipitation_probability?.[0] ?? 0}%`;
  $('#uv-index').textContent = `${forecast.daily.uv_index_max?.[0] ?? '—'}`;
  $('#updated-at').textContent = `Local time · ${current.time.replace('T', ' ')}`;
  renderHourly(forecast);
  renderDaily(forecast);
}

function renderHourly(forecast) {
  const list = $('#hourly-list');
  list.replaceChildren();
  const times = forecast.hourly.time;
  let startIndex = times.findIndex((time) => time >= forecast.current.time);
  if (startIndex < 0) startIndex = 0;
  for (let offset = 0; offset < 12; offset += 1) {
    const index = startIndex + offset;
    if (index >= times.length) break;
    const info = weatherInfo(forecast.hourly.weather_code[index], true);
    const hour = times[index].slice(11, 16);
    const item = document.createElement('div');
    item.className = 'hour-item';
    item.innerHTML = `<span>${offset === 0 ? 'Now' : hour}</span><span class="hour-icon" aria-hidden="true">${info.icon}</span><strong>${temperature(forecast.hourly.temperature_2m[index])}°</strong><span class="hour-rain">${forecast.hourly.precipitation_probability?.[index] ?? 0}% rain</span>`;
    list.append(item);
  }
}

function renderDaily(forecast) {
  const list = $('#daily-list');
  list.replaceChildren();
  forecast.daily.time.forEach((date, index) => {
    const info = weatherInfo(forecast.daily.weather_code[index]);
    const day = index === 0 ? 'Today' : new Intl.DateTimeFormat('en', { weekday: 'short', timeZone: 'UTC' }).format(new Date(`${date}T12:00:00Z`));
    const item = document.createElement('div');
    item.className = 'day-item';
    item.innerHTML = `<span class="day-name">${day}</span><span class="day-icon" aria-hidden="true">${info.icon}</span><div class="day-temps"><span>${temperature(forecast.daily.temperature_2m_max[index])}°</span><span>${temperature(forecast.daily.temperature_2m_min[index])}°</span></div>`;
    list.append(item);
  });
}

searchForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const query = searchInput.value.trim();
  if (query.length < 2) {
    showStatus('Enter at least two characters to search for a city.');
    return;
  }
  showStatus('Searching locations...');
  suggestions.hidden = true;
  try {
    const places = await findPlaces(query);
    renderSuggestions(places);
    if (places.length === 1) {
      suggestions.hidden = true;
      loadWeather(places[0]);
    }
  } catch (error) {
    showStatus(error.message);
  }
});

$('#use-location').addEventListener('click', () => {
  if (!navigator.geolocation) {
    showStatus('Geolocation is not available in this browser. Search for a city instead.');
    return;
  }
  showStatus('Finding your location...');
  navigator.geolocation.getCurrentPosition(async ({ coords }) => {
    try {
      const response = await fetch(`${GEOCODING_BASE}/reverse?latitude=${coords.latitude}&longitude=${coords.longitude}&language=en&format=json`);
      if (!response.ok) throw new Error('Could not identify your location. Search for a city instead.');
      const data = await response.json();
      const place = data.results?.[0] || { name: 'Your location', latitude: coords.latitude, longitude: coords.longitude };
      await loadWeather(place);
    } catch (error) {
      showStatus(error.message);
    }
  }, (error) => {
    showStatus(error.code === error.PERMISSION_DENIED ? 'Location access was denied. Search for a city instead.' : 'Could not get your location. Search for a city instead.');
  }, { enableHighAccuracy: false, timeout: 10000 });
});

$('#unit-toggle').addEventListener('click', () => {
  state.unit = state.unit === 'C' ? 'F' : 'C';
  $('#unit-toggle').innerHTML = state.unit === 'C' ? '°C <span>/</span> °F' : '°F <span>/</span> °C';
  $('#unit-toggle').setAttribute('aria-label', `Temperature unit: ${state.unit === 'C' ? 'Celsius' : 'Fahrenheit'}. Switch units`);
  if (state.current) renderDashboard();
});

document.addEventListener('click', (event) => {
  if (!event.target.closest('.search')) suggestions.hidden = true;
});

loadWeather({ name: 'San Francisco', admin1: 'California', country: 'United States', latitude: 37.7749, longitude: -122.4194 });
