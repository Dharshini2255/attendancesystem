import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Alert, Button, ScrollView, StyleSheet, Text, View } from 'react-native';

export default function AdminDashboard() {
  const router = useRouter();
  const [authorized, setAuthorized] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const v = await AsyncStorage.getItem('adminAuth');
        if (v === 'true') {
          setAuthorized(true);
        } else {
          Alert.alert('Unauthorized', 'Admin access required');
          router.replace('/home');
        }
      } catch {
        router.replace('/home');
      }
    })();
  }, []);

  if (!authorized) {
    return <View style={styles.container}><Text style={{ color: '#fff' }}>Checking admin access…</Text></View>;
  }

  return (
    <ScrollView contentContainerStyle={styles.scroll}>
      <Text style={styles.title}>Admin Dashboard</Text>
      <Text style={styles.text}>Welcome, Dharshini Priya S</Text>
      <View style={{ height: 16 }} />
      <Button title="Exit Admin" onPress={async () => { await AsyncStorage.removeItem('adminAuth'); router.replace('/home'); }} />
      {/* TODO: add admin controls here (manage users, attendance, etc.) */}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#222', alignItems: 'center', justifyContent: 'center' },
  scroll: { flexGrow: 1, backgroundColor: '#222', alignItems: 'center', padding: 20, paddingTop: 60 },
  title: { color: '#fff', fontSize: 24, fontWeight: 'bold', marginBottom: 10 },
  text: { color: '#ccc' },
});
