import { calculateDynamicEPsa } from './dynamicCalculator';
import { DEFAULT_CALCULATOR_CONFIG, calculateDynamicEPsaPost } from '@epsa/engine';

// Same engine and config the live kiosk flow uses.
export const KIOSK_ENGINE = {
  pre: (formData) => calculateDynamicEPsa(formData, DEFAULT_CALCULATOR_CONFIG),
  post: (pre, step2) => calculateDynamicEPsaPost(pre, step2, DEFAULT_CALCULATOR_CONFIG),
};
