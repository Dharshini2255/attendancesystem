import * as Location from 'expo-location';
import { useEffect, useState } from 'react';
import { Alert, Button, StyleSheet, Text, View } from 'react-native';

export default function AttendancePing({ studentId }) {
  const [location, setLocation] = useState(null);
  const [status, setStatus] = useState('');
  const BACKEND_URL = 'https://railway-up-production-fda2.up.railway.app/attendance/mark';

  useEffect(() => {
    const fetchLocation = async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Denied', 'Location access is required.');
        return;
      }

      const loc = await Location.getCurrentPositionAsync({});
      setLocation({
        latitude: loc.coords.latitude,
        longitude: loc.coords.longitude
      });
    };

    fetchLocation();
  }, []);

  const sendPing = async (periodNumber, timestampType) => {
    if (!location) {
      Alert.alert('Location Missing', 'Could not fetch location.');
      return;
    }

    try {
      const response = await fetch(BACKEND_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studentId, periodNumber, timestampType, location })
      });

      const data = await response.json();

      if (response.ok) {
        setStatus(`✅ Ping recorded for Period ${periodNumber} (${timestampType})`);
      } else {
        Alert.alert('Ping Failed', data.error || 'Could not mark attendance');
      }
    } catch (err) {
      console.error(err);
      Alert.alert('Network Error', 'Could not connect to server');
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Ping Attendance</Text>
      <View style={styles.buttonRow}>
        <Button title="Start" onPress={() => sendPing(1, 'start')} />
        <Button title="+15 min" onPress={() => sendPing(1, 'afterStart15')} />
        <Button title="-10 min" onPress={() => sendPing(1, 'beforeEnd10')} />
        <Button title="End" onPress={() => sendPing(1, 'end')} />
      </View>
      {status ? <Text style={styles.status}>{status}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, backgroundColor: '#222' },
  title: { color: '#fff', fontSize: 18, fontWeight: 'bold', marginBottom: 10 },
  buttonRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
  status: { color: '#0f0', marginTop: 10 }
});
