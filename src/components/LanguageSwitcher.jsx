import React from 'react';
import { useTranslation } from 'react-i18next';
import { supportedLanguages } from '../i18n/supportedLanguages';

const LanguageSwitcher = () => {
  const { t, i18n } = useTranslation();
  const resolvedLang = i18n.resolvedLanguage || i18n.language || 'en';

  const handleLanguageChange = (e) => {
    const nextLang = e.target.value;
    i18n.changeLanguage(nextLang);
    try {
      window.localStorage.setItem('epsaLang', nextLang);
    } catch (_) {
      // Ignore storage failures
    }
  };

  return (
    <div className="language-switcher" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
      <label style={{ fontSize: '0.75rem', color: 'var(--ink-500)' }}>{t('common.language')}</label>
      <select
        value={resolvedLang}
        onChange={handleLanguageChange}
        aria-label={t('common.language')}
        style={{
          fontSize: '0.75rem',
          padding: '0.375rem 0.625rem',
          borderRadius: '0.5rem',
          border: '0.0625rem solid var(--line-100)',
          background: 'var(--surface)',
          color: 'var(--ink-900)',
        }}
      >
        {supportedLanguages.map((lng) => (
          <option key={lng.code} value={lng.code}>
            {lng.label}
          </option>
        ))}
      </select>
    </div>
  );
};

export default LanguageSwitcher;
