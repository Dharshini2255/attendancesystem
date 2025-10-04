import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, useColorScheme, View } from 'react-native';

export default function AdminDashboard() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const textColor = isDark ? '#fff' : '#000';
  const backgroundColor = isDark ? '#222' : '#fff';
  const boxColor = isDark ? '#333' : '#f2f2f2';

  const BACKEND_URL = 'http://192.168.0.132:5000/users'; // GET route

  const fetchUsers = async () => {
    try {
      const response = await fetch(BACKEND_URL);
      const data = await response.json();
      setUsers(data);
    } catch (err) {
      console.error('Error fetching users:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  if (loading) return <ActivityIndicator size="large" color="#007AFF" style={{ flex: 1, justifyContent: 'center' }} />;

  return (
    <ScrollView style={{ flex: 1, backgroundColor, padding: 20 }}>
      <Text style={[styles.title, { color: textColor }]}>Admin Dashboard - All Users</Text>
      {users.length === 0 && <Text style={{ color: textColor }}>No users found.</Text>}
      {users.map((user, index) => (
        <View key={user._id} style={[styles.userBox, { backgroundColor: boxColor }]}>
          <Text style={[styles.label, { color: textColor }]}>#{index + 1}</Text>
          <Text style={[styles.info, { color: textColor }]}>Name: {user.name}</Text>
          <Text style={[styles.info, { color: textColor }]}>Reg No: {user.regNo}</Text>
          <Text style={[styles.info, { color: textColor }]}>Class: {user.class}</Text>
          <Text style={[styles.info, { color: textColor }]}>Year: {user.year}</Text>
          <Text style={[styles.info, { color: textColor }]}>Phone: {user.phone}</Text>
          <Text style={[styles.info, { color: textColor }]}>Username: {user.username}</Text>
          <Text style={[styles.info, { color: textColor }]}>Email: {user.email}</Text>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 22, fontWeight: 'bold', marginBottom: 20 },
  userBox: { padding: 15, borderRadius: 8, marginBottom: 15 },
  label: { fontWeight: 'bold', marginBottom: 5 },
  info: { marginLeft: 5, marginBottom: 2 },
});
