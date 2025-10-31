import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Button, StyleSheet, Text, View } from 'react-native';
import { useSignup } from '../context/SignupContext';

export default function IndexScreen() {
  const router = useRouter();
  const { hydrated, resumeSignup, currentStep, resetSignup } = useSignup();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (hydrated) setLoading(false);
  }, [hydrated]);

  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#fff" />
        <Text style={styles.text}>Loading...</Text>
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