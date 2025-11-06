import { Platform } from 'react-native';
import { MapView as WebMapView, Marker as WebMarker } from '@teovilla/react-native-web-maps';
import { MapView as NativeMapView, Marker as NativeMarker } from 'react-native-maps';

const MapView = Platform.OS === 'web' ? WebMapView : NativeMapView;
const Marker = Platform.OS === 'web' ? WebMarker : NativeMarker;

export { Marker };
export default MapView;