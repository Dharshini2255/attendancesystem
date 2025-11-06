import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useState, useRef } from 'react';
import * as SecureStore from 'expo-secure-store';
import * as Location from 'expo-location';
import { startBackgroundTracking } from '../utils/background';
import { apiUrl } from '../utils/api';
import { Platform } from 'react-native';
import * as LocalAuthentication from 'expo-local-authentication';

import {
  Alert,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  Button,
  ImageBackground,
  ScrollView
} from 'react-native';

export default function HomeScreen() {
  const router = useRouter();
  const [drawerVisible, setDrawerVisible] = useState(false);
  const [user, setUser] = useState(null);
  const [status, setStatus] = useState('');
  const [attendance, setAttendance] = useState([]);
  const [attendanceDate, setAttendanceDate] = useState('');
  const settingsRef = useRef(null);

  const refreshAttendance = async (id) => {
    try {
      const response = await fetch(apiUrl(`/attendance/today/${id}`));
      const data = await response.json();
      if (response.ok) {
        setAttendance(data.periods || []);
        setAttendanceDate(data.date || '');
      } else {
        console.warn('Attendance fetch failed:', data?.error || response.status);
      }
    } catch (e) {
      console.warn('Attendance request error:', e);
    }
  };

  const referenceLocation = {
    latitude: 12.8005328,
    longitude: 80.0388091
  };

  const timestampTypes = ['start', 'afterStart15', 'beforeEnd10', 'end'];

useEffect(() => {
  const loadUser = async () => {
    // Read user from secure storage; only redirect if missing or unreadable
    try {
      let storedUser = null;
      try {
        // Skip SecureStore on web entirely
        if (typeof navigator !== 'undefined' && navigator.product === 'ReactNative') {
          storedUser = await SecureStore.getItemAsync('user');
        }
      } catch {}
      if (!storedUser) {
        try {
          const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
          storedUser = await AsyncStorage.getItem('user');
        } catch {}
      }
      if (!storedUser) {
        router.replace('/login');
        return;
      }
      const parsedUser = JSON.parse(storedUser);
      setUser(parsedUser);
      // Initial load of today's attendance
      await refreshAttendance(parsedUser._id);
      // Background tracking disabled to avoid duplicate pings; auto-pinger handles sending
      // (kept here commented intentionally)
      // try { await startBackgroundTracking(); } catch {}
      
    } catch (err) {
      console.error('Error reading user from storage:', err);
      router.replace('/login');
    }
  };

  loadUser();
}, []);

// Auto pinger driven by Admin Settings (time window, pingIntervalMs, threshold)
useEffect(() => {
  if (!user) return;
  let timer = null;
  const stateRef = { perCounts: {}, currentPeriod: 1 };
  const permRef = { granted: false };
  const sendingRef = { sending: false };
  let nextSettingsFetchAt = 0;

  const ensurePermission = async () => {
    if (permRef.granted) return true;
    try { 
      const { status } = await Location.requestForegroundPermissionsAsync(); 
      permRef.granted = status === 'granted'; 
    } catch {}
    if (!permRef.granted && Platform.OS === 'web' && navigator.geolocation) {
      try { 
        await new Promise((resolve, reject) => 
          navigator.geolocation.getCurrentPosition(() => resolve(), reject, { timeout: 5000 })
        ); 
        permRef.granted = true; 
      } catch {}
    }
    if (!permRef.granted) {
      Alert.alert('Location Required', 'Please enable location to send attendance pings.');
    }
    return permRef.granted;
  };

  const getSettings = async () => {
    try { 
      const res = await fetch(apiUrl('/admin/settings')); 
      settingsRef.current = await res.json(); 
      nextSettingsFetchAt = Date.now() + 60000; 
    } catch (err) {
      console.error('Failed to fetch settings:', err);
    }
  };

  const withinWindow = (now, s) => {
    // Time window check disabled for testing - pings can run at any time
    return true;
    // Uncomment below to re-enable time window checking:
    // if (!s?.startTime || !s?.endTime) return true;
    // const [sh, sm] = String(s.startTime).split(':').map(Number);
    // const [eh, em] = String(s.endTime).split(':').map(Number);
    // const m = now.getHours()*60 + now.getMinutes();
    // const a = (sh||0)*60 + (sm||0), b = (eh||0)*60 + (em||0);
    // return m >= a && m <= b;
  };

  const tick = async () => {
    if (sendingRef.sending) return;
    sendingRef.sending = true;
    try {
      // Refresh settings if needed
      if (!settingsRef.current || Date.now() > nextSettingsFetchAt) {
        await getSettings();
        if (!settingsRef.current) {
          setStatus('Waiting: unable to load admin settings');
        }
      }
      const s = settingsRef.current;
      if (!s) {
        sendingRef.sending = false;
        setStatus('Waiting: no settings available');
        return;
      }

      // Scope enforcement (class/year)
      if (Array.isArray(s.classes) && s.classes.length && !s.classes.includes(user.class)) {
        sendingRef.sending = false;
        setStatus('Waiting: not in allowed class scope');
        return;
      }
      if (Array.isArray(s.years) && s.years.length && !s.years.includes(Number(user.year))) {
        sendingRef.sending = false;
        setStatus('Waiting: not in allowed year scope');
        return;
      }

      const ok = await ensurePermission();
      if (!ok) {
        sendingRef.sending = false;
        setStatus('Location permission required');
        return;
      }

      const now = new Date();
      if (!withinWindow(now, s)) {
        sendingRef.sending = false;
        setStatus(`Waiting: outside time window ${s.startTime||''}-${s.endTime||''}`);
        return;
      }

      // Get current period and threshold
      const threshold = Math.max(1, Number(s.pingThresholdPerPeriod || 4));
      let period = stateRef.currentPeriod || 1;
      
      // If we've completed all 8 periods, stop
      if (period > 8) {
        sendingRef.sending = false;
        setStatus('All periods completed for today');
        return;
      }

      // Get current count for this period (before sending new ping)
      let currentCount = stateRef.perCounts[period] || 0;
      
      // Check if current period has reached threshold - if so, move to next period
      if (currentCount >= threshold) {
        // Move to next period
        stateRef.currentPeriod = Math.min(8, period + 1);
        period = stateRef.currentPeriod;
        
        // If we've completed all periods, stop
        if (period > 8) {
          sendingRef.sending = false;
          setStatus('All periods completed for today');
          return;
        }
        // Reset count for new period and continue to send first ping
        stateRef.perCounts[period] = 0;
        currentCount = 0; // Update currentCount for new period
      }

      // Determine biometric trigger (optional) - use current count
      const actualCountForBio = currentCount;
      let doBiometric = false;
      const mode = s.biometricTriggerMode || 'pingNumber';
      if (mode === 'off') {
        doBiometric = false; // Biometric disabled
      } else if (mode === 'pingNumber') {
        const atN = Math.min(Math.max(1, Number(s.biometricAtPingNumber || 1)), threshold);
        doBiometric = (actualCountForBio + 1) === atN;
      } else if (mode === 'time') {
        const m = now.getHours()*60 + now.getMinutes();
        const windows = s.biometricTimeWindows || [];
        doBiometric = windows.some(w => {
          const [sh,sm] = String(w.start||'').split(':').map(Number);
          const [eh,em] = String(w.end||'').split(':').map(Number);
          const a = (sh||0)*60 + (sm||0);
          const b = (eh||0)*60 + (em||0);
          return m >= a && m <= b;
        });
      } else if (mode === 'period') {
        const list = s.biometricPeriods || [];
        doBiometric = list.includes(period) && (actualCountForBio === 0);
      }

      // Get location
      let loc;
      try { 
        loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }); 
      } catch {
        if (Platform.OS === 'web' && navigator.geolocation) {
          try { 
            loc = await new Promise((resolve, reject) => 
              navigator.geolocation.getCurrentPosition(
                (p) => resolve({ coords: { latitude: p.coords.latitude, longitude: p.coords.longitude } }), 
                reject,
                { enableHighAccuracy: true, timeout: 8000 }
              )
            ); 
          } catch {}
        }
      }
      if (!loc) {
        sendingRef.sending = false;
        return;
      }

      // Optional biometric auth on device
      let biometricVerified = false;
      if (doBiometric) {
        try {
          // Check if biometric is available
          const hasHardware = await LocalAuthentication.hasHardwareAsync();
          const isEnrolled = await LocalAuthentication.isEnrolledAsync();
          
          if (hasHardware && isEnrolled) {
            const res = await LocalAuthentication.authenticateAsync({ 
              promptMessage: 'Verify identity for attendance',
              cancelLabel: 'Cancel',
              disableDeviceFallback: false
            });
            biometricVerified = res.success;
            if (!res.success) {
              setStatus('Biometric verification failed - ping will still be sent');
            }
          } else if (Platform.OS === 'web') {
            // Web fallback
            biometricVerified = window.confirm('Biometric challenge: confirm to proceed');
          } else {
            console.warn('Biometric not available or not enrolled');
            setStatus('Biometric not available - continuing without verification');
          }
        } catch (err) {
          console.error('Biometric auth error:', err);
          setStatus('Biometric error - continuing without verification');
        }
      }

      // Double-check period count before sending (prevent race conditions)
      if (currentCount >= threshold) {
        // Period already completed, skip this tick
        sendingRef.sending = false;
        return;
      }
      
      // Send ping
      try {
        // Map ping number to timestamp type based on threshold
        // 2 pings: start, end
        // 3 pings: start, afterStart15, end
        // 4 pings: start, afterStart15, beforeEnd10, end
        let timestampType = 'start';
        const pingIndex = currentCount; // 0-indexed (0, 1, 2, 3)
        
        if (threshold === 2) {
          // 2 pings: start, end
          timestampType = pingIndex === 0 ? 'start' : 'end';
        } else if (threshold === 3) {
          // 3 pings: start, afterStart15, end
          if (pingIndex === 0) timestampType = 'start';
          else if (pingIndex === 1) timestampType = 'afterStart15';
          else timestampType = 'end';
        } else if (threshold >= 4) {
          // 4+ pings: start, afterStart15, beforeEnd10, end
          if (pingIndex === 0) timestampType = 'start';
          else if (pingIndex === 1) timestampType = 'afterStart15';
          else if (pingIndex === threshold - 1) timestampType = 'end';
          else timestampType = 'beforeEnd10'; // For any middle pings
        }
        
        const response = await fetch(apiUrl('/attendance/mark'), {
          method: 'POST', 
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            studentId: user._id,
            periodNumber: period,
            timestampType: timestampType,
            location: { latitude: loc.coords.latitude, longitude: loc.coords.longitude },
            biometricType: doBiometric ? 'fingerprint' : null,
            biometricVerified
          })
        });

        if (response.ok) {
          // Increment count for this period AFTER successful ping
          const newCount = currentCount + 1;
          stateRef.perCounts[period] = newCount;
          
          // Only refresh attendance after completing threshold
          if (newCount >= threshold) {
            await refreshAttendance(user._id);
            setStatus(`Period ${period} completed (${threshold}/${threshold} pings)`);
            // The next tick will automatically advance to next period
          } else {
            setStatus(`Ping ${newCount}/${threshold} sent for period ${period} (${timestampType})`);
          }
        } else {
          let msg = '';
          try { const errorData = await response.json(); msg = errorData?.error || ''; } catch {}
          setStatus(`Ping failed: ${msg || response.status}`);
        }
      } catch (err) {
        setStatus('Ping error: network or permission issue');
      }
    } finally {
      sendingRef.sending = false;
    }
  };

  const start = async () => {
    try {
      // Get permissions first
      await ensurePermission();
      
      // Load settings
      await getSettings();
      
      // Check today's attendance to determine starting period
      try {
        const res = await fetch(apiUrl(`/attendance/today/${user._id}`));
        const data = await res.json();
        const periods = Array.isArray(data?.periods) ? data.periods : [];
        let maxP = 0; 
        for (const p of periods) { 
          if (p.status === 'present') {
            maxP = Math.max(maxP, Number(p.periodNumber) || 0); 
          }
        }
        // Start from next incomplete period
        stateRef.currentPeriod = Math.min(8, Math.max(1, maxP + 1));
        stateRef.perCounts = {}; // Reset counts for fresh start
        console.log(`Starting pings from period ${stateRef.currentPeriod}`);
      } catch (err) {
        console.error('Failed to load today attendance:', err);
        stateRef.currentPeriod = 1; // Default to period 1
      }
      
      // Get interval from settings
      const s = settingsRef.current || {};
      const ms = Math.max(1000, Number(s.pingIntervalMs || 60000)); // Minimum 1 second
      
      // Start timer
      timer = setInterval(tick, ms);
      
      // Send first ping immediately after login
      setStatus('Starting auto-pinger…');
      setTimeout(() => tick(), 500); // Small delay to ensure everything is ready
    } catch (err) {
      setStatus('Failed to start auto-pinger');
    }
  };

  start();
  
  return () => { 
    if (timer) {
      clearInterval(timer);
      setStatus('Auto-pinger stopped');
    }
  };
}, [user]);


  const calculateDistance = (loc1, loc2) => {
    const toRad = (value) => (value * Math.PI) / 180;
    const R = 6371000;
    const dLat = toRad(loc2.latitude - loc1.latitude);
    const dLon = toRad(loc2.longitude - loc1.longitude);
    const lat1 = toRad(loc1.latitude);
    const lat2 = toRad(loc2.latitude);

    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  };

  const sendPing = async (periodNumber, timestampType) => {
    try {
      setStatus(`Sending ${timestampType}…`);
      // Request permission and get current position with web fallback
      let granted = false;
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        granted = status === 'granted';
      } catch {}
      if (!granted && Platform.OS === 'web' && navigator.geolocation) {
        // prompt browser permission via native API
        await new Promise((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(() => resolve(), reject, { enableHighAccuracy: true, timeout: 8000 });
        });
        granted = true;
      }
      if (!granted) {
        setStatus('');
        Alert.alert('Permission Denied', 'Location access is required.');
        return;
      }

      // Get position (fallback for web if expo-location throws)
      let loc;
      try {
        loc = await Location.getCurrentPositionAsync({});
      } catch (e) {
        if (Platform.OS === 'web' && navigator.geolocation) {
          loc = await new Promise((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(
              (pos) => resolve({ coords: { latitude: pos.coords.latitude, longitude: pos.coords.longitude } }),
              reject,
              { enableHighAccuracy: true, timeout: 8000 }
            );
          });
        } else {
          throw e;
        }
      }

      const current = { latitude: loc.coords.latitude, longitude: loc.coords.longitude };
      // Compute distance for info only; server will enforce the radius
      try {
        const distance = calculateDistance(current, referenceLocation);
        if (distance > 100) {
          console.warn(`Outside radius by ~${Math.round(distance)}m (client)`);
        }
      } catch {}

      // Send with timeout so failures surface quickly
      const controller = new AbortController();
      const t = setTimeout(() => controller.abort(), 10000);
      const response = await fetch(apiUrl('/attendance/mark'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studentId: user._id, periodNumber, timestampType, location: current }),
        signal: controller.signal
      });
      clearTimeout(t);
      let data = {};
      try { data = await response.json(); } catch {}

      if (response.ok) {
        setStatus(`✅ Ping recorded: ${timestampType}`);
        if (user?._id) await refreshAttendance(user._id);
      } else {
        setStatus('');
        Alert.alert('Ping Failed', data.error || 'Could not mark attendance');
      }
    } catch (err) {
      console.error('Ping error:', err);
      setStatus('');
      Alert.alert('Network Error', 'Could not connect to server');
    }
  };

  if (!user) {
    return (
      <View style={styles.container}>
        <Text style={{ color: '#fff', textAlign: 'center', marginTop: 50 }}>
          Loading user info...
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ImageBackground source={require('../assets/bg.jpg')} style={styles.background} resizeMode="cover" />
      <View style={styles.contentWrapper}>
        <ScrollView contentContainerStyle={styles.scroll}>
          {/* Header */}
          <View style={styles.header}>
              <TouchableOpacity onPress={() => setDrawerVisible(true)}>
                <Ionicons name="menu" size={28} color="#fff" />
              </TouchableOpacity>
              <Text style={styles.headerTitle}>Welcome, {user.name}</Text>
            </View>

          {/* User Info */}
          <View style={styles.infoBox}>
            <Text style={styles.label}>Reg No: <Text style={styles.value}>{user.regNo}</Text></Text>
            <Text style={styles.label}>Class: <Text style={styles.value}>{user.class}</Text></Text>
            <Text style={styles.label}>Year: <Text style={styles.value}>{user.year}</Text></Text>
            <Text style={styles.label}>Phone: <Text style={styles.value}>{user.phone}</Text></Text>
            <Text style={styles.label}>Email: <Text style={styles.value}>{user.email}</Text></Text>
            <Text style={styles.label}>UUID: <Text style={styles.value}>{user.uuid}</Text></Text>
          </View>

          {/* Auto-pinging is controlled by Admin Settings; no manual buttons */}
          {status ? (
            <View style={styles.section}>
              <Text style={styles.status}>{status}</Text>
            </View>
          ) : null}

          {/* Current Day Attendance (visible after first attendance is marked) */}
          {attendance.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Current Day Attendance</Text>
              {(() => {
                const presentSet = new Set((attendance||[]).filter(p=>p.status==='present').map(p=>Number(p.periodNumber)));
                const ord = ['1st','2nd','3rd','4th','5th','6th','7th','8th'];
                const s = settingsRef.current || {};
                // Determine which periods are "decided" (past windows)
                const now = new Date();
                let decidedPeriod = 8;
                try {
                  if (s?.startTime && s?.endTime) {
                    const [sh, sm] = String(s.startTime).split(':').map(Number);
                    const [eh, em] = String(s.endTime).split(':').map(Number);
                    const startM = (sh||0)*60 + (sm||0);
                    const endM = (eh||0)*60 + (em||0);
                    const total = Math.max(1, endM - startM);
                    const slot = Math.max(1, Math.round(total / 8));
                    const nowM = now.getHours()*60 + now.getMinutes();
                    const idx = Math.min(7, Math.max(-1, Math.floor((nowM - startM) / slot) - 1));
                    decidedPeriod = Math.max(0, Math.min(8, idx + 1));
                  }
                } catch {}
                const lines = [];
                for (let i=1;i<=8;i++) {
                  let label = '-';
                  if (i <= decidedPeriod) {
                    label = presentSet.has(i) ? 'present' : 'absent';
                  }
                  const color = label==='present' ? '#0f0' : (label==='absent' ? '#f00' : '#ddd');
                  lines.push(
                    <Text key={i} style={{ color, fontSize: 16, marginBottom: 4 }}>
                      {ord[i-1]} period - {label}
                    </Text>
                  );
                }
                // Show overall only when all periods decided
                if (decidedPeriod === 8) {
                  const overall = presentSet.size===8 ? 'present' : 'absent';
                  lines.push(
                    <Text key="overall" style={{ color: overall==='present' ? '#0f0' : '#f00', fontSize: 16, marginTop: 6 }}>
                      overall attendance - {overall}
                    </Text>
                  );
                }
                return lines;
              })()}
            </View>
          )}
        </ScrollView>
        {/* Overlay below text */}
        <View style={styles.bottomOverlay} />
      </View>

      {/* Drawer Menu */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={drawerVisible}
        onRequestClose={() => setDrawerVisible(false)}
      >
        <Pressable style={styles.drawerOverlay} onPress={() => setDrawerVisible(false)}>
          <View style={styles.drawer}>
            <Text style={styles.drawerTitle}>Menu</Text>
            <TouchableOpacity
              style={styles.drawerItem}
              onPress={() => {
                setDrawerVisible(false);
                router.push({ pathname: '/profile', params: { username: user?.username } });
              }}
            >
              <Text style={styles.drawerText}>My Profile</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.drawerItem}
              onPress={async () => {
                setDrawerVisible(false);
                try { await SecureStore.deleteItemAsync('user'); } catch {}
                try {
                  const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
                  // notify backend about logout
                  try {
                    if (user?.username) {
                      await fetch(apiUrl('/logout'), {
                        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: user.username })
                      });
                    }
                  } catch {}
                  await AsyncStorage.removeItem('user');
                  await AsyncStorage.removeItem('adminAuth');
                } catch {}
                router.replace('/login');
              }}
            >
              <Text style={styles.drawerText}>Sign Out</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { 
    flex: 1, 
    position: 'relative',
    backgroundColor: '#000' 
  },
  background: { 
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: '100%',
    height: '100%'
  },
  overlay: { 
    flex: 1, 
    backgroundColor: 'rgba(0,0,0,0.1)' 
  },
  contentWrapper: {
    flex: 1,
    position: 'relative',
    zIndex: 1
  },
  scroll: { padding: 20, flex: 1 },
  bottomOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 100,
    backgroundColor: 'rgba(0,0,0,0.3)',
    zIndex: 0
  },
  drawerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)'
  },
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: 20 },
  headerTitle: { color: '#fff', fontSize: 22, fontWeight: 'bold', marginLeft: 10 },
  infoBox: { marginBottom: 20 },
  label: { color: '#ccc', fontSize: 16, marginBottom: 5 },
  value: { color: '#fff', fontWeight: '600' },
  section: { marginBottom: 20 },
  sectionTitle: { color: '#fff', fontSize: 18, fontWeight: 'bold', marginBottom: 10 },
  buttonRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
    status: { color: '#0f0', fontSize: 16, marginTop: 10 },
  drawer: {
    backgroundColor: '#333',
    padding: 20,
    width: '70%',
    height: '100%',
    elevation: 5
  },
  drawerTitle: { color: '#fff', fontSize: 18, fontWeight: 'bold', marginBottom: 20 },
  drawerItem: { marginBottom: 15 },
  drawerText: { color: '#fff', fontSize: 16 }
});