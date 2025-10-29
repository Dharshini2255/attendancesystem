import { useRouter } from 'expo-router';
import { useState } from 'react';
import * as SecureStore from 'expo-secure-store';
import {
  Alert,
  Button,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput
} from 'react-native';

export default function LoginScreen() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

 const BACKEND_URL = 'https://attendancesystem-backend-mias.onrender.com/login';

 // ✅ Replace with your local IP

  const handleLogin = async () => {
    if (!username || !password) {
      Alert.alert('Missing Fields', 'Please enter both username and password.');
      return;
    }

    try {
      const response = await fetch(BACKEND_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });

      const data = await response.json();

      if (response.ok) {
        // ✅ Store user info securely
        await SecureStore.setItemAsync('user', JSON.stringify(data.user));

        // ✅ Show welcome message and navigate
        Alert.alert('✅ Login Successful', `Welcome ${data.user.name}`);
      router.replace('/home'); // or router.replace('/(main)/home') if it's nested

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

export const useLogin = () => useContext(LoginScreen);