import { Platform } from 'react-native';
import { Marker as WebMarker } from '@teovilla/react-native-web-maps';
import { Marker as NativeMarker } from 'react-native-maps';

const Marker = Platform.OS === 'web' ? WebMarker : NativeMarker;

export default Marker;