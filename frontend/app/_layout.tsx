import { useColorScheme } from '@/hooks/useColorScheme';
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { useFonts } from 'expo-font';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import 'react-native-reanimated';
import { SignupProvider, useSignup } from '../context/SignupContext';
function ProtectedStack({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const segments = useSegments();
  const { hydrated } = useSignup();

  // Avoid forcing navigation; this caused bounce from /login to /
  useEffect(() => {
    if (!hydrated) return;
    // Only redirect if we are truly at the root path
    try {
      if (typeof window !== 'undefined' && window.location.pathname === '/') {
        // Stay on index; no action needed
      }
    } catch {}
  }, [hydrated, segments]);

  return <>{children}</>;
}



export default function RootLayout() {
  const colorScheme = useColorScheme();
  const [loaded] = useFonts({
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
  });

  if (!loaded) return null;

  return (
    <SignupProvider>
      <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
        <ProtectedStack>
          <Stack>
            <Stack.Screen name="index" options={{ headerShown: false }} />
            <Stack.Screen name="login" />
            <Stack.Screen name="signup/step1" options={{ title: 'Signup - Step 1' }} />
            <Stack.Screen name="signup/step2" options={{ title: 'Signup - Step 2' }} />
            <Stack.Screen name="signup/step3" options={{ title: 'Signup - Step 3' }} />
            <Stack.Screen name="signup/step4" options={{ title: 'Signup - Step 4' }} />
            <Stack.Screen name="signup/step5" options={{ title: 'Signup - Step 5' }} />
            <Stack.Screen name="admin/index" options={{ headerShown: false }} />
            <Stack.Screen name="home" options={{ headerShown: false }} />
          </Stack>
        </ProtectedStack>
        <StatusBar style="auto" />
      </ThemeProvider>
    </SignupProvider>
  );
}
