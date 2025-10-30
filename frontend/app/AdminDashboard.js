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
    <View style={{ flex: 1, backgroundColor: '#fff' }}>
      {/* Header bar with title and buttons */}
      <View style={styles.headerBar}>
        <Text style={styles.title}>Admin Dashboard</Text>
        <View style={styles.buttonGroup}>
          <ActionButton title="Users" color="#3b82f6" onPress={() => { setTab('users'); }} />
          <ActionButton title="Attendance" color="#8b5cf6" onPress={() => { setTab('attendance'); loadAttendance(); }} />
          <ActionButton title="Pings/Location" color="#10b981" onPress={() => { setTab('pings'); loadPings(); }} />
          <ActionButton title="Filters" color="#64748b" onPress={() => setShowFilters(true)} />
          <ActionButton title="Exit Admin" color="#ef4444" onPress={async () => { await AsyncStorage.removeItem('adminAuth'); router.replace('/home'); }} />
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>

      </ScrollView>
      
      {/* Slide-in filter sidebar */}
      {showFilters && (
        <View style={styles.backdrop} onTouchStart={() => setShowFilters(false)}>
          <View style={styles.sidebar}>
            <View style={styles.sidebarHeader}>
              <Text style={styles.sidebarTitle}>Filters & Analytics</Text>
              <TouchableOpacity onPress={() => setShowFilters(false)} style={styles.closeBtn}>
                <Text style={styles.closeBtnText}>✕</Text>
              </TouchableOpacity>
            </View>
            
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
                
                <Text style={styles.sectionTitle}>Filter by Student</Text>
                <input 
                  value={studentId} 
                  onChange={e => setStudentId(e.target.value)} 
                  placeholder="Enter Student ID" 
                  style={styles.textInput}
                />
                
                <ActionButton 
                  title="Apply Filters" 
                  color="#3b82f6" 
                  onPress={() => { 
                    setShowFilters(false); 
                    if (tab==='attendance') loadAttendance(); 
                    else if (tab==='pings') loadPings(); 
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
      {tab === 'users' && (
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
                <Text style={[styles.td, { flex: 2 }]}>{r.studentName}</Text>
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

      {tab === 'pings' && (
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
    animation: 'slideInRight 0.3s ease-out',
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
