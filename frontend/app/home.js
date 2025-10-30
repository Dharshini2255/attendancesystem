import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
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

// Helper: derive current period from timetable
const getPeriodNow = () => {
  const t = [
    { p:1,s:'08:15',e:'09:05' },{ p:2,s:'09:05',e:'09:55' },{ p:3,s:'10:05',e:'10:55' },{ p:4,s:'10:55',e:'11:45' },
    { p:5,s:'12:45',e:'13:30' },{ p:6,s:'13:30',e:'14:15' },{ p:7,s:'14:25',e:'15:10' },{ p:8,s:'15:10',e:'15:55' }
  ];
  const now = new Date(); const m = now.getHours()*60+now.getMinutes();
  for (const r of t) { const [sh,sm]=r.s.split(':').map(Number); const [eh,em]=r.e.split(':').map(Number); const a=sh*60+sm, b=eh*60+em; if (m>=a && m<=b) return r.p; }
  return 1;
};

// Admin-driven pinger (poll control and send pings at configured interval)
useEffect(() => {
  let ctrlTimer;
  let pingTimer;
  let stepIndex = 0; // 0:start,1:afterStart15,2:beforeEnd10,3:end
  let currentPeriodRef = null;

  const types = ['start','afterStart15','beforeEnd10','end'];

  const stopPing = () => { if (pingTimer) { clearInterval(pingTimer); pingTimer = null; } };

  const sendOnePing = async () => {
    try {
      if (!user) return;
      // Get location
      let loc;
      try { loc = await Location.getCurrentPositionAsync({}); } catch {
        if (Platform.OS === 'web' && navigator.geolocation) {
          loc = await new Promise((resolve, reject) => navigator.geolocation.getCurrentPosition((p)=>resolve({ coords: { latitude: p.coords.latitude, longitude: p.coords.longitude } }), reject));
        }
      }
      if (!loc) return;
      const doBiometric = stepIndex === 1; // challenge once per sequence
      let biometricVerified = false;
      if (doBiometric) {
        try { if (typeof LocalAuthentication?.authenticateAsync === 'function') { const r = await LocalAuthentication.authenticateAsync({ promptMessage: 'Verify identity' }); biometricVerified = !!r.success; } }
        catch {}
      }
      const timestampType = types[Math.min(stepIndex, 3)];
      const periodNumber = currentPeriodRef || getPeriodNow();
      const resp = await fetch('https://attendancesystem-backend-mias.onrender.com/attendance/mark', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studentId: user._id, periodNumber, timestampType, location: { latitude: loc.coords.latitude, longitude: loc.coords.longitude }, biometricType: doBiometric ? 'fingerprint' : null, biometricVerified })
      });
      // advance step
      stepIndex = (stepIndex + 1) % 4;
      if (resp.ok && user?._id) await refreshAttendance(user._id);
      if (stepIndex === 0) { // completed 4 pings
        currentPeriodRef = (currentPeriodRef || getPeriodNow()) + 1;
        if (user?._id) await refreshAttendance(user._id);
      }
    } catch {}
  };

  const pollControl = async () => {
    try {
      const res = await fetch('https://attendancesystem-backend-mias.onrender.com/admin/ping-control');
      const data = await res.json();
      if (!user || !data?.pingEnabled) { stopPing(); return; }
      const intervalMs = Math.max(2000, Number(data.intervalMs) || 60000);
      if (currentPeriodRef == null) currentPeriodRef = getPeriodNow();
      if (!pingTimer) {
        // immediate ping
        await sendOnePing();
        pingTimer = setInterval(sendOnePing, intervalMs);
      }
    } catch {
      stopPing();
    }
  };

  ctrlTimer = setInterval(pollControl, 5000);
  pollControl();
  return () => { if (ctrlTimer) clearInterval(ctrlTimer); stopPing(); };
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

          {/* Admin-controlled pings only; manual buttons removed */}
          {status ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Attendance Status</Text>
              <Text style={styles.status}>{status}</Text>
            </View>
          ) : null}

          {/* Attendance Summary */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>🗓️ Attendance for {attendanceDate || 'Today'}</Text>
            {attendance.length === 0 ? (
              <Text style={styles.label}>No attendance recorded yet.</Text>
            ) : (
              attendance.map((p, index) => (
                <Text
                  key={index}
                  style={{
                    color: p.status === 'present' ? '#0f0' : '#f00',
                    fontSize: 16,
                    marginBottom: 4
                  }}
                >
                  Period {p.periodNumber}: {p.status === 'present' ? '✅ Present' : '❌ Absent'}
                </Text>
              ))
            )}
          </View>
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
