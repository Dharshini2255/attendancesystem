import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState, useEffect } from 'react';
import * as LocalAuthentication from 'expo-local-authentication';
import { Alert, Button, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';

export default function Step5() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const username = typeof params.username === 'string' ? params.username : '';

  const [supported, setSupported] = useState(false);
  const [enrolled, setEnrolled] = useState(false);
  const [busy, setBusy] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        let hw = false, en = false;
        try { hw = await LocalAuthentication.hasHardwareAsync(); } catch {}
        try { en = await LocalAuthentication.isEnrolledAsync(); } catch {}
        setSupported(!!hw);
        setEnrolled(!!en);
      } finally { setBusy(false); }
    })();
  }, []);

  const enrollNow = async () => {
    try {
      const res = await LocalAuthentication.authenticateAsync({ promptMessage: 'Set up biometrics' });
      if (!res.success) {
        Alert.alert('Biometric failed', 'Please try again.');
        return;
      }
      // Mark on server
      const r = await fetch('https://attendancesystem-backend-mias.onrender.com/biometric/enroll', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username })
      });
      if (!r.ok) {
        const e = await r.json().catch(()=>({error:'Server error'}));
        Alert.alert('Server Error', e.error || 'Could not record enrollment');
        return;
      }
      Alert.alert('Success', 'Biometric setup complete. You can login now.');
      router.replace('/login');
      if (Platform.OS === 'web') {
        setTimeout(() => { try { if (typeof window !== 'undefined') window.location.assign('/login'); } catch {} }, 50);
      }
    } catch (err) {
      Alert.alert('Error', 'Enrollment failed.');
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Step 5: Biometric Setup</Text>
      {busy ? (
        <Text style={styles.text}>Checking device…</Text>
      ) : (
        <>
          <Text style={styles.text}>Device support: {supported ? 'Yes' : 'No'}</Text>
          <Text style={styles.text}>Biometric enrolled on device: {enrolled ? 'Yes' : 'No'}</Text>
          {!supported && (
            <Text style={styles.note}>Your device does not support biometrics. You can continue but attendance will be blocked until setup on a supported device.</Text>
          )}
          {!enrolled && supported && (
            <Text style={styles.note}>Please add a fingerprint or face unlock in your device settings, then tap Continue.</Text>
          )}
          <View style={{ height: 12 }} />
          <Button title="Continue" onPress={enrollNow} />
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, justifyContent: 'center', alignItems: 'center', padding: 20, backgroundColor: '#222' },
  title: { color: '#fff', fontSize: 22, fontWeight: 'bold', marginBottom: 16 },
  text: { color: '#fff', marginBottom: 8 },
  note: { color: '#ddd', marginBottom: 12, textAlign: 'center' },
});
