import * as Location from 'expo-location';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Button,
  ScrollView,
  StyleSheet,
  Text,
  View,
  Platform
} from 'react-native';
import uuid from 'react-native-uuid';
import { useSignup } from '../../context/SignupContext';

export default function Step4() {
  const router = useRouter();
  const { signupData, resetSignup, markSignupCompleted } = useSignup();

  const [location, setLocation] = useState(null);
  const [uuidValue, setUuidValue] = useState('');
  const [loading, setLoading] = useState(true);

  const BACKEND_URL = 'https://attendancesystem-backend-mias.onrender.com/signup';

  useEffect(() => {
    const fetchData = async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          Alert.alert('Location Required', 'Please allow location access.');
          return;
        }

        const loc = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Highest,
          maximumAge: 0,
          timeout: 10000
        });

        setLocation({
          latitude: loc.coords.latitude,
          longitude: loc.coords.longitude,
          timestamp: loc.timestamp
        });

        const generatedId = uuid.v4();
        console.log('Generated UUID:', generatedId);
        setUuidValue(generatedId);
      } catch (err) {
        console.error('Error fetching location or UUID:', err);
        Alert.alert('Error', 'Could not fetch location or generate ID.');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  const handleFinish = async () => {
    if (!location || !uuidValue) {
      let missing = [];
      if (!location) missing.push('Location');
      if (!uuidValue) missing.push('UUID');

      Alert.alert(
        'Missing Info',
        `The following fields are required:\n- ${missing.join('\n- ')}`
      );
      return;
    }

    try {
      const payload = {
        ...signupData,
        location,
        uuid: uuidValue
      };

      const response = await fetch(BACKEND_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await response.json();

      if (response.ok) {
        // Proceed to biometric enrollment step
        try { await markSignupCompleted(); } catch {}
        const uname = (data?.user?.username) || signupData?.username;
        Alert.alert('Signup Complete', 'Next, set up biometrics.');
        router.replace({ pathname: '/signup/step5', params: { username: uname } });
        if (Platform.OS === 'web') {
          setTimeout(() => {
            try {
              if (typeof window !== 'undefined' && !window.location.pathname.endsWith('/signup/step5')) {
                const q = uname ? `?username=${encodeURIComponent(uname)}` : '';
                window.location.assign(`/signup/step5${q}`);
              }
            } catch {}
          }, 50);
        }
      } else {
        // Stay on this screen to let the user fix inputs; do not redirect
        Alert.alert('Signup Failed', data.error || 'Could not create account. Please review your details and try again.');
      }
    } catch (err) {
      console.error(err);
      Alert.alert('Network Error', 'Could not connect to server. Please try again.');
    }
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#fff" />
        <Text style={{ color: '#fff', marginTop: 10 }}>Fetching location and generating ID...</Text>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.scrollContainer}>
      <Text style={styles.title}>Signup Complete 🎉</Text>
      <View style={styles.infoBox}>
        {Object.entries(signupData).map(([key, value]) => {
          if (!value || key === 'password') return null;
          return (
            <View key={key} style={styles.row}>
              <Text style={styles.label}>{key.charAt(0).toUpperCase() + key.slice(1)}:</Text>
              <Text style={styles.value}>{value}</Text>
            </View>
          );
        })}
        {location && (
          <>
            <View style={styles.row}>
              <Text style={styles.label}>Location:</Text>
              <Text style={styles.value}>
                {location.latitude}, {location.longitude}
              </Text>
            </View>
            <Text style={{ color: '#aaa', marginBottom: 10 }}>
              Location fetched at: {new Date(location.timestamp).toLocaleTimeString()}
            </Text>
          </>
        )}
        {uuidValue && (
          <View style={styles.row}>
            <Text style={styles.label}>UUID:</Text>
            <Text style={styles.value}>{uuidValue}</Text>
          </View>
        )}
      </View>
      <Button title="Finish & Go to Login" onPress={handleFinish} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#222' },
  scrollContainer: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    backgroundColor: '#222',
  },
  title: { fontSize: 22, fontWeight: 'bold', color: '#fff', marginBottom: 20 },
  infoBox: { marginBottom: 30, width: '100%' },
  row: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 5,
  },
  label: { fontSize: 16, fontWeight: '600', color: '#fff', marginRight: 5 },
  value: { fontSize: 16, color: '#fff' },
});
