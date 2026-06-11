import React from 'react';
import { useTranslation } from 'react-i18next';

const STORAGE_KEY = 'epsaTextScale';

/** Root font-size multipliers; 1 = browser default (~16px base for rem). */
const LEVELS = [0.875, 0.9375, 1, 1.0625, 1.125, 1.1875, 1.25];

const defaultIndex = () => {
  const i = LEVELS.indexOf(1);
  return i >= 0 ? i : 3;
};

const readStoredIndex = () => {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw == null) return null;
    const i = parseInt(raw, 10);
    if (Number.isFinite(i) && i >= 0 && i < LEVELS.length) return i;
  } catch (_) {
    // ignore
  }
  return null;
};

const applyLevel = (index) => {
  const scale = LEVELS[index];
  document.documentElement.style.removeProperty('font-size');
  document.documentElement.style.setProperty('--epsa-user-text-scale', String(scale));
};

const TextScaleControl = () => {
  const { t } = useTranslation();
  const [levelIndex, setLevelIndex] = React.useState(defaultIndex);

  React.useEffect(() => {
    const stored = readStoredIndex();
    const idx = stored != null ? stored : defaultIndex();
    setLevelIndex(idx);
    applyLevel(idx);
  }, []);

  const persist = (index) => {
    try {
      window.localStorage.setItem(STORAGE_KEY, String(index));
    } catch (_) {
      // ignore
    }
  };

  const setLevel = (index) => {
    setLevelIndex(index);
    applyLevel(index);
    persist(index);
  };

  const decrease = () => {
    if (levelIndex <= 0) return;
    setLevel(levelIndex - 1);
  };

  const increase = () => {
    if (levelIndex >= LEVELS.length - 1) return;
    setLevel(levelIndex + 1);
  };

  return (
    <div
      className="text-scale-control"
      role="group"
      aria-label={t('app.textScale.groupLabel')}
    >
      <button
        type="button"
        className="text-scale-btn"
        onClick={decrease}
        disabled={levelIndex <= 0}
        aria-label={t('app.textScale.decreaseAria')}
        title={t('app.textScale.decreaseTitle')}
      >
        {t('app.textScale.smaller')}
      </button>
      <button
        type="button"
        className="text-scale-btn"
        onClick={increase}
        disabled={levelIndex >= LEVELS.length - 1}
        aria-label={t('app.textScale.increaseAria')}
        title={t('app.textScale.increaseTitle')}
      >
        {t('app.textScale.bigger')}
      </button>
    </div>
  );
};

export default TextScaleControl;
