/* eslint-disable @typescript-eslint/no-unused-vars */
/**
 * API Integration Module
 * Handles all communication with the Blackflag API
 */

// API Configuration Constants
const API_TIMEOUT_MS = 30000; // 30 second timeout
const API_MAX_RETRIES = 2; // Maximum number of retry attempts
const API_RETRY_DELAY_BASE_MS = 1000; // Base delay for exponential backoff (1 second)
const NAVBAR_HEIGHT_OFFSET = 80; // Navbar height + padding for scroll

class UpgraderAPI {
  constructor() {
    this.statusToken = this.loadStatusToken();
    this.reloadConfig();
  }

  /**
   * Reload configuration - call this after config changes
   */
  reloadConfig() {
    this.config = CONFIG;
    this.isPreviewMode = this.config.previewMode === true;
    // In production, use local PHP proxy to keep API key secure
    // In preview mode, call blackflag directly (for demo purposes)
    if (this.isPreviewMode) {
      this.baseUrl = this.config.apiBaseUrl;
      this.useProxy = false;
    } else {
      this.proxyUrl = getApiBasePath() + '/proxy.php';
      this.useProxy = true;
    }
    // API key is no longer exposed to browser - it's read server-side by proxy.php
    // Check CONFIG.isConfigured flag set by config.php
    this.isConfigured = !this.isPreviewMode && (this.config.isConfigured !== false);
  }

  /**
   * Load status token from session storage
   */
  loadStatusToken() {
    try {
      return sessionStorage.getItem('upgrader_status_token') || null;
    } catch (e) {
      return null;
    }
  }

  /**
   * Save status token to session storage
   */
  saveStatusToken(token) {
    try {
      if (token) {
        sessionStorage.setItem('upgrader_status_token', token);
        this.statusToken = token;
      }
    } catch (e) {
      // Session storage unavailable (private browsing or quota exceeded)
    }
  }

  /**
   * Make API request with retry logic - uses PHP proxy in production to keep API key secure
   * Includes timeout to prevent hanging on slow connections
   * Retries on network errors or 5xx responses with exponential backoff
   */
  async request(endpoint, options = {}, retryCount = 0) {
    let url;
    const headers = {
      'Content-Type': 'application/json',
      ...options.headers
    };

    if (this.useProxy) {
      // Production: use local PHP proxy (API key stays on server)
      const endpointName = endpoint.replace(/^\//, '');
      url = `${this.proxyUrl}?endpoint=${endpointName}`;
    } else {
      // Preview mode: call blackflag directly
      url = `${this.baseUrl}${endpoint}`;
      headers['X-API-Key'] = this.config.apiKey;
    }

    // Add status token header if available
    if (this.statusToken) {
      headers['X-Status-Token'] = this.statusToken;
    }

    // Create AbortController for timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT_MS);

    try {
      const response = await fetch(url, {
        ...options,
        headers,
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      const data = await response.json();

      // Save status token if returned
      if (data.statusToken) {
        this.saveStatusToken(data.statusToken);
      }

      // Handle maintenance mode (503 status)
      if (response.status === 503 || data.maintenance) {
        const error = new Error(data.message || 'System is currently offline for maintenance. Please try again later.');
        error.isMaintenance = true;
        throw error;
      }

      // Check if we should retry on 5xx errors
      if (response.status >= 500 && retryCount < API_MAX_RETRIES) {
        return this.retryRequest(endpoint, options, retryCount);
      }

      if (!response.ok) {
        throw new Error(data.message || 'API request failed');
      }

      // Handle captcha_required - reseller sites can't do captcha
      if (data.status === 'captcha_required') {
        throw new Error('Additional verification required. Please contact support or try again later.');
      }

      return data;
    } catch (error) {
      clearTimeout(timeoutId);

      // Handle timeout errors
      if (error.name === 'AbortError') {
        throw new Error('Request timed out. Please check your internet connection and try again.');
      }

      // Retry on network errors (but not on maintenance or other thrown errors)
      if (!error.isMaintenance && retryCount < API_MAX_RETRIES && this.isNetworkError(error)) {
        return this.retryRequest(endpoint, options, retryCount);
      }

      throw error;
    }
  }

  /**
   * Check if error is a network error that should be retried
   */
  isNetworkError(error) {
    return error instanceof TypeError ||
           error.message.includes('Failed to fetch') ||
           error.message.includes('Network request failed');
  }

  /**
   * Retry request with exponential backoff
   */
  async retryRequest(endpoint, options, retryCount) {
    // Exponential backoff: delay doubles with each retry to reduce server load
    const delay = API_RETRY_DELAY_BASE_MS * Math.pow(2, retryCount);
    console.warn(`API request failed, retrying in ${delay}ms (attempt ${retryCount + 1}/${API_MAX_RETRIES})`);

    await new Promise(resolve => setTimeout(resolve, delay));
    return this.request(endpoint, options, retryCount + 1);
  }

  /**
   * Get available stock for all countries
   */
  async getStock() {
    // In preview mode or when not configured, return mock data
    if (this.isPreviewMode || !this.isConfigured) {
      return this.getMockStock();
    }
    return this.request('/stock', {
      method: 'GET'
    });
  }

  /**
   * Get mock stock data for preview mode
   */
  getMockStock() {
    return {
      status: 'success',
      data: {
        'US': { slots: 50 },
        'GB': { slots: 35 },
        'DE': { slots: 28 },
        'FR': { slots: 22 },
        'CA': { slots: 18 },
        'AU': { slots: 15 },
        'NL': { slots: 12 },
        'ES': { slots: 10 }
      }
    };
  }

  /**
   * Get available countries from stock API
   */
  async getCountries() {
    try {
      const stockData = await this.getStock();

      if (stockData.status === 'success' && stockData.data) {
        // Stock API returns array of {country, country_code, slots}
        const stockArray = Array.isArray(stockData.data) ? stockData.data : [];

        // Only return countries with available slots
        // Flags are rendered via CSS (flag-icons library) based on country code
        return stockArray
          .filter(item => item.slots > 0)
          .map(item => ({
            code: item.country_code,
            name: item.country,
            slots: item.slots
          }))
          .sort((a, b) => a.name.localeCompare(b.name));
      }

      return [];
    } catch (error) {
      return [];
    }
  }

  /**
   * Get key information and status
   * @param {string} key - The upgrade key
   */
  async getKeyInfo(key) {
    // In preview mode or when not configured, show demo message
    if (this.isPreviewMode || !this.isConfigured) {
      throw new Error('This is a preview. Configure your API key to enable key status checking.');
    }
    return this.request('/info', {
      method: 'POST',
      body: JSON.stringify({ key })
    });
  }

  /**
   * Process Spotify upgrade
   * @param {object} data - Upgrade data
   * @param {string} data.key - Upgrade key
   * @param {string} data.login - Spotify username/email
   * @param {string} data.password - Spotify password
   * @param {string} data.country - Country code (US, GB, etc.)
   */
  async processUpgrade(data) {
    // In preview mode or when not configured, show demo message
    if (this.isPreviewMode || !this.isConfigured) {
      throw new Error('This is a preview. Configure your API key to process upgrades.');
    }
    return this.request('/upgrade', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  }

  /**
   * Process Spotify renewal
   * @param {object} data - Renewal data
   * @param {string} data.key - Upgrade key
   * @param {string} data.login - Spotify username/email
   * @param {string} data.password - Spotify password
   * @param {string} data.newEmail - New email for the account
   * @param {string} data.country - Country code
   */
  async processRenewal(data) {
    // In preview mode or when not configured, show demo message
    if (this.isPreviewMode || !this.isConfigured) {
      throw new Error('This is a preview. Configure your API key to process renewals.');
    }
    return this.request('/renew', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  }
}

// Create global API instance
const api = new UpgraderAPI();

/**
 * UI Helper Functions
 */

function showLoading(button) {
  if (!button) return;
  button.disabled = true;
  button.dataset.originalText = button.textContent;
  button.innerHTML = `
    <svg class="animate-spin inline-block w-5 h-5 mr-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
      <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
      <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
    </svg>
    Processing...
  `;
}

function hideLoading(button) {
  if (!button) return;
  button.disabled = false;
  button.textContent = button.dataset.originalText || 'Submit';
}

function scrollToElement(element) {
  if (!element) return;
  const elementPosition = element.getBoundingClientRect().top + window.pageYOffset;
  window.scrollTo({
    top: elementPosition - NAVBAR_HEIGHT_OFFSET,
    behavior: 'smooth'
  });
}

function showSuccess(message, container) {
  const alert = document.createElement('div');
  alert.className = 'bg-green-50 border border-green-200 text-green-800 px-6 py-4 rounded-lg mb-6';
  alert.innerHTML = `
    <div class="flex items-start">
      <svg class="w-6 h-6 mr-3 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
        <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"/>
      </svg>
      <div>
        <h3 class="font-semibold mb-1">Success!</h3>
        <p>${message}</p>
      </div>
    </div>
  `;

  if (container) {
    container.prepend(alert);
    scrollToElement(container);
  }
}

function showError(message, container) {
  const alert = document.createElement('div');
  alert.className = 'bg-red-50 border border-red-200 text-red-800 px-6 py-4 rounded-lg mb-6';
  alert.innerHTML = `
    <div class="flex items-start">
      <svg class="w-6 h-6 mr-3 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
        <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd"/>
      </svg>
      <div>
        <h3 class="font-semibold mb-1">Error</h3>
        <p>${message}</p>
      </div>
    </div>
  `;

  if (container) {
    container.prepend(alert);
    scrollToElement(container);
  }
}

function showMaintenance(message, container) {
  const alert = document.createElement('div');
  alert.className = 'bg-amber-50 border border-amber-200 text-amber-800 px-6 py-4 rounded-lg mb-6';
  alert.innerHTML = `
    <div class="flex items-start">
      <svg class="w-6 h-6 mr-3 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
        <path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clip-rule="evenodd"/>
      </svg>
      <div>
        <h3 class="font-semibold mb-1">System Maintenance</h3>
        <p>${message}</p>
      </div>
    </div>
  `;

  if (container) {
    container.prepend(alert);
    scrollToElement(container);
  }
}

function clearAlerts(container) {
  if (!container) return;
  const alerts = container.querySelectorAll('.bg-green-50, .bg-red-50, .bg-yellow-50, .bg-blue-50, .bg-amber-50');
  alerts.forEach(alert => alert.remove());
}

function formatDate(timestamp) {
  if (!timestamp) return 'N/A';
  const date = new Date(timestamp);
  return date.toLocaleString();
}

function getCountryName(code) {
  const country = CONFIG.countries.find(c => c.code === code);
  if (country) {
    return `<span class="fi fi-${code.toLowerCase()}" style="margin-right: 0.5rem;"></span>${country.name}`;
  }
  return code;
}

function validateForm(formData, requiredFields) {
  const errors = [];

  for (const field of requiredFields) {
    if (!formData[field] || formData[field].trim() === '') {
      errors.push(`${field.charAt(0).toUpperCase() + field.slice(1)} is required`);
    }
  }

  return errors;
}

function checkApiKey() {
  if (CONFIG.previewMode === true) {
    const banner = document.createElement('div');
    banner.className = 'bg-blue-50 border border-blue-200 text-blue-800 px-6 py-4 rounded-lg mb-6';
    banner.innerHTML = `
      <div class="flex items-start">
        <svg class="w-6 h-6 mr-3 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
          <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clip-rule="evenodd"/>
        </svg>
        <div>
          <h3 class="font-semibold mb-1">Preview Mode</h3>
        </div>
      </div>
    `;
    return banner;
  }

  if (CONFIG.apiKeyConfigured === false) {
    const warning = document.createElement('div');
    warning.className = 'bg-yellow-50 border border-yellow-200 text-yellow-800 px-6 py-4 rounded-lg mb-6';
    warning.innerHTML = `
      <div class="flex items-start">
        <svg class="w-6 h-6 mr-3 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
          <path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clip-rule="evenodd"/>
        </svg>
        <div>
          <h3 class="font-semibold mb-1">API Key Not Configured</h3>
          <p>Please configure your API key in the <a href="./admin/config.html" class="underline font-semibold">Admin Panel</a> to enable this feature.</p>
        </div>
      </div>
    `;
    return warning;
  }
  return null;
}

async function loadStock() {
  const stockContainer = document.getElementById('stockContainer');
  if (!stockContainer) return;

  try {
    const data = await api.getStock();

    if (data.status === 'success' && data.data) {
      let html = '<div class="grid grid-cols-2 md:grid-cols-4 gap-4">';

      for (const [countryCode, stockData] of Object.entries(data.data)) {
        const country = CONFIG.countries.find(c => c.code === countryCode);
        if (country) {
          const inStock = stockData.slots > 0;
          html += `
            <div class="bg-white rounded-lg p-4 border ${inStock ? 'border-green-200' : 'border-gray-200'}">
              <div class="mb-2"><span class="fi fi-${countryCode.toLowerCase()}" style="font-size: 2rem;"></span></div>
              <div class="font-semibold text-gray-900">${country.name}</div>
              <div class="text-sm ${inStock ? 'text-green-600' : 'text-gray-500'} font-medium">
                ${inStock ? `${stockData.slots} available` : 'Out of stock'}
              </div>
            </div>
          `;
        }
      }

      html += '</div>';
      stockContainer.innerHTML = html;
    }
  } catch (error) {
    stockContainer.innerHTML = '<p class="text-gray-500">Unable to load stock information.</p>';
  }
}

async function loadCountriesIntoDropdowns() {
  const countries = await api.getCountries();
  
  if (countries.length > 0) {
    // Update CONFIG
    CONFIG.countries = countries;
    
    // Find all country select elements
    const countrySelects = document.querySelectorAll('select[name="country"]');
    
    countrySelects.forEach(select => {
      // Clear existing options except placeholder
      const hasPlaceholder = select.options[0]?.value === '';
      if (hasPlaceholder) {
        select.innerHTML = '<option value="">Select a country</option>';
      } else {
        select.innerHTML = '';
      }

      countries.forEach(country => {
        const option = document.createElement('option');
        option.value = country.code;
        option.textContent = `${country.code} - ${country.name}`;
        if (country.slots) {
          option.textContent += ` (${country.slots} available)`;
        }
        select.appendChild(option);
      });
    });

    window.dispatchEvent(new CustomEvent('countriesLoaded', { detail: countries }));
    if (typeof window.reinitCountryDropdowns === 'function') {
      window.reinitCountryDropdowns();
    }
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  await loadConfig();

  await loadCountriesIntoDropdowns();


  const siteNameElements = document.querySelectorAll('.site-name');
  siteNameElements.forEach(el => {
    el.textContent = CONFIG.branding.siteName;
  });

  const taglineElements = document.querySelectorAll('.site-tagline');
  taglineElements.forEach(el => {
    el.textContent = CONFIG.branding.tagline;
  });

  if (document.getElementById('stockContainer')) {
    loadStock();
  }
});

window.addEventListener('unhandledrejection', (event) => {
  console.error('Unhandled promise rejection:', event.reason);

  event.preventDefault();
});
