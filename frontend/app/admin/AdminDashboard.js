import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Alert, Button, ScrollView, StyleSheet, Text, View, TouchableOpacity } from 'react-native';

export default function AdminDashboard() {
  const router = useRouter();
  const [authorized, setAuthorized] = useState(false);
  const [tab, setTab] = useState('dashboard'); // dashboard | attendance | settings | notifications

  const [users, setUsers] = useState([]);
  const [attRows, setAttRows] = useState([]);
  const [pings, setPings] = useState([]);
  const [sessions, setSessions] = useState({ loggedIn: [], loggedOut: [], total: 0 });
  const [ctrl, setCtrl] = useState({ pingEnabled: false, intervalMs: 60000 });

  const [from, setFrom] = useState(new Date().toLocaleDateString('en-CA'));
  const [to, setTo] = useState(new Date().toLocaleDateString('en-CA'));
  const [granularity, setGranularity] = useState('day');
  const [query, setQuery] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [settings, setSettings] = useState({ date: new Date().toLocaleDateString('en-CA'), day: '', startTime: '09:00', endTime: '17:00', classes: [], sections: [], years: [], locationMode: 'college', collegeLocation: { latitude: 12.8005328, longitude: 80.0388091 }, staffLocation: { latitude: 0, longitude: 0 } });
  const [notifications, setNotifications] = useState([]);

  useEffect(() => {
    (async () => {
      try {
        const v = await AsyncStorage.getItem('adminAuth');
        if (v === 'true') {
          setAuthorized(true);
          await loadUsers();
          await loadAttendance();
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

  if (!authorized) {
    return <View style={styles.container}><Text style={{ color: '#fff' }}>Checking admin access…</Text></View>;
  }

  const ActionButton = ({ title, color = '#3b82f6', onPress }) => (
    <TouchableOpacity onPress={onPress} style={[styles.btn, { backgroundColor: color }]}>
      <Text style={styles.btnText}>{title}</Text>
    </TouchableOpacity>
  );

  return (
    <View style={{ flex: 1, backgroundColor: '#fff' }}>
      {/* Header bar with title and buttons */}
      <View style={styles.headerBar}>
        <Text style={styles.title}>Admin Dashboard</Text>
        <View style={styles.buttonGroup}>
          <ActionButton title="Dashboard" color="#3b82f6" onPress={() => { setTab('dashboard'); loadUsers(); loadSessions(); }} />
          <ActionButton title="Attendance" color="#8b5cf6" onPress={() => { setTab('attendance'); loadAttendance(); }} />
          <ActionButton title="Settings" color="#10b981" onPress={() => { setTab('settings'); readSettings(); }} />
          <ActionButton title="Notifications" color="#f59e0b" onPress={() => { setTab('notifications'); loadNotifications(); }} />
          <ActionButton title="Filters" color="#64748b" onPress={() => setShowFilters(true)} />
          <ActionButton title="Logout" color="#ef4444" onPress={async () => { await AsyncStorage.removeItem('adminAuth'); router.replace('/home'); }} />
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>

      {tab === 'dashboard' && (
        <View style={{ width: '100%' }}>
          <Text style={styles.textDark}>Overview</Text>
          <View style={{ flexDirection: 'row', gap: 12, flexWrap: 'wrap', marginVertical: 8 }}>
            <View style={{ backgroundColor: '#e2e8f0', padding: 12, borderRadius: 8 }}>
              <Text style={styles.textDark}>Users: {users.length}</Text>
            </View>
            <View style={{ backgroundColor: '#e2e8f0', padding: 12, borderRadius: 8 }}>
              <Text style={styles.textDark}>Logged In: {sessions.loggedIn?.length || 0}</Text>
            </View>
            <View style={{ backgroundColor: '#e2e8f0', padding: 12, borderRadius: 8 }}>
              <Text style={styles.textDark}>Alerts: {notifications.length}</Text>
            </View>
          </View>
          <Text style={[styles.th, { marginTop: 12 }]}>Recent Pings</Text>
          <View style={styles.table}>
            <View style={styles.tableHeader}>
              <Text style={[styles.th, { flex: 2 }]}>Time</Text>
              <Text style={[styles.th, { flex: 2 }]}>Name</Text>
              <Text style={[styles.th, { flex: 2 }]}>Reg No</Text>
              <Text style={[styles.th, { flex: 2 }]}>Type</Text>
            </View>
            {pings.slice(0,10).map((p,i)=>(
              <View key={i} style={styles.tableRow}>
                <Text style={[styles.td,{flex:2}]}>{new Date(p.timestamp).toLocaleString()}</Text>
                <Text style={[styles.td,{flex:2}]}>{p.studentName}</Text>
                <Text style={[styles.td,{flex:2}]}>{p.regNo}</Text>
                <Text style={[styles.td,{flex:2}]}>{p.periodNumber} {p.timestampType}</Text>
              </View>
            ))}
          </View>
        </View>
      )}

      {tab === 'attendance' && (
        <View style={{ width: '100%' }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
            <Text style={styles.textDark}>Users: {users.length}</Text>
            <ActionButton title="Export CSV" color="#22c55e" onPress={exportUsers} />
          </View>
          <View style={styles.table}>
            <View style={styles.tableHeader}>
              <Text style={[styles.th, { flex: 2 }]}>Name</Text>
              <Text style={[styles.th, { flex: 1.5 }]}>Reg No</Text>
              <Text style={[styles.th, { flex: 1 }]}>Class</Text>
              <Text style={[styles.th, { flex: 0.8 }]}>Year</Text>
              <Text style={[styles.th, { flex: 2.5 }]}>Email</Text>
              <Text style={[styles.th, { flex: 1.5 }]}>Username</Text>
              <Text style={[styles.th, { flex: 2 }]}>UUID</Text>
            </View>
            {users.map((u, i) => (
              <View key={u._id || i} style={styles.tableRow}>
                <Text style={[styles.td, { flex: 2 }]}>{u.name}</Text>
                <Text style={[styles.td, { flex: 1.5 }]}>{u.regNo}</Text>
                <Text style={[styles.td, { flex: 1 }]}>{u.class}</Text>
                <Text style={[styles.td, { flex: 0.8 }]}>{u.year}</Text>
                <Text style={[styles.td, { flex: 2.5 }]}>{u.email}</Text>
                <Text style={[styles.td, { flex: 1.5 }]}>{u.username}</Text>
                <Text style={[styles.td, { flex: 2 }]}>{u.uuid}</Text>
              </View>
            ))}
          </View>
        </View>
      )}

      {tab === 'attendance' && (
        <View style={{ width: '100%' }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
            <Text style={styles.textDark}>Rows: {attRows.length}</Text>
            <ActionButton title="Export CSV" color="#22c55e" onPress={exportAttendance} />
          </View>
          <View style={styles.table}>
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
                <Text style={[styles.td, { color:'#2563eb', textDecorationLine:'underline' }]}>{r.studentName}</Text>
              </TouchableOpacity>
                <Text style={[styles.td, { flex: 1.5 }]}>{r.regNo}</Text>
                {r.periodNumber != null ? (
                  <Text style={[styles.td, { flex: 2 }]}>P{r.periodNumber} - {r.status}</Text>
                ) : (
                  <Text style={[styles.td, { flex: 2 }]}>Present: {r.present} | Absent: {r.absent}</Text>
                )}
              </View>
            ))}
          </View>
        </View>
      )}

      {tab === 'settings' && (
        <View style={{ width: '100%' }}>
          <Text style={styles.textDark}>Attendance Settings</Text>
          <View style={{ gap: 8, marginBottom: 12 }}>
            <Text>Date</Text>
            <input type="date" value={settings.date||''} onChange={e=>setSettings({ ...settings, date: e.target.value })} style={styles.textInput} />
            <Text>Day</Text>
            <input value={settings.day||''} onChange={e=>setSettings({ ...settings, day: e.target.value })} style={styles.textInput} />
            <Text>Start Time</Text>
            <input type="time" value={settings.startTime||''} onChange={e=>setSettings({ ...settings, startTime: e.target.value })} style={styles.textInput} />
            <Text>End Time</Text>
            <input type="time" value={settings.endTime||''} onChange={e=>setSettings({ ...settings, endTime: e.target.value })} style={styles.textInput} />
            <Text>Classes (comma-separated)</Text>
            <input value={(settings.classes||[]).join(',')} onChange={e=>setSettings({ ...settings, classes: e.target.value.split(',').map(s=>s.trim()).filter(Boolean) })} style={styles.textInput} />
            <Text>Sections (comma-separated)</Text>
            <input value={(settings.sections||[]).join(',')} onChange={e=>setSettings({ ...settings, sections: e.target.value.split(',').map(s=>s.trim()).filter(Boolean) })} style={styles.textInput} />
            <Text>Years (comma-separated)</Text>
            <input value={(settings.years||[]).join(',')} onChange={e=>setSettings({ ...settings, years: e.target.value.split(',').map(s=>Number(s.trim())).filter(n=>!isNaN(n)) })} style={styles.textInput} />
            <Text>Location Mode</Text>
            <select value={settings.locationMode} onChange={e=>setSettings({ ...settings, locationMode: e.target.value })} style={styles.select}>
              <option value="college">College</option>
              <option value="staff">Staff</option>
            </select>
            <Text>College Location (lat,lon)</Text>
            <input value={`${settings.collegeLocation?.latitude||''},${settings.collegeLocation?.longitude||''}`} onChange={e=>{ const [lat,lon]=e.target.value.split(','); setSettings({ ...settings, collegeLocation: { latitude: Number(lat), longitude: Number(lon) } }); }} style={styles.textInput} />
            <Text>Staff Location (lat,lon)</Text>
            <input value={`${settings.staffLocation?.latitude||''},${settings.staffLocation?.longitude||''}`} onChange={e=>{ const [lat,lon]=e.target.value.split(','); setSettings({ ...settings, staffLocation: { latitude: Number(lat), longitude: Number(lon) } }); }} style={styles.textInput} />
            <ActionButton title="Save Settings" color="#3b82f6" onPress={saveSettings} />
          </View>
        </View>
      )}

      {tab === 'notifications' && (
        <View style={{ width: '100%' }}>
          <Text style={styles.textDark}>Notifications</Text>
          <View style={styles.table}>
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
          </View>
        </View>
      )}
        <View style={{ width: '100%' }}>
          <Text style={styles.textDark}>Pings: {pings.length}</Text>
          <View style={styles.table}>
            <View style={styles.tableHeader}>
              <Text style={[styles.th, { flex: 2 }]}>Time</Text>
              <Text style={[styles.th, { flex: 1.5 }]}>Name</Text>
              <Text style={[styles.th, { flex: 1.5 }]}>Reg No</Text>
              <Text style={[styles.th, { flex: 1.5 }]}>Period/Type</Text>
              <Text style={[styles.th, { flex: 1 }]}>Location</Text>
            </View>
            {pings.map((p, i) => (
              <View key={i} style={styles.tableRow}>
                <Text style={[styles.td, { flex: 2 }]}>{new Date(p.timestamp).toLocaleString()}</Text>
                <Text style={[styles.td, { flex: 1.5 }]}>{p.studentName || ''}</Text>
                <Text style={[styles.td, { flex: 1.5 }]}>{p.regNo || ''}</Text>
                <Text style={[styles.td, { flex: 1.5 }]}>{p.periodNumber || ''} {p.timestampType || ''}</Text>
                <TouchableOpacity style={{ flex: 1 }} onPress={() => window.open(`https://maps.google.com/?q=${p.location?.latitude},${p.location?.longitude}`, '_blank')}>
                  <Text style={[styles.td, { color: '#3b82f6', textDecorationLine: 'underline' }]}>View Map</Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>
        </View>
    

      {tab === 'sessions' && (
        <View style={{ width: '100%' }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
            <Text style={styles.textDark}>Logged in: {sessions.loggedIn.length} | Logged out: {sessions.loggedOut.length}</Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <ActionButton title={ctrl.pingEnabled ? 'Stop Pings' : 'Start Pings'} color={ctrl.pingEnabled ? '#ef4444' : '#22c55e'} onPress={() => toggleControl(!ctrl.pingEnabled)} />
              <ActionButton title="Refresh" color="#64748b" onPress={() => { loadSessions(); readControl(); }} />
            </View>
          </View>

          <View style={{ marginBottom: 12 }}>
            <Text style={styles.textDark}>Interval (ms)</Text>
            <input type="number" value={ctrl.intervalMs} onChange={e => setCtrl({ ...ctrl, intervalMs: Number(e.target.value) })} style={styles.textInput} />
            <ActionButton title="Apply Interval" color="#3b82f6" onPress={() => toggleControl(ctrl.pingEnabled)} />
          </View>

          <Text style={[styles.th, { marginBottom: 6 }]}>Currently Logged In</Text>
          <View style={styles.table}>
            <View style={styles.tableHeader}>
              <Text style={[styles.th, { flex: 2 }]}>Name</Text>
              <Text style={[styles.th, { flex: 1.5 }]}>Reg No</Text>
              <Text style={[styles.th, { flex: 1.5 }]}>Username</Text>
              <Text style={[styles.th, { flex: 2 }]}>Last Login</Text>
            </View>
            {sessions.loggedIn.map((u, i) => (
              <View key={i} style={styles.tableRow}>
                <Text style={[styles.td, { flex: 2 }]}>{u.name}</Text>
                <Text style={[styles.td, { flex: 1.5 }]}>{u.regNo}</Text>
                <Text style={[styles.td, { flex: 1.5 }]}>{u.username}</Text>
                <Text style={[styles.td, { flex: 2 }]}>{u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString() : ''}</Text>
              </View>
            ))}
          </View>

          <Text style={[styles.th, { marginVertical: 10 }]}>Logged Out</Text>
          <View style={styles.table}>
            <View style={styles.tableHeader}>
              <Text style={[styles.th, { flex: 2 }]}>Name</Text>
              <Text style={[styles.th, { flex: 1.5 }]}>Reg No</Text>
              <Text style={[styles.th, { flex: 1.5 }]}>Username</Text>
              <Text style={[styles.th, { flex: 2 }]}>Last Logout</Text>
            </View>
            {sessions.loggedOut.map((u, i) => (
              <View key={i} style={styles.tableRow}>
                <Text style={[styles.td, { flex: 2 }]}>{u.name}</Text>
                <Text style={[styles.td, { flex: 1.5 }]}>{u.regNo}</Text>
                <Text style={[styles.td, { flex: 1.5 }]}>{u.username}</Text>
                <Text style={[styles.td, { flex: 2 }]}>{u.lastLogoutAt ? new Date(u.lastLogoutAt).toLocaleString() : ''}</Text>
              </View>
            ))}
          </View>
        </View>
      )}

      </ScrollView>
      
      {/* Slide-in filter sidebar */}
      {showFilters && (
        <View style={styles.backdrop} onClick={() => setShowFilters(false)}>
          <View style={styles.sidebar} onClick={(e) => e.stopPropagation()}>
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
                
                <ActionButton 
                  title="Apply Filters" 
                  color="#3b82f6" 
                  onPress={() => { 
                    setShowFilters(false); 
                    if (tab==='attendance') loadAttendance(); 
                    else if (tab==='pings') loadPings(); 
                    else if (tab==='users') loadUsers();
                  }} 
                />
              </View>
              
              <View style={styles.filterSection}>
                <Text style={styles.sectionTitle}>Export Data</Text>
                <ActionButton title="Export Users (CSV)" color="#059669" onPress={exportUsers} />
                <ActionButton title="Export Attendance (CSV)" color="#059669" onPress={exportAttendance} />
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    backgroundColor: '#f8fafc',
    borderBottomColor: '#e5e7eb',
    borderBottomWidth: 1,
  },
  title: { color: '#111', fontSize: 26, fontWeight: '800' },
  buttonGroup: { flexDirection: 'row', gap: 8 },
  scroll: { flexGrow: 1, backgroundColor: '#fff', padding: 20 },
  text: { color: '#555' },
  textDark: { color: '#111' },
  btn: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 6 },
  btnText: { color: '#fff', fontWeight: '700' },
  
  backdrop: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
    zIndex: 1000,
  },
  sidebar: {
    position: 'absolute',
    right: 0,
    top: 0,
    height: '100vh',
    width: 380,
    backgroundColor: '#fff',
    boxShadow: '-4px 0 12px rgba(0,0,0,0.15)',
  },
  foldHandle: {
    position: 'absolute',
    left: -24,
    top: '50%',
    marginTop: -20,
    width: 24,
    height: 40,
    borderTopLeftRadius: 4,
    borderBottomLeftRadius: 4,
    backgroundColor: '#64748b',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sidebarHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomColor: '#e5e7eb',
    borderBottomWidth: 1,
    backgroundColor: '#f8fafc',
  },
  sidebarTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111',
  },
  closeBtn: {
    padding: 8,
    borderRadius: 4,
    backgroundColor: '#ef4444',
  },
  closeBtnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  sidebarContent: {
    padding: 16,
    gap: 24,
  },
  filterSection: {
    gap: 8,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111',
    marginBottom: 8,
  },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  dateLabel: {
    minWidth: 40,
    color: '#555',
  },
  dateInput: {
    flex: 1,
    padding: 8,
    border: '1px solid #d1d5db',
    borderRadius: 4,
  },
  select: {
    width: '100%',
    padding: 8,
    border: '1px solid #d1d5db',
    borderRadius: 4,
    marginBottom: 8,
  },
  textInput: {
    width: '100%',
    padding: 8,
    border: '1px solid #d1d5db',
    borderRadius: 4,
    marginBottom: 8,
  },
  hint: {
    fontSize: 12,
    color: '#6b7280',
    marginTop: 4,
  },
  chartTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111',
    marginBottom: 8,
  },
  chartBar: {
    height: 20,
    flexDirection: 'row',
    backgroundColor: '#e5e7eb',
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 4,
  },
  chartSegment: {
    height: '100%',
  },
  chartLabel: {
    fontSize: 12,
    color: '#555',
  },
  
  table: {
    width: '100%',
    borderColor: '#e5e7eb',
    borderWidth: 1,
    borderRadius: 8,
    overflow: 'hidden',
  },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: '#f8fafc',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomColor: '#e5e7eb',
    borderBottomWidth: 1,
  },
  tableRow: {
    flexDirection: 'row',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomColor: '#f3f4f6',
    borderBottomWidth: 1,
  },
  th: {
    color: '#374151',
    fontWeight: '700',
    fontSize: 14,
  },
  td: {
    color: '#111',
    fontSize: 14,
  },
});