/**
 * In production, empty string = same origin (Flask serves /api on the same host).
 * In Vite dev, defaults to local Flask.
 */
export const API_BASE_URL =
  (import.meta.env.VITE_API_BASE_URL as string | undefined)?.toString().trim() ||
  (import.meta.env.DEV ? 'http://localhost:5000' : '')
