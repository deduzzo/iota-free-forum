import '@testing-library/jest-dom';

// Polyfill sessionStorage / localStorage for jsdom
if (typeof globalThis.sessionStorage === 'undefined') {
  const store = {};
  globalThis.sessionStorage = {
    getItem: (k) => store[k] ?? null,
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; },
    clear: () => { Object.keys(store).forEach(k => delete store[k]); },
  };
}

// Reset storages between tests
afterEach(() => {
  sessionStorage.clear();
  localStorage.clear();
});
