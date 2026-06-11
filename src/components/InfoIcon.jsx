import React, { useState } from 'react';
import './InfoIcon.css';
import { useTranslation } from 'react-i18next';

const InfoIcon = ({ title, description, titleKey, descriptionKey, sources, isGuideline }) => {
  const [isOpen, setIsOpen] = useState(false);
  const { t } = useTranslation();

  const resolvedTitle = titleKey ? t(titleKey) : title;
  const resolvedDescription = descriptionKey ? t(descriptionKey) : description;
  const hasGuidelineFlag = typeof isGuideline === 'boolean';

  return (
    <>
      <button
        className="info-icon-btn"
        onClick={(e) => {
          e.stopPropagation();
          setIsOpen(true);
        }}
        title={t('info.learnMore', { title: resolvedTitle })}
      >
        ⓘ
      </button>

      {isOpen && (
        <div className="info-modal-overlay" onClick={() => setIsOpen(false)}>
          <div className="info-modal" onClick={(e) => e.stopPropagation()}>
            <div className="info-modal-header">
              <h3>{resolvedTitle}</h3>
              <button className="info-modal-close" onClick={() => setIsOpen(false)}>
                ×
              </button>
            </div>
            <div className="info-modal-body">
              {hasGuidelineFlag && (
                <div
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '6px 10px',
                    borderRadius: '999px',
                    fontSize: '11px',
                    fontWeight: 700,
                    letterSpacing: '0.02em',
                    textTransform: 'uppercase',
                    marginBottom: '10px',
                    background: isGuideline ? '#ecfdf5' : '#fff7ed',
                    border: isGuideline ? '1px solid #10b981' : '1px solid #f59e0b',
                    color: isGuideline ? '#047857' : '#b45309',
                  }}
                >
                  {isGuideline ? t('info.guidelineBadge') : t('info.modelOnlyBadge')}
                </div>
              )}
              {hasGuidelineFlag && (
                <p style={{ fontSize: '12px', color: '#6b7280', marginTop: 0, marginBottom: '12px', fontStyle: 'italic' }}>
                  {isGuideline ? t('info.guidelineNote') : t('info.modelOnlyNote')}
                </p>
              )}
              <p className="info-description">{resolvedDescription}</p>
              <div className="info-sources">
                <strong>{t('info.sources')}</strong>
                <ul>
                  {sources.map((source, idx) => (
                    <li key={idx}>
                      <a href={source.url} target="_blank" rel="noopener noreferrer">
                        {source.name}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default InfoIcon;
