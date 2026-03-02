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
    if (error.response?.status === 401 && !_redirectingToLogin) {
      if (typeof window !== 'undefined') {
        _redirectingToLogin = true;
        localStorage.removeItem('token');
        // Small delay to let any in-flight requests settle before navigating
        setTimeout(() => {
          window.location.replace('/atendimento/login');
          _redirectingToLogin = false;
        }, 100);
      }
    }
    return Promise.reject(error);
  }
);

export default api;
