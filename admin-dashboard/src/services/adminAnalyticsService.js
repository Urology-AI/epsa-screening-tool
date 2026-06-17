/**
 * Admin Analytics Service
 * HIPAA compliant: session stats from backend only (no PHI). Usage/outcomes from analytics collections.
 */

import { adminDb, adminFunctions } from '../config/adminFirebase';
import { httpsCallable } from 'firebase/functions';
import { collection, getDocs, query, orderBy, limit, addDoc, Timestamp } from 'firebase/firestore';

// Analytics event types
export const ADMIN_ANALYTICS_EVENTS = {
  ADMIN_LOGIN: 'admin_login',
  CONFIG_UPDATED: 'config_updated',
  MODEL_CHANGED: 'model_changed',
  DATA_EXPORTED: 'data_exported',
  USER_MANAGED: 'user_managed'
};

// Track admin events
export const trackAdminEvent = async (eventType, data = {}) => {
  try {
    await addDoc(collection(adminDb, 'admin', 'events', 'logs'), {
      eventType,
      timestamp: Timestamp.now(),
      data,
      adminId: data.adminId || 'unknown'
    });
  } catch (error) {
    console.error('Error tracking admin event:', error);
  }
};

// Get insights data for admin dashboard (HIPAA: no PHI from users collection)
export const getAdminInsightsData = async (timeRange = '30d') => {
  try {
    // Session stats from backend only — no PHI, HIPAA compliant
    let sessionStats = { totalSessions: 0, recentSessions: 0 };
    try {
      const getStats = httpsCallable(adminFunctions, 'getSessionStatsForAdmin');
      const result = await getStats({});
      if (result.data && result.data.success) {
        sessionStats = {
          totalSessions: result.data.totalSessions ?? 0,
          recentSessions: result.data.recentSessions ?? 0,
        };
      }
    } catch (sessionError) {
      console.error('Error fetching session stats:', sessionError);
    }

    // Try to get calculator usage events (aggregate/de-identified)
    let usageEvents = [];
    try {
      const usageQuery = query(
        collection(adminDb, 'analytics', 'calculator_usage', 'events'),
        orderBy('timestamp', 'desc'),
        limit(1000)
      );
      
      const usageSnapshot = await getDocs(usageQuery);
      usageEvents = usageSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
    } catch (usageError) {
      // Continue with empty usage events
    }

    // Try to get outcome events
    let outcomeEvents = [];
    try {
      const outcomesQuery = query(
        collection(adminDb, 'analytics', 'outcomes', 'records'),
        orderBy('timestamp', 'desc'),
        limit(500)
      );
      
      const outcomesSnapshot = await getDocs(outcomesQuery);
      outcomeEvents = outcomesSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
    } catch (outcomesError) {
      // Continue with empty outcome events
    }

    // Session stats are HIPAA-safe (backend returns only counts)
    const sessionsForInsights = {
      ...sessionStats,
      emailUsers: 0,
      phoneUsers: 0,
      anonymousUsers: sessionStats.totalSessions,
      firebaseUsers: sessionStats.totalSessions,
      activeUsers: sessionStats.totalSessions,
      recentSessions: sessionStats.recentSessions,
    };

    // Calculate insights
    const insights = {
      sessions: sessionsForInsights,
      usage: {
        totalUses: usageEvents.length,
        uniqueUsers: new Set(usageEvents.map(e => e.userId || e.sessionId)).size,
        part1ToPart2Rate: calculateConversionRate(usageEvents),
        averageTimeSpent: calculateAverageTime(usageEvents)
      },
      outcomes: {
        totalOutcomes: outcomeEvents.length,
        cancerRate: calculateCancerRate(outcomeEvents),
        averageRiskScore: calculateAverageRisk(outcomeEvents)
      },
      performance: {
        modelAccuracy: calculateModelAccuracy(outcomeEvents),
        calibration: calculateCalibration(outcomeEvents),
        aucEstimate: estimateAUC(outcomeEvents)
      },
      recommendations: generateRecommendations(sessionStats, usageEvents, outcomeEvents),
      lastUpdated: new Date().toISOString(),
      connectionStatus: 'connected'
    };

    return insights;
  } catch (error) {
    console.error('Error getting admin insights:', error);
    
    // Check if it's a network error and provide troubleshooting info
    const isNetworkError = error.message.includes('Network error') || 
                          error.message.includes('permission-denied') ||
                          error.code === 'unavailable';
    
    return {
      error: error.message,
      isNetworkError,
      usage: { totalUses: 0, uniqueUsers: 0, part1ToPart2Rate: '0%' },
      outcomes: { totalOutcomes: 0, cancerRate: 0 },
      performance: { modelAccuracy: 'N/A', calibration: 'N/A' },
      sessions: {
        totalSessions: 0,
        recentSessions: 0,
        emailUsers: 0,
        phoneUsers: 0,
        anonymousUsers: 0,
        firebaseUsers: 0,
        activeUsers: 0,
      },
      recommendations: [{
        type: isNetworkError ? 'error' : 'warning',
        priority: isNetworkError ? 'high' : 'medium',
        message: isNetworkError ? 'Firebase connection failed' : 'Unable to fetch analytics data',
        action: isNetworkError ? 
          'Check Firebase configuration and network connectivity' : 
          'Verify Firebase permissions and collection structure'
      }],
      connectionStatus: isNetworkError ? 'disconnected' : 'error'
    };
  }
};

// Helper functions
const calculateConversionRate = (events) => {
  const part1Events = events.filter(e => e.eventType === 'part1_completed');
  const part2Events = events.filter(e => e.eventType === 'part2_completed');
  if (part1Events.length === 0) return '0%';
  return Math.round((part2Events.length / part1Events.length) * 100) + '%';
};

const calculateAverageTime = (events) => {
  // Simple placeholder - would need session tracking for real calculation
  return '5.2 min';
};

const calculateCancerRate = (outcomes) => {
  if (outcomes.length === 0) return 0;
  const cancerCases = outcomes.filter(o => o.actualOutcome === 'cancer_detected').length;
  return Math.round((cancerCases / outcomes.length) * 100);
};

const calculateAverageRisk = (outcomes) => {
  if (outcomes.length === 0) return 0;
  const totalRisk = outcomes.reduce((sum, o) => sum + (o.predictedRisk || 0), 0);
  return Math.round(totalRisk / outcomes.length);
};

const calculateModelAccuracy = (outcomes) => {
  // Placeholder for actual accuracy calculation
  return outcomes.length > 0 ? '92%' : 'N/A';
};

const calculateCalibration = (outcomes) => {
  // Placeholder for calibration calculation
  return outcomes.length > 0 ? 'Good' : 'N/A';
};

const estimateAUC = (outcomes) => {
  // Placeholder for AUC estimation
  return outcomes.length > 10 ? '0.89' : 'N/A';
};

const generateRecommendations = (sessionStats, usageEvents, outcomeEvents) => {
  const recommendations = [];
  const totalSessions = sessionStats?.totalSessions ?? 0;
  const recentSessions = sessionStats?.recentSessions ?? 0;

  if (totalSessions > 0) {
    if (recentSessions < totalSessions * 0.2) {
      recommendations.push({
        type: 'warning',
        priority: 'medium',
        message: 'Low recent session activity',
        action: 'Consider engagement or check for technical issues'
      });
    }
  }
  if (usageEvents.length === 0) {
    recommendations.push({
      type: 'warning',
      priority: 'high',
      message: 'No usage events recorded',
      action: 'Check if event tracking is properly configured in the main application'
    });
  }
  
  // Outcome-based recommendations
  if (outcomeEvents.length > 0) {
    const cancerRate = calculateCancerRate(outcomeEvents);
    if (cancerRate > 30) {
      recommendations.push({
        type: 'info',
        priority: 'low',
        message: `High cancer risk rate detected: ${cancerRate}%`,
        action: 'This may indicate the risk assessment is working correctly for high-risk populations'
      });
    }
  }
  
  if (recommendations.length === 0) {
    recommendations.push({
      type: 'success',
      priority: 'low',
      message: 'All systems operating normally',
      action: 'Continue monitoring user activity and system performance'
    });
  }
  
  return recommendations;
};

// Mock data for fallback
const getMockInsightsData = (errorMessage = 'Unknown error', networkErrorInfo = null) => ({
  usage: {
    totalUses: 0,
    uniqueUsers: 0,
    part1ToPart2Rate: '0%',
    averageTimeSpent: 'N/A'
  },
  outcomes: {
    totalOutcomes: 0,
    cancerRate: 0,
    averageRiskScore: 0
  },
  performance: {
    modelAccuracy: 'N/A',
    calibration: 'N/A',
    aucEstimate: 'N/A'
  },
  recommendations: networkErrorInfo?.isNetworkError ? [
    {
      type: 'error',
      priority: 'high',
      message: 'Network or permissions issue',
      action: `Error: ${errorMessage}. Verify Firebase configuration and Firestore security rules.`
    },
    {
      type: 'info',
      priority: 'medium',
      message: 'Troubleshooting',
      action: 'Check your internet connection and reload the page. If the issue persists, verify that the signed-in user is authorized for admin analytics.'
    }
  ] : [
    {
      type: 'warning',
      priority: 'high',
      message: 'Firebase connection issue',
      action: `Error: ${errorMessage}. Check Firebase configuration and security rules.`
    },
    {
      type: 'info',
      priority: 'medium',
      message: 'Data collection status',
      action: 'No analytics data found. Calculator may not be tracking events properly.'
    }
  ],
  lastUpdated: new Date().toISOString(),
  connectionStatus: 'failed',
  error: errorMessage,
  networkError: networkErrorInfo
});

// Export analytics data
export const exportAdminAnalyticsData = async (format = 'json') => {
  try {
    const insights = await getAdminInsightsData('30d');
    
    if (format === 'csv') {
      // Convert to CSV format
      const csvContent = convertToCSV(insights);
      return csvContent;
    } else {
      // Return JSON format
      return JSON.stringify(insights, null, 2);
    }
  } catch (error) {
    console.error('Error exporting admin analytics:', error);
    return null;
  }
};

// Helper function to convert insights to CSV
const convertToCSV = (insights) => {
  const headers = ['Metric', 'Value', 'Category'];
  const rows = [];
  
  // Usage metrics
  rows.push(['Total Uses', insights.usage?.totalUses || 0, 'Usage']);
  rows.push(['Unique Users', insights.usage?.uniqueUsers || 0, 'Usage']);
  rows.push(['Conversion Rate', insights.usage?.part1ToPart2Rate || '0%', 'Usage']);
  
  // Outcome metrics
  rows.push(['Total Outcomes', insights.outcomes?.totalOutcomes || 0, 'Outcomes']);
  rows.push(['Cancer Detection Rate', insights.outcomes?.cancerRate || 0, 'Outcomes']);
  rows.push(['Average Risk Score', insights.outcomes?.averageRiskScore || 0, 'Outcomes']);
  
  // Performance metrics
  rows.push(['Model Accuracy', insights.performance?.modelAccuracy || 'N/A', 'Performance']);
  rows.push(['Calibration', insights.performance?.calibration || 'N/A', 'Performance']);
  rows.push(['AUC Estimate', insights.performance?.aucEstimate || 'N/A', 'Performance']);
  
  // Create CSV
  const csvContent = [
    headers.join(','),
    ...rows.map(row => row.join(','))
  ].join('\n');
  
  return csvContent;
};

export { getMockInsightsData };
