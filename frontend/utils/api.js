// Centralized API base URL utility
// Uses Expo public env var if provided, otherwise falls back to production URL

export function getApiBaseUrl() {
	const envUrl = process?.env?.EXPO_PUBLIC_API_URL || process?.env?.API_URL;
	const trimmed = typeof envUrl === 'string' ? envUrl.trim() : '';
	const base = trimmed || 'https://attendancesystem-backend-mias.onrender.com';
	return base.replace(/\/$/, '');
}

export function apiUrl(path) {
	const base = getApiBaseUrl();
	const p = String(path || '');
	return p.startsWith('/') ? `${base}${p}` : `${base}/${p}`;
}

export async function apiFetch(path, options = {}) {
	const url = apiUrl(path);
	const defaultHeaders = { 'Content-Type': 'application/json' };
	const headers = { ...defaultHeaders, ...(options.headers || {}) };
	return fetch(url, { ...options, headers });
}


