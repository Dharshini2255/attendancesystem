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

export default function Step2() {
  const router = useRouter();
  const { signupData, updateSignupData, currentStep, saveStep } = useSignup();

  const textColor = '#fff';
  const borderColor = '#555';
  const placeholderColor = '#aaa';
  const backgroundColor = '#222';

  const [localData, setLocalData] = useState({
    username: '',
    password: '',
    confirmPassword: ''
  });

  const [checkingUsername, setCheckingUsername] = useState(false);
  const [usernameExists, setUsernameExists] = useState(false);
  const debounceTimeout = useRef(null);

  useEffect(() => {
    if (currentStep < 2) router.replace(`/signup/step${currentStep}`);
  }, [currentStep]);

  const checkUsernameExists = async (username) => {
  if (!username) return false;
  setCheckingUsername(true);

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    const response = await fetch('https://attendancesystem-backend-mias.onrender.com/check-username', {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ username }),
  signal: controller.signal
});

    clearTimeout(timeoutId);

    if (!response.ok) throw new Error('Server error');

    const data = await response.json();
    return data.exists;
  } catch (err) {
    console.error('Username check failed:', err.message);
    return false;
  } finally {
    setCheckingUsername(false);
  }
};


  useEffect(() => {
    if (debounceTimeout.current) clearTimeout(debounceTimeout.current);

    debounceTimeout.current = setTimeout(async () => {
      const exists = await checkUsernameExists(localData.username);
      setUsernameExists(exists);
    }, 700);
  }, [localData.username]);

  const handleNext = async () => {
    const { username, password, confirmPassword } = localData;

    if (!username || !password || !confirmPassword) {
      Alert.alert('Error', 'All fields are required');
      return;
    }

    if (username.length < 4) {
      Alert.alert('Error', 'Username must be at least 4 characters.');
      return;
    }

    if (usernameExists) {
      Alert.alert('Error', 'Username already exists. Please choose another.');
      return;
    }

    if (password.length < 4) {
      Alert.alert('Error', 'Password must be at least 4 characters.');
      return;
    }

    if (password !== confirmPassword) {
      Alert.alert('Error', 'Passwords do not match.');
      return;
    }

    await updateSignupData({ username, password });
    await saveStep(3);
    try { router.push('/signup/step3'); } catch {}
    if (Platform.OS === 'web') {
      setTimeout(() => {
        try {
          if (typeof window !== 'undefined' && !window.location.pathname.endsWith('/signup/step3')) {
            window.location.assign('/signup/step3');
          }
        } catch {}
      }, 50);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView
        contentContainerStyle={{
          flexGrow: 1,
          justifyContent: 'center',
          alignItems: 'center',
          padding: 20,
          paddingTop: 40
        }}
      >
        <Text style={[styles.title, { color: textColor }]}>Step 2: Account Info</Text>

        <TextInput
          style={[styles.input, { color: textColor, borderColor, backgroundColor }]}
          placeholder="Username"
          placeholderTextColor={placeholderColor}
          autoCapitalize="none"
          value={localData.username}
          onChangeText={(t) => setLocalData({ ...localData, username: t })}
        />
        {checkingUsername && <Text style={{ color: textColor, marginBottom: 10 }}>Checking username...</Text>}
        {usernameExists && <Text style={{ color: 'red', marginBottom: 10 }}>Username already taken</Text>}

        <TextInput
          style={[styles.input, { color: textColor, borderColor, backgroundColor }]}
          placeholder="Password"
          placeholderTextColor={placeholderColor}
          secureTextEntry
          value={localData.password}
          onChangeText={(t) => setLocalData({ ...localData, password: t })}
        />

        <TextInput
          style={[styles.input, { color: textColor, borderColor, backgroundColor }]}
          placeholder="Confirm Password"
          placeholderTextColor={placeholderColor}
          secureTextEntry
          value={localData.confirmPassword}
          onChangeText={(t) => setLocalData({ ...localData, confirmPassword: t })}
        />

        <Button title="Next" onPress={handleNext} disabled={checkingUsername} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 22, fontWeight: 'bold', marginBottom: 20 },
  input: { borderWidth: 1, padding: 10, marginBottom: 15, borderRadius: 5, width: '100%' }
});3