/**
 * Admin Authentication with Email OTP
 * 6-digit code flow: email → code sent → code verified → custom token sign-in
 */

import { adminAuth, adminFunctions } from '../config/adminFirebase';
import { signInWithCustomToken } from 'firebase/auth';
import { httpsCallable } from 'firebase/functions';

export class AdminAuthService {
  async sendAdminOTP(email) {
    try {
      const fn = httpsCallable(adminFunctions, 'sendAdminOTP');
      await fn({ email });
      return { success: true };
    } catch (error) {
      console.error('Error sending admin OTP:', error);
      return { success: false, message: this.getErrorMessage(error) };
    }
  }

  async verifyAdminOTP(email, code) {
    try {
      const fn = httpsCallable(adminFunctions, 'verifyAdminOTP');
      const result = await fn({ email, code });
      const { customToken } = result.data;

      await signInWithCustomToken(adminAuth, customToken);

      sessionStorage.setItem('admin_authenticated', 'true');
      sessionStorage.setItem('admin_user', JSON.stringify({ email }));

      return { success: true, message: 'Logged in successfully' };
    } catch (error) {
      console.error('Error verifying admin OTP:', error);
      return { success: false, message: this.getErrorMessage(error) };
    }
  }

  getCurrentAdmin() {
    const raw = sessionStorage.getItem('admin_user');
    return raw ? JSON.parse(raw) : null;
  }

  isAdminAuthenticated() {
    return sessionStorage.getItem('admin_authenticated') === 'true' && !!this.getCurrentAdmin();
  }

  async logoutAdmin() {
    try {
      await adminAuth.signOut();
      sessionStorage.removeItem('admin_authenticated');
      sessionStorage.removeItem('admin_user');
      return { success: true };
    } catch (error) {
      return { success: false, message: 'Error during logout' };
    }
  }

  getErrorMessage(error) {
    const code = error?.code || '';
    if (code.includes('deadline-exceeded') || error?.message?.includes('expired')) return 'Code has expired. Please request a new one.';
    if (code.includes('unauthenticated')) return 'Invalid code. Please try again.';
    if (code.includes('resource-exhausted')) return 'Too many attempts. Please request a new code.';
    if (code.includes('not-found')) return 'No code found. Please request a new one.';
    if (code.includes('invalid-argument')) return 'Email and code are required.';
    return error?.message || 'Authentication failed. Please try again.';
  }
}

export const adminAuthService = new AdminAuthService();
