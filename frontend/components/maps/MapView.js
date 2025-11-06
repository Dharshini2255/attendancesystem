import { Platform } from 'react-native';
import { MapView as WebMapView } from '@teovilla/react-native-web-maps';
import { MapView as NativeMapView } from 'react-native-maps';

const MapView = Platform.OS === 'web' ? WebMapView : NativeMapView;

export default MapView;