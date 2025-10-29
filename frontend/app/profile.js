import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  View,
  Image,
  TouchableOpacity,
  Alert,
  Platform,
  Button
} from 'react-native';

const isWeb = Platform.OS === 'web';
const safeSecureGet = async (key) => {
  try {
    if (!isWeb && typeof SecureStore.getItemAsync === 'function') {
      return await SecureStore.getItemAsync(key);
    }
  } catch {}
  return null;
};

export default function Profile() {
  const { username: routeUsername } = useLocalSearchParams();
  const [userInfo, setUserInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [photoUri, setPhotoUri] = useState(null);

  const BACKEND_URL = 'https://attendancesystem-backend-mias.onrender.com/userinfo';

  // Resolve username either from route or stored user
  useEffect(() => {
    (async () => {
      try {
        let username = routeUsername;
        if (!username) {
          let storedUser = await safeSecureGet('user');
          if (!storedUser) {
            try { storedUser = await AsyncStorage.getItem('user'); } catch {}
          }
          if (storedUser) username = JSON.parse(storedUser)?.username;
        }

        if (!username) {
          setLoading(false);
          return;
        }

        const response = await fetch(`${BACKEND_URL}?username=${encodeURIComponent(username)}`);
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
    })();
  }, [routeUsername]);

  // Load saved photo after user info is present
  useEffect(() => {
    (async () => {
      if (!userInfo) return;
      const key = `profilePhoto:${userInfo._id || userInfo.username}`;
      try { const uri = await AsyncStorage.getItem(key); if (uri) setPhotoUri(uri); } catch {}
    })();
  }, [userInfo]);

  const savePhoto = async (uri) => {
    setPhotoUri(uri);
    if (userInfo) {
      const key = `profilePhoto:${userInfo._id || userInfo.username}`;
      try { await AsyncStorage.setItem(key, uri); } catch {}
    }
  };

  const pickFromGallery = async () => {
    try {
      if (Platform.OS === 'web') {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.onchange = async () => {
          const file = input.files && input.files[0];
          if (!file) return;
          const reader = new FileReader();
          reader.onload = async () => { await savePhoto(String(reader.result)); };
          reader.readAsDataURL(file);
        };
        input.click();
        return;
      }
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') { Alert.alert('Permission required', 'Please allow photo library access.'); return; }
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsEditing: true, quality: 0.7 });
      if (!result.canceled && result.assets?.length) await savePhoto(result.assets[0].uri);
    } catch (e) { console.error('Gallery pick error:', e); }
  };

  const takePhoto = async () => {
    try {
      if (Platform.OS === 'web') {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.capture = 'environment';
        input.onchange = async () => {
          const file = input.files && input.files[0];
          if (!file) return;
          const reader = new FileReader();
          reader.onload = async () => { await savePhoto(String(reader.result)); };
          reader.readAsDataURL(file);
        };
        input.click();
        return;
      }
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') { Alert.alert('Permission required', 'Please allow camera access.'); return; }
      const result = await ImagePicker.launchCameraAsync({ allowsEditing: true, quality: 0.7 });
      if (!result.canceled && result.assets?.length) await savePhoto(result.assets[0].uri);
    } catch (e) { console.error('Camera capture error:', e); }
  };

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

      <TouchableOpacity onPress={pickFromGallery} style={styles.photoWrapper}>
        {photoUri ? (
          <Image source={{ uri: photoUri }} style={styles.photo} />
        ) : (
          <View style={[styles.photo, styles.photoPlaceholder]}>
            <Text style={{ color: '#888' }}>Tap to add photo</Text>
          </View>
        )}
      </TouchableOpacity>

      <View style={{ flexDirection: 'row', gap: 10, marginBottom: 20 }}>
        <Button title="Use Camera" onPress={takePhoto} />
        <Button title="Choose from Gallery" onPress={pickFromGallery} />
      </View>

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
  photoWrapper: { marginBottom: 20 },
  photo: { width: 140, height: 140, borderRadius: 70, backgroundColor: '#333' },
  photoPlaceholder: { justifyContent: 'center', alignItems: 'center' },
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
