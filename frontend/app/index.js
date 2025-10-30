import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Button, StyleSheet, Text, View } from 'react-native';
import { useSignup } from '../context/SignupContext';
import AdminDashboard from './admin/AdminDashboard';

export default function IndexScreen() {
  const router = useRouter();
  const { hydrated, resumeSignup, currentStep, resetSignup } = useSignup();
  const [loading, setLoading] = useState(true);
  const [showAdminInline, setShowAdminInline] = useState(false);

  useEffect(() => {
    if (hydrated) setLoading(false);
    (async () => {
      try {
        if (typeof window !== 'undefined') {
          const params = new URLSearchParams(window.location.search);
          if (params.get('admin') === '1' || window.location.hash === '#admin') {
            setShowAdminInline(true);
            return;
          }
        }
        // also check persisted admin flag
        const { default: AsyncStorage } = await import('@react-native-async-storage/async-storage');
        const v = await AsyncStorage.getItem('adminAuth');
        if (v === 'true') setShowAdminInline(true);
      } catch {}
    })();
  }, [hydrated]);

  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#fff" />
        <Text style={styles.text}>Loading...</Text>
      </View>
    );
  }

  if (showAdminInline) {
    return (
      <View style={{ flex: 1 }}>
        <AdminDashboard />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Welcome to the Attendance System</Text>

      <Button title="Login" onPress={() => router.push('/login')} />

      <View style={styles.spacer} />

      <Button
        title="Start New Signup"
        onPress={async () => {
          await resetSignup();
          router.push('/signup/step1');
        }}
      />

      {resumeSignup && (
        <>
          <View style={styles.spacer} />
          <Button
            title="Resume Signup"
            onPress={() => router.push(`/signup/step${currentStep}`)}
          />
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#222',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 30,
    textAlign: 'center',
  },
  text: {
    color: '#fff',
    marginTop: 10,
  },
  spacer: {
    height: 20,
  },
});
