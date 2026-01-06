/* eslint-disable @typescript-eslint/no-unused-vars */
// Configuration file for the Reseller Website
// Edit these values or use the admin panel at /admin/config.html

// Package Version - Do not modify this

const CONFIG = {
  // Preview Mode - Automatically set to false when you download the package
  // Keep this as false for your production website
  // Only true when viewing the live preview on bfb
  previewMode: false,

  // Admin Panel Password
  // IMPORTANT: Change this default password for security!
  // This password is used to access /admin/config.html
  // WARNING: DO NOT use the default password in production!
  adminPassword: 'admin123',

  // Your API Key from bfb Dashboard
  // Get your API key from: bfb (Settings → API Keys)
  apiKey: 'YOUR_API_KEY_HERE',

  // API Base URL (do not change unless using custom domain)

  // Branding - Customize your website appearance and contact info
  branding: {
    siteName: 'Spotify Premium Upgrades',        // Main site title
    tagline: 'Upgrade Your Spotify Account to Premium',  // Hero section tagline
    supportEmail: 'support@yourdomain.com',      // Contact email shown on site
    logo: './assets/images/logo.png'     // Add favicon to assets/images/ (falls back to logo if not found)
  },

  // Delivery Instructions - Customize the message shown after payment on upgrade page
  // Note: Renewal is FREE (lifetime warranty) - customers just use their existing key
  deliveryInstructions: 'You will receive an upgrade key. Copy this key and paste it in Step 2 below.',

  // Color Scheme - Customize your website colors
  colors: {
    primary: '#1DB954',      // Main brand color (buttons, links, accents)
    primaryDark: '#1ed760',  // Lighter shade for hover states and gradients
    background: '#ffffff',   // Page background color
    surface: '#ffffff',      // Card/surface background (navbar, cards, forms)
    text: '#191414',         // Primary text color
    textSecondary: '#666666' // Secondary text color (labels, hints)
  },

  // Available Countries - Loaded dynamically from API
  countries: [],

  // Features to display on homepage
  features: [
    { title: 'Instant Activation', description: 'Get Premium access within 5-10 minutes of submission' },
    { title: 'Secure Service', description: 'Bank-level encryption and secure payment processing' },
    { title: '24/7 Support', description: 'Round-the-clock customer support for all your needs' },
    { title: 'Free Replacements', description: 'Unlimited free replacements if any issues occur' },
    { title: 'No Ads', description: 'Enjoy uninterrupted music without any advertisements' },
    { title: 'Offline Listening', description: 'Download and listen to your favorite tracks offline' },
    { title: 'Unlimited Skips', description: 'Skip as many songs as you want, anytime' },
    { title: 'High Quality Audio', description: 'Stream in high-quality audio up to 320kbps' }
  ],

  // Packages - Define different pricing tiers (1 key, 5 keys, 10 keys, etc.)
  // Configure payment links for each payment method per package
  // You can add/remove packages and enable/disable them individually
  packages: [
    {
      id: '1-key',                // Unique identifier for this package
      name: '1 Key',              // Display name on website
      quantity: 1,                // Number of keys in this package
      description: 'Perfect for a single account upgrade',  // Package description
      price: '14.99',             // Price for this package (same across all payment methods)
      enabled: true,              // Show/hide this package on the website
      paymentLinks: {
        stripe: '',               // Stripe payment link
        paypal: '',               // PayPal payment link
        crypto: ''                // Crypto payment link
      }
    },
    {
      id: '5-keys',
      name: '5 Keys',
      quantity: 5,
      description: 'Best value for multiple accounts',
      price: '59.99',
      popular: true,              // Optional: adds "Most Popular" badge to this package
      enabled: true,
      paymentLinks: {
        stripe: '',
        paypal: '',
        crypto: ''
      }
    },
    {
      id: '10-keys',
      name: '10 Keys',
      quantity: 10,
      description: 'Maximum savings for bulk purchases',
      price: '99.99',
      enabled: true,
      paymentLinks: {
        stripe: '',
        paypal: '',
        crypto: ''
      }
    }
  ]
};

function getApiBasePath() {
  // Preview mode on bfb
  if (window.location.pathname.includes('/reseller-website/')) {
    return '/reseller-website/api';
  }
  // Production: always use /api from root (works from any page like /admin/)
  return '/api';
}

// Load config from server (PHP backend)
async function loadConfigFromServer() {
  try {
    const configVersion = localStorage.getItem('configVersion') || '0';
    const response = await fetch(`${getApiBasePath()}/get-config.php?v=${configVersion}`, {
      method: 'GET',
      cache: 'no-cache'
    });

    if (response.ok) {
      const serverConfig = await response.json();

      // Check if server returned actual config (not empty object)
      if (serverConfig && Object.keys(serverConfig).length > 0) {
        // Deep merge server config with defaults
        Object.keys(serverConfig).forEach(key => {
          if (typeof serverConfig[key] === 'object' && !Array.isArray(serverConfig[key])) {
            CONFIG[key] = { ...CONFIG[key], ...serverConfig[key] };
          } else {
            CONFIG[key] = serverConfig[key];
          }
        });
        return true;
      }
    }
  } catch (error) {
    // Server config not available, use defaults
    console.error('Failed to load config from server:', error);
  }

  return false;
}

// Main load config function
async function loadConfig() {
  await loadConfigFromServer();
  return CONFIG;
}

// Save config to server (token required for authenticated requests)
async function saveConfig(newConfig, adminToken) {
  try {
    const headers = {
      'Content-Type': 'application/json',
    };
    if (adminToken) {
      headers['X-Admin-Token'] = adminToken;
    }

    const response = await fetch(`${getApiBasePath()}/save-config.php`, {
      method: 'POST',
      headers: headers,
      credentials: 'include',
      body: JSON.stringify(newConfig)
    });

    const result = await response.json();

    if (response.ok && result.success) {
      Object.assign(CONFIG, newConfig);
      // Bump config version to invalidate cache on other pages
      localStorage.setItem('configVersion', Date.now().toString());
      // Reload API instance with new config
      if (typeof api !== 'undefined' && api.reloadConfig) {
        api.reloadConfig();
      }
      return { success: true, message: 'Configuration saved successfully' };
    }

    // Return server error message if available
    if (result.error) {
      return { success: false, message: result.error };
    }
  } catch (error) {
    // Server save failed
    console.error('Failed to save config to server:', error);
  }

  return {
    success: false,
    message: 'Failed to save configuration. PHP must be enabled on your hosting.'
  };
}

// Apply colors from config to CSS variables
function applyColors() {
  if (CONFIG.colors) {
    const root = document.documentElement;

    // Apply customizable colors
    if (CONFIG.colors.primary) {
      root.style.setProperty('--color-primary', CONFIG.colors.primary);
    }
    if (CONFIG.colors.primaryDark) {
      root.style.setProperty('--color-primary-light', CONFIG.colors.primaryDark);
      root.style.setProperty('--color-primary-dark', CONFIG.colors.primaryDark);
    }

    // Apply background and surface colors
    if (CONFIG.colors.background) {
      document.body.style.backgroundColor = CONFIG.colors.background;
      root.style.setProperty('--color-neutral-50', CONFIG.colors.background);
    }
    if (CONFIG.colors.surface) {
      root.style.setProperty('--color-surface', CONFIG.colors.surface);
    }

    // Apply text colors
    if (CONFIG.colors.text) {
      root.style.setProperty('--color-neutral-900', CONFIG.colors.text);
    }
    if (CONFIG.colors.textSecondary) {
      root.style.setProperty('--color-neutral-600', CONFIG.colors.textSecondary);
    }

  }
}

// Apply favicon from config
function applyFavicon() {
  // Get favicon path - use favicon if set, otherwise try logo
  let faviconPath = CONFIG.branding.favicon;

  // If favicon is empty, try using logo instead
  if (!faviconPath) {
    faviconPath = CONFIG.branding.logo;
  }

  // If we have a path, set it
  if (faviconPath) {
    // Adjust path if we're in admin folder
    const isInAdmin = window.location.pathname.includes('/admin/');
    if (isInAdmin && faviconPath.startsWith('./')) {
      faviconPath = '..' + faviconPath.substring(1);
    }

    const link = document.querySelector("link[rel*='icon']") || document.createElement('link');
    link.type = 'image/x-icon';
    link.rel = 'icon';
    link.href = faviconPath + '?v=' + Date.now(); // Cache bust
    if (!link.parentNode) {
      document.getElementsByTagName('head')[0].appendChild(link);
    }
  }
}

// Hide loader and show page content
function showPage() {
  const loader = document.getElementById('page-loader');
  const content = document.getElementById('page-content');

  if (loader) {
    loader.classList.add('hidden');
  }
  if (content) {
    content.classList.add('loaded');
  }
}

// Initialize config on page load
if (typeof window !== 'undefined') {
  loadConfig().then(() => {
    applyColors();
    applyFavicon();
    showPage();
    window.dispatchEvent(new CustomEvent('configLoaded', { detail: CONFIG }));
  });
}
