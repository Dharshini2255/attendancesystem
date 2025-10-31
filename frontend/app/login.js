import { useRouter } from 'expo-router';
import { useState, useEffect } from 'react';
import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  Alert,
  Button,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput
} from 'react-native';

const isWeb = Platform.OS === 'web';

// Secure getters/setters with fallback
const safeSecureGet = async (key) => {
  try {
    if (!isWeb && typeof SecureStore.getItemAsync === 'function') {
      return await SecureStore.getItemAsync(key);
    }
  } catch {}
  return null;
};

const safeSecureSet = async (key, value) => {
  try {
    if (!isWeb && typeof SecureStore.setItemAsync === 'function') {
      await SecureStore.setItemAsync(key, value);
    }
  } catch {}
};

export default function LoginScreen() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  // 🔁 Auto redirect if already logged in
  useEffect(() => {
    (async () => {
      try {
        let storedUser = await safeSecureGet('user');
        if (!storedUser) {
          try { storedUser = await AsyncStorage.getItem('user'); } catch {}
        }

        if (storedUser) {
          const parsed = JSON.parse(storedUser);
          // 👇 Redirect based on role
          if (parsed.role === 'admin') {
            router.replace('/admin');
          } else {
            router.replace('/home');
          }
        }
      } catch {}
    })();
  }, []);

  const BACKEND_URL = 'https://attendancesystem-backend-mias.onrender.com/login';

  const handleLogin = async () => {
    if (!username || !password) {
      Alert.alert('Missing Fields', 'Please enter both username and password.');
      return;
    }

    // 🧠 Admin shortcut login
    if (username === 'Adminsystem@123' && password === 'Admin@sdp2255') {
      const adminData = { name: 'Admin', role: 'admin' };
      try {
        await safeSecureSet('user', JSON.stringify(adminData));
        await AsyncStorage.setItem('user', JSON.stringify(adminData));
      } catch {}

      Alert.alert('✅ Admin Login', 'Welcome, Admin');
      router.replace('/admin');
      if (Platform.OS === 'web') {
        setTimeout(() => {
          try {
            if (typeof window !== 'undefined' && window.location.pathname !== '/admin') {
              window.history.pushState({}, '', '/admin');
            }
          } catch {}
        }, 50);
      }
      return;
    }

    // 🧠 Normal user login
    try {
      const response = await fetch(BACKEND_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });

      const data = await response.json();

      if (response.ok) {
        // ✅ Save user securely
        await safeSecureSet('user', JSON.stringify(data.user));
        try { await AsyncStorage.setItem('user', JSON.stringify(data.user)); } catch {}

        Alert.alert('✅ Login Successful', `Welcome ${data.user.name}`);
        router.replace('/home');
        if (Platform.OS === 'web') {
          setTimeout(() => {
            try {
              if (typeof window !== 'undefined' && !window.location.pathname.endsWith('/home')) {
                window.location.assign('/home');
              }
            } catch {}
          }, 50);
        }
      } else {
        Alert.alert('❌ Login Failed', data.error || 'Invalid credentials');
      }
    } catch (err) {
      console.error('Login Error:', err);
      Alert.alert('Network Error', 'Could not connect to server');
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Text style={styles.title}>Login</Text>
      <TextInput
        style={styles.input}
        placeholder="Username"
        placeholderTextColor="#aaa"
        value={username}
        onChangeText={setUsername}
        autoCapitalize="none"
      />
      <TextInput
        style={styles.input}
        placeholder="Password"
        placeholderTextColor="#aaa"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
      />
      <Button title="Login" onPress={handleLogin} />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#222',
    justifyContent: 'center',
    padding: 20
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 30,
    textAlign: 'center'
  },
  input: {
    backgroundColor: '#333',
    color: '#fff',
    padding: 12,
    marginBottom: 15,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: '#555'
  }
});
