import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  View
} from 'react-native';

export default function Profile() {
  const { username } = useLocalSearchParams();
  const [userInfo, setUserInfo] = useState(null);
  const [loading, setLoading] = useState(true);

  const BACKEND_URL = 'https://attendancesystem-backend-mias.onrender.com/userinfo';


  useEffect(() => {
    const fetchUserInfo = async () => {
      try {
        const response = await fetch(`${BACKEND_URL}?username=${username}`);
        const data = await response.json();

        if (response.ok) {
          setUserInfo(data);
        } else {
          console.error('Failed to fetch user info:', data.error);
        }
      } catch (err) {
        console.error('Network error:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchUserInfo();
  }, [username]);

  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#fff" />
        <Text style={{ color: '#fff', marginTop: 10 }}>Loading profile...</Text>
      </View>
    );
  }

  if (!userInfo) {
    return (
      <View style={styles.container}>
        <Text style={{ color: '#fff' }}>User info not found.</Text>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.scrollContainer}>
      <Text style={styles.title}>Profile</Text>
      <View style={styles.infoBox}>
        {Object.entries(userInfo).map(([key, value]) => {
          if (!value || key === 'password') return null;
          return (
            <View key={key} style={styles.row}>
              <Text style={styles.label}>{key.charAt(0).toUpperCase() + key.slice(1)}:</Text>
              <Text style={styles.value}>{String(value)}</Text>
            </View>
          );
        })}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#222' },
  scrollContainer: {
    flexGrow: 1,
    justifyContent: 'flex-start',
    alignItems: 'center',
    padding: 20,
    paddingTop: 60,
    backgroundColor: '#222',
  },
  title: { fontSize: 24, fontWeight: 'bold', marginBottom: 20, color: '#fff' },
  infoBox: { width: '100%' },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
    paddingHorizontal: 10,
  },
  label: { fontSize: 16, fontWeight: '600', color: '#fff' },
  value: { fontSize: 16, color: '#ccc' },
});
