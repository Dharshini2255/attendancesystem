import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import {
  Alert,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from 'react-native';

export default function HomeScreen() {
  const router = useRouter();

  // Dummy user data — replace with context or login response
  const user = {
    name: 'Dharshini',
    regNo: '21CS123',
    class: 'CS-A',
    year: '2025',
    phone: '9876543210',
    email: 'dharshini@example.com',
    uuid: 'a1b2c3d4-e5f6-7890-gh12-ijklmnop3456'
  };

  const [drawerVisible, setDrawerVisible] = useState(false);

  const handleSignOut = () => {
    Alert.alert(
      'Sign Out',
      'Are you sure you want to sign out?',
      [
        {
          text: 'Cancel',
          style: 'cancel'
        },
        {
          text: 'Sign Out',
          style: 'destructive',
          onPress: () => {
            // TODO: Notify admin (e.g. via backend ping)
            Alert.alert('Signed Out', 'You have been signed out.');
            router.replace('/login');
          }
        }
      ]
    );
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => setDrawerVisible(true)}>
          <Ionicons name="menu" size={28} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Home</Text>
      </View>

      {/* User Info */}
      <View style={styles.infoBox}>
        <Text style={styles.label}>Name: <Text style={styles.value}>{user.name}</Text></Text>
        <Text style={styles.label}>Reg No: <Text style={styles.value}>{user.regNo}</Text></Text>
        <Text style={styles.label}>Class: <Text style={styles.value}>{user.class}</Text></Text>
        <Text style={styles.label}>Year: <Text style={styles.value}>{user.year}</Text></Text>
        <Text style={styles.label}>Phone: <Text style={styles.value}>{user.phone}</Text></Text>
        <Text style={styles.label}>Email: <Text style={styles.value}>{user.email}</Text></Text>
        <Text style={styles.label}>UUID: <Text style={styles.value}>{user.uuid}</Text></Text>
      </View>

      {/* Drawer Menu */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={drawerVisible}
        onRequestClose={() => setDrawerVisible(false)}
      >
        <Pressable style={styles.overlay} onPress={() => setDrawerVisible(false)}>
          <View style={styles.drawer}>
            <Text style={styles.drawerTitle}>Menu</Text>
            <TouchableOpacity
              style={styles.drawerItem}
              onPress={() => {
                setDrawerVisible(false);
                router.push('/profile'); // TODO: Create profile screen
              }}
            >
              <Text style={styles.drawerText}>My Profile</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.drawerItem}
              onPress={() => {
                setDrawerVisible(false);
                handleSignOut();
              }}
            >
              <Text style={styles.drawerText}>Sign Out</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#222', paddingTop: 50 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    marginBottom: 20
  },
  headerTitle: { color: '#fff', fontSize: 20, fontWeight: 'bold', marginLeft: 10 },
  infoBox: { paddingHorizontal: 20 },
  label: { color: '#aaa', fontSize: 16, marginBottom: 5 },
  value: { color: '#fff', fontWeight: '600' },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.3)',
    justifyContent: 'flex-start'
  },
  drawer: {
    backgroundColor: '#333',
    padding: 20,
    width: '70%',
    height: '100%',
    elevation: 5
  },
  drawerTitle: { color: '#fff', fontSize: 18, fontWeight: 'bold', marginBottom: 20 },
  drawerItem: { marginBottom: 15 },
  drawerText: { color: '#fff', fontSize: 16 }
});
