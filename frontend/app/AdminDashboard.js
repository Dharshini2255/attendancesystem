import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Alert, Button, ScrollView, StyleSheet, Text, View, TouchableOpacity } from 'react-native';

export default function AdminDashboard() {
  const router = useRouter();
  const [authorized, setAuthorized] = useState(false);
  const [tab, setTab] = useState('users'); // users | attendance | pings

  const [users, setUsers] = useState([]);
  const [attRows, setAttRows] = useState([]);
  const [pings, setPings] = useState([]);

  const [from, setFrom] = useState(new Date().toLocaleDateString('en-CA'));
  const [to, setTo] = useState(new Date().toLocaleDateString('en-CA'));
  const [granularity, setGranularity] = useState('day');
  const [studentId, setStudentId] = useState('');
  const [showFilters, setShowFilters] = useState(false);

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
      const res = await fetch(`${api}/admin/users`);
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
      if (studentId) url.searchParams.set('studentId', studentId);
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
      if (studentId) url.searchParams.set('studentId', studentId);
      const res = await fetch(url);
      const data = await res.json();
      setPings(data || []);
    } catch {}
  };

  const exportUsers = () => { window.location.assign(`${api}/admin/export/users.csv`); };
  const exportAttendance = () => {
    const url = new URL(`${api}/admin/export/attendance.csv`);
    url.searchParams.set('from', from); url.searchParams.set('to', to);
    if (studentId) url.searchParams.set('studentId', studentId);
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
    <ScrollView contentContainerStyle={styles.scroll}>
      <Text style={styles.title}>Admin Dashboard</Text>

      {/* Top action bar */}
      <View style={styles.topBar}>
        <ActionButton title="Users" color="#3b82f6" onPress={() => { setTab('users'); }} />
        <ActionButton title="Attendance" color="#8b5cf6" onPress={() => { setTab('attendance'); loadAttendance(); }} />
        <ActionButton title="Pings/Location" color="#10b981" onPress={() => { setTab('pings'); loadPings(); }} />
        <View style={{ flex: 1 }} />
        <ActionButton title="Filters" color="#64748b" onPress={() => setShowFilters(true)} />
        <ActionButton title="Exit Admin" color="#ef4444" onPress={async () => { await AsyncStorage.removeItem('adminAuth'); router.replace('/home'); }} />
      </View>

      {/* Filter side panel */}
      {showFilters && (
        <View style={styles.filterPanel}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={{ fontWeight: '700' }}>Filters & Export</Text>
            <ActionButton title="Close" color="#ef4444" onPress={() => setShowFilters(false)} />
          </View>
          <View style={styles.filterRow}>
            <Text>From</Text>
            <input type="date" value={from} onChange={e => setFrom(e.target.value)} />
          </View>
          <View style={styles.filterRow}>
            <Text>To</Text>
            <input type="date" value={to} onChange={e => setTo(e.target.value)} />
          </View>
          <View style={styles.filterRow}>
            <Text>Granularity</Text>
            <select value={granularity} onChange={e => setGranularity(e.target.value)}>
              <option value="day">Day</option>
              <option value="week">Week</option>
              <option value="month">Month</option>
              <option value="year">Year</option>
            </select>
          </View>
          <View style={styles.filterRow}>
            <Text>Student ID</Text>
            <input value={studentId} onChange={e => setStudentId(e.target.value)} placeholder="studentId" />
          </View>
          <ActionButton title="Apply" color="#0ea5e9" onPress={() => { setShowFilters(false); if (tab==='attendance') loadAttendance(); else if (tab==='pings') loadPings(); }} />
          <View style={{ height: 8 }} />
          <Text style={{ fontWeight: '700' }}>Export</Text>
          <ActionButton title="Users (CSV)" color="#22c55e" onPress={exportUsers} />
          <ActionButton title="Attendance (CSV)" color="#22c55e" onPress={exportAttendance} />
          <Text style={{ color: '#555', marginTop: 6 }}>Tip: CSV opens in Excel.</Text>
          <View style={{ height: 12 }} />
          <Text style={{ fontWeight: '700' }}>Quick Analytics</Text>
          {/* Simple bar chart: present vs absent from current attendance rows */}
          {(() => {
            const present = attRows.filter(r => r.status === 'present').length;
            const absent = attRows.filter(r => r.status === 'absent').length;
            const total = Math.max(1, present + absent);
            return (
              <View style={{ marginTop: 8 }}>
                <Text>Present vs Absent</Text>
                <View style={{ height: 16, flexDirection: 'row', backgroundColor: '#e5e7eb', borderRadius: 4, overflow: 'hidden' }}>
                  <View style={{ width: `${(present/total)*100}%`, backgroundColor: '#10b981' }} />
                  <View style={{ width: `${(absent/total)*100}%`, backgroundColor: '#ef4444' }} />
                </View>
                <Text style={{ fontSize: 12, color: '#555' }}>Present {present} / Absent {absent}</Text>
              </View>
            );
          })()}
        </View>
      )}

      {tab === 'users' && (
        <View style={{ width: '100%' }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
            <Text style={styles.textDark}>Users: {users.length}</Text>
            <ActionButton title="Export CSV" color="#22c55e" onPress={exportUsers} />
          </View>
          <View style={styles.tableHeader}>
            <Text style={styles.th}>Name</Text>
            <Text style={styles.th}>Reg No</Text>
            <Text style={styles.th}>Class</Text>
            <Text style={styles.th}>Year</Text>
            <Text style={styles.th}>Email</Text>
            <Text style={styles.th}>Username</Text>
            <Text style={styles.th}>UUID</Text>
          </View>
          {users.map((u, i) => (
            <View key={u._id || i} style={styles.rowItem}>
              <Text style={styles.td}>{u.name}</Text>
              <Text style={styles.td}>{u.regNo}</Text>
              <Text style={styles.td}>{u.class}</Text>
              <Text style={styles.td}>{u.year}</Text>
              <Text style={styles.td}>{u.email}</Text>
              <Text style={styles.td}>{u.username}</Text>
              <Text style={styles.tdSmall}>{u.uuid}</Text>
            </View>
          ))}
        </View>
      )}

      {tab === 'attendance' && (
        <View style={{ width: '100%' }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
            <Text style={styles.textDark}>Rows: {attRows.length}</Text>
            <ActionButton title="Export CSV" color="#22c55e" onPress={exportAttendance} />
          </View>
          <View style={styles.tableHeader}>
            <Text style={styles.th}>{granularity==='day' ? 'Date' : 'Bucket'}</Text>
            <Text style={styles.th}>Name</Text>
            <Text style={styles.th}>Reg No</Text>
            <Text style={styles.th}>Details</Text>
          </View>
          {attRows.map((r, i) => (
            <View key={i} style={styles.rowItem}>
              <Text style={styles.td}>{r.date || r.bucket}</Text>
              <Text style={styles.td}>{r.studentName}</Text>
              <Text style={styles.td}>{r.regNo}</Text>
              {r.periodNumber != null ? (
                <Text style={styles.td}>P{r.periodNumber} - {r.status}</Text>
              ) : (
                <Text style={styles.td}>Present: {r.present} | Absent: {r.absent}</Text>
              )}
            </View>
          ))}
        </View>
      )}

      {tab === 'pings' && (
        <View style={{ width: '100%' }}>
          <Text style={styles.textDark}>Pings: {pings.length}</Text>
          <View style={styles.tableHeader}>
            <Text style={styles.th}>Time</Text>
            <Text style={styles.th}>Name</Text>
            <Text style={styles.th}>Reg No</Text>
            <Text style={styles.th}>Period/Type</Text>
            <Text style={styles.th}>Location</Text>
          </View>
          {pings.map((p, i) => (
            <View key={i} style={styles.rowItem}>
              <Text style={styles.td}>{new Date(p.timestamp).toLocaleString()}</Text>
              <Text style={styles.td}>{p.studentName || ''}</Text>
              <Text style={styles.td}>{p.regNo || ''}</Text>
              <Text style={styles.td}>{p.periodNumber || ''} {p.timestampType || ''}</Text>
              <a href={`https://maps.google.com/?q=${p.location?.latitude},${p.location?.longitude}`} target="_blank" rel="noreferrer">View Map</a>
            </View>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  scroll: { flexGrow: 1, backgroundColor: '#fff', alignItems: 'center', padding: 20, paddingTop: 60, gap: 8 },
  title: { color: '#111', fontSize: 26, fontWeight: '800', marginBottom: 10 },
  text: { color: '#555' },
  textDark: { color: '#111' },
  topBar: { flexDirection: 'row', alignItems: 'center', gap: 8, width: '100%', backgroundColor: '#f1f5f9', padding: 10, borderRadius: 8, marginBottom: 12, borderColor: '#e5e7eb', borderWidth: 1 },
  btn: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 6 },
  btnText: { color: '#fff', fontWeight: '700' },
  filterPanel: { position: 'fixed', right: 0, top: 0, height: '100vh', width: 320, backgroundColor: '#fff', borderLeftColor: '#e5e7eb', borderLeftWidth: 1, padding: 12, gap: 8 },
  filterRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginVertical: 6 },
  tableHeader: { flexDirection: 'row', gap: 8, backgroundColor: '#f8fafc', borderColor: '#e5e7eb', borderWidth: 1, paddingVertical: 6, paddingHorizontal: 4, borderRadius: 6, marginBottom: 6 },
  th: { color: '#111', fontWeight: '700', minWidth: 120 },
  rowItem: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, borderBottomColor: '#e5e7eb', borderBottomWidth: 1, paddingVertical: 8 },
  td: { color: '#111', minWidth: 120 },
  tdSmall: { color: '#555', minWidth: 160 }
});
