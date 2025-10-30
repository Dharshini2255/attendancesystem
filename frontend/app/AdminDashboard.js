import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Alert, Button, ScrollView, StyleSheet, Text, View } from 'react-native';

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

  return (
    <ScrollView contentContainerStyle={styles.scroll}>
      <Text style={styles.title}>Admin Dashboard</Text>

      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
        <Button title="Users" onPress={() => { setTab('users'); }} />
        <Button title="Attendance" onPress={() => { setTab('attendance'); loadAttendance(); }} />
        <Button title="Pings/Locations" onPress={() => { setTab('pings'); loadPings(); }} />
        <View style={{ width: 12 }} />
        <Button title="Exit Admin" onPress={async () => { await AsyncStorage.removeItem('adminAuth'); router.replace('/home'); }} />
      </View>

      {/* Filters */}
      <View style={{ width: '100%', marginBottom: 12 }}>
        <Text style={{ color: '#ccc', marginBottom: 6 }}>Filters</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
          <Text style={styles.text}>From:</Text>
          <input type="date" value={from} onChange={e => setFrom(e.target.value)} />
          <Text style={styles.text}>To:</Text>
          <input type="date" value={to} onChange={e => setTo(e.target.value)} />
          <Text style={styles.text}>Granularity:</Text>
          <select value={granularity} onChange={e => setGranularity(e.target.value)}>
            <option value="day">Day</option>
            <option value="week">Week</option>
            <option value="month">Month</option>
            <option value="year">Year</option>
          </select>
          <Text style={styles.text}>Student ID (optional):</Text>
          <input value={studentId} onChange={e => setStudentId(e.target.value)} placeholder="studentId" />
          <Button title="Apply" onPress={() => { if (tab==='attendance') loadAttendance(); else if (tab==='pings') loadPings(); }} />
        </View>
      </View>

      {tab === 'users' && (
        <View style={{ width: '100%' }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
            <Text style={styles.text}>Users: {users.length}</Text>
            <Button title="Export CSV" onPress={exportUsers} />
          </View>
          {users.map((u, i) => (
            <View key={u._id || i} style={styles.rowItem}>
              <Text style={styles.cell}>{u.name}</Text>
              <Text style={styles.cell}>{u.regNo}</Text>
              <Text style={styles.cell}>{u.class}</Text>
              <Text style={styles.cell}>{u.year}</Text>
              <Text style={styles.cell}>{u.email}</Text>
              <Text style={styles.cell}>{u.username}</Text>
              <Text style={styles.cellSmall}>{u.uuid}</Text>
            </View>
          ))}
        </View>
      )}

      {tab === 'attendance' && (
        <View style={{ width: '100%' }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
            <Text style={styles.text}>Rows: {attRows.length}</Text>
            <Button title="Export CSV" onPress={exportAttendance} />
          </View>
          {attRows.map((r, i) => (
            <View key={i} style={styles.rowItem}>
              <Text style={styles.cell}>{r.date || r.bucket}</Text>
              <Text style={styles.cell}>{r.studentName}</Text>
              <Text style={styles.cell}>{r.regNo}</Text>
              {r.periodNumber != null ? (
                <Text style={styles.cell}>P{r.periodNumber} - {r.status}</Text>
              ) : (
                <Text style={styles.cell}>Present: {r.present} | Absent: {r.absent}</Text>
              )}
            </View>
          ))}
        </View>
      )}

      {tab === 'pings' && (
        <View style={{ width: '100%' }}>
          <Text style={styles.text}>Pings: {pings.length}</Text>
          {pings.map((p, i) => (
            <View key={i} style={styles.rowItem}>
              <Text style={styles.cell}>{new Date(p.timestamp).toLocaleString()}</Text>
              <Text style={styles.cell}>{p.studentName || ''}</Text>
              <Text style={styles.cell}>{p.regNo || ''}</Text>
              <Text style={styles.cell}>{p.periodNumber || ''} {p.timestampType || ''}</Text>
              <a href={`https://maps.google.com/?q=${p.location?.latitude},${p.location?.longitude}`} target="_blank" rel="noreferrer">View Map</a>
            </View>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#222', alignItems: 'center', justifyContent: 'center' },
  scroll: { flexGrow: 1, backgroundColor: '#222', alignItems: 'center', padding: 20, paddingTop: 60, gap: 8 },
  title: { color: '#fff', fontSize: 24, fontWeight: 'bold', marginBottom: 10 },
  text: { color: '#ccc' },
  rowItem: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, borderBottomColor: '#444', borderBottomWidth: 1, paddingVertical: 6 },
  cell: { color: '#fff', minWidth: 120 },
  cellSmall: { color: '#aaa', minWidth: 160 },
});
