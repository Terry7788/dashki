// The Dashki API this build talks to (VITE_API_BASE_URL, see .env.production).
export const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000').replace(/\/$/, '');
