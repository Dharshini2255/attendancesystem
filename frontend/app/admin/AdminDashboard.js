import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Alert, ScrollView, StyleSheet, Text, View, TouchableOpacity, Platform, TextInput, Switch, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Location from 'expo-location';

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

  const [from, setFrom] = useState(new Date().toLocaleDateString('en-CA'));
  const [to, setTo] = useState(new Date().toLocaleDateString('en-CA'));
  const [granularity, setGranularity] = useState('day');
  const [query, setQuery] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [settings, setSettings] = useState({ date: new Date().toLocaleDateString('en-CA'), day: '', startTime: '09:00', endTime: '17:00', classes: [], sections: [], years: [], locationMode: 'college', collegeLocation: { latitude: 12.8005328, longitude: 80.0388091 }, staffLocation: { latitude: 0, longitude: 0 } });
  const [notifications, setNotifications] = useState([]);
  const { width } = useWindowDimensions();
  const isSmall = width < 768;

  useEffect(() => {
    (async () => {
      try {
        const v = await AsyncStorage.getItem('adminAuth');
        if (v === 'true') {
          setAuthorized(true);
          await Promise.all([loadUsers(), loadAttendance(), loadPings(), loadNotifications(), loadSessions(), readControl()]);
        } else {
          Alert.alert('Unauthorized', 'Admin access required');
          router.replace('/home');
        }
      } catch {
        router.replace('/home');
      }
    })();
  }, []);

  const api = 'https://attendancesystem-backend-mias.onrender.com';

  const loadUsers = async () => {
    try {
      const url = new URL(`${api}/admin/users`);
      if (query) url.searchParams.set('q', query);
      const res = await fetch(url);
      const data = await res.json();
      setUsers(data || []);
    } catch {}
  };

  const loadAttendance = async () => {
    try {
      const url = new URL(`${api}/admin/attendance`);
      url.searchParams.set('from', from);
      url.searchParams.set('to', to);
      url.searchParams.set('granularity', granularity);
      if (query) url.searchParams.set('q', query);
      const res = await fetch(url);
      const data = await res.json();
      setAttRows(data.rows || []);
    } catch {}
  };

  const loadPings = async () => {
    try {
      const url = new URL(`${api}/admin/pings`);
      url.searchParams.set('from', from);
      url.searchParams.set('to', to);
      if (query) url.searchParams.set('q', query);
      const res = await fetch(url);
      const data = await res.json();
      setPings(data || []);
    } catch {}
  };

  const loadSessions = async () => {
    try {
      const res = await fetch(`${api}/admin/sessions`);
      const data = await res.json();
      setSessions(data || { loggedIn: [], loggedOut: [], total: 0 });
    } catch {}
  };

  const readControl = async () => {
    try {
      const res = await fetch(`${api}/admin/ping-control`);
      const data = await res.json();
      setCtrl({ pingEnabled: !!data.pingEnabled, intervalMs: data.intervalMs || 60000 });
    } catch {}
  };

  const toggleControl = async (enabled) => {
    try {
      const res = await fetch(`${api}/admin/ping-control`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ enabled, intervalMs: ctrl.intervalMs }) });
      const data = await res.json();
      setCtrl({ pingEnabled: !!data.pingEnabled, intervalMs: data.intervalMs || ctrl.intervalMs });
    } catch {}
  };

  const readSettings = async () => {
    try { const res = await fetch(`${api}/admin/settings`); const data = await res.json(); setSettings(prev => ({ ...prev, ...data })); } catch {}
  };

  const saveSettings = async () => {
    try { await fetch(`${api}/admin/settings`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(settings) }); alert('Settings saved'); } catch {}
  };

  const loadNotifications = async () => {
    try { const res = await fetch(`${api}/admin/notifications`); const data = await res.json(); setNotifications(data.alerts || []); } catch {}
  };

  const exportUsers = () => { 
    const url = new URL(`${api}/admin/export/users.csv`);
    if (query) url.searchParams.set('q', query);
    window.location.assign(url);
  };
  const exportAttendance = () => {
    const url = new URL(`${api}/admin/export/attendance.csv`);
    url.searchParams.set('from', from); url.searchParams.set('to', to);
    if (query) url.searchParams.set('q', query);
    window.location.assign(url);
  };

  const attendancePercent = useMemo(() => {
    let present = 0, absent = 0;
    for (const r of attRows) {
      if (typeof r.present === 'number' || typeof r.absent === 'number') {
        present += r.present || 0; absent += r.absent || 0;
      } else if (r.status) {
        if (r.status === 'present') present += 1; else if (r.status === 'absent') absent += 1;
      }
    }
    const total = present + absent;
    return total ? Math.round((present / total) * 100) : 0;
  }, [attRows]);

  const usersByReg = useMemo(() => { const m = {}; (users||[]).forEach(u => { if (u?.regNo) m[u.regNo] = u; }); return m; }, [users]);
  const recentPings = useMemo(() => (pings||[]).filter(p => {
    const t = new Date(p.timestamp).getTime();
    return !isNaN(t) && (Date.now() - t) <= 30*60*1000;
  }), [pings]);
  const metrics = useMemo(() => {
    const seenStudents = new Set();
    const seenClasses = new Set();
    let biometric = 0;
    for (const p of recentPings) {
      const key = p.studentId || `${p.studentName||''}:${p.regNo||''}`;
      if (key) seenStudents.add(key);
      const u = p.regNo && usersByReg[p.regNo];
      const cls = p.class || p.className || u?.class;
      if (cls) seenClasses.add(cls);
      if (p.biometricVerified) biometric += 1;
    }
    return { activeStudents: seenStudents.size, activeClasses: seenClasses.size, biometric };
  }, [recentPings, usersByReg]);

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

  if (!authorized) {
    return <View style={[styles.fill, styles.bg]}><Text style={{ color: '#1f2937' }}>Checking admin access…</Text></View>;
  }

  const NavItem = ({ active, label, onPress }) => (
    <TouchableOpacity onPress={onPress} style={styles.navTab}>
      <Text style={[styles.navTabText, active && styles.navTabTextActive]}>{label}</Text>
      <View style={[styles.navUnderline, active && styles.navUnderlineActive]} />
    </TouchableOpacity>
  );

  const Panel = ({ style, children }) => (
    <BlurView intensity={40} tint="light" style={[styles.card, style]}>{children}</BlurView>
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
        <View style={styles.navRow}>
          <NavItem active={tab==='dashboard'} label="Dashboard" onPress={() => { setTab('dashboard'); loadPings(); loadNotifications(); }} />
          <NavItem active={tab==='settings'} label="Settings" onPress={() => { setTab('settings'); readSettings(); }} />
          <NavItem active={tab==='attendance'} label="Attendance" onPress={() => { setTab('attendance'); loadAttendance(); }} />
          <NavItem active={tab==='notifications'} label="Notifications" onPress={() => { setTab('notifications'); loadNotifications(); }} />
          <TouchableOpacity onPress={async () => { await AsyncStorage.removeItem('adminAuth'); router.replace('/home'); }} style={styles.logout}>
            <Ionicons name="log-out-outline" size={18} color="#5b21b6" />
            <Text style={styles.navTabText}>Logout</Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.page}>
        <Panel style={styles.contentBox}>
        {tab === 'dashboard' && (
          <View style={styles.grid}>
            {/* Left: Attendance Setup */}

            {/* Center: Map / Overview */}
            <Panel style={styles.centerCol}>
              <Text style={styles.panelTitle}>Real-time Attendance Overview</Text>
              <View style={styles.metricsRow}>
                <View style={styles.metricChip}><Text style={styles.metricNum}>{metrics.activeStudents}</Text><Text style={styles.metricLabel}>Active Students (30m)</Text></View>
                <View style={styles.metricChip}><Text style={styles.metricNum}>{metrics.activeClasses}</Text><Text style={styles.metricLabel}>Active Classes</Text></View>
                <View style={styles.metricChip}><Text style={styles.metricNum}>{metrics.biometric}</Text><Text style={styles.metricLabel}>Biometric Pings</Text></View>
              </View>
              <View style={styles.mapWrap}>
                <Image source={{ uri: 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/80/World_map_-_low_resolution.svg/1024px-World_map_-_low_resolution.svg.png' }} contentFit="contain" style={{ width: '100%', height: '100%' }} />
              </View>
              <View style={styles.legendRow}>
                <View style={[styles.legendDot,{backgroundColor:'#60a5fa'}]} />
                <Text style={styles.legendText}>Currently</Text>
                <View style={[styles.legendDot,{backgroundColor:'#10b981'}]} />
                <Text style={styles.legendText}>Active Classes</Text>
                <View style={[styles.legendDot,{backgroundColor:'#f59e0b'}]} />
                <Text style={styles.legendText}>Summary</Text>
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
                {users.slice(0,12).map((u,i)=> (
                  <View key={u._id||i} style={styles.tableRow}>
                    <Text style={[styles.td,{flex:2}]}>{u.name}</Text>
                    <Text style={[styles.td,{flex:1.2}]}>{u.regNo}</Text>
                    <Text style={[styles.td,{flex:1}]}>{u.loggedIn? 'Online' : 'Offline'}</Text>
                    <Text style={[styles.td,{flex:1}]}>{u.biometricEnrolled? '✓' : '—'}</Text>
                    <Text style={[styles.td,{flex:1}]}>{u.trackingEnabled? '✓' : '—'}</Text>
                  </View>
                ))}
              </TableContainer>

              {/* Side analytics */}
              <View style={styles.analyticsRow}>
                <View style={styles.gaugeWrap}>
                  <View style={styles.gaugeCircle}>
                    <Text style={styles.gaugeText}>{attendancePercent}%</Text>
                  </View>
                  <Text style={styles.muted}>Overall Attendance</Text>
                </View>
                <View style={styles.donutRow}>
                  <View style={[styles.donut, { borderColor: '#60a5fa' }]} />
                  <View style={[styles.donut, { borderColor: '#34d399' }]} />
                  <View style={[styles.donut, { borderColor: '#f472b6' }]} />
                </View>
              </View>
            </Panel>

            {/* Pings table */}
            <Panel style={styles.fullRow}>
              <View style={{flexDirection:'row', justifyContent:'space-between', alignItems:'center'}}>
                <Text style={styles.panelTitle}>Recent Pings</Text>
                <TouchableOpacity onPress={loadPings}><Text style={styles.link}>Refresh</Text></TouchableOpacity>
              </View>
              <TableContainer>
                <View style={styles.tableHeader}>
                  <Text style={[styles.th, { flex: 2 }]}>Time</Text>
                  <Text style={[styles.th, { flex: 1.5 }]}>Name</Text>
                  <Text style={[styles.th, { flex: 1.2 }]}>Reg No</Text>
                  <Text style={[styles.th, { flex: 1.2 }]}>Period</Text>
                </View>
                {pings.slice(0,20).map((p,i)=> (
                  <View key={i} style={styles.tableRow}>
                    <Text style={[styles.td,{flex:2}]}>{new Date(p.timestamp).toLocaleString()}</Text>
                    <Text style={[styles.td,{flex:1.5}]}>{p.studentName||''}</Text>
                    <Text style={[styles.td,{flex:1.2}]}>{p.regNo||''}</Text>
                    <Text style={[styles.td,{flex:1.2}]}>{p.periodNumber||''} {p.timestampType||''}</Text>
                  </View>
                ))}
              </TableContainer>
            </Panel>
          </View>
        )}

        {tab === 'attendance' && (
          <View style={{ width: '100%', gap: 16 }}>
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
                  {users.map((u, i) => (
                    <View key={u._id || i} style={styles.tableRow}>
                      <Text style={[styles.td, { flex: 2 }]}>{u.name}</Text>
                      <Text style={[styles.td, { flex: 1.5 }]}>{u.regNo}</Text>
                      <Text style={[styles.td, { flex: 1 }]}>{u.class}</Text>
                      <Text style={[styles.td, { flex: 0.8 }]}>{u.year}</Text>
                      <Text style={[styles.td, { flex: 2.5 }]}>{u.email}</Text>
                      <Text style={[styles.td, { flex: 1.5 }]}>{u.username}</Text>
                    </View>
                  ))}
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
                  {attRows.map((r, i) => (
                    <View key={i} style={styles.tableRow}>
                      <Text style={[styles.td, { flex: 1.5 }]}>{r.date || r.bucket}</Text>
                      <TouchableOpacity style={{ flex: 2 }} onPress={async () => {
                        try {
                          const params = new URLSearchParams({ from: from, to: to });
                          const res = await fetch(`${api}/admin/student/${encodeURIComponent(r.studentId)}/history?${params}`);
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
                    </View>
            ))}
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
                  <select value={settings.department||''} onChange={e=>setSettings({ ...settings, department: e.target.value })} style={styles.webInput}>
                    {departmentOptions.map(opt=> <option key={opt} value={opt}>{opt}</option>)}
                  </select>
                ) : (
                  <TextInput value={settings.department||''} onChangeText={t=>setSettings({...settings, department:t})} style={styles.input} placeholder="Department" />
                )}

                <Text style={styles.muted}>Class (5 per department)</Text>
                {Platform.OS==='web' ? (
                  <select value={settings.class||''} onChange={e=>setSettings({ ...settings, class: e.target.value })} style={styles.webInput}>
                    {classOptions.map(opt=> <option key={opt} value={opt}>{opt}</option>)}
                  </select>
                ) : (
                  <TextInput value={settings.class||''} onChangeText={t=>setSettings({...settings, class:t})} style={styles.input} placeholder="e.g., CSE-A … CSE-E" />
                )}

                <Text style={styles.muted}>Year</Text>
                {Platform.OS==='web' ? (
                  <select value={String(settings.year||'')} onChange={e=>setSettings({ ...settings, year: Number(e.target.value) })} style={styles.webInput}>
                    {[1,2,3,4].map(y=> <option key={y} value={y}>{y}</option>)}
                  </select>
                ) : (
                  <TextInput value={String(settings.year||'')} onChangeText={t=>setSettings({...settings, year: Number(t||0)})} style={styles.input} placeholder="1-4" />
                )}

                <Text style={styles.muted}>Location Mode</Text>
                <View style={styles.segmentRow}>
                  {['college','staff','user'].map(mode => (
                    <TouchableOpacity key={mode} onPress={()=>setSettings({...settings, locationMode: mode})} style={[styles.segmentBtn, settings.locationMode===mode && styles.segmentActive]}>
                      <Text style={styles.segmentLabel}>{mode==='college' ? 'College' : mode==='staff' ? 'Staff Anchor' : 'User Proximity'}</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {settings.locationMode==='staff' && (
                  <View style={{ gap: 8 }}>
                    <Text style={styles.muted}>Staff Anchor Location (lat,lon)</Text>
                    {Platform.OS==='web' ? (
                      <input value={`${settings.staffLocation?.latitude||''},${settings.staffLocation?.longitude||''}`} onChange={e=>{ const [lat,lon]=e.target.value.split(','); setSettings({ ...settings, staffLocation: { latitude: Number(lat), longitude: Number(lon) } }); }} style={styles.webInput} />
                    ) : (
                      <TextInput value={`${settings.staffLocation?.latitude||''},${settings.staffLocation?.longitude||''}`} onChangeText={t=>{ const [lat,lon]=t.split(','); setSettings({ ...settings, staffLocation: { latitude: Number(lat), longitude: Number(lon) } }); }} style={styles.input} placeholder="lat,lon" />
                    )}
                    <TouchableOpacity onPress={async()=>{
                      try {
                        const { status } = await Location.requestForegroundPermissionsAsync();
                        if (status === 'granted') {
                          const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
                          setSettings({ ...settings, staffLocation: { latitude: loc.coords.latitude, longitude: loc.coords.longitude } });
                        }
                      } catch {}
                    }} style={styles.secondaryBtn}><Text style={styles.secondaryBtnText}>Use My Current Location</Text></TouchableOpacity>
                  </View>
                )}

                {settings.locationMode==='user' && (
                  <View style={{ gap: 8 }}>
                    <Text style={styles.muted}>Anchor Username/RegNo</Text>
                    {Platform.OS==='web' ? (
                      <input value={settings.proximityUsername||''} onChange={e=>setSettings({ ...settings, proximityUsername: e.target.value })} style={styles.webInput} />
                    ) : (
                      <TextInput value={settings.proximityUsername||''} onChangeText={t=>setSettings({ ...settings, proximityUsername: t })} style={styles.input} placeholder="username or reg no" />
                    )}

                    <Text style={styles.muted}>Radius (meters)</Text>
                    {Platform.OS==='web' ? (
                      <input type="number" value={settings.proximityRadiusMeters||100} onChange={e=>setSettings({ ...settings, proximityRadiusMeters: Number(e.target.value||'100') })} style={styles.webInput} />
                    ) : (
                      <TextInput value={String(settings.proximityRadiusMeters||100)} onChangeText={t=>setSettings({ ...settings, proximityRadiusMeters: Number(t||'100') })} style={styles.input} placeholder="100" />
                    )}

                    <Text style={styles.muted}>Anchor Location (lat,lon)</Text>
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

                    <Text style={styles.hint}>Only users within the radius (default 100m) of this anchor will be marked present.</Text>
                  </View>
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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  bg: Platform.select({
    web: {
      backgroundImage: 'linear-gradient(135deg, #faf8fbff 0%, #fcfbfcff 50%, #fefefeff 100%)',
    },
    default: { backgroundColor: '#ffffffff' },
  }),

  topBar: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  brand: { fontSize: 20, fontWeight: '800', color: '#010101ff' },
  navRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 18, flexWrap: 'wrap' },
  navTab: { alignItems: 'center' },
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
    backgroundColor: 'rgba(104, 100, 100, 0.75)',
    ...Platform.select({ web: { boxShadow: '0 12px 30px rgba(91, 33, 182, 0.08)', border: '1px solid #796e6aff' }, default: {} }),
  },
  contentBox: { padding: 12 },

  panelTitle: { fontSize: 16, fontWeight: '800', color: '#000000ff', marginBottom: 10 },
  muted: { color: '#526581ff' },
  value: { color: '#0f172a', fontWeight: '700' },
  rowBetween: { flexDirection:'row', alignItems:'center', justifyContent:'space-between', marginTop: 4 },
  primaryBtn: { marginTop: 12, backgroundColor: '#60a5fa', paddingVertical: 10, borderRadius: 10, alignItems: 'center' },
  primaryBtnText: { color: '#0f172a', fontWeight: '800' },
  secondaryBtn: { backgroundColor: 'rgba(96,165,250,0.15)', paddingVertical: 8, paddingHorizontal: 10, borderRadius: 8, marginTop: 6 },
  secondaryBtnText: { color: '#000000ff', fontWeight: '700' },
  link: { color: '#000000ff', fontWeight: '700', textDecorationLine: 'underline' },

  mapWrap: { height: 200, borderRadius: 12, overflow: 'hidden', backgroundColor: 'rgba(255,255,255,0.6)' },
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
  segmentActive: { backgroundColor:'rgba(255,255,255,0.9)' },
  segmentLabel: { color:'#0f172a', fontWeight:'700' },

  input: { padding: 10, backgroundColor:'rgba(255, 255, 255, 1), 0.8)', borderRadius: 10, color:'#0f172a' },
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
  chartTitle: { fontSize:14, fontWeight:'700', color:'#0f172a', marginBottom:8 },
  chartBar: { height:20, flexDirection:'row', backgroundColor:'rgba(148,163,184,0.25)', borderRadius:4, overflow:'hidden', marginBottom:4 },
  chartSegment: { height:'100%' },
  chartLabel: { fontSize:12, color:'#475569' },
});
