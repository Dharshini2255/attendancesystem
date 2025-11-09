import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Alert, ScrollView, StyleSheet, Text, View, TouchableOpacity, Platform, TextInput, Switch, useWindowDimensions, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { Image } from 'expo-image';
import MapView, { Marker } from '../../components/maps/MapView';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Location from 'expo-location';
import { apiUrl } from '../../utils/api';

export default function AdminDashboard() {
  const router = useRouter();
  const [authorized, setAuthorized] = useState(false);
  const [tab, setTab] = useState('dashboard'); // dashboard | attendance | settings | notifications

  const [users, setUsers] = useState([]);
  const [attRows, setAttRows] = useState([]);
  const [pings, setPings] = useState([]);
  const [sessions, setSessions] = useState({ loggedIn: [], loggedOut: [], total: 0 });
  const [ctrl, setCtrl] = useState({ pingEnabled: false, intervalMs: 60000 });
  const [attendanceView, setAttendanceView] = useState('users');
  const [userLocations, setUserLocations] = useState({}); // userId -> { lat, lon, timestamp }

  const [from, setFrom] = useState(new Date().toLocaleDateString('en-CA'));
  const [to, setTo] = useState(new Date().toLocaleDateString('en-CA'));
  const [pingsLoading, setPingsLoading] = useState(false);
  const [granularity, setGranularity] = useState('day');
  const [query, setQuery] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [settings, setSettings] = useState({ date: new Date().toLocaleDateString('en-CA'), day: '', startTime: '09:00', endTime: '17:00', classes: [], sections: [], years: [], locationMode: 'college', collegeLocation: { latitude: 12.8005328, longitude: 80.0388091 }, staffLocation: { latitude: 0, longitude: 0 } });
  const [notifications, setNotifications] = useState([]);
  const { width } = useWindowDimensions();
  const isSmall = width < 768;

  // Student history modal state
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyUser, setHistoryUser] = useState(null);
  const [historyFrom, setHistoryFrom] = useState(new Date().toLocaleDateString('en-CA'));
  const [historyTo, setHistoryTo] = useState(new Date().toLocaleDateString('en-CA'));
  const [historyData, setHistoryData] = useState({ records: [], pings: [] });
  const [historyGran, setHistoryGran] = useState('date'); // date | month | year
  const [settingsCache, setSettingsCache] = useState(null);
  const [selectedUserId, setSelectedUserId] = useState(null);
  const [mapRegion, setMapRegion] = useState(null);
  const [mapWebZoom, setMapWebZoom] = useState(9);

  useEffect(() => {
    (async () => {
      try {
        const v = await AsyncStorage.getItem('adminAuth');
        if (v === 'true') {
          setAuthorized(true);
          await Promise.all([loadUsers(), loadAttendance(), loadPings(false), loadNotifications(), loadSessions(), readControl()]);
        } else {
          Alert.alert('Unauthorized', 'Admin access required');
          router.replace('/login');
        }
      } catch {
        router.replace('/home');
      }
    })();
  }, []);

  // Initialize/refresh map region from settings
  useEffect(() => {
    const collegeLat = settings?.collegeLocation?.latitude || 12.8005328;
    const collegeLon = settings?.collegeLocation?.longitude || 80.0388091;
    setMapRegion(prev => ({
      latitude: collegeLat,
      longitude: collegeLon,
      latitudeDelta: prev?.latitudeDelta || 0.02,
      longitudeDelta: prev?.longitudeDelta || 0.02,
    }));
  }, [settings?.collegeLocation?.latitude, settings?.collegeLocation?.longitude]);

  // Auto-refresh pings and attendance when on dashboard tab
  useEffect(() => {
    if (!authorized || tab !== 'dashboard') return;
    const interval = setInterval(() => {
      loadPings(true); // Load today's pings for current locations (for map)
      loadPings(false); // Load all pings for Recent Pings table
      loadUsers();
      loadAttendance();
      loadNotifications();
      loadSessions();
    }, 10000); // Refresh every 10 seconds
    return () => clearInterval(interval);
  }, [authorized, tab]);

  const loadUsers = async () => {
    try {
      let url = apiUrl('/admin/users');
      if (query) url += `?q=${encodeURIComponent(query)}`;
      const res = await fetch(url);
      if (!res.ok) {
        console.error('Failed to load users:', res.status, res.statusText);
        setUsers([]);
        return;
      }
      const data = await res.json();
      setUsers(data || []);
      console.log('Loaded users:', data?.length || 0);
    } catch (err) {
      console.error('Error loading users:', err);
      setUsers([]);
    }
  };

  const loadAttendance = async () => {
    try {
      let url = apiUrl('/admin/attendance');
      const params = new URLSearchParams();
      params.set('from', from);
      params.set('to', to);
      params.set('granularity', granularity);
      if (query) params.set('q', query);
      url += `?${params.toString()}`;
      const res = await fetch(url);
      if (!res.ok) {
        console.error('Failed to load attendance:', res.status, res.statusText);
        setAttRows([]);
        return;
      }
      const data = await res.json();
      setAttRows(data.rows || []);
      console.log('Loaded attendance rows:', data.rows?.length || 0);
    } catch (err) {
      console.error('Error loading attendance:', err);
      setAttRows([]);
    }
  };

  const loadPings = async (useToday = false) => {
    try {
      let url = apiUrl('/admin/pings');
      const params = new URLSearchParams();
      if (useToday) {
        const today = new Date().toLocaleDateString('en-CA');
        params.set('date', today);
      } else {
        params.set('from', from);
        params.set('to', to);
      }
      if (query) params.set('q', query);
      url += `?${params.toString()}`;
      const res = await fetch(url);
      if (!res.ok) {
        console.error('Failed to load pings:', res.status, res.statusText);
        if (!useToday) setPings([]);
        return;
      }
      const data = await res.json();
     
      if (useToday) {
        // For dashboard, only update locations, don't replace all pings
        const locations = {};
        (data || []).forEach(p => {
          if (p.location?.latitude && p.location?.longitude && p.studentId) {
            const userId = String(p.studentId);
            if (!locations[userId] || new Date(p.timestamp) > new Date(locations[userId].timestamp)) {
              locations[userId] = {
                lat: p.location.latitude,
                lon: p.location.longitude,
                timestamp: p.timestamp
              };
            }
          }
        });
        setUserLocations(prev => ({ ...prev, ...locations }));
      } else {
        setPings(data || []);
        // Calculate latest location per user from pings
        const locations = {};
        (data || []).forEach(p => {
          if (p.location?.latitude && p.location?.longitude && p.studentId) {
            const userId = String(p.studentId);
            if (!locations[userId] || new Date(p.timestamp) > new Date(locations[userId].timestamp)) {
              locations[userId] = {
                lat: p.location.latitude,
                lon: p.location.longitude,
                timestamp: p.timestamp
              };
            }
          }
        });
        setUserLocations(locations);
      }
      console.log('Loaded pings:', data?.length || 0, 'useToday:', useToday);
      setPingsLoading(false);
    } catch (err) {
      console.error('Error loading pings:', err);
      if (!useToday) setPings([]);
      setPingsLoading(false);
    }
  };

  const loadSessions = async () => {
    try {
      const res = await fetch(apiUrl('/admin/sessions'));
      if (!res.ok) {
        console.error('Failed to load sessions:', res.status, res.statusText);
        setSessions({ loggedIn: [], loggedOut: [], total: 0 });
        return;
      }
      const data = await res.json();
      setSessions(data || { loggedIn: [], loggedOut: [], total: 0 });
      console.log('Loaded sessions:', data);
    } catch (err) {
      console.error('Error loading sessions:', err);
      setSessions({ loggedIn: [], loggedOut: [], total: 0 });
    }
  };

  const readControl = async () => {
    try {
      const res = await fetch(apiUrl('/admin/ping-control'));
      if (!res.ok) {
        console.error('Failed to load ping control:', res.status, res.statusText);
        return;
      }
      const data = await res.json();
      setCtrl({ pingEnabled: !!data.pingEnabled, intervalMs: data.intervalMs || 60000 });
    } catch (err) {
      console.error('Error loading ping control:', err);
    }
  };

  const toggleControl = async (enabled) => {
    try {
      const res = await fetch(apiUrl('/admin/ping-control'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ enabled, intervalMs: ctrl.intervalMs }) });
      if (!res.ok) {
        console.error('Failed to update ping control:', res.status, res.statusText);
        Alert.alert('Error', 'Failed to update ping control');
        return;
      }
      const data = await res.json();
      setCtrl({ pingEnabled: !!data.pingEnabled, intervalMs: data.intervalMs || ctrl.intervalMs });
    } catch (err) {
      console.error('Error updating ping control:', err);
      Alert.alert('Error', 'Failed to update ping control');
    }
  };

  const readSettings = async () => {
    try {
      const res = await fetch(apiUrl('/admin/settings'));
      if (!res.ok) {
        console.error('Failed to load settings:', res.status, res.statusText);
        return;
      }
      const data = await res.json();
      setSettings(prev => ({ ...prev, ...data }));
      console.log('Loaded settings:', data);
    } catch (err) {
      console.error('Error loading settings:', err);
    }
  };

  const saveSettings = async () => {
    try {
      const res = await fetch(apiUrl('/admin/settings'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(settings) });
      if (!res.ok) {
        console.error('Failed to save settings:', res.status, res.statusText);
        Alert.alert('Error', 'Failed to save settings');
        return;
      }
      Alert.alert('Success', 'Settings saved');
    } catch (err) {
      console.error('Error saving settings:', err);
      Alert.alert('Error', 'Failed to save settings');
    }
  };

  const loadNotifications = async () => {
    try {
      const res = await fetch(apiUrl('/admin/notifications'));
      if (!res.ok) {
        console.error('Failed to load notifications:', res.status, res.statusText);
        setNotifications([]);
        return;
      }
      const data = await res.json();
      setNotifications(data.alerts || []);
      console.log('Loaded notifications:', data.alerts?.length || 0);
    } catch (err) {
      console.error('Error loading notifications:', err);
      setNotifications([]);
    }
  };

  const exportUsers = () => {
    let url = apiUrl('/admin/export/users.csv');
    if (query) url += `?q=${encodeURIComponent(query)}`;
    if (Platform.OS === 'web') {
      window.location.assign(url);
    } else {
      Linking.openURL(url).catch(err => console.error('Failed to open export URL:', err));
    }
  };
  const exportAttendance = () => {
    let url = apiUrl('/admin/export/attendance.csv');
    const params = new URLSearchParams();
    params.set('from', from);
    params.set('to', to);
    if (query) params.set('q', query);
    url += `?${params.toString()}`;
    if (Platform.OS === 'web') {
      window.location.assign(url);
    } else {
      Linking.openURL(url).catch(err => console.error('Failed to open export URL:', err));
    }
  };

  // Real-time overall: percent online out of total users
  const attendancePercent = useMemo(() => {
    const totalUsers = (users||[]).length || 0;
    const onlineUsers = (sessions?.loggedIn?.length || 0);
    return totalUsers ? Math.round((onlineUsers / totalUsers) * 100) : 0;
  }, [users, sessions]);

  // Group helpers for charts
  const onlineUsers = useMemo(() => (users||[]).filter(u => u.loggedIn), [users]);
  const groupOnlineBy = useMemo(() => {
    const by = { class: {}, department: {}, year: {} };
    for (const u of onlineUsers) {
      const cls = u.class || u.className || 'Unknown';
      const dep = (u.department || 'Unknown').toUpperCase();
      const yr = String(u.year || 'NA');
      by.class[cls] = (by.class[cls]||0) + 1;
      by.department[dep] = (by.department[dep]||0) + 1;
      by.year[yr] = (by.year[yr]||0) + 1;
    }
    return by;
  }, [onlineUsers]);

  // Visualization controls
  const [vizType, setVizType] = useState('bar'); // bar | donut | line | pie | histogram | clustered | stacked
  const [vizCategory, setVizCategory] = useState('class'); // users|departments|year|class|overall
  const [searchName, setSearchName] = useState('');
  const [selectedUser, setSelectedUser] = useState(null);

  const usersByReg = useMemo(() => { const m = {}; (users||[]).forEach(u => { if (u?.regNo) m[u.regNo] = u; }); return m; }, [users]);
  const recentPings = useMemo(() => (pings||[]).filter(p => {
    const t = new Date(p.timestamp).getTime();
    return !isNaN(t) && (Date.now() - t) <= 30*60*1000;
  }), [pings]);
  const metrics = useMemo(() => {
    const seenClasses = new Set();
    let biometric = 0;
    for (const p of recentPings) {
      const u = p.regNo && usersByReg[p.regNo];
      const cls = p.class || p.className || u?.class;
      if (cls) seenClasses.add(cls);
      if (p.biometricVerified) biometric += 1;
    }
    return { activeStudents: (sessions?.loggedIn?.length || 0), activeClasses: seenClasses.size, biometric };
  }, [recentPings, usersByReg, sessions]);

  const departmentOptions = useMemo(() => {
    const vals = Array.from(new Set((users||[]).map(u=>u.department).filter(Boolean)));
    return vals.length ? vals : ['CSE','IT','ECE','EEE','MECH','CIVIL'];
  }, [users]);
  const classOptions = useMemo(() => {
    const d = (settings.department || '').toUpperCase();
    if (d) {
      return ['A','B','C','D','E'].map(sec => `${d}-${sec}`);
    }
    const vals = Array.from(new Set((users||[]).map(u=>u.class).filter(Boolean)));
    return vals.length ? vals : ['CSE-A','CSE-B','CSE-C','CSE-D','CSE-E'];
  }, [users, settings.department]);

  // Chart rendering functions
  const palette = ['#14b8a6', '#ef4444', '#fbbf24', '#1f2937', '#8b5cf6', '#22d3ee', '#84cc16', '#fb7185'];
 
  const renderDonutChart = (data, label) => {
    const entries = Object.entries(data);
    if (entries.length === 0) return <Text style={styles.muted}>No data</Text>;
    const total = entries.reduce((s, [, v]) => s + v, 0);
    if (total === 0) return <Text style={styles.muted}>No data</Text>;
   
    const chartSize = 120;
    const maxEntry = Math.max(...entries.map(([, v]) => v));
   
    return (
      <View style={{ alignItems: 'center', gap: 8 }}>
        <View style={{ width: chartSize, height: chartSize, position: 'relative', justifyContent: 'center', alignItems: 'center' }}>
          {/* Donut visualization using circular segments */}
          <View style={{ width: chartSize, height: chartSize, borderRadius: chartSize / 2, backgroundColor: '#e5e7eb', justifyContent: 'center', alignItems: 'center', position: 'relative' }}>
            {entries.map(([name, val], idx) => {
              const percentage = (val / total) * 100;
              const borderWidth = Math.max(8, (val / maxEntry) * 20);
              return (
                <View
                  key={name}
                  style={{
                    position: 'absolute',
                    width: chartSize - (idx * 8),
                    height: chartSize - (idx * 8),
                    borderRadius: (chartSize - (idx * 8)) / 2,
                    borderWidth: borderWidth,
                    borderColor: palette[idx % palette.length],
                    opacity: 0.8,
                  }}
                />
              );
            })}
            <View style={{ width: chartSize * 0.5, height: chartSize * 0.5, borderRadius: chartSize * 0.25, backgroundColor: '#ffffff', justifyContent: 'center', alignItems: 'center', position: 'absolute' }}>
              <Text style={{ fontSize: 18, fontWeight: '800', color: '#0f172a' }}>{total}</Text>
              <Text style={{ fontSize: 10, color: '#64748b' }}>Total</Text>
            </View>
          </View>
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center' }}>
          {entries.map(([name, val], idx) => (
            <View key={name} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: palette[idx % palette.length] }} />
              <Text style={{ fontSize: 11, color: '#0f172a' }}>{name}: {val}</Text>
            </View>
          ))}
        </View>
      </View>
    );
  };

  const renderPieChart = (data) => {
    const entries = Object.entries(data);
    if (entries.length === 0) return <Text style={styles.muted}>No data</Text>;
    const total = entries.reduce((s, [, v]) => s + v, 0);
    if (total === 0) return <Text style={styles.muted}>No data</Text>;
   
    return (
      <View style={{ gap: 8 }}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, justifyContent: 'center' }}>
          {entries.map(([name, val], idx) => {
            const percentage = (val / total) * 100;
            return (
              <View key={name} style={{ alignItems: 'center' }}>
                <View style={{ width: 80, height: 80, borderRadius: 40, backgroundColor: palette[idx % palette.length], opacity: 0.8, justifyContent: 'center', alignItems: 'center' }}>
                  <Text style={{ fontSize: 14, fontWeight: '800', color: '#fff' }}>{Math.round(percentage)}%</Text>
                </View>
                <Text style={{ fontSize: 11, marginTop: 4, color: '#0f172a', textAlign: 'center' }}>{name}</Text>
                <Text style={{ fontSize: 10, color: '#64748b' }}>{val}</Text>
              </View>
            );
          })}
        </View>
      </View>
    );
  };

  const renderClusteredBarChart = (data, allUsers) => {
    const entries = Object.entries(data);
    if (entries.length === 0) return <Text style={styles.muted}>No data</Text>;
    const max = Math.max(1, ...entries.map(([, v]) => v));
    const chartHeight = 200;
   
    // Calculate offline counts
    const offlineData = {};
    entries.forEach(([key]) => {
      const classUsers = (allUsers || []).filter(u => (u.class || u.className) === key);
      offlineData[key] = classUsers.filter(u => !u.loggedIn).length;
    });
    const maxOffline = Math.max(1, ...Object.values(offlineData));
    const maxTotal = Math.max(max, maxOffline);
   
    return (
      <View style={{ gap: 8 }}>
        <View style={{ flexDirection: 'row', gap: 4, alignItems: 'flex-end', height: chartHeight, paddingHorizontal: 8 }}>
          {entries.map(([name, onlineVal], idx) => {
            const offlineVal = offlineData[name] || 0;
            const onlineHeight = (onlineVal / maxTotal) * chartHeight;
            const offlineHeight = (offlineVal / maxTotal) * chartHeight;
            return (
              <View key={name} style={{ flex: 1, alignItems: 'center', gap: 2 }}>
                <View style={{ width: '100%', alignItems: 'center', justifyContent: 'flex-end' }}>
                  <View style={{ width: '80%', flexDirection: 'row', gap: 2, alignItems: 'flex-end' }}>
                    <View style={{ width: '50%', height: onlineHeight, backgroundColor: palette[0], borderRadius: 4, minHeight: 4 }} />
                    <View style={{ width: '50%', height: offlineHeight, backgroundColor: palette[1], borderRadius: 4, minHeight: 4 }} />
                  </View>
                </View>
                <Text style={{ fontSize: 10, color: '#0f172a', marginTop: 4, textAlign: 'center' }} numberOfLines={1}>{name}</Text>
                <Text style={{ fontSize: 9, color: '#64748b' }}>{onlineVal + offlineVal}</Text>
              </View>
            );
          })}
        </View>
        <View style={{ flexDirection: 'row', gap: 12, justifyContent: 'center', marginTop: 8 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <View style={{ width: 12, height: 12, borderRadius: 2, backgroundColor: palette[0] }} />
            <Text style={{ fontSize: 11, color: '#0f172a' }}>Online</Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <View style={{ width: 12, height: 12, borderRadius: 2, backgroundColor: palette[1] }} />
            <Text style={{ fontSize: 11, color: '#0f172a' }}>Offline</Text>
          </View>
        </View>
      </View>
    );
  };

  const renderStackedBarChart = (attRows) => {
    // Group by month
    const byMonth = {};
    (attRows || []).forEach(r => {
      const date = r.date || r.bucket;
      if (!date) return;
      const month = date.substring(0, 7); // YYYY-MM
      if (!byMonth[month]) byMonth[month] = { present: 0, absent: 0 };
      if (r.status === 'present') byMonth[month].present += 1;
      else if (r.status === 'absent') byMonth[month].absent += 1;
      else {
        byMonth[month].present += (r.present || 0);
        byMonth[month].absent += (r.absent || 0);
      }
    });
   
    const entries = Object.entries(byMonth).sort();
    if (entries.length === 0) return <Text style={styles.muted}>No data</Text>;
   
    const max = Math.max(1, ...entries.map(([, v]) => v.present + v.absent));
    const chartHeight = 200;
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
   
    return (
      <View style={{ gap: 8 }}>
        <View style={{ flexDirection: 'row', gap: 4, alignItems: 'flex-end', height: chartHeight, paddingHorizontal: 8 }}>
          {entries.slice(-12).map(([month, data]) => {
            const presentHeight = ((data.present / max) * chartHeight);
            const absentHeight = ((data.absent / max) * chartHeight);
            const monthNum = parseInt(month.split('-')[1]) - 1;
            return (
              <View key={month} style={{ flex: 1, alignItems: 'center' }}>
                <View style={{ width: '100%', height: chartHeight, flexDirection: 'column-reverse', gap: 1 }}>
                  <View style={{ width: '100%', height: presentHeight, backgroundColor: palette[0], borderRadius: 2, minHeight: 2 }} />
                  <View style={{ width: '100%', height: absentHeight, backgroundColor: palette[1], borderRadius: 2, minHeight: 2 }} />
                </View>
                <Text style={{ fontSize: 9, color: '#0f172a', marginTop: 4 }}>{monthNames[monthNum] || month.split('-')[1]}</Text>
              </View>
            );
          })}
        </View>
        <View style={{ flexDirection: 'row', gap: 12, justifyContent: 'center', marginTop: 8 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <View style={{ width: 12, height: 12, borderRadius: 2, backgroundColor: palette[0] }} />
            <Text style={{ fontSize: 11, color: '#0f172a' }}>Present</Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <View style={{ width: 12, height: 12, borderRadius: 2, backgroundColor: palette[1] }} />
            <Text style={{ fontSize: 11, color: '#0f172a' }}>Absent</Text>
          </View>
        </View>
      </View>
    );
  };

  const renderLineChart = (attRows) => {
    // Group by date
    const byDate = {};
    (attRows || []).forEach(r => {
      const date = r.date || r.bucket;
      if (!date) return;
      if (!byDate[date]) byDate[date] = { present: 0, absent: 0 };
      if (r.status === 'present') byDate[date].present += 1;
      else if (r.status === 'absent') byDate[date].absent += 1;
      else {
        byDate[date].present += (r.present || 0);
        byDate[date].absent += (r.absent || 0);
      }
    });
   
    const entries = Object.entries(byDate).sort().slice(-30); // Last 30 days
    if (entries.length === 0) return <Text style={styles.muted}>No data</Text>;
   
    const max = Math.max(1, ...entries.map(([, v]) => v.present + v.absent));
    const chartHeight = 200;
    const chartWidth = entries.length * 8;
   
    return (
      <View style={{ gap: 8 }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={{ width: Math.max(chartWidth, 400), height: chartHeight, position: 'relative', paddingHorizontal: 8 }}>
            {Platform.OS === 'web' ? (
              <View style={{ width: Math.max(chartWidth, 400), height: chartHeight, position: 'relative' }}>
                {/* Grid lines using View components */}
                {[0, 0.25, 0.5, 0.75, 1].map((ratio) => (
                  <View
                    key={ratio}
                    style={{
                      position: 'absolute',
                      left: 0,
                      right: 0,
                      top: chartHeight * ratio,
                      height: 1,
                      backgroundColor: '#e5e7eb',
                    }}
                  />
                ))}
                {/* Line chart using View components for simplicity */}
                <View style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }}>
                  {entries.map(([date, data], idx) => {
                    if (idx === 0) return null;
                    const prevData = entries[idx - 1][1];
                    const x1 = (idx - 1) / (entries.length - 1 || 1) * (Math.max(chartWidth, 400) - 16) + 8;
                    const y1 = chartHeight - ((prevData.present / max) * chartHeight);
                    const x2 = idx / (entries.length - 1 || 1) * (Math.max(chartWidth, 400) - 16) + 8;
                    const y2 = chartHeight - ((data.present / max) * chartHeight);
                    const length = Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2));
                    const angle = Math.atan2(y2 - y1, x2 - x1) * (180 / Math.PI);
                    return (
                      <View
                        key={`present-${idx}`}
                        style={{
                          position: 'absolute',
                          left: x1,
                          top: y1,
                          width: length,
                          height: 2,
                          backgroundColor: palette[0],
                          transform: [{ rotate: `${angle}deg` }],
                          transformOrigin: '0 0',
                        }}
                      />
                    );
                  })}
                </View>
              </View>
            ) : (
              <View style={{ flex: 1, justifyContent: 'space-between' }}>
                {[0, 0.25, 0.5, 0.75, 1].map((ratio) => (
                  <View key={ratio} style={{ height: 1, backgroundColor: '#e5e7eb', width: '100%' }} />
                ))}
              </View>
            )}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: chartHeight + 8 }}>
              {entries.filter((_, idx) => idx % Math.ceil(entries.length / 5) === 0).map(([date]) => (
                <Text key={date} style={{ fontSize: 9, color: '#64748b' }}>{date.split('-')[2]}</Text>
              ))}
            </View>
          </View>
        </ScrollView>
        <View style={{ flexDirection: 'row', gap: 12, justifyContent: 'center' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <View style={{ width: 12, height: 2, backgroundColor: palette[0] }} />
            <Text style={{ fontSize: 11, color: '#0f172a' }}>Present</Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <View style={{ width: 12, height: 2, backgroundColor: palette[1] }} />
            <Text style={{ fontSize: 11, color: '#0f172a' }}>Absent</Text>
          </View>
        </View>
      </View>
    );
  };

  const renderHistogram = (attRows) => {
    // Create bins for attendance percentage
    const bins = [0, 20, 40, 60, 80, 100];
    const binCounts = new Array(bins.length - 1).fill(0);
   
    // Group by student
    const byStudent = {};
    (attRows || []).forEach(r => {
      const sid = r.studentId;
      if (!byStudent[sid]) byStudent[sid] = { present: 0, total: 0 };
      if (r.status === 'present') byStudent[sid].present += 1;
      byStudent[sid].total += 1;
    });
   
    Object.values(byStudent).forEach(student => {
      if (student.total === 0) return;
      const percentage = (student.present / student.total) * 100;
      for (let i = 0; i < bins.length - 1; i++) {
        if (percentage >= bins[i] && percentage < bins[i + 1]) {
          binCounts[i]++;
          break;
        }
      }
    });
   
    const max = Math.max(1, ...binCounts);
    const chartHeight = 150;
   
    return (
      <View style={{ gap: 8 }}>
        <View style={{ flexDirection: 'row', gap: 4, alignItems: 'flex-end', height: chartHeight }}>
          {binCounts.map((count, idx) => (
            <View key={idx} style={{ flex: 1, alignItems: 'center' }}>
              <View style={{ width: '90%', height: (count / max) * chartHeight, backgroundColor: palette[idx % palette.length], borderRadius: 4, minHeight: 4 }} />
              <Text style={{ fontSize: 9, color: '#0f172a', marginTop: 4 }}>{bins[idx]}-{bins[idx + 1]}%</Text>
              <Text style={{ fontSize: 10, fontWeight: '700', color: '#0f172a' }}>{count}</Text>
            </View>
          ))}
        </View>
      </View>
    );
  };

  const renderHorizontalBarChart = (data) => {
    const entries = Object.entries(data).sort((a, b) => b[1] - a[1]);
    if (entries.length === 0) return <Text style={styles.muted}>No data</Text>;
    const max = Math.max(1, ...entries.map(([, v]) => v));
   
    return (
      <View style={{ gap: 8 }}>
        {entries.map(([name, val], idx) => (
          <View key={name} style={{ gap: 4 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={{ fontSize: 12, color: '#0f172a', flex: 1 }} numberOfLines={1}>{name}</Text>
              <Text style={{ fontSize: 12, fontWeight: '700', color: '#0f172a', marginLeft: 8 }}>{val}</Text>
            </View>
            <View style={styles.chartBar}>
              <View style={[styles.chartSegment, { width: `${Math.round((val / max) * 100)}%`, backgroundColor: palette[idx % palette.length] }]} />
            </View>
          </View>
        ))}
      </View>
    );
  };

  const exportDashboardData = () => {
    if (Platform.OS !== 'web') return;
   
    const data = {
      overallAttendance: attendancePercent,
      totalStudents: users?.length || 0,
      onlineNow: metrics.activeStudents,
      biometricPings: metrics.biometric,
      byClass: groupOnlineBy.class,
      byDepartment: groupOnlineBy.department,
      byYear: groupOnlineBy.year,
      attendanceRows: attRows.slice(0, 1000), // Limit to prevent huge files
    };
   
    const csv = [
      ['Metric', 'Value'].join(','),
      ['Overall Attendance %', attendancePercent].join(','),
      ['Total Students', users?.length || 0].join(','),
      ['Online Now', metrics.activeStudents].join(','),
      ['Biometric Pings', metrics.biometric].join(','),
      [''],
      ['Class', 'Online Count'].join(','),
      ...Object.entries(groupOnlineBy.class).map(([k, v]) => [k, v].join(',')),
      [''],
      ['Department', 'Online Count'].join(','),
      ...Object.entries(groupOnlineBy.department).map(([k, v]) => [k, v].join(',')),
      [''],
      ['Year', 'Online Count'].join(','),
      ...Object.entries(groupOnlineBy.year).map(([k, v]) => [k, v].join(',')),
    ].join('\n');
   
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `dashboard_export_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  if (!authorized) {
    return <View style={[styles.fill, styles.bg]}><Text style={{ color: '#1f2937' }}>Checking admin access…</Text></View>;
  }

  const NavItem = ({ active, label, onPress, big=false }) => (
    <TouchableOpacity onPress={onPress} style={[styles.navTab, big && styles.navTabBig]}>
      <Text style={[styles.navTabText, active && styles.navTabTextActive]}>{label}</Text>
      <View style={[styles.navUnderline, active && styles.navUnderlineActive]} />
    </TouchableOpacity>
  );

  const Panel = ({ style, children }) => (
    <BlurView intensity={Platform.OS==='web' ? 0 : 40} tint="light" style={[styles.card, style]}>{children}</BlurView>
  );

  const TableContainer = ({ children, minWidth = 820 }) => {
    if (Platform.OS === 'web' && !isSmall) {
      return <View style={styles.table}>{children}</View>;
    }
    return (
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View style={[styles.table, { minWidth }]}>{children}</View>
      </ScrollView>
    );
  };

  return (
    <SafeAreaView style={[styles.fill, styles.bg]}>
      {/* Top nav */}
      <View style={styles.topBar}>
        <Text style={styles.brand}>Admin Dashboard</Text>
        {Platform.OS === 'web' ? (
          <View style={[styles.navRow, isSmall && styles.navRowSmall]}>
            <NavItem big={isSmall} active={tab==='dashboard'} label="Dashboard" onPress={() => { setTab('dashboard'); loadPings(true); loadNotifications(); }} />
            <NavItem active={tab==='settings'} label="Settings" onPress={() => { setTab('settings'); readSettings(); }} />
            <NavItem active={tab==='attendance'} label="Attendance" onPress={() => { setTab('attendance'); loadAttendance(); }} />
            <NavItem active={tab==='notifications'} label="Notifications" onPress={() => { setTab('notifications'); loadNotifications(); }} />
            <TouchableOpacity onPress={async () => { await AsyncStorage.removeItem('adminAuth'); router.replace('/home'); }} style={styles.logout}>
              <Ionicons name="log-out-outline" size={18} color="#0f766e" />
              <Text style={styles.navTabText}>Logout</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.navRowMobile}>
            <NavItem active={tab==='dashboard'} label="Dashboard" onPress={() => { setTab('dashboard'); loadPings(true); loadNotifications(); }} />
            <NavItem active={tab==='settings'} label="Settings" onPress={() => { setTab('settings'); readSettings(); }} />
            <NavItem active={tab==='attendance'} label="Attendance" onPress={() => { setTab('attendance'); loadAttendance(); }} />
            <NavItem active={tab==='notifications'} label="Notifications" onPress={() => { setTab('notifications'); loadNotifications(); }} />
            <TouchableOpacity onPress={async () => { await AsyncStorage.removeItem('adminAuth'); router.replace('/home'); }} style={styles.logout}>
              <Ionicons name="log-out-outline" size={18} color="#0f766e" />
              <Text style={styles.navTabText}>Logout</Text>
            </TouchableOpacity>
          </ScrollView>
        )}
      </View>

      <ScrollView contentContainerStyle={styles.page}>
        <Panel style={styles.contentBox}>
        {tab === 'dashboard' && (
          <View style={styles.grid}>
            {/* Left: Attendance Setup */}

            {/* Center: Analytics Overview (charts instead of map) */}
            <Panel style={styles.centerCol}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <Text style={styles.panelTitle}>Attendance Analytics Overview</Text>
                {Platform.OS === 'web' && (
                  <TouchableOpacity onPress={exportDashboardData} style={styles.exportButton}>
                    <Ionicons name="download-outline" size={16} color="#fff" />
                    <Text style={styles.exportButtonText}>Export Dashboard</Text>
                  </TouchableOpacity>
                )}
              </View>
              <View style={styles.metricsRow}>
                <View style={styles.metricChip}><Text style={styles.metricNum}>{attendancePercent}%</Text><Text style={styles.metricLabel}>Overall Attendance</Text></View>
                <View style={styles.metricChip}><Text style={styles.metricNum}>{users?.length||0}</Text><Text style={styles.metricLabel}>Total Students</Text></View>
                <View style={styles.metricChip}><Text style={styles.metricNum}>{metrics.activeStudents}</Text><Text style={styles.metricLabel}>Online Now</Text></View>
                <View style={styles.metricChip}><Text style={styles.metricNum}>{metrics.biometric}</Text><Text style={styles.metricLabel}>Biometric Pings</Text></View>
              </View>
              <View style={{ gap: 16 }}>
                {/* First Row: KPI Cards and Donut Chart */}
                <View style={{ flexDirection:'row', gap:12, flexWrap:'wrap' }}>
                  {/* Overall Attendance KPI */}
                  <View style={[styles.chartCard, { flex:1, minWidth:200 }]}>
                    <Text style={styles.chartTitle}>Overall Attendance</Text>
                    <View style={[styles.gaugeCircle, { borderColor: attendancePercent>=75?'#10b981':(attendancePercent>=50?'#f59e0b':'#ef4444') }]}>
                      <Text style={styles.gaugeText}>{attendancePercent}%</Text>
                    </View>
                    <Text style={styles.muted}>{(sessions?.loggedIn?.length||0)} / {(users||[]).length} users</Text>
                  </View>

                  {/* Attendance by Region - Donut Chart */}
                  <View style={[styles.chartCard, { flex:1, minWidth:250 }]}>
                    <Text style={styles.chartTitle}>Attendance by Department</Text>
                    {renderDonutChart(groupOnlineBy.department, 'department')}
                  </View>

                  {/* Attendance by Year - Pie Chart */}
                  <View style={[styles.chartCard, { flex:1, minWidth:250 }]}>
                    <Text style={styles.chartTitle}>Attendance by Year</Text>
                    {renderPieChart(groupOnlineBy.year)}
                  </View>
                </View>

                {/* Second Row: Clustered and Stacked Charts */}
                <View style={{ flexDirection:'row', gap:12, flexWrap:'wrap' }}>
                  {/* Online by Class - Clustered Bar Chart */}
                  <View style={[styles.chartCard, { flex:2, minWidth:400 }]}>
                    <Text style={styles.chartTitle}>Online Count by Class, Status</Text>
                    {renderClusteredBarChart(groupOnlineBy.class, users)}
                  </View>

                  {/* Attendance by Month - Stacked Column Chart */}
                  <View style={[styles.chartCard, { flex:2, minWidth:400 }]}>
                    <Text style={styles.chartTitle}>Attendance by Month, Status</Text>
                    {renderStackedBarChart(attRows)}
                  </View>
                </View>

                {/* Third Row: Line Chart and Histogram */}
                <View style={{ flexDirection:'row', gap:12, flexWrap:'wrap' }}>
                  {/* Attendance Trend - Line Chart */}
                  <View style={[styles.chartCard, { flex:2, minWidth:400 }]}>
                    <Text style={styles.chartTitle}>Attendance Trend Over Time</Text>
                    {renderLineChart(attRows)}
                  </View>

                  {/* Attendance Distribution - Histogram */}
                  <View style={[styles.chartCard, { flex:1, minWidth:300 }]}>
                    <Text style={styles.chartTitle}>Attendance Distribution</Text>
                    {renderHistogram(attRows)}
                  </View>
                </View>

                {/* Fourth Row: Horizontal Bar Charts */}
                <View style={{ flexDirection:'row', gap:12, flexWrap:'wrap' }}>
                  {/* Attendance by Class - Horizontal Bar */}
                  <View style={[styles.chartCard, { flex:2, minWidth:400 }]}>
                    <Text style={styles.chartTitle}>Attendance by Class</Text>
                    {renderHorizontalBarChart(groupOnlineBy.class)}
                  </View>

                  {/* Attendance by Department - Horizontal Bar */}
                  <View style={[styles.chartCard, { flex:1, minWidth:300 }]}>
                    <Text style={styles.chartTitle}>Attendance by Department</Text>
                    {renderHorizontalBarChart(groupOnlineBy.department)}
                  </View>
                </View>
              </View>
            </Panel>

            {/* Right: Notifications */}
            <Panel style={styles.rightCol}>
              <Text style={styles.panelTitle}>Notification Panel</Text>
              <View style={{ gap: 10 }}>
                {notifications.slice(0,6).map((n,i)=> (
                  <View key={i} style={styles.noticeItem}>
                    <Text style={styles.noticeTime}>{new Date(n.at||Date.now()).toLocaleTimeString()}</Text>
                    <Text style={styles.noticeMsg}>{n.message}</Text>
                  </View>
                ))}
                {notifications.length===0 && <Text style={styles.muted}>No notifications</Text>}
              </View>
            </Panel>

            {/* Full-width: Student roster and analytics */}
            <Panel style={styles.fullRow}>
              <Text style={styles.panelTitle}>Student Roster</Text>
              <TableContainer minWidth={700}>
                <View style={styles.tableHeader}>
                  <Text style={[styles.th,{flex:2}]}>Name</Text>
                  <Text style={[styles.th,{flex:1.2}]}>Reg No</Text>
                  <Text style={[styles.th,{flex:1}]}>Status</Text>
                  <Text style={[styles.th,{flex:1}]}>Biometric</Text>
                  <Text style={[styles.th,{flex:1}]}>Tracking</Text>
                </View>
                {users.length === 0 ? (
                  <View style={{ padding: 20, alignItems: 'center' }}>
                    <Text style={[styles.td, { color: '#64748b' }]}>No students found</Text>
                  </View>
                ) : (
                  users.slice(0,12).map((u,i)=> {
                  // Get latest ping location for this user
                  const userPings = (pings||[]).filter(p => String(p.studentId) === String(u._id));
                  const latestPing = userPings.sort((a,b) => new Date(b.timestamp) - new Date(a.timestamp))[0];
                 
                  let locationText = '—';
                  let lat = null;
                  let lon = null;
                  if (latestPing?.location?.latitude && latestPing?.location?.longitude) {
                    lat = latestPing.location.latitude;
                    lon = latestPing.location.longitude;
                  } else if (u.location?.latitude && u.location?.longitude) {
                    // Fallback to user's stored location
                    lat = u.location.latitude;
                    lon = u.location.longitude;
                  }
                 
                  if (lat && lon) {
                    locationText = u.loggedIn
                      ? `Current: ${lat.toFixed(4)}, ${lon.toFixed(4)}`
                      : `Last: ${lat.toFixed(4)}, ${lon.toFixed(4)}`;
                  }
                 
                  const openGoogleMaps = () => {
                    if (lat && lon) {
                      const url = Platform.OS === 'ios'
                        ? `maps://maps.apple.com/?q=${lat},${lon}`
                        : `https://www.google.com/maps/search/?api=1&query=${lat},${lon}`;
                      Linking.openURL(url).catch(err => console.error('Failed to open maps:', err));
                    }
                  };
                 
                  return (
                    <View key={u._id||i} style={styles.tableRow}>
                      <Text style={[styles.td,{flex:2}]}>{u.name}</Text>
                      <Text style={[styles.td,{flex:1.2}]}>{u.regNo}</Text>
                      <Text style={[styles.td,{flex:1}]}>{u.loggedIn? 'Online' : 'Offline'}</Text>
                      <Text style={[styles.td,{flex:1}]}>{u.biometricEnrolled? '✓' : '—'}</Text>
                      {lat && lon ? (
                        <TouchableOpacity onPress={openGoogleMaps} style={{ flex: 1 }}>
                          <Text style={[styles.td,{ fontSize: 11, color: '#2563eb', textDecorationLine: 'underline' }]}>{locationText}</Text>
                        </TouchableOpacity>
                      ) : (
                        <Text style={[styles.td,{flex:1, fontSize: 11 }]}>{locationText}</Text>
                      )}
                    </View>
                  );
                  })
                )}
              </TableContainer>

            </Panel>

            {/* Pings table */}
            <Panel style={styles.fullRow}>
              <View style={{flexDirection:'row', justifyContent:'space-between', alignItems:'center'}}>
                <Text style={styles.panelTitle}>Recent Pings</Text>
                <TouchableOpacity onPress={() => loadPings(false)}><Text style={styles.link}>Refresh</Text></TouchableOpacity>
              </View>
              <TableContainer>
                <View style={styles.tableHeader}>
                  <Text style={[styles.th, { flex: 2 }]}>Time</Text>
                  <Text style={[styles.th, { flex: 2 }]}>Student</Text>
                  <Text style={[styles.th, { flex: 1 }]}>Period</Text>
                  <Text style={[styles.th, { flex: 1 }]}>Status</Text>
                  <Text style={[styles.th, { flex: 0.6, textAlign:'right' }]}></Text>
                </View>
                {pings.length === 0 ? (
                  <View style={{ padding: 20, alignItems: 'center' }}>
                    <Text style={[styles.td, { color: '#64748b' }]}>No pings found</Text>
                  </View>
                ) : (
                  pings.slice(0,20).map((p,i)=> (
                  <View key={i} style={[styles.tableRow, { alignItems:'center' }]}>
                    <Text style={[styles.td,{flex:2}]}>{new Date(p.timestamp).toLocaleString()}</Text>
                    <Text style={[styles.td,{flex:2}]}>{p.studentName||''} ({p.regNo||''})</Text>
                    <Text style={[styles.td,{flex:1}]}>{p.periodNumber||''}</Text>
                    <Text style={[styles.td,{flex:1}]}>{p.biometricVerified? 'verified' : (p.timestampType||'')}</Text>
                    <View style={{ flex:0.6, alignItems:'flex-end' }}>
                      <TouchableOpacity onPress={async()=>{
                        try {
                          await fetch(apiUrl(`/admin/ping/${encodeURIComponent(p._id)}`), { method: 'DELETE' });
                          await loadPings(false);
                          await loadAttendance();
                        } catch {}
                      }} style={[styles.secondaryBtn,{backgroundColor:'rgba(239,68,68,0.2)', paddingVertical:4,paddingHorizontal:8}]}>
                        <Text style={[styles.secondaryBtnText,{color:'#ef4444'}]}>Delete</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                  ))
                )}
              </TableContainer>
            </Panel>
          </View>
        )}

        {tab === 'attendance' && (
          <View style={{ width: '100%', gap: 16 }}>
            {/* Inline filters for Attendance */}
            <Panel>
              <View style={{ gap: 8 }}>
                <View style={styles.segmentRow}>
                  {Platform.OS==='web' ? (
                    <input
                      value={query}
                      onChange={e=>setQuery(e.target.value)}
                      placeholder="Search by name/reg no/username"
                      style={styles.webInput}
                    />
                  ) : (
                    <TextInput value={query} onChangeText={setQuery} placeholder="Search" style={styles.input} />
                  )}
                  {Platform.OS==='web' ? (
                    <select value={granularity} onChange={e=>setGranularity(e.target.value)} style={styles.webInput}>
                      <option value="day">Day</option>
                      <option value="week">Week</option>
                      <option value="month">Month</option>
                      <option value="year">Year</option>
                    </select>
                  ) : (
                    <TextInput value={granularity} onChangeText={setGranularity} placeholder="day/week/month" style={styles.input} />
                  )}
                </View>
                <View style={styles.segmentRow}>
                  {Platform.OS==='web' ? (
                    <input type="date" value={from} onChange={e=>setFrom(e.target.value)} style={styles.webInput} />
                  ) : (
                    <TextInput value={from} onChangeText={setFrom} placeholder="From (YYYY-MM-DD)" style={styles.input} />
                  )}
                  {Platform.OS==='web' ? (
                    <input type="date" value={to} onChange={e=>setTo(e.target.value)} style={styles.webInput} />
                  ) : (
                    <TextInput value={to} onChangeText={setTo} placeholder="To (YYYY-MM-DD)" style={styles.input} />
                  )}
                  <TouchableOpacity onPress={()=>{ if (attendanceView==='attendance') loadAttendance(); else loadUsers(); }} style={styles.primaryBtn}>
                    <Text style={styles.primaryBtnText}>Apply</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </Panel>

            <View style={styles.segmentRow}>
              <TouchableOpacity onPress={()=>setAttendanceView('users')} style={[styles.segmentBtn, attendanceView==='users' && styles.segmentActive]}>
                <Text style={styles.segmentLabel}>Users</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={()=>setAttendanceView('attendance')} style={[styles.segmentBtn, attendanceView==='attendance' && styles.segmentActive]}>
                <Text style={styles.segmentLabel}>Attendance</Text>
              </TouchableOpacity>
            </View>

            {attendanceView==='users' ? (
              <Panel>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
                  <Text style={styles.panelTitle}>Users</Text>
                  <TouchableOpacity onPress={exportUsers}><Text style={styles.link}>Export CSV</Text></TouchableOpacity>
                </View>
                <TableContainer>
                  <View style={styles.tableHeader}>
                    <Text style={[styles.th, { flex: 2 }]}>Name</Text>
                    <Text style={[styles.th, { flex: 1.5 }]}>Reg No</Text>
                    <Text style={[styles.th, { flex: 1 }]}>Class</Text>
                    <Text style={[styles.th, { flex: 0.8 }]}>Year</Text>
                    <Text style={[styles.th, { flex: 2.5 }]}>Email</Text>
                    <Text style={[styles.th, { flex: 1.5 }]}>Username</Text>
                  </View>
                  {users.length === 0 ? (
                    <View style={{ padding: 20, alignItems: 'center' }}>
                      <Text style={[styles.td, { color: '#64748b' }]}>No users found</Text>
                    </View>
                  ) : (
                    users.map((u, i) => (
                    <View key={u._id || i} style={[styles.tableRow, { alignItems:'center' }]}>
                      <TouchableOpacity style={{ flex: 2 }} onPress={async ()=>{
                        setHistoryUser(u);
                        setHistoryOpen(true);
                        try {
                          const s = await fetch(apiUrl('/admin/settings')).then(r=>r.json());
                          setSettingsCache(s);
                        } catch {}
                        try {
                          const params = new URLSearchParams({ from: historyFrom, to: historyTo });
                          const res = await fetch(apiUrl(`/admin/student/${encodeURIComponent(u._id)}/history?${params}`));
                          const detail = await res.json();
                          setHistoryData(detail || { records: [], pings: [] });
                        } catch {}
                      }}>
                        <Text style={[styles.td, { color:'#2563eb', textDecorationLine:'underline' }]}>{u.name}</Text>
                      </TouchableOpacity>
                      <Text style={[styles.td, { flex: 1.5 }]}>{u.regNo}</Text>
                      <Text style={[styles.td, { flex: 1 }]}>{u.class}</Text>
                      <Text style={[styles.td, { flex: 0.8 }]}>{u.year}</Text>
                      <Text style={[styles.td, { flex: 2.5 }]}>{u.email}</Text>
                      <Text style={[styles.td, { flex: 1.5 }]}>{u.username}</Text>
                      <View style={{ flexDirection:'row', gap:8, marginLeft: 8 }}>
                        <TouchableOpacity onPress={async()=>{
                          try {
                            const newClass = Platform.OS==='web' ? window.prompt('Class', u.class||'') : u.class;
                            const newYearStr = Platform.OS==='web' ? window.prompt('Year (1-4)', String(u.year||'')) : String(u.year||'');
                            if (Platform.OS==='web') {
                              await fetch(apiUrl('/admin/user'), { method:'PATCH', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ _id: u._id, class: newClass, year: Number(newYearStr||u.year) }) });
                              await loadUsers();
                            }
                          } catch {}
                        }} style={[styles.secondaryBtn,{paddingVertical:4,paddingHorizontal:8}]}>
                          <Text style={styles.secondaryBtnText}>Edit</Text>
                        </TouchableOpacity>
                        <TouchableOpacity onPress={async()=>{
                          try {
                            if (Platform.OS==='web' && !window.confirm('Delete user?')) return;
                            await fetch(apiUrl(`/admin/user/${encodeURIComponent(u._id)}`), { method:'DELETE' });
                            await loadUsers();
                          } catch {}
                        }} style={[styles.secondaryBtn,{backgroundColor:'rgba(239,68,68,0.2)', paddingVertical:4,paddingHorizontal:8}]}>
                          <Text style={[styles.secondaryBtnText,{color:'#ef4444'}]}>Delete</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                    ))
                  )}
                </TableContainer>
              </Panel>
            ) : (
              <Panel>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
                  <Text style={styles.panelTitle}>Attendance</Text>
                  <TouchableOpacity onPress={exportAttendance}><Text style={styles.link}>Export CSV</Text></TouchableOpacity>
                </View>
                <TableContainer>
                  <View style={styles.tableHeader}>
                    <Text style={[styles.th, { flex: 1.5 }]}>{granularity==='day' ? 'Date' : 'Bucket'}</Text>
                    <Text style={[styles.th, { flex: 2 }]}>Name</Text>
                    <Text style={[styles.th, { flex: 1.5 }]}>Reg No</Text>
                    <Text style={[styles.th, { flex: 2 }]}>Details</Text>
                  </View>
                  {attRows.length === 0 ? (
                    <View style={{ padding: 20, alignItems: 'center' }}>
                      <Text style={[styles.td, { color: '#64748b' }]}>No attendance records found</Text>
                    </View>
                  ) : (
                    attRows.map((r, i) => (
                    <View key={i} style={styles.tableRow}>
                      <Text style={[styles.td, { flex: 1.5 }]}>{r.date || r.bucket}</Text>
                      <TouchableOpacity style={{ flex: 2 }} onPress={async () => {
                        try {
                          const params = new URLSearchParams({ from: from, to: to });
                          const res = await fetch(apiUrl(`/admin/student/${encodeURIComponent(r.studentId)}/history?${params}`));
                          const detail = await res.json();
                          alert(JSON.stringify(detail, null, 2));
                        } catch {}
                      }}>
                        <Text style={[styles.td, { color:'#0b0e14ff', textDecorationLine:'underline' }]}>{r.studentName}</Text>
                      </TouchableOpacity>
                      <Text style={[styles.td, { flex: 1.5 }]}>{r.regNo}</Text>
                      {r.periodNumber != null ? (
                        <Text style={[styles.td, { flex: 2 }]}>P{r.periodNumber} - {r.status}</Text>
                      ) : (
                        <Text style={[styles.td, { flex: 2 }]}>Present: {r.present} | Absent: {r.absent}</Text>
                      )}
                      {r.periodNumber != null && (
                        <View style={{ flexDirection:'row', gap:8, marginLeft: 8 }}>
                          <TouchableOpacity onPress={async()=>{
                            try {
                              await fetch(apiUrl('/admin/attendance'), { method:'PATCH', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ studentId: r.studentId, date: r.date, periodNumber: r.periodNumber, status: r.status === 'present' ? 'absent' : 'present' }) });
                              await loadAttendance();
                            } catch {}
                          }} style={[styles.secondaryBtn,{paddingVertical:4,paddingHorizontal:8}]}>
                            <Text style={styles.secondaryBtnText}>Toggle</Text>
                          </TouchableOpacity>
                          <TouchableOpacity onPress={async()=>{
                            try {
                              const qs = new URLSearchParams({ studentId: r.studentId, date: r.date, periodNumber: String(r.periodNumber) });
                              await fetch(apiUrl(`/admin/attendance?${qs}`), { method:'DELETE' });
                              await loadAttendance();
                            } catch {}
                          }} style={[styles.secondaryBtn,{backgroundColor:'rgba(239,68,68,0.2)', paddingVertical:4,paddingHorizontal:8}]}>
                            <Text style={[styles.secondaryBtnText,{color:'#ef4444'}]}>Delete</Text>
                          </TouchableOpacity>
                        </View>
                      )}
                    </View>
                    ))
                  )}
                </TableContainer>
              </Panel>
            )}
          </View>
        )}

        {tab === 'settings' && (
          <View style={{ width: '100%', gap: 16 }}>
            <Panel>
              <Text style={styles.panelTitle}>Attendance Settings</Text>
              <View style={{ gap: 12 }}>
                <Text style={styles.muted}>Date</Text>
                {Platform.OS==='web' ? (
                  <input type="date" value={settings.date||''} onChange={e=>setSettings({ ...settings, date: e.target.value })} style={styles.webInput} />
                ) : (
                  <TextInput value={settings.date} onChangeText={t=>setSettings({...settings, date:t})} style={styles.input} placeholder="YYYY-MM-DD" />
                )}

                <Text style={styles.muted}>Day</Text>
                <View style={styles.segmentRow}>
                  {['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(d => (
                    <TouchableOpacity key={d} onPress={()=>setSettings({...settings, day:d})} style={[styles.segmentBtn, settings.day===d && styles.segmentActive]}>
                      <Text style={styles.segmentLabel}>{d}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <Text style={styles.muted}>Department</Text>
                {Platform.OS==='web' ? (
                  <input value={settings.department||''} onChange={e=>setSettings({ ...settings, department: e.target.value })} style={styles.webInput} placeholder="Department" />
                ) : (
                  <TextInput value={settings.department||''} onChangeText={t=>setSettings({...settings, department:t})} style={styles.input} placeholder="Department" />
                )}

                <Text style={styles.muted}>Class</Text>
                {Platform.OS==='web' ? (
                  <input value={settings.class||''} onChange={e=>setSettings({ ...settings, class: e.target.value })} style={styles.webInput} placeholder="e.g., CSE-A" />
                ) : (
                  <TextInput value={settings.class||''} onChangeText={t=>setSettings({...settings, class:t})} style={styles.input} placeholder="e.g., CSE-A" />
                )}

                <Text style={styles.muted}>Year</Text>
                {Platform.OS==='web' ? (
                  <select value={String(settings.year||'')} onChange={e=>setSettings({ ...settings, year: Number(e.target.value) })} style={styles.webInput}>
                    {[1,2,3,4].map(y=> <option key={y} value={y}>{y}</option>)}
                  </select>
                ) : (
                  <TextInput value={String(settings.year||'')} onChangeText={t=>setSettings({...settings, year: Number(t||0)})} style={styles.input} placeholder="1-4" />
                )}

                <Text style={styles.muted}>Location Options</Text>
                <View style={{ gap: 12 }}>
                  <View style={styles.rowBetween}>
                    <Text style={styles.muted}>Use College Location</Text>
                    <TouchableOpacity onPress={()=>setSettings({ ...settings, useCollegeLocation: !settings.useCollegeLocation })} style={[styles.segmentBtn, settings.useCollegeLocation && styles.segmentActive]}>
                      <Text style={styles.segmentLabel}>{settings.useCollegeLocation ? 'On' : 'Off'}</Text>
                    </TouchableOpacity>
                  </View>

                  <Text style={styles.muted}>College Polygon (up to 4 lines: lat,lon)</Text>
                  {Platform.OS==='web' ? (
                    <textarea rows={4} value={(settings.collegePolygon||[]).map(p=>`${p.latitude||''},${p.longitude||''}`).join('\n')} onChange={e=>{
                      const lines = e.target.value.split(/\n+/).map(s=>s.trim()).filter(Boolean).slice(0,4);
                      const pts = lines.map(l=>{ const [a,b]=l.split(','); return { latitude: Number(a), longitude: Number(b) }; });
                      setSettings({ ...settings, collegePolygon: pts });
                    }} style={{ ...styles.webInput, minHeight: 100 }} />
                  ) : (
                    <TextInput multiline value={(settings.collegePolygon||[]).map(p=>`${p.latitude||''},${p.longitude||''}`).join('\n')} onChangeText={t=>{
                      const lines = t.split(/\n+/).map(s=>s.trim()).filter(Boolean).slice(0,4);
                      const pts = lines.map(l=>{ const [a,b]=l.split(','); return { latitude: Number(a), longitude: Number(b) }; });
                      setSettings({ ...settings, collegePolygon: pts });
                    }} style={styles.input} placeholder={'lat,lon\nlat,lon\n...'} />
                  )}

                  <Text style={styles.muted}>Additional Live Locations (one per line: username,lat,lon,radius)</Text>
                  {Platform.OS==='web' ? (
                    <textarea rows={4} value={(settings.proximityAnchors||[]).map(a=>`${a.username||''},${a.location?.latitude||''},${a.location?.longitude||''},${a.radiusMeters||100}`).join('\n')} onChange={e=>{
                      const anchors = e.target.value.split(/\n+/).map(s=>s.trim()).filter(Boolean).map(l=>{ const [u,la,lo,r]=l.split(','); return { username: u||'', location: { latitude: Number(la), longitude: Number(lo) }, radiusMeters: Number(r||100) }; });
                      setSettings({ ...settings, proximityAnchors: anchors });
                    }} style={{ ...styles.webInput, minHeight: 100 }} />
                  ) : (
                    <TextInput multiline value={(settings.proximityAnchors||[]).map(a=>`${a.username||''},${a.location?.latitude||''},${a.location?.longitude||''},${a.radiusMeters||100}`).join('\n')} onChangeText={t=>{
                      const anchors = t.split(/\n+/).map(s=>s.trim()).filter(Boolean).map(l=>{ const [u,la,lo,r]=l.split(','); return { username: u||'', location: { latitude: Number(la), longitude: Number(lo) }, radiusMeters: Number(r||100) }; });
                      setSettings({ ...settings, proximityAnchors: anchors });
                    }} style={styles.input} placeholder={'user1,lat,lon,100\nuser2,lat,lon,200'} />
                  )}

                  <Text style={styles.muted}>Single Live Anchor (optional)</Text>
                  {Platform.OS==='web' ? (
                    <input value={`${settings.proximityLocation?.latitude||''},${settings.proximityLocation?.longitude||''}`} onChange={e=>{ const [lat,lon]=e.target.value.split(','); setSettings({ ...settings, proximityLocation: { latitude: Number(lat), longitude: Number(lon) } }); }} style={styles.webInput} />
                  ) : (
                    <TextInput value={`${settings.proximityLocation?.latitude||''},${settings.proximityLocation?.longitude||''}`} onChangeText={t=>{ const [lat,lon]=t.split(','); setSettings({ ...settings, proximityLocation: { latitude: Number(lat), longitude: Number(lon) } }); }} style={styles.input} placeholder="lat,lon" />
                  )}
                  <TouchableOpacity onPress={async()=>{
                    try {
                      const { status } = await Location.requestForegroundPermissionsAsync();
                      if (status === 'granted') {
                        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
                        setSettings({ ...settings, proximityLocation: { latitude: loc.coords.latitude, longitude: loc.coords.longitude }, proximityRadiusMeters: settings.proximityRadiusMeters || 100 });
                      }
                    } catch {}
                  }} style={styles.secondaryBtn}><Text style={styles.secondaryBtnText}>Use My Current Location</Text></TouchableOpacity>
                  <View style={styles.segmentRow}>
                    {[100,200].map(r => (
                      Platform.OS==='web' ? (
                        <button key={r} onClick={()=>setSettings({ ...settings, proximityRadiusMeters: r })} style={{ padding: 8, borderRadius: 8, border: '1px solid #ccfbf1', background: (settings.proximityRadiusMeters||100)===r ? '#99f6e4' : 'transparent' }}>{r} m</button>
                      ) : (
                        <TouchableOpacity key={r} onPress={()=>setSettings({ ...settings, proximityRadiusMeters: r })} style={[styles.segmentBtn, (settings.proximityRadiusMeters||100)===r && styles.segmentActive]}>
                          <Text style={styles.segmentLabel}>{r} m</Text>
                        </TouchableOpacity>
                      )
                    ))}
                  </View>
                  <Text style={styles.hint}>Students within {String(settings.proximityRadiusMeters||100)}m of any live or single anchor will count present.</Text>
                </View>

                <Text style={styles.muted}>Pings required for Present (per period)</Text>
                <View style={styles.segmentRow}>
                  {[2,3,4].map(n => (
                    <TouchableOpacity key={n} onPress={()=>setSettings({ ...settings, pingThresholdPerPeriod: n })} style={[styles.segmentBtn, (settings.pingThresholdPerPeriod||4)===n && styles.segmentActive]}>
                      <Text style={styles.segmentLabel}>{n}</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <Text style={styles.muted}>Ping interval (value + unit)</Text>
                <View style={styles.segmentRow}>
                  {Platform.OS==='web' ? (
                    <input type="number" min="1" value={String(Math.max(1, Math.round((settings.pingIntervalMs||60000)/1000)))} onChange={e=>{
                      const seconds = Number(e.target.value||'60');
                      setSettings({ ...settings, pingIntervalMs: seconds*1000 });
                    }} style={styles.webInput} />
                  ) : (
                    <TextInput value={String(Math.max(1, Math.round((settings.pingIntervalMs||60000)/1000)))} onChangeText={t=>{
                      const seconds = Number(t||'60');
                      setSettings({ ...settings, pingIntervalMs: seconds*1000 });
                    }} style={styles.input} placeholder="60" />
                  )}
                  {Platform.OS==='web' ? (
                    <select value={(settings.pingIntervalMs||60000) % 3600000 === 0 ? 'hours' : (settings.pingIntervalMs||60000) % 60000 === 0 ? 'minutes' : 'seconds'} onChange={e=>{
                      const unit = e.target.value;
                      const baseSeconds = Math.max(1, Math.round((settings.pingIntervalMs||60000)/1000));
                      const ms = unit==='hours' ? baseSeconds*1000*60*60/baseSeconds*baseSeconds : unit==='minutes' ? baseSeconds*1000*60 : baseSeconds*1000;
                      setSettings({ ...settings, pingIntervalMs: ms });
                    }} style={styles.webInput}>
                      <option value="seconds">seconds</option>
                      <option value="minutes">minutes</option>
                      <option value="hours">hours</option>
                    </select>
                  ) : (
                    <Text style={styles.muted}>seconds</Text>
                  )}
                </View>

                <Text style={styles.muted}>Biometric trigger mode</Text>
                <View style={styles.segmentRow}>
                  {['off','pingNumber','time','period'].map(m => (
                    <TouchableOpacity key={m} onPress={()=>setSettings({ ...settings, biometricTriggerMode: m })} style={[styles.segmentBtn, (settings.biometricTriggerMode||'pingNumber')===m && styles.segmentActive]}>
                      <Text style={styles.segmentLabel}>{m}</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {(settings.biometricTriggerMode||'pingNumber')==='pingNumber' && (
                  <>
                    <Text style={styles.muted}>Biometric challenge at ping number</Text>
                    {Platform.OS==='web' ? (
                      <input type="number" min="1" max="10" value={String(settings.biometricAtPingNumber||1)} onChange={e=>setSettings({ ...settings, biometricAtPingNumber: Number(e.target.value||'1') })} style={styles.webInput} />
                    ) : (
                      <TextInput value={String(settings.biometricAtPingNumber||1)} onChangeText={t=>setSettings({ ...settings, biometricAtPingNumber: Number(t||'1') })} style={styles.input} placeholder="1" />
                    )}
                  </>
                )}

                {(settings.biometricTriggerMode||'pingNumber')==='time' && (
                  <>
                    <Text style={styles.muted}>Biometric time windows (HH:mm-HH:mm; separate by ;)</Text>
                    {Platform.OS==='web' ? (
                      <input value={(settings.biometricTimeWindows||[]).map(w=>`${w.start||''}-${w.end||''}`).join(';')} onChange={e=>{
                        const arr = e.target.value.split(';').map(s=>s.trim()).filter(Boolean).map(p=>{ const [a,b] = p.split('-'); return { start: (a||'').trim(), end: (b||'').trim() }; });
                        setSettings({ ...settings, biometricTimeWindows: arr });
                      }} style={styles.webInput} />
                    ) : (
                      <TextInput value={(settings.biometricTimeWindows||[]).map(w=>`${w.start||''}-${w.end||''}`).join(';')} onChangeText={t=>{
                        const arr = t.split(';').map(s=>s.trim()).filter(Boolean).map(p=>{ const [a,b] = p.split('-'); return { start: (a||'').trim(), end: (b||'').trim() }; });
                        setSettings({ ...settings, biometricTimeWindows: arr });
                      }} style={styles.input} placeholder={'09:10-09:20; 11:00-11:05'} />
                    )}
                  </>
                )}

                {(settings.biometricTriggerMode||'pingNumber')==='period' && (
                  <>
                    <Text style={styles.muted}>Biometric required periods (comma separated)</Text>
                    {Platform.OS==='web' ? (
                      <input value={(settings.biometricPeriods||[]).join(',')} onChange={e=>setSettings({ ...settings, biometricPeriods: e.target.value.split(',').map(s=>Number(s.trim())).filter(n=>!isNaN(n)) })} style={styles.webInput} />
                    ) : (
                      <TextInput value={(settings.biometricPeriods||[]).join(',')} onChangeText={t=>setSettings({ ...settings, biometricPeriods: t.split(',').map(s=>Number(s.trim())).filter(n=>!isNaN(n)) })} style={styles.input} placeholder={'1,3,5'} />
                    )}
                  </>
                )}

                <TouchableOpacity onPress={saveSettings} style={styles.primaryBtn}><Text style={styles.primaryBtnText}>Save Settings</Text></TouchableOpacity>
              </View>
            </Panel>
          </View>
        )}

        {tab === 'notifications' && (
          <Panel>
            <Text style={styles.panelTitle}>Notifications</Text>
            <TableContainer>
              <View style={styles.tableHeader}>
                <Text style={[styles.th,{flex:2}]}>Time</Text>
                <Text style={[styles.th,{flex:2}]}>Student</Text>
                <Text style={[styles.th,{flex:3}]}>Message</Text>
              </View>
              {notifications.map((n,i)=>(
                <View key={i} style={styles.tableRow}>
                  <Text style={[styles.td,{flex:2}]}>{new Date(n.at||Date.now()).toLocaleString()}</Text>
                  <Text style={[styles.td,{flex:2}]}>{n.studentName} ({n.regNo})</Text>
                  <Text style={[styles.td,{flex:3}]}>{n.message}</Text>
                </View>
              ))}
            </TableContainer>
          </Panel>
        )}
        </Panel>
      </ScrollView>

      {/* Slide-in filter sidebar (web optimized, mobile full-screen) */}
      {showFilters && (
        <View style={styles.backdrop} onClick={() => Platform.OS==='web' && setShowFilters(false)}>
          <View style={styles.sidebar} onClick={(e) => Platform.OS==='web' && e.stopPropagation()}>
            <View style={styles.sidebarHeader}>
              <Text style={styles.sidebarTitle}>Filters & Analytics</Text>
              <TouchableOpacity onPress={() => setShowFilters(false)} style={styles.closeBtn}>
                <Text style={styles.closeBtnText}>✕</Text>
              </TouchableOpacity>
            </View>
            <TouchableOpacity style={styles.foldHandle} onPress={() => setShowFilters(false)}>
              <Text style={{ color: '#fff', fontWeight: '700' }}>{'<'}</Text>
            </TouchableOpacity>
           
            <View style={styles.sidebarContent}>
              <View style={styles.filterSection}>
                <Text style={styles.sectionTitle}>Date Range</Text>
                <View style={styles.dateRow}>
                  <Text style={styles.dateLabel}>From:</Text>
                  <input type="date" value={from} onChange={e => setFrom(e.target.value)} style={styles.dateInput} />
                </View>
                <View style={styles.dateRow}>
                  <Text style={styles.dateLabel}>To:</Text>
                  <input type="date" value={to} onChange={e => setTo(e.target.value)} style={styles.dateInput} />
                </View>
               
                <Text style={styles.sectionTitle}>Grouping</Text>
                <select value={granularity} onChange={e => setGranularity(e.target.value)} style={styles.select}>
                  <option value="day">Daily</option>
                  <option value="week">Weekly</option>
                  <option value="month">Monthly</option>
                  <option value="year">Yearly</option>
                </select>
               
                <Text style={styles.sectionTitle}>Search</Text>
                <input
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  placeholder="Search by name, reg no, username, etc."
                  style={styles.textInput}
                />
               
                <TouchableOpacity
                  onPress={() => {
                    setShowFilters(false);
                    if (tab==='attendance') loadAttendance();
                    else loadPings();
                    loadUsers();
                  }}
                  style={[styles.primaryBtn,{alignSelf:'flex-start'}]}
                >
                  <Text style={styles.primaryBtnText}>Apply Filters</Text>
                </TouchableOpacity>
              </View>
             
              <View style={styles.filterSection}>
                <Text style={styles.sectionTitle}>Export Data</Text>
                <TouchableOpacity onPress={exportUsers} style={styles.secondaryBtn}><Text style={styles.secondaryBtnText}>Export Users (CSV)</Text></TouchableOpacity>
                <TouchableOpacity onPress={exportAttendance} style={styles.secondaryBtn}><Text style={styles.secondaryBtnText}>Export Attendance (CSV)</Text></TouchableOpacity>
                <Text style={styles.hint}>CSV files open directly in Excel</Text>
              </View>
             
              <View style={styles.filterSection}>
                <Text style={styles.sectionTitle}>Quick Analytics</Text>
                {(() => {
                  const present = attRows.filter(r => r.status === 'present').length;
                  const absent = attRows.filter(r => r.status === 'absent').length;
                  const total = Math.max(1, present + absent);
                  return (
                    <View>
                      <Text style={styles.chartTitle}>Attendance Overview</Text>
                      <View style={styles.chartBar}>
                        <View style={[styles.chartSegment, { width: `${(present/total)*100}%`, backgroundColor: '#10b981' }]} />
                        <View style={[styles.chartSegment, { width: `${(absent/total)*100}%`, backgroundColor: '#ef4444' }]} />
                      </View>
                      <Text style={styles.chartLabel}>Present: {present} | Absent: {absent}</Text>
                    </View>
                  );
                })()}
              </View>
            </View>
          </View>
        </View>
      )}

      {/* Student history modal */}
      {historyOpen && (
        <View style={styles.histBackdrop}>
          <View style={styles.histCard}>
            <View style={{ flexDirection:'row', justifyContent:'space-between', alignItems:'center', marginBottom: 8 }}>
              <Text style={styles.panelTitle}>History - {historyUser?.name} ({historyUser?.regNo})</Text>
              <TouchableOpacity onPress={()=>setHistoryOpen(false)} style={styles.closeBtn}><Text style={styles.closeBtnText}>✕</Text></TouchableOpacity>
            </View>

            <View style={{ gap: 8, marginBottom: 12 }}>
              <Text style={styles.muted}>Filters</Text>
              <View style={styles.segmentRow}>
                {['date','month','year'].map(g => (
                  <TouchableOpacity key={g} onPress={()=>setHistoryGran(g)} style={[styles.segmentBtn, historyGran===g && styles.segmentActive]}>
                    <Text style={styles.segmentLabel}>{g}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <View style={styles.segmentRow}>
                {Platform.OS==='web' ? (
                  <input type="date" value={historyFrom} onChange={e=>setHistoryFrom(e.target.value)} style={styles.webInput} />
                ) : (
                  <TextInput value={historyFrom} onChangeText={setHistoryFrom} style={styles.input} placeholder="YYYY-MM-DD" />
                )}
                {Platform.OS==='web' ? (
                  <input type="date" value={historyTo} onChange={e=>setHistoryTo(e.target.value)} style={styles.webInput} />
                ) : (
                  <TextInput value={historyTo} onChangeText={setHistoryTo} style={styles.input} placeholder="YYYY-MM-DD" />
                )}
                <TouchableOpacity onPress={async ()=>{
                  try { const s = await fetch(apiUrl('/admin/settings')).then(r=>r.json()); setSettingsCache(s); } catch {}
                  try { const params = new URLSearchParams({ from: historyFrom, to: historyTo }); const res = await fetch(apiUrl(`/admin/student/${encodeURIComponent(historyUser._id)}/history?${params}`)); const detail=await res.json(); setHistoryData(detail || { records: [], pings: [] }); } catch {}
                }} style={styles.primaryBtn}><Text style={styles.primaryBtnText}>Apply</Text></TouchableOpacity>
              </View>
            </View>

            {/* Overall Attendance */}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <Text style={styles.panelTitle}>Overall Attendance</Text>
              {Platform.OS === 'web' && (
                <TouchableOpacity onPress={() => {
                  const headers = ['Date', 'P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7', 'P8', 'Overall'];
                  const rows = (historyData.records || []).map(r => {
                    const statusByPeriod = {};
                    (r.periods || []).forEach(p => { statusByPeriod[p.periodNumber] = p.status; });
                    const presentCount = (r.periods || []).filter(p => p.status === 'present').length;
                    const overall = presentCount === 8 ? 'present' : (presentCount > 0 ? 'partial' : 'absent');
                    const periodStatuses = [];
                    for (let i = 1; i <= 8; i++) {
                      periodStatuses.push(statusByPeriod[i] || 'absent');
                    }
                    return [r.date, ...periodStatuses, overall].join(',');
                  });
                  const csv = [headers.join(','), ...rows].join('\n');
                  const blob = new Blob([csv], { type: 'text/csv' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `overall_attendance_${historyUser?.name || 'student'}_${historyFrom}_to_${historyTo}.csv`;
                  document.body.appendChild(a);
                  a.click();
                  document.body.removeChild(a);
                  URL.revokeObjectURL(url);
                }} style={styles.exportButton}>
                  <Ionicons name="download-outline" size={16} color="#fff" />
                  <Text style={styles.exportButtonText}>Export CSV</Text>
                </TouchableOpacity>
              )}
            </View>
            <TableContainer minWidth={900}>
              <View style={styles.tableHeader}>
                <Text style={[styles.th,{flex:1.2}]}>Date</Text>
                {Array.from({length:8}).map((_,idx)=>(<Text key={idx} style={[styles.th,{flex:1}]}>P{idx+1}</Text>))}
                <Text style={[styles.th,{flex:1.5}]}>Overall</Text>
                <Text style={[styles.th,{flex:0.8,textAlign:'right'}]}></Text>
              </View>
              {(() => {
                const s = settingsCache||{};
                const threshold = Math.max(1, Number(s.pingThresholdPerPeriod || 4));
                const datesWithPings = new Set((historyData.pings||[]).map(p=> new Date(p.timestamp).toLocaleDateString('en-CA')));
                const collegePoly = s.collegePolygon||[];
                const campusRadius= 50000;
                const toRad = (v)=> (v*Math.PI)/180; const R=6371000;
                const dist=(a,b)=>{ const dLat=toRad(a.latitude-b.latitude), dLon=toRad(a.longitude-b.longitude); const lat1=toRad(b.latitude), lat2=toRad(a.latitude); const h=Math.sin(dLat/2)**2+Math.cos(lat1)*Math.cos(lat2)*Math.sin(dLon/2)**2; return 2*R*Math.atan2(Math.sqrt(h),Math.sqrt(1-h)); };
                const pinPoly=(pt,poly)=>{ if(!poly||poly.length<3) return false; let inside=false; for(let i=0,j=poly.length-1;i<poly.length;j=i++){const xi=poly[i].latitude, yi=poly[i].longitude; const xj=poly[j].latitude, yj=poly[j].longitude; const intersect=((yi>pt.longitude)!==(yj>pt.longitude)) && (pt.latitude < (xj - xi) * (pt.longitude - yi) / (yj - yi + 1e-12) + xi); if(intersect) inside=!inside;} return inside; };
                const liveAnchors = s.proximityAnchors||[];
                const singleAnchor = s.proximityLocation; const singleR = s.proximityRadiusMeters||100;
               
                // Calculate valid pings per period per date
                const validPingsByDatePeriod = {};
                (historyData.pings||[]).forEach(p=>{
                  const d = new Date(p.timestamp).toLocaleDateString('en-CA');
                  if(!validPingsByDatePeriod[d]) validPingsByDatePeriod[d] = {};
                  const loc = { latitude: p.location?.latitude, longitude: p.location?.longitude };
                  const inCollege = (collegePoly.length>=3 ? pinPoly(loc, collegePoly) : (s.useCollegeLocation && s.collegeLocation && dist(loc, s.collegeLocation)<=campusRadius));
                  let inLive = false; if(singleAnchor?.latitude){ inLive = dist(loc, singleAnchor)<=singleR; }
                  for(const a of liveAnchors){ if(a?.location?.latitude && dist(loc,a.location)<= (a.radiusMeters||100)) { inLive=true; break; } }
                  if(inCollege || inLive) {
                    const period = p.periodNumber || 0;
                    if(!validPingsByDatePeriod[d][period]) validPingsByDatePeriod[d][period] = 0;
                    validPingsByDatePeriod[d][period]++;
                  }
                });
               
                return (historyData.records||[]).map((r,i)=>{
                  const statusByPeriod = {};
                  (r.periods||[]).forEach(p=>{ statusByPeriod[p.periodNumber]=p.status; });
                // Determine login-aware start period for this date
                let startPeriod = 1;
                try {
                  const loginAt = historyUser?.lastLoginAt ? new Date(historyUser.lastLoginAt) : null;
                  const loginDateStr = loginAt ? loginAt.toLocaleDateString('en-CA') : null;
                  if (loginAt && loginDateStr === r.date && s?.startTime && s?.endTime) {
                    const [sh, sm] = String(s.startTime).split(':').map(Number);
                    const [eh, em] = String(s.endTime).split(':').map(Number);
                    const startM = (sh||0)*60 + (sm||0);
                    const endM = (eh||0)*60 + (em||0);
                    const total = Math.max(1, endM - startM);
                    const slot = Math.max(1, Math.round(total / 8));
                    const lm = loginAt.getHours()*60 + loginAt.getMinutes();
                    const idx = Math.min(7, Math.max(0, Math.floor((lm - startM) / slot)));
                    startPeriod = isNaN(idx) ? 1 : (idx + 1);
                  }
                } catch {}
                // Skip days with neither attendance nor any pings
                if (((r.periods||[]).length===0) && !datesWithPings.has(r.date)) return null;
               
                // Calculate period statuses: use recorded status if available, otherwise calculate from pings
                const periodStatuses = {};
                for(let pnum=1; pnum<=8; pnum++) {
                  if(statusByPeriod[pnum]) {
                    // Use recorded attendance status if available
                    periodStatuses[pnum] = statusByPeriod[pnum];
                  } else {
                    // Calculate from valid pings
                    const validCount = (validPingsByDatePeriod[r.date] && validPingsByDatePeriod[r.date][pnum]) || 0;
                    // If there are any pings, determine if present or absent based on threshold
                    if(validCount > 0) {
                      periodStatuses[pnum] = validCount >= threshold ? 'present' : 'absent';
                    } else {
                      // No pings at all - show absent
                      periodStatuses[pnum] = 'absent';
                    }
                  }
                }
               
                const presentSet = new Set(Object.keys(periodStatuses).filter(p=>periodStatuses[p]==='present').map(Number));
                // Calculate overall: present if all 8 periods are present
                const presentCount = presentSet.size;
                const overall = presentCount === 8 ? 'present' : (presentCount > 0 ? 'partial' : 'absent');
                return (
                  <View key={i} style={[styles.tableRow, { alignItems:'center' }]}>
                    <Text style={[styles.td,{flex:1.2}]}>{r.date}</Text>
                    {Array.from({length:8}).map((_,idx)=> {
                      const pnum = idx+1;
                      // Show present/absent for all periods, never show '-'
                      const val = periodStatuses[pnum] || 'absent';
                      const color = val==='present'?'#10b981':'#ef4444';
                      return (<Text key={idx} style={[styles.td,{flex:1, color}]}>{val}</Text>);
                    })}
                    <Text style={[styles.td,{flex:1.5, color: overall==='present'?'#10b981':(overall==='partial'?'#f59e0b':'#ef4444')}]}>{overall}</Text>
                    <View style={{ flex:0.8, alignItems:'flex-end' }}>
                      <TouchableOpacity onPress={async()=>{
                        try {
                          const qs = new URLSearchParams({ studentId: historyUser._id, date: r.date });
                          await fetch(apiUrl(`/admin/attendance/day?${qs}`), { method:'DELETE' });
                          // reload modal data
                          try { const params = new URLSearchParams({ from: historyFrom, to: historyTo }); const res = await fetch(apiUrl(`/admin/student/${encodeURIComponent(historyUser._id)}/history?${params}`)); const detail=await res.json(); setHistoryData(detail || { records: [], pings: [] }); } catch {}
                          await loadAttendance();
                        } catch {}
                      }} style={[styles.secondaryBtn,{backgroundColor:'rgba(239,68,68,0.2)', paddingVertical:4,paddingHorizontal:8}]}>
                        <Text style={[styles.secondaryBtnText,{color:'#ef4444'}]}>Delete</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              });
              })()}
            </TableContainer>

            {/* Detailed Attendance */}
            <View style={{ height: 12 }} />
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <Text style={styles.panelTitle}>Detailed Attendance</Text>
              {Platform.OS === 'web' && (
                <TouchableOpacity onPress={() => {
                  const s = settingsCache||{};
                  const threshold = Math.max(1, Number(s.pingThresholdPerPeriod || 4));
                  const collegePoly = s.collegePolygon||[];
                  const campusRadius= 50000;
                  const toRad = (v)=> (v*Math.PI)/180; const R=6371000;
                  const dist=(a,b)=>{ const dLat=toRad(a.latitude-b.latitude), dLon=toRad(a.longitude-b.longitude); const lat1=toRad(b.latitude), lat2=toRad(a.latitude); const h=Math.sin(dLat/2)**2+Math.cos(lat1)*Math.cos(lat2)*Math.sin(dLon/2)**2; return 2*R*Math.atan2(Math.sqrt(h),Math.sqrt(1-h)); };
                  const pinPoly=(pt,poly)=>{ if(!poly||poly.length<3) return false; let inside=false; for(let i=0,j=poly.length-1;i<poly.length;j=i++){const xi=poly[i].latitude, yi=poly[i].longitude; const xj=poly[j].latitude, yj=poly[j].longitude; const intersect=((yi>pt.longitude)!==(yj>pt.longitude)) && (pt.latitude < (xj - xi) * (pt.longitude - yi) / (yj - yi + 1e-12) + xi); if(intersect) inside=!inside;} return inside; };
                  const liveAnchors = s.proximityAnchors||[];
                  const singleAnchor = s.proximityLocation; const singleR = s.proximityRadiusMeters||100;
                  const byDate = {};
                  (historyData.pings||[]).forEach(p=>{
                    const d = new Date(p.timestamp).toLocaleDateString('en-CA');
                    if(!byDate[d]) byDate[d]=[]; byDate[d].push(p);
                  });
                  const attendanceByDatePeriod = {};
                  (historyData.records||[]).forEach(r=>{
                    if(!attendanceByDatePeriod[r.date]) attendanceByDatePeriod[r.date]={};
                    (r.periods||[]).forEach(p=>{
                      attendanceByDatePeriod[r.date][p.periodNumber] = p.status;
                    });
                  });
                  const csvRows = [];
                  Object.keys(byDate).sort().forEach(d=>{
                    const validPingsByPeriod = {};
                    byDate[d].forEach(p=>{
                      const loc = { latitude: p.location?.latitude, longitude: p.location?.longitude };
                      const inCollege = (collegePoly.length>=3 ? pinPoly(loc, collegePoly) : (s.useCollegeLocation && s.collegeLocation && dist(loc, s.collegeLocation)<=campusRadius));
                      let inLive = false; if(singleAnchor?.latitude){ inLive = dist(loc, singleAnchor)<=singleR; }
                      for(const a of liveAnchors){ if(a?.location?.latitude && dist(loc,a.location)<= (a.radiusMeters||100)) { inLive=true; break; } }
                      if(inCollege || inLive) {
                        const period = p.periodNumber || 0;
                        if(!validPingsByPeriod[period]) validPingsByPeriod[period] = 0;
                        validPingsByPeriod[period]++;
                      }
                    });
                    for(let p=1; p<=8; p++) {
                      const validCount = validPingsByPeriod[p] || 0;
                      const status = attendanceByDatePeriod[d] && attendanceByDatePeriod[d][p]
                        ? attendanceByDatePeriod[d][p]
                        : (validCount >= threshold ? 'present' : (validCount > 0 ? 'absent' : '-'));
                      const locationText = (collegePoly.length>=3 ? pinPoly({latitude: byDate[d][0]?.location?.latitude, longitude: byDate[d][0]?.location?.longitude}, collegePoly) : (s.useCollegeLocation && s.collegeLocation && dist({latitude: byDate[d][0]?.location?.latitude, longitude: byDate[d][0]?.location?.longitude}, s.collegeLocation)<=campusRadius)) ? 'college' : 'live';
                      csvRows.push([d, validCount, locationText, `P${p}`, status].join(','));
                    }
                  });
                  const headers = ['Date', 'No. of Pings', 'Location', 'Period', 'Attendance'];
                  const csv = [headers.join(','), ...csvRows].join('\n');
                  const blob = new Blob([csv], { type: 'text/csv' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `detailed_attendance_${historyUser?.name || 'student'}_${historyFrom}_to_${historyTo}.csv`;
                  document.body.appendChild(a);
                  a.click();
                  document.body.removeChild(a);
                  URL.revokeObjectURL(url);
                }} style={styles.exportButton}>
                  <Ionicons name="download-outline" size={16} color="#fff" />
                  <Text style={styles.exportButtonText}>Export CSV</Text>
                </TouchableOpacity>
              )}
            </View>
            <TableContainer minWidth={800}>
              <View style={styles.tableHeader}>
                <Text style={[styles.th,{flex:1.2}]}>Date</Text>
                <Text style={[styles.th,{flex:1.2}]}>No. of Pings</Text>
                <Text style={[styles.th,{flex:1.6}]}>Location (college | live)</Text>
                <Text style={[styles.th,{flex:0.8}]}>Period</Text>
                <Text style={[styles.th,{flex:1.2}]}>Attendance</Text>
                <Text style={[styles.th,{flex:0.8,textAlign:'right'}]}></Text>
              </View>
              {(() => {
                const s = settingsCache||{};
                const threshold = Math.max(1, Number(s.pingThresholdPerPeriod || 4));
                const collegePoly = s.collegePolygon||[];
                const campusRadius= 50000; // same as server default MAX_RADIUS_METERS unless polygon exists
                const toRad = (v)=> (v*Math.PI)/180; const R=6371000;
                const dist=(a,b)=>{ const dLat=toRad(a.latitude-b.latitude), dLon=toRad(a.longitude-b.longitude); const lat1=toRad(b.latitude), lat2=toRad(a.latitude); const h=Math.sin(dLat/2)**2+Math.cos(lat1)*Math.cos(lat2)*Math.sin(dLon/2)**2; return 2*R*Math.atan2(Math.sqrt(h),Math.sqrt(1-h)); };
                const pinPoly=(pt,poly)=>{ if(!poly||poly.length<3) return false; let inside=false; for(let i=0,j=poly.length-1;i<poly.length;j=i++){const xi=poly[i].latitude, yi=poly[i].longitude; const xj=poly[j].latitude, yj=poly[j].longitude; const intersect=((yi>pt.longitude)!==(yj>pt.longitude)) && (pt.latitude < (xj - xi) * (pt.longitude - yi) / (yj - yi + 1e-12) + xi); if(intersect) inside=!inside;} return inside; };
                const liveAnchors = s.proximityAnchors||[];
                const singleAnchor = s.proximityLocation; const singleR = s.proximityRadiusMeters||100;
                const rows = [];
                const byDate = {};
                (historyData.pings||[]).forEach(p=>{
                  const d = new Date(p.timestamp).toLocaleDateString('en-CA');
                  if(!byDate[d]) byDate[d]=[]; byDate[d].push(p);
                });
                // Group pings by date and period to calculate attendance
                const attendanceByDatePeriod = {};
                (historyData.records||[]).forEach(r=>{
                  if(!attendanceByDatePeriod[r.date]) attendanceByDatePeriod[r.date]={};
                  (r.periods||[]).forEach(p=>{
                    attendanceByDatePeriod[r.date][p.periodNumber] = p.status;
                  });
                });
                Object.keys(byDate).sort().forEach(d=>{
                  // Count valid pings per period for this date
                  const validPingsByPeriod = {};
                  byDate[d].forEach(p=>{
                    const loc = { latitude: p.location?.latitude, longitude: p.location?.longitude };
                    const inCollege = (collegePoly.length>=3 ? pinPoly(loc, collegePoly) : (s.useCollegeLocation && s.collegeLocation && dist(loc, s.collegeLocation)<=campusRadius));
                    let inLive = false; if(singleAnchor?.latitude){ inLive = dist(loc, singleAnchor)<=singleR; }
                    for(const a of liveAnchors){ if(a?.location?.latitude && dist(loc,a.location)<= (a.radiusMeters||100)) { inLive=true; break; } }
                    if(inCollege || inLive) {
                      const period = p.periodNumber || 0;
                      if(!validPingsByPeriod[period]) validPingsByPeriod[period] = 0;
                      validPingsByPeriod[period]++;
                    }
                  });
                  // Determine attendance status for each period
                  const periodStatus = {};
                  for(let p=1; p<=8; p++) {
                    const validCount = validPingsByPeriod[p] || 0;
                    if(attendanceByDatePeriod[d] && attendanceByDatePeriod[d][p]) {
                      periodStatus[p] = attendanceByDatePeriod[d][p]; // Use recorded status if available
                    } else {
                      periodStatus[p] = validCount >= threshold ? 'present' : (validCount > 0 ? 'absent' : '-');
                    }
                  }
                  byDate[d].forEach((p,idx)=>{
                    const loc = { latitude: p.location?.latitude, longitude: p.location?.longitude };
                    const inCollege = (collegePoly.length>=3 ? pinPoly(loc, collegePoly) : (s.useCollegeLocation && s.collegeLocation && dist(loc, s.collegeLocation)<=campusRadius));
                    let inLive = false; if(singleAnchor?.latitude){ inLive = dist(loc, singleAnchor)<=singleR; }
                    for(const a of liveAnchors){ if(a?.location?.latitude && dist(loc,a.location)<= (a.radiusMeters||100)) { inLive=true; break; } }
                    const period = p.periodNumber || 0;
                    const attendanceStatus = periodStatus[period] || '-';
                    rows.push(
                      <View key={`${d}-${idx}`} style={[styles.tableRow, { alignItems:'center' }]}>
                        <Text style={[styles.td,{flex:1.2}]}>{d}</Text>
                        <Text style={[styles.td,{flex:1.2}]}>{idx+1}</Text>
                        <Text style={[styles.td,{flex:1.6}]}>{inCollege?'yes':'no'} | {inLive?'yes':'no'}</Text>
                        <Text style={[styles.td,{flex:0.8}]}>{period}</Text>
                        <Text style={[styles.td,{flex:1.2, color: attendanceStatus==='present'?'#10b981':(attendanceStatus==='absent'?'#ef4444':'#64748b')}]}>{attendanceStatus}</Text>
                        <View style={{ flex:0.8, alignItems:'flex-end' }}>
                          <TouchableOpacity onPress={async()=>{
                            try {
                              await fetch(apiUrl(`/admin/ping/${encodeURIComponent(p._id)}`), { method:'DELETE' });
                              // reload modal data
                              try { const s2 = await fetch(apiUrl('/admin/settings')).then(r=>r.json()); setSettingsCache(s2); } catch {}
                              try { const params = new URLSearchParams({ from: historyFrom, to: historyTo }); const res = await fetch(apiUrl(`/admin/student/${encodeURIComponent(historyUser._id)}/history?${params}`)); const detail=await res.json(); setHistoryData(detail || { records: [], pings: [] }); } catch {}
                              await loadAttendance();
                              await loadPings();
                            } catch {}
                          }} style={[styles.secondaryBtn,{backgroundColor:'rgba(239,68,68,0.2)', paddingVertical:4,paddingHorizontal:8}]}>
                            <Text style={[styles.secondaryBtnText,{color:'#ef4444'}]}>Delete</Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    );
                  });
                });
                return rows;
              })()}
            </TableContainer>
          </View>
        </View>
      )}

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  bg: Platform.select({
    web: {
      backgroundImage: 'linear-gradient(135deg, #ffffffff 0%, #ffffffff 50%, #ffffffff 100%)',
    },
    default: { backgroundColor: '#ffffffff' },
  }),

  topBar: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Platform.OS==='web' ? 'rgba(255,255,255,0.9)' : '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    ...Platform.select({ default: { elevation: 2, shadowColor: '#000', shadowOpacity: 0.05, shadowOffset: { width: 0, height: 2 }, shadowRadius: 4 } })
  },
  brand: { fontSize: 20, fontWeight: '800', color: '#010101ff' },
  navRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 18, flexWrap: 'wrap' },
  navRowSmall: { flexDirection:'row', flexWrap:'wrap', gap: 12 },
  navRowMobile: { flexDirection:'row', alignItems:'flex-end', gap: 16, paddingVertical: 4 },
  navTab: { alignItems: 'center', paddingHorizontal: 6 },
  navTabBig: { width: '100%', alignItems:'flex-start' },
  navTabText: { color: '#000000ff', fontWeight: '800', fontSize: 14 },
  navTabTextActive: { color: '#000000ff' },
  navUnderline: { height: 2, width: '100%', backgroundColor: 'transparent', marginTop: 4, borderRadius: 9999 },
  navUnderlineActive: { backgroundColor: '#000000ff' },
  logout: { flexDirection:'row', alignItems:'center', gap:6, paddingVertical:4, paddingHorizontal:6, borderRadius:6 },

  page: { flexGrow: 1, padding: 16, gap: 16 },
  grid: { width: '100%', gap: 16 },
  leftCol: { width: '100%' },
  centerCol: { width: '100%' },
  rightCol: { width: '100%' },
  fullRow: { width: '100%' },

 card: {
  borderRadius: 16,
  padding: 16,
  backgroundColor: 'rgba(107, 112, 116, 0.75)',
  ...Platform.select({
    web: {
      backgroundColor: 'rgba(104, 100, 100, 0.75)', // ✅ same background for web
      boxShadow: '0 12px 30px rgba(91, 33, 182, 0.08)',
      border: '1px solid #796e6aff',
    },
    default: {
      backgroundColor: 'rgba(104, 100, 100, 0.75)', // ✅ same background for mobile
    },
  }),
},
  chartCard: {
    borderRadius: 12,
    padding: 16,
    backgroundColor: '#ffffff',
    ...Platform.select({
      web: {
        backgroundColor: '#ffffff',
        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.08)',
        border: '1px solid #e5e7eb',
      },
      default: {
        backgroundColor: '#ffffff',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 3,
      },
    }),
  },

  contentBox: { padding: 12 },

  panelTitle: { fontSize: 16, fontWeight: '800', color: '#000000ff', marginBottom: 10 },
  muted: { color: '#526581ff' },
  value: { color: '#0f172a', fontWeight: '700' },
  rowBetween: { flexDirection:'row', alignItems:'center', justifyContent:'space-between', marginTop: 4 },
  primaryBtn: { marginTop: 12, backgroundColor: '#0a0a0aff', paddingVertical: 10, borderRadius: 10, alignItems: 'center' },
  primaryBtnText: { color: '#fcfdffff', fontWeight: '800' },
  secondaryBtn: { backgroundColor: 'rgba(96,165,250,0.15)', paddingVertical: 8, paddingHorizontal: 10, borderRadius: 8, marginTop: 6 },
  secondaryBtnText: { color: '#000000ff', fontWeight: '700' },
  link: { color: '#000000ff', fontWeight: '700', textDecorationLine: 'underline' },

  mapWrap: { height: 200, borderRadius: 12, overflow: 'hidden', backgroundColor: 'rgba(255,255,255,0.6)', position: 'relative' },
  legendRow: { flexDirection:'row', alignItems:'center', gap:8, marginTop: 8, flexWrap:'wrap' },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  legendText: { color: '#334155' },

  metricsRow: { flexDirection:'row', gap: 10, flexWrap:'wrap', marginBottom: 10 },
  metricChip: { paddingVertical:8, paddingHorizontal:12, backgroundColor:'rgba(255,255,255,0.7)', borderRadius: 9999 },
  metricNum: { fontWeight:'800', color:'#6c6d6fff' },
  metricLabel: { color:'#475569' },

  noticeItem: { padding: 10, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.7)' },
  noticeTime: { fontSize: 12, color: '#64748b', marginBottom: 4 },
  noticeMsg: { color: '#0f172a' },

  analyticsRow: { flexDirection:'row', alignItems:'center', justifyContent:'space-between', marginTop: 12 },
  gaugeWrap: { alignItems:'center', justifyContent:'center' },
  gaugeCircle: { width: 80, height: 80, borderRadius: 40, borderWidth: 8, borderColor: '#60a5fa', alignItems:'center', justifyContent:'center', backgroundColor:'rgba(255,255,255,0.6)' },
  gaugeText: { fontWeight:'800', color:'#0f172a' },
  donutRow: { flexDirection:'row', gap: 12 },
  donut: { width: 40, height: 40, borderRadius: 20, borderWidth: 6, backgroundColor:'transparent' },

  segmentRow: { flexDirection:'row', gap: 8, flexWrap:'wrap' },
  segmentBtn: { paddingVertical:6, paddingHorizontal:12, borderRadius: 9999, backgroundColor:'rgba(255,255,255,0.6)' },
  segmentActive: { backgroundColor:'rgba(139, 129, 129, 0.9)' },
  segmentLabel: { color:'#0f172a', fontWeight:'700' },

  input: { padding: 10, backgroundColor:'rgba(255,255,255,0.8)', borderRadius: 10, color:'#0f172a' },
  webInput: { padding: 10, background: 'rgba(255, 255, 255, 1)', borderRadius: 10, border: '1px solid rgba(148,163,184,0.35)' },

  // Table styles
  table: { width:'100%', borderRadius: 12, overflow:'hidden', ...Platform.select({ web: { border: '1px solid rgba(148,163,184,0.35)' }, default: {} }) },
  tableHeader: { flexDirection:'row', backgroundColor:'rgba(255,255,255,0.8)', paddingVertical:12, paddingHorizontal:16 },
  tableRow: { flexDirection:'row', backgroundColor:'rgba(255,255,255,0.6)', paddingVertical:12, paddingHorizontal:16, borderBottomWidth: Platform.OS==='web'?0:StyleSheet.hairlineWidth, borderBottomColor: 'rgba(148,163,184,0.25)' },
  th: { color:'#334155', fontWeight:'800' },
  td: { color:'#0f172a' },

  // Sidebar (filters)
  backdrop: Platform.select({ web: { position:'fixed', top:0, left:0, right:0, bottom:0, backgroundColor:'rgba(15,23,42,0.4)', zIndex:1000 }, default: { position:'absolute', top:0, left:0, right:0, bottom:0, backgroundColor:'rgba(15,23,42,0.4)', zIndex:1000 } }),
  sidebar: Platform.select({ web: { position:'absolute', right:0, top:0, height:'100vh', width:380, backgroundColor:'#ffffff', boxShadow:'-4px 0 24px rgba(2,6,23,0.1)' }, default: { position:'absolute', left:0, right:0, top:0, bottom:0, backgroundColor:'#ffffff' } }),
  foldHandle: { position:'absolute', left:-24, top:'50%', marginTop:-20, width:24, height:40, borderTopLeftRadius:4, borderBottomLeftRadius:4, backgroundColor:'#64748b', alignItems:'center', justifyContent:'center' },
  sidebarHeader: { flexDirection:'row', justifyContent:'space-between', alignItems:'center', padding:16, borderBottomWidth:1, borderBottomColor:'#e5e7eb', backgroundColor:'#f8fafc' },
  sidebarTitle: { fontSize:18, fontWeight:'800', color:'#0f172a' },
  closeBtn: { padding:8, borderRadius:4, backgroundColor:'#ef4444' },
  closeBtnText: { color:'#fff', fontWeight:'800' },
  sidebarContent: { padding:16, gap:24 },
  filterSection: { gap:8 },
  sectionTitle: { fontSize:16, fontWeight:'800', color:'#0f172a', marginBottom:8 },
  dateRow: { flexDirection:'row', alignItems:'center', gap:8, marginBottom:8 },
  dateLabel: { minWidth: 40, color:'#475569' },
  dateInput: { flex:1, padding:8, border:'1px solid #d1d5db', borderRadius:4 },
  select: { width:'100%', padding:8, border:'1px solid #d1d5db', borderRadius:4, marginBottom:8 },
  textInput: { width:'100%', padding:8, border:'1px solid #d1d5db', borderRadius:4, marginBottom:8 },
  hint: { fontSize:12, color:'#6b7280', marginTop:4 },
  chartTitle: { fontSize:14, fontWeight:'700', color:'#0f172a', marginBottom:12 },
  chartBar: { height:20, flexDirection:'row', backgroundColor:'rgba(148,163,184,0.25)', borderRadius:4, overflow:'hidden', marginBottom:4 },
  chartSegment: { height:'100%' },
  chartLabel: { fontSize:12, color:'#475569' },

  // History modal styles
  histBackdrop: { position:'fixed', top:0, left:0, right:0, bottom:0, backgroundColor:'rgba(0,0,0,0.5)', zIndex:2000, alignItems:'center', justifyContent:'center' },
  histCard: { width:'90%', maxWidth: 1100, maxHeight: '90%', padding:16, borderRadius:16, backgroundColor:'rgba(104, 100, 100, 0.95)', ...Platform.select({ web: { overflowY:'auto' }, default: {} }) },
 
  // Export button styles
  exportButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#10b981',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    gap: 6,
  },
  exportButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
});