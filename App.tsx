import { StatusBar } from 'expo-status-bar';
import { StyleSheet, View, ActivityIndicator } from 'react-native';
import { useFonts } from 'expo-font';
import {
  SpaceGrotesk_500Medium,
  SpaceGrotesk_600SemiBold,
  SpaceGrotesk_700Bold,
} from '@expo-google-fonts/space-grotesk';
import { Inter_400Regular, Inter_400Regular_Italic, Inter_500Medium, Inter_600SemiBold } from '@expo-google-fonts/inter';
import { SpaceMono_400Regular, SpaceMono_700Bold } from '@expo-google-fonts/space-mono';
import { colors } from './src/theme/tokens';
import { AppProvider } from './src/state/AppContext';
import { DictationProvider } from './src/state/Dictation';
import { MainScreen } from './src/components/MainScreen';

export default function App() {
  const [fontsLoaded] = useFonts({
    SpaceGrotesk_500Medium,
    SpaceGrotesk_600SemiBold,
    SpaceGrotesk_700Bold,
    Inter_400Regular,
    Inter_400Regular_Italic,
    Inter_500Medium,
    Inter_600SemiBold,
    SpaceMono_400Regular,
    SpaceMono_700Bold,
  });

  if (!fontsLoaded) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={colors.primary} />
        <StatusBar style="dark" />
      </View>
    );
  }

  return (
    <AppProvider>
      <DictationProvider>
        <MainScreen />
        <StatusBar style="dark" />
      </DictationProvider>
    </AppProvider>
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1, backgroundColor: colors.canvas, alignItems: 'center', justifyContent: 'center' },
});
