import * as TaskManager from 'expo-task-manager';
import * as Location from 'expo-location';
import * as SecureStore from 'expo-secure-store';
import * as turf from '@turf/turf';
import { Platform } from 'react-native';

const LOCATION_TASK_NAME = 'background-location-task';

// College polygon
const collegePolygon = turf.polygon([[
  [80.042220, 12.826504],
  [80.042201, 12.826280],
  [80.042853, 12.826268],
  [80.042851, 12.826512],
  [80.042220, 12.826504]
]]);

const isInsideCollege = (location) => {
  const point = turf.point([location.longitude, location.latitude]);
  return turf.booleanPointInPolygon(point, collegePolygon);
};

// Period schedule
const timetable = [
  { period: 1, start: '08:15', end: '09:05' },
  { period: 2, start: '09:05', end: '09:55' },
  { period: 3, start: '10:05', end: '10:55' },
  { period: 4, start: '10:55', end: '11:45' },
  { period: 5, start: '12:45', end: '13:30' },
  { period: 6, start: '13:30', end: '14:15' },
  { period: 7, start: '14:25', end: '15:10' },
  { period: 8, start: '15:10', end: '15:55' }
];

const getCurrentPeriod = () => {
  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();

  for (let entry of timetable) {
    const start = entry.start.split(':');
    const end = entry.end.split(':');
    const startMin = parseInt(start[0]) * 60 + parseInt(start[1]);
    const endMin = parseInt(end[0]) * 60 + parseInt(end[1]);

    if (currentMinutes >= startMin && currentMinutes <= endMin) {
      return entry.period;
    }
  }

  return null;
};

const getTimestampType = () => {
  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();

  for (let entry of timetable) {
    const start = entry.start.split(':');
    const end = entry.end.split(':');
    const startMin = parseInt(start[0]) * 60 + parseInt(start[1]);
    const endMin = parseInt(end[0]) * 60 + parseInt(end[1]);

    if (currentMinutes === startMin) return 'start';
    if (currentMinutes === startMin + 15) return 'afterStart15';
    if (currentMinutes === endMin - 10) return 'beforeEnd10';
    if (currentMinutes === endMin) return 'end';
  }

  return null;
};

TaskManager.defineTask(LOCATION_TASK_NAME, async ({ data, error }) => {
  if (error || !data) return;

  const { locations } = data;
  const location = locations[0];
  const period = getCurrentPeriod();
  const timestampType = getTimestampType();

  if (!period || !timestampType) return;

  const isValid = isInsideCollege(location.coords);
  if (!isValid) return;

  const storedUser = await SecureStore.getItemAsync('user');
  if (!storedUser) return;

  const user = JSON.parse(storedUser);

 await fetch('https://attendancesystem-backend-mias.onrender.com/attendance/mark', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      studentId: user._id,
      periodNumber: period,
      timestampType,
      location: {
        latitude: location.coords.latitude,
        longitude: location.coords.longitude
      }
    })
  });
});

export const startBackgroundTracking = async () => {
  // Background location updates are not supported on web; silently no-op
  if (Platform.OS === 'web' || typeof Location.startLocationUpdatesAsync !== 'function') {
    return;
  }

  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== 'granted') return;

  await Location.startLocationUpdatesAsync(LOCATION_TASK_NAME, {
    accuracy: Location.Accuracy.High,
    timeInterval: 60000, // every 1 minute
    distanceInterval: 0,
    showsBackgroundLocationIndicator: true,
    foregroundService: {
      notificationTitle: 'Attendance Tracker',
      notificationBody: 'Tracking your location for attendance'
    }
  });
};
