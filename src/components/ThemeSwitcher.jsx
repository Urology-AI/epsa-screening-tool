import React from 'react';

const THEME_STORAGE_KEY = 'epsaTheme';

const getInitialTheme = () => {
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (stored === 'light' || stored === 'dark') return stored;
  } catch (_) {
    // ignore
  }
  // Default to system preference
  return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
};

const ThemeSwitcher = () => {
  const [theme, setTheme] = React.useState('light');

  React.useEffect(() => {
    const initial = getInitialTheme();
    setTheme(initial);

    const root = document.documentElement;
    if (initial === 'dark') root.classList.add('theme-dark');
    else root.classList.remove('theme-dark');
  }, []);

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);

    const root = document.documentElement;
    if (next === 'dark') root.classList.add('theme-dark');
    else root.classList.remove('theme-dark');

    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch (_) {
      // ignore
    }
  };

  const isDark = theme === 'dark';

  return (
    <button
      type="button"
      className="theme-toggle-btn"
      onClick={toggleTheme}
      aria-label="Toggle dark/light theme"
      title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
    >
      <span>{isDark ? 'Light' : 'Dark'}</span>
    </button>
  );
};

export default ThemeSwitcher;

