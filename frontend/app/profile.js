import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
// Image compression will be handled by ImagePicker quality settings
import { Ionicons } from '@expo/vector-icons';
import { apiUrl } from '../utils/api';
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
  ImageBackground,
  Modal,
  TextInput
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
  const router = useRouter();
  const { username: routeUsername } = useLocalSearchParams();
  const [userInfo, setUserInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [photoUri, setPhotoUri] = useState(null);
  const [attendanceData, setAttendanceData] = useState([]);
  const [attendanceFrom, setAttendanceFrom] = useState(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toLocaleDateString('en-CA'));
  const [attendanceTo, setAttendanceTo] = useState(new Date().toLocaleDateString('en-CA'));
  const [loadingAttendance, setLoadingAttendance] = useState(false);
  const [queryModalVisible, setQueryModalVisible] = useState(false);
  const [queryMessage, setQueryMessage] = useState('');
  const [messages, setMessages] = useState([]);

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

        const response = await fetch(apiUrl(`/userinfo?username=${encodeURIComponent(username)}`));
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

  // Load attendance data on mount and when userInfo changes
  useEffect(() => {
    if (!userInfo?._id) return;
    loadAttendance();
    loadMessages();
  }, [userInfo]);

  const loadMessages = async () => {
    if (!userInfo?._id) return;
    try {
      const res = await fetch(apiUrl(`/messages/${userInfo._id}`));
      const data = await res.json();
      if (res.ok) {
        setMessages(data.messages || []);
      }
    } catch (err) {
      console.error('Failed to load messages:', err);
    }
  };

  const loadAttendance = async () => {
    if (!userInfo?._id) return;
    setLoadingAttendance(true);
    try {
      const params = new URLSearchParams({ from: attendanceFrom, to: attendanceTo });
      const res = await fetch(apiUrl(`/admin/student/${encodeURIComponent(userInfo._id)}/history?${params}`));
      const data = await res.json();
      setAttendanceData(data || { records: [], pings: [] });
    } catch (err) {
      console.error('Failed to load attendance:', err);
    } finally {
      setLoadingAttendance(false);
    }
  };

  const savePhoto = async (uri) => {
    try {
      // For web, convert to base64 with compression
      if (Platform.OS === 'web') {
        // Image is already compressed via FileReader
        setPhotoUri(uri);
        if (userInfo) {
          const key = `profilePhoto:${userInfo._id || userInfo.username}`;
          try { 
            // Check size before saving (base64 is ~33% larger than binary)
            if (uri.length > 2 * 1024 * 1024) { // ~1.5MB base64 = ~1MB image
              Alert.alert('Error', 'Image is too large. Please choose a smaller image (max 1MB).');
              return;
            }
            await AsyncStorage.setItem(key, uri);
            Alert.alert('Success', 'Profile photo saved successfully');
          } catch (err) {
            if (err.message?.includes('exceeds') || err.message?.includes('QuotaExceeded')) {
              Alert.alert('Error', 'Image is too large. Please choose a smaller image.');
            } else {
              Alert.alert('Error', 'Failed to save photo');
            }
          }
        }
      } else {
        // For mobile, uri is already optimized by ImagePicker with quality settings
        setPhotoUri(uri);
        if (userInfo) {
          const key = `profilePhoto:${userInfo._id || userInfo.username}`;
          try { 
            await AsyncStorage.setItem(key, uri);
            Alert.alert('Success', 'Profile photo saved successfully');
          } catch (err) {
            if (err.message?.includes('exceeds') || err.message?.includes('QuotaExceeded')) {
              Alert.alert('Error', 'Image is too large. Please choose a smaller image.');
            } else {
              Alert.alert('Error', 'Failed to save photo');
            }
          }
        }
      }
    } catch (err) {
      console.error('Save photo error:', err);
      Alert.alert('Error', 'Failed to process image');
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
          if (file.size > 5 * 1024 * 1024) { // 5MB limit
            Alert.alert('Error', 'Image size must be less than 5MB');
            return;
          }
          const reader = new FileReader();
          reader.onload = async () => { await savePhoto(String(reader.result)); };
          reader.readAsDataURL(file);
        };
        input.click();
        return;
      }
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') { 
        Alert.alert('Permission required', 'Please allow photo library access.'); 
        return; 
      }
      const result = await ImagePicker.launchImageLibraryAsync({ 
        mediaTypes: ImagePicker.MediaTypeOptions.Images, 
        allowsEditing: true, 
        quality: 0.3, // Lower quality (30%) to reduce file size
        aspect: [1, 1], // Square aspect ratio
        base64: false, // Don't include base64 to reduce memory
      });
      if (!result.canceled && result.assets?.length) {
        await savePhoto(result.assets[0].uri);
      }
    } catch (e) { 
      console.error('Gallery pick error:', e);
      Alert.alert('Error', 'Failed to pick image from gallery');
    }
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
          if (file.size > 5 * 1024 * 1024) { // 5MB limit
            Alert.alert('Error', 'Image size must be less than 5MB');
            return;
          }
          const reader = new FileReader();
          reader.onload = async () => { await savePhoto(String(reader.result)); };
          reader.readAsDataURL(file);
        };
        input.click();
        return;
      }
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') { 
        Alert.alert('Permission required', 'Please allow camera access.'); 
        return; 
      }
      const result = await ImagePicker.launchCameraAsync({ 
        allowsEditing: true, 
        quality: 0.3, // Lower quality (30%) to reduce file size
        aspect: [1, 1], // Square aspect ratio
        base64: false, // Don't include base64 to reduce memory
      });
      if (!result.canceled && result.assets?.length) {
        await savePhoto(result.assets[0].uri);
      }
    } catch (e) { 
      console.error('Camera capture error:', e);
      Alert.alert('Error', 'Failed to capture photo');
    }
  };

  const exportAttendanceCSV = () => {
    if (!attendanceData.records || attendanceData.records.length === 0) {
      Alert.alert('No Data', 'No attendance records to export');
      return;
    }

    const headers = ['Date', 'P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7', 'P8', 'Overall'];
    const rows = attendanceData.records.map(r => {
      const statusByPeriod = {};
      (r.periods || []).forEach(p => { statusByPeriod[p.periodNumber] = p.status; });
      const presentCount = (r.periods || []).filter(p => p.status === 'present').length;
      const overall = presentCount === 8 ? 'present' : (presentCount > 0 ? 'partial' : 'absent');
      
      const periodStatuses = [];
      for (let i = 1; i <= 8; i++) {
        periodStatuses.push(statusByPeriod[i] || 'absent');
      }
      
      return [r.date, ...periodStatuses, overall].join(',');
    });

    const csv = [headers.join(','), ...rows].join('\n');
    
    if (Platform.OS === 'web') {
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `attendance_${userInfo.name}_${attendanceFrom}_to_${attendanceTo}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } else {
      Alert.alert('Export', 'CSV export is available on web platform');
    }
  };

  const handleHelpRequest = async () => {
    if (!userInfo?._id) {
      Alert.alert('Error', 'User information not available');
      return;
    }

    Alert.alert(
      'Request Help',
      'Do you want to send a help request to the admin?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Send',
          onPress: async () => {
            try {
              const response = await fetch(apiUrl('/help/request'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  studentId: userInfo._id,
                  message: `${userInfo.name} (${userInfo.regNo}) requested help`
                })
              });

              const data = await response.json();
              if (response.ok) {
                Alert.alert('Success', 'Help request sent successfully. Admin will be notified.');
              } else {
                Alert.alert('Error', data.error || 'Failed to send help request');
              }
            } catch (err) {
              console.error('Help request error:', err);
              Alert.alert('Error', 'Failed to send help request. Please try again.');
            }
          }
        }
      ]
    );
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
    <ImageBackground source={require('../assets/bg.jpg')} style={styles.background} resizeMode="cover">
      <View style={styles.overlay}>
        <ScrollView contentContainerStyle={styles.scrollContainer}>
          {/* Header with back button */}
          <View style={styles.header}>
            <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
              <Ionicons name="arrow-back" size={24} color="#fff" />
            </TouchableOpacity>
            <Text style={styles.title}>My Profile</Text>
          </View>

          {/* Profile Photo Section */}
          <View style={styles.photoSection}>
            <TouchableOpacity onPress={pickFromGallery} style={styles.photoWrapper}>
              {photoUri ? (
                <Image source={{ uri: photoUri }} style={styles.photo} />
              ) : (
                <View style={[styles.photo, styles.photoPlaceholder]}>
                  <Ionicons name="person" size={50} color="#888" />
                  <Text style={styles.photoPlaceholderText}>Tap to add photo</Text>
                </View>
              )}
              <View style={styles.photoEditBadge}>
                <Ionicons name="camera" size={16} color="#fff" />
              </View>
            </TouchableOpacity>
            <View style={styles.photoButtons}>
              <TouchableOpacity onPress={takePhoto} style={styles.photoButton}>
                <Ionicons name="camera-outline" size={20} color="#fff" />
                <Text style={styles.photoButtonText}>Camera</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={pickFromGallery} style={styles.photoButton}>
                <Ionicons name="images-outline" size={20} color="#fff" />
                <Text style={styles.photoButtonText}>Gallery</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* User Details Section */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Personal Information</Text>
            <View style={styles.infoCard}>
              <View style={styles.infoRow}>
                <Ionicons name="person-outline" size={20} color="#60a5fa" style={styles.icon} />
                <View style={styles.infoContent}>
                  <Text style={styles.infoLabel}>Name</Text>
                  <Text style={styles.infoValue}>{userInfo.name || '—'}</Text>
                </View>
              </View>
              <View style={styles.infoRow}>
                <Ionicons name="id-card-outline" size={20} color="#60a5fa" style={styles.icon} />
                <View style={styles.infoContent}>
                  <Text style={styles.infoLabel}>Registration Number</Text>
                  <Text style={styles.infoValue}>{userInfo.regNo || '—'}</Text>
                </View>
              </View>
              <View style={styles.infoRow}>
                <Ionicons name="school-outline" size={20} color="#60a5fa" style={styles.icon} />
                <View style={styles.infoContent}>
                  <Text style={styles.infoLabel}>Class</Text>
                  <Text style={styles.infoValue}>{userInfo.class || '—'}</Text>
                </View>
              </View>
              <View style={styles.infoRow}>
                <Ionicons name="calendar-outline" size={20} color="#60a5fa" style={styles.icon} />
                <View style={styles.infoContent}>
                  <Text style={styles.infoLabel}>Year</Text>
                  <Text style={styles.infoValue}>{userInfo.year || '—'}</Text>
                </View>
              </View>
            </View>
          </View>

          {/* Contact Information Section */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Contact Information</Text>
            <View style={styles.infoCard}>
              <View style={styles.infoRow}>
                <Ionicons name="call-outline" size={20} color="#60a5fa" style={styles.icon} />
                <View style={styles.infoContent}>
                  <Text style={styles.infoLabel}>Phone</Text>
                  <Text style={styles.infoValue}>{userInfo.phone || '—'}</Text>
                </View>
              </View>
              <View style={styles.infoRow}>
                <Ionicons name="mail-outline" size={20} color="#60a5fa" style={styles.icon} />
                <View style={styles.infoContent}>
                  <Text style={styles.infoLabel}>Email</Text>
                  <Text style={styles.infoValue}>{userInfo.email || '—'}</Text>
                </View>
              </View>
              <View style={styles.infoRow}>
                <Ionicons name="at-outline" size={20} color="#60a5fa" style={styles.icon} />
                <View style={styles.infoContent}>
                  <Text style={styles.infoLabel}>Username</Text>
                  <Text style={styles.infoValue}>{userInfo.username || '—'}</Text>
                </View>
              </View>
              <View style={styles.infoRow}>
                <Ionicons name="key-outline" size={20} color="#60a5fa" style={styles.icon} />
                <View style={styles.infoContent}>
                  <Text style={styles.infoLabel}>UUID</Text>
                  <Text style={[styles.infoValue, styles.uuidValue]}>{userInfo.uuid || '—'}</Text>
                </View>
              </View>
            </View>
          </View>

          {/* Attendance Section */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Attendance History</Text>
              {Platform.OS === 'web' && (
                <TouchableOpacity onPress={exportAttendanceCSV} style={styles.exportButton}>
                  <Ionicons name="download-outline" size={18} color="#fff" />
                  <Text style={styles.exportButtonText}>Export CSV</Text>
                </TouchableOpacity>
              )}
            </View>

            {/* Date Filters */}
            <View style={styles.filterRow}>
              {Platform.OS === 'web' ? (
                <>
                  <input 
                    type="date" 
                    value={attendanceFrom} 
                    onChange={e => setAttendanceFrom(e.target.value)} 
                    style={styles.dateInput} 
                  />
                  <Text style={styles.filterText}>to</Text>
                  <input 
                    type="date" 
                    value={attendanceTo} 
                    onChange={e => setAttendanceTo(e.target.value)} 
                    style={styles.dateInput} 
                  />
                  <TouchableOpacity onPress={loadAttendance} style={styles.applyButton}>
                    <Text style={styles.applyButtonText}>Apply Filter</Text>
                  </TouchableOpacity>
                </>
              ) : (
                <>
                  <Text style={styles.filterText}>From:</Text>
                  <Text style={styles.filterValue}>{attendanceFrom}</Text>
                  <Text style={styles.filterText}>To:</Text>
                  <Text style={styles.filterValue}>{attendanceTo}</Text>
                  <TouchableOpacity onPress={loadAttendance} style={styles.applyButton}>
                    <Text style={styles.applyButtonText}>Apply</Text>
                  </TouchableOpacity>
                </>
              )}
            </View>

            {loadingAttendance ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="small" color="#fff" />
                <Text style={styles.loadingText}>Loading attendance...</Text>
              </View>
            ) : (
              <View style={styles.attendanceCard}>
                {attendanceData.records && attendanceData.records.length > 0 ? (
                  <View style={styles.attendanceTable}>
                    <View style={styles.attendanceHeader}>
                      <Text style={[styles.attendanceHeaderText, { flex: 1.5 }]}>Date</Text>
                      {Array.from({length: 8}).map((_, i) => (
                        <Text key={i} style={[styles.attendanceHeaderText, { flex: 0.8 }]}>P{i+1}</Text>
                      ))}
                      <Text style={[styles.attendanceHeaderText, { flex: 1 }]}>Overall</Text>
                    </View>
                    {attendanceData.records.map((r, idx) => {
                      const statusByPeriod = {};
                      (r.periods || []).forEach(p => { statusByPeriod[p.periodNumber] = p.status; });
                      const presentCount = (r.periods || []).filter(p => p.status === 'present').length;
                      const overall = presentCount === 8 ? 'present' : (presentCount > 0 ? 'partial' : 'absent');
                      
                      return (
                        <View key={idx} style={styles.attendanceRow}>
                          <Text style={[styles.attendanceCell, { flex: 1.5 }]}>{r.date}</Text>
                          {Array.from({length: 8}).map((_, i) => {
                            const pnum = i + 1;
                            const status = statusByPeriod[pnum] || 'absent';
                            return (
                              <Text 
                                key={i} 
                                style={[
                                  styles.attendanceCell, 
                                  { flex: 0.8, color: status === 'present' ? '#10b981' : '#ef4444' }
                                ]}
                              >
                                {status === 'present' ? '✓' : '✗'}
                              </Text>
                            );
                          })}
                          <Text 
                            style={[
                              styles.attendanceCell, 
                              { 
                                flex: 1, 
                                color: overall === 'present' ? '#10b981' : (overall === 'partial' ? '#f59e0b' : '#ef4444'),
                                fontWeight: 'bold'
                              }
                            ]}
                          >
                            {overall}
                          </Text>
                        </View>
                      );
                    })}
                  </View>
                ) : (
                  <Text style={styles.noDataText}>No attendance records found for this period</Text>
                )}
              </View>
            )}
          </View>

          {/* Help Section */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Need Help?</Text>
            <View style={styles.helpButtonsRow}>
              <TouchableOpacity onPress={handleHelpRequest} style={styles.helpButton}>
                <Ionicons name="help-circle-outline" size={24} color="#fff" />
                <Text style={styles.helpButtonText}>Request Help</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setQueryModalVisible(true)} style={[styles.helpButton, { backgroundColor: '#3b82f6' }]}>
                <Ionicons name="chatbubble-outline" size={24} color="#fff" />
                <Text style={styles.helpButtonText}>Send Query</Text>
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      </View>

      {/* Query/Message Modal */}
      <Modal
        visible={queryModalVisible}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setQueryModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Send Query to Admin</Text>
              <TouchableOpacity onPress={() => setQueryModalVisible(false)}>
                <Ionicons name="close" size={24} color="#fff" />
              </TouchableOpacity>
            </View>
            
            {/* Messages List */}
            {messages.length > 0 && (
              <ScrollView style={styles.messagesList}>
                {messages.map((msg, idx) => (
                  <View key={idx} style={[styles.messageBubble, msg.sender === 'admin' ? styles.messageAdmin : styles.messageStudent]}>
                    <Text style={styles.messageSender}>{msg.sender === 'admin' ? 'Admin' : 'You'}</Text>
                    <Text style={styles.messageText}>{msg.message}</Text>
                    <Text style={styles.messageTime}>{new Date(msg.at).toLocaleString()}</Text>
                  </View>
                ))}
              </ScrollView>
            )}

            <TextInput
              style={styles.modalInput}
              placeholder="Type your query..."
              multiline
              numberOfLines={4}
              value={queryMessage}
              onChangeText={setQueryMessage}
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.helpButton, { backgroundColor: '#64748b', marginTop: 0 }]}
                onPress={() => setQueryModalVisible(false)}
              >
                <Text style={styles.helpButtonText}>Close</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.helpButton, { backgroundColor: '#3b82f6', marginTop: 0 }]}
                onPress={async () => {
                  if (!queryMessage.trim()) {
                    Alert.alert('Error', 'Please enter a message');
                    return;
                  }
                  try {
                    const response = await fetch(apiUrl('/messages/send'), {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        studentId: userInfo._id,
                        sender: 'student',
                        message: queryMessage
                      })
                    });
                    const data = await response.json();
                    if (response.ok) {
                      Alert.alert('Success', 'Query sent successfully');
                      setQueryMessage('');
                      await loadMessages();
                    } else {
                      Alert.alert('Error', data.error || 'Failed to send query');
                    }
                  } catch (err) {
                    console.error('Send query error:', err);
                    Alert.alert('Error', 'Failed to send query');
                  }
                }}
              >
                <Text style={styles.helpButtonText}>Send</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#222' },
  background: { 
    flex: 1,
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: '100%',
    height: '100%'
  },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)' },
  scrollContainer: {
    flexGrow: 1,
    padding: 20,
    paddingTop: 60,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  backButton: {
    marginRight: 10,
    padding: 5,
  },
  title: { fontSize: 24, fontWeight: 'bold', color: '#fff' },
  photoSection: {
    alignItems: 'center',
    marginBottom: 30,
  },
  photoWrapper: {
    position: 'relative',
    marginBottom: 15,
  },
  photo: { 
    width: 120, 
    height: 120, 
    borderRadius: 60, 
    backgroundColor: '#333',
    borderWidth: 3,
    borderColor: '#60a5fa'
  },
  photoPlaceholder: { 
    justifyContent: 'center', 
    alignItems: 'center',
    borderWidth: 3,
    borderColor: '#60a5fa',
    borderStyle: 'dashed'
  },
  photoPlaceholderText: {
    color: '#888',
    fontSize: 12,
    marginTop: 5,
  },
  photoEditBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    backgroundColor: '#60a5fa',
    borderRadius: 15,
    width: 30,
    height: 30,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#fff'
  },
  photoButtons: {
    flexDirection: 'row',
    gap: 15,
  },
  photoButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(96, 165, 250, 0.3)',
    paddingVertical: 8,
    paddingHorizontal: 15,
    borderRadius: 20,
    gap: 5,
  },
  photoButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  section: {
    marginBottom: 25,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 15,
  },
  sectionTitle: { 
    fontSize: 18, 
    fontWeight: 'bold', 
    color: '#fff',
    marginBottom: 15,
  },
  infoCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 12,
    padding: 15,
    gap: 12,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  icon: {
    marginRight: 12,
  },
  infoContent: {
    flex: 1,
  },
  infoLabel: { 
    fontSize: 12, 
    color: '#aaa',
    marginBottom: 4,
  },
  infoValue: { 
    fontSize: 16, 
    color: '#fff',
    fontWeight: '500',
  },
  uuidValue: {
    fontSize: 12,
    fontFamily: Platform.OS === 'web' ? 'monospace' : 'monospace',
  },
  filterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 15,
    flexWrap: 'wrap',
  },
  filterText: {
    color: '#fff',
    fontSize: 14,
  },
  filterValue: {
    color: '#60a5fa',
    fontSize: 14,
    fontWeight: '600',
  },
  dateInput: {
    padding: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 8,
    color: '#fff',
    border: '1px solid rgba(255, 255, 255, 0.3)',
  },
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
    gap: 10,
  },
  loadingText: {
    color: '#fff',
    fontSize: 14,
  },
  attendanceCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 12,
    padding: 15,
    overflow: 'hidden',
  },
  attendanceTable: {
    width: '100%',
  },
  attendanceHeader: {
    flexDirection: 'row',
    paddingBottom: 10,
    marginBottom: 10,
    borderBottomWidth: 2,
    borderBottomColor: 'rgba(255, 255, 255, 0.2)',
  },
  attendanceHeaderText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 12,
    textAlign: 'center',
  },
  attendanceRow: {
    flexDirection: 'row',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  attendanceCell: {
    color: '#fff',
    fontSize: 12,
    textAlign: 'center',
  },
  noDataText: {
    color: '#aaa',
    textAlign: 'center',
    padding: 20,
    fontSize: 14,
  },
  exportButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#10b981',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    gap: 5,
  },
  exportButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  applyButton: {
    backgroundColor: '#60a5fa',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
    marginLeft: 10,
  },
  applyButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  helpButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f59e0b',
    paddingVertical: 15,
    paddingHorizontal: 20,
    borderRadius: 12,
    gap: 10,
    marginTop: 10,
  },
  helpButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  helpButtonsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 10,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: 'rgba(0,0,0,0.9)',
    borderRadius: 16,
    padding: 20,
    width: Platform.OS === 'web' ? 500 : '90%',
    maxWidth: 500,
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
  },
  messagesList: {
    maxHeight: 200,
    marginBottom: 16,
    padding: 10,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 8,
  },
  messageBubble: {
    padding: 10,
    borderRadius: 8,
    marginBottom: 8,
  },
  messageAdmin: {
    backgroundColor: 'rgba(59, 130, 246, 0.3)',
    alignSelf: 'flex-start',
  },
  messageStudent: {
    backgroundColor: 'rgba(16, 185, 129, 0.3)',
    alignSelf: 'flex-end',
  },
  messageSender: {
    color: '#60a5fa',
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 4,
  },
  messageText: {
    color: '#fff',
    fontSize: 14,
    marginBottom: 4,
  },
  messageTime: {
    color: '#aaa',
    fontSize: 10,
  },
  modalInput: {
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
    borderRadius: 8,
    padding: 12,
    minHeight: 100,
    textAlignVertical: 'top',
    marginBottom: 16,
    color: '#fff',
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'flex-end',
  },
});