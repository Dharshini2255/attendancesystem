import * as Location from 'expo-location';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  Alert,
  Button,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from 'react-native';
import { useSignup } from '../../context/SignupContext';

export default function Step1() {
  const router = useRouter();
  const { signupData, updateSignupData, currentStep, saveStep, resetSignup } = useSignup();

  // Force dark theme
  const textColor = '#fff';
  const borderColor = '#555';
  const placeholderColor = '#aaa';
  const backgroundColor = '#222';

  const [localData, setLocalData] = useState({
    name: '',
    class: '',
    year: '',
    regNo: '',
    phone: '',
  });

  const [locationAllowed, setLocationAllowed] = useState(false);
  const [loading, setLoading] = useState(true);

  // Reset signup when entering Step 1
  useEffect(() => {
    resetSignup();
  }, []);

  useEffect(() => {
    if (currentStep > 1) {
      router.replace(`/signup/step${currentStep}`);
    }
  }, [currentStep]);

  useEffect(() => {
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status === 'granted') {
          setLocationAllowed(true);
        } else {
          Alert.alert('Location Permission', 'You must allow location access to proceed.');
        }
        setLoading(false);
      } catch (err) {
        console.error(err);
        Alert.alert('Error', 'Could not fetch location.');
        setLoading(false);
      }
    })();
  }, []);

  const handleNext = () => {
    const { name, class: className, year, regNo, phone } = localData;

    if (!name || !className || !year || !regNo || !phone) {
      Alert.alert('Error', 'All fields are required');
      return;
    }

    if (name.length < 4) {
      Alert.alert('Error', 'Name must be at least 4 characters');
      return;
    }

    if (!/[A-Za-z]/.test(className) || !/[0-9]/.test(className)) {
      Alert.alert('Error', 'Class must contain letters and numbers');
      return;
    }

    if (isNaN(year)) {
      Alert.alert('Error', 'Year must be a number');
      return;
    }

    if (regNo.length < 7) {
      Alert.alert('Error', 'Register number must be at least 7 digits');
      return;
    }

    if (phone.length !== 10) {
      Alert.alert('Error', 'Phone number must be exactly 10 digits');
      return;
    }

    updateSignupData(localData);
    saveStep(2);
    router.push('/signup/step2');
  };

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor }]}>
        <Text style={{ color: textColor }}>Checking location permissions...</Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView
        contentContainerStyle={{ flexGrow: 1, justifyContent: 'flex-start', alignItems: 'center', padding: 20, paddingTop: 60 }}
      >
        <Text style={[styles.title, { color: textColor }]}>Step 1: Basic Info</Text>

        {['name', 'class', 'year', 'regNo', 'phone'].map(field => (
          <TextInput
            key={field}
            style={[styles.input, { color: textColor, borderColor, backgroundColor }]}
            placeholder={field.charAt(0).toUpperCase() + field.slice(1)}
            placeholderTextColor={placeholderColor}
            keyboardType={['year','regNo','phone'].includes(field)?'numeric':'default'}
            value={localData[field]}
            onChangeText={t => setLocalData({ ...localData, [field]: t })}
          />
        ))}

        <Button title="Next" onPress={handleNext} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex:1, justifyContent:'center', alignItems:'center' },
  title: { fontSize: 22, fontWeight:'bold', marginBottom:20 },
  input: { borderWidth:1, padding:10, marginBottom:15, borderRadius:5, width:'100%' },
});
