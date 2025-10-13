import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Button,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput
} from 'react-native';
import { useSignup } from '../../context/SignupContext';

export default function Step3() {
  const router = useRouter();
  const { signupData, updateSignupData, currentStep, saveStep } = useSignup();

  const textColor = '#fff';
  const borderColor = '#555';
  const placeholderColor = '#aaa';
  const backgroundColor = '#222';

  const [email, setEmail] = useState('');
  const [checkingEmail, setCheckingEmail] = useState(false);
  const [emailExists, setEmailExists] = useState(false);
  const debounceTimeout = useRef(null);

  const BACKEND_CHECK_EMAIL = 'https://railway-up-production-fda2.up.railway.app/check-email';
 // replace with your server IP

  useEffect(() => {
    if (currentStep < 3) router.replace(`/signup/step${currentStep}`);
  }, [currentStep]);

  // Debounced real-time email check
  const checkEmailExists = async (emailToCheck) => {
    if (!emailToCheck) return false;
    setCheckingEmail(true);

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      const res = await fetch(BACKEND_CHECK_EMAIL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: emailToCheck }),
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      if (!res.ok) throw new Error('Server error');
      const data = await res.json();
      return data.exists;
    } catch (err) {
      console.error('Email check failed:', err.message);
      return false;
    } finally {
      setCheckingEmail(false);
    }
  };

  useEffect(() => {
    if (debounceTimeout.current) clearTimeout(debounceTimeout.current);

    debounceTimeout.current = setTimeout(async () => {
      const exists = await checkEmailExists(email);
      setEmailExists(exists);
    }, 700);
  }, [email]);

  const handleNext = () => {
    if (!email) {
      Alert.alert('Error', 'Email is required');
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      Alert.alert('Error', 'Invalid email format');
      return;
    }

    if (emailExists) {
      Alert.alert('Error', 'Email already registered');
      return;
    }

    updateSignupData({ email });
    saveStep(4);
    router.push('/signup/step4');
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={{
          flexGrow: 1,
          justifyContent: 'center',
          alignItems: 'center',
          padding: 20,
          paddingTop: 40,
          backgroundColor
        }}
      >
        <Text style={[styles.title, { color: textColor }]}>Step 3: Email</Text>

        <TextInput
          style={[styles.input, { color: textColor, borderColor, backgroundColor }]}
          placeholder="Email"
          placeholderTextColor={placeholderColor}
          autoCapitalize="none"
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
        />
        {checkingEmail && <Text style={{ color: textColor, marginBottom: 10 }}>Checking email...</Text>}
        {emailExists && <Text style={{ color: 'red', marginBottom: 10 }}>Email already registered</Text>}

        <Button title="Next" onPress={handleNext} disabled={checkingEmail} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 22, fontWeight: 'bold', marginBottom: 20 },
  input: { borderWidth: 1, padding: 10, marginBottom: 15, borderRadius: 5, width: '100%' }
});
