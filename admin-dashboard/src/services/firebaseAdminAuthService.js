/**
 * Firebase-based Admin Authorization System
 * Uses Firestore for admin user management and Custom Claims for authorization
 */

import { adminDb } from '../config/adminFirebase';
import { doc, getDoc, setDoc, updateDoc, collection, getDocs } from 'firebase/firestore';
import { adminAuth } from '../config/adminFirebase';

export class FirebaseAdminAuthService {
  constructor() {
    this.adminCollection = 'admins'; // Changed from admin_users to admins
  }

  // Check if user is authorized admin using Firestore
  async isAdminAuthorized(email, uid) {
    try {
      // Method 1: Check Firestore admins collection
      const adminDoc = await getDoc(doc(adminDb, this.adminCollection, uid));
      
      if (adminDoc.exists()) {
        const adminData = adminDoc.data();
        const isAuthorized = adminData.isActive === true && adminData.email === email;
        return {
          authorized: isAuthorized,
          source: 'firestore',
          adminData
        };
      }
      
      // Method 2: Check Firebase Custom Claims (more secure)
      const user = adminAuth.currentUser;
      if (user) {
        try {
          const decodedToken = await user.getIdTokenResult();
          const customClaims = decodedToken.claims;
          
          const hasAdminClaim = customClaims.admin === true;
          
          if (hasAdminClaim) {
            return {
              authorized: true,
              source: 'custom_claims',
              adminData: { email, uid, role: 'admin' }
            };
          }
        } catch (claimsError) {
          console.warn('Could not check custom claims:', claimsError);
        }
      }
      
      // No fallback - user must be in Firestore or have custom claims
      return {
        authorized: false,
        source: 'not_found',
        error: 'Admin user not found in admins collection and no admin custom claims'
      };
      
    } catch (error) {
      console.error('Error checking admin authorization:', error);
      
      // Check if it's a permission error
      if (error.code === 'permission-denied' || error.message.includes('Missing or insufficient permissions')) {
        return {
          authorized: false,
          source: 'permission_error',
          error: 'Firestore permissions error. Please check security rules.',
          needsSetup: true
        };
      }
      
      return {
        authorized: false,
        source: 'error',
        error: error.message
      };
    }
  }

  // Create admin user in Firestore
  async createAdminUser(uid, email, createdBy = 'manual') {
    try {
      const adminData = {
        email,
        isActive: true,
        role: 'admin',
        createdAt: new Date().toISOString(),
        createdBy,
        lastLogin: new Date().toISOString()
      };
      
      await setDoc(doc(adminDb, this.adminCollection, uid), adminData);
      return true;
    } catch (error) {
      console.error('Error creating admin user:', error);
      return false;
    }
  }

  // Update admin user login info
  async updateAdminLogin(uid) {
    try {
      const adminDoc = await getDoc(doc(adminDb, this.adminCollection, uid));
      
      if (adminDoc.exists()) {
        const currentData = adminDoc.data();
        await updateDoc(doc(adminDb, this.adminCollection, uid), {
          lastLogin: new Date().toISOString(),
          loginCount: (currentData.loginCount || 0) + 1
        });
      }
    } catch (error) {
      console.error('Error updating admin login:', error);
    }
  }

  // Get all admin users (for admin management)
  async getAllAdminUsers() {
    try {
      const snapshot = await getDocs(collection(adminDb, this.adminCollection));
      const admins = [];
      
      snapshot.forEach(doc => {
        admins.push({
          uid: doc.id,
          ...doc.data()
        });
      });
      
      return admins;
    } catch (error) {
      console.error('Error getting admin users:', error);
      return [];
    }
  }

  // Deactivate admin user
  async deactivateAdminUser(uid) {
    try {
      await updateDoc(doc(adminDb, this.adminCollection, uid), {
        isActive: false,
        deactivatedAt: new Date().toISOString()
      });
      
      return { success: true };
    } catch (error) {
      console.error('Error deactivating admin:', error);
      return { success: false, error: error.message };
    }
  }

  // Set Firebase Custom Claims for user (requires admin SDK)
  // This would typically be done via a Cloud Function
  async setAdminCustomClaims(uid) {
    // Note: This requires Firebase Admin SDK
    // In production, this should be done via a secure Cloud Function
    return { 
      success: false, 
      message: 'Custom claims require Firebase Admin SDK - use Cloud Functions'
    };
  }

  // Check if current user has specific permission
  async hasPermission(permission) {
    try {
      const user = adminAuth.currentUser;
      if (!user) return false;
      
      const adminDoc = await getDoc(doc(adminDb, this.adminCollection, user.uid));
      
      if (adminDoc.exists()) {
        const adminData = adminDoc.data();
        return adminData.isActive && adminData.permissions.includes(permission);
      }
      
      return false;
    } catch (error) {
      console.error('Error checking permission:', error);
      return false;
    }
  }
}

// Create singleton instance
export const firebaseAdminAuthService = new FirebaseAdminAuthService();
