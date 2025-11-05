import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useState, useRef } from 'react';
import * as SecureStore from 'expo-secure-store';
import * as Location from 'expo-location';
import { startBackgroundTracking } from '../utils/background';
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
      const response = await fetch(`https://attendancesystem-backend-mias.onrender.com/attendance/today/${id}`);
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
      // Start background tracking safely
      try {
        await startBackgroundTracking();
      } catch (bgErr) {
        console.warn('Background tracking failed to start:', bgErr);
      }
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
  const stateRef = { perCounts: {}, lastPeriod: null };
  const permRef = { granted: false };
  let nextSettingsFetchAt = 0;
  stateRef.currentPeriod = 1;

  const ensurePermission = async () => {
    if (permRef.granted) return true;
    try { const { status } = await Location.requestForegroundPermissionsAsync(); permRef.granted = status === 'granted'; } catch {}
    if (!permRef.granted && Platform.OS === 'web' && navigator.geolocation) {
      try { await new Promise((resolve, reject) => navigator.geolocation.getCurrentPosition(() => resolve(), reject)); permRef.granted = true; } catch {}
    }
    if (!permRef.granted) Alert.alert('Location Required', 'Please enable location to send attendance pings.');
    return permRef.granted;
  };

  const getSettings = async () => {
    try { const res = await fetch('https://attendancesystem-backend-mias.onrender.com/admin/settings'); settingsRef.current = await res.json(); nextSettingsFetchAt = Date.now() + 60000; } catch {}
  };

  const withinWindow = (now, s) => {
    if (!s?.startTime || !s?.endTime) return true;
    const [sh, sm] = String(s.startTime).split(':').map(Number);
    const [eh, em] = String(s.endTime).split(':').map(Number);
    const m = now.getHours()*60 + now.getMinutes();
    const a = (sh||0)*60 + (sm||0), b = (eh||0)*60 + (em||0);
    return m >= a && m <= b;
  };
  const currentPeriod = (now, s) => {
    if (!s?.startTime || !s?.endTime) return 1;
    const [sh, sm] = String(s.startTime).split(':').map(Number);
    const [eh, em] = String(s.endTime).split(':').map(Number);
    const startM = (sh||0)*60 + (sm||0);
    const endM = (eh||0)*60 + (em||0);
    const total = Math.max(1, endM - startM);
    const slot = Math.max(1, Math.round(total / 8));
    const nowM = now.getHours()*60 + now.getMinutes();
    const idx = Math.min(7, Math.max(0, Math.floor((nowM - startM) / slot)));
    return idx + 1;
  };

  const tick = async () => {
    if (!settingsRef.current || Date.now() > nextSettingsFetchAt) await getSettings();
    const s = settingsRef.current;
    if (!s) return;

    // Scope enforcement (class/year)
    if (Array.isArray(s.classes) && s.classes.length && !s.classes.includes(user.class)) return;
    if (Array.isArray(s.years) && s.years.length && !s.years.includes(Number(user.year))) return;

    const ok = await ensurePermission();
    if (!ok) return;

    const now = new Date();
    if (!withinWindow(now, s)) return;

    // Determine working period: sequential, not time-sliced
    const threshold = Math.max(1, Number(s.pingThresholdPerPeriod || 4));
    const period = stateRef.currentPeriod || 1;
    if (period > 8) return; // done for the day

    const count = stateRef.perCounts[period] || 0;
    if (count >= threshold) {
      // advance to next period and reset count; next tick will send
      stateRef.currentPeriod = Math.min(8, period + 1);
      stateRef.perCounts[stateRef.currentPeriod] = 0;
      return;
    }

    // Determine biometric trigger (optional)
    let doBiometric = false;
    const mode = s.biometricTriggerMode || 'pingNumber';
    if (mode === 'pingNumber') {
      const atN = Math.min(Math.max(1, Number(s.biometricAtPingNumber || 1)), threshold);
      doBiometric = (count + 1) === atN;
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
      doBiometric = list.includes(period) && (count === 0);
    }

    // Get location
    let loc;
    try { loc = await Location.getCurrentPositionAsync({}); } catch {
      if (Platform.OS === 'web' && navigator.geolocation) {
        try { loc = await new Promise((resolve, reject) => navigator.geolocation.getCurrentPosition((p)=>resolve({ coords: { latitude: p.coords.latitude, longitude: p.coords.longitude } }), reject)); } catch {}
      }
    }
    if (!loc) return;

    // Optional biometric auth on device
    let biometricVerified = false;
    if (doBiometric) {
      try {
        if (typeof LocalAuthentication?.authenticateAsync === 'function') {
          const res = await LocalAuthentication.authenticateAsync({ promptMessage: 'Verify identity' });
          biometricVerified = !!res.success;
        } else if (Platform.OS === 'web') {
          biometricVerified = window.confirm('Biometric challenge: confirm to proceed');
        }
      } catch {}
    }

    try {
      await fetch('https://attendancesystem-backend-mias.onrender.com/attendance/mark', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentId: user._id,
          periodNumber: period,
          timestampType: ['start','afterStart15','beforeEnd10','end'][Math.min(count,3)],
          location: { latitude: loc.coords.latitude, longitude: loc.coords.longitude },
          biometricType: doBiometric ? 'fingerprint' : null,
          biometricVerified
        })
      });
      stateRef.perCounts[period] = count + 1;
      await refreshAttendance(user._id);
    } catch {}
  };

  const start = async () => {
    await ensurePermission();
    await getSettings();
    // Seed currentPeriod from today's attendance (max present period + 1)
    try {
      const res = await fetch(`https://attendancesystem-backend-mias.onrender.com/attendance/today/${user._id}`);
      const data = await res.json();
      const periods = Array.isArray(data?.periods) ? data.periods : [];
      let maxP = 0; for (const p of periods) { if (p.status==='present') maxP = Math.max(maxP, Number(p.periodNumber)||0); }
      stateRef.currentPeriod = Math.min(8, Math.max(1, maxP + 1));
      stateRef.perCounts = {}; // fresh counts for the next period
    } catch {}
    const s = settingsRef.current || {};
    const ms = Math.max(5000, Number(s.pingIntervalMs || 60000));
    timer = setInterval(tick, ms);
    // immediate first ping after login
    tick();
  };

  start();
  return () => { if (timer) clearInterval(timer); };
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
      const response = await fetch('https://attendancesystem-backend-mias.onrender.com/attendance/mark', {
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
    <ImageBackground source={require('../assets/bg.jpg')} style={styles.background}>
      <View style={styles.overlay}>
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
                const lines = [];
                for (let i=1;i<=8;i++) {
                  const st = presentSet.has(i) ? 'present' : 'absent';
                  lines.push(
                    <Text key={i} style={{ color: st==='present' ? '#0f0' : '#f00', fontSize: 16, marginBottom: 4 }}>
                      {ord[i-1]} period - {st}
                    </Text>
                  );
                }
                const overall = presentSet.size===8 ? 'present' : (presentSet.size>0 ? 'partial' : 'absent');
                lines.push(
                  <Text key="overall" style={{ color: overall==='present' ? '#0f0' : '#f00', fontSize: 16, marginTop: 6 }}>
                    overall attendance - {overall}
                  </Text>
                );
                return lines;
              })()}
            </View>
          )}
        </ScrollView>

        {/* Drawer Menu */}
        <Modal
          animationType="slide"
          transparent={true}
          visible={drawerVisible}
          onRequestClose={() => setDrawerVisible(false)}
        >
          <Pressable style={styles.overlay} onPress={() => setDrawerVisible(false)}>
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
                        await fetch('https://attendancesystem-backend-mias.onrender.com/logout', {
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
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#000' },
  background: { flex: 1 },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)' },
  scroll: { padding: 20 },
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