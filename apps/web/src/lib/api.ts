import axios from 'axios';

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3005',
});

api.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
  }
  return config;
});

let _redirectingToLogin = false;

api.interceptors.response.use(
  (response) => response,
  (error) => {
    // _silent401: true → chamadas de background (ex: inboxUpdate) não causam redirect global
    const isSilent = (error.config as any)?._silent401 === true;

    if (error.response?.status === 401 && !_redirectingToLogin && !isSilent) {
      if (typeof window !== 'undefined') {
        _redirectingToLogin = true;
        localStorage.removeItem('token');
        // Dispara evento para o layout capturar via Next.js router (sem full page reload)
        window.dispatchEvent(new CustomEvent('auth:logout'));
        setTimeout(() => { _redirectingToLogin = false; }, 3000);
      }
    }
    return Promise.reject(error);
  }
);

export default api;
