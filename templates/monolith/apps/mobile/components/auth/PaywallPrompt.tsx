// @ts-nocheck -- template-only; the scaffold engine strips this line before writing to user projects so scaffolded output has normal TypeScript checking.
import { Link } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

// Mobile paywall prompt for {{projectName}}.
//
// Rendered by the mobile `<RoleGate />` when the signed-in user's role
// doesn't meet the required tier. Minimal styling — Story 4.3 adds
// NativeWind and a polished card visual.
//
// The "View plans" link navigates to `/(tabs)/billing` — that screen
// doesn't exist in Story 3.4 yet, but the route will resolve once a
// billing tab is added. Edit the href when your mobile billing flow
// lives at a different path.
export function PaywallPrompt() {
  return (
    <View style={styles.container} accessibilityRole="summary">
      <Text style={styles.title}>Upgrade required</Text>
      <Text style={styles.body}>This feature is part of the paid plan. Upgrade to continue.</Text>
      <Link href="/(tabs)/billing" style={styles.link}>
        View plans
      </Link>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 24,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 8,
    alignItems: 'center',
    gap: 8,
  },
  title: { fontSize: 18, fontWeight: '600' },
  body: { fontSize: 14, opacity: 0.8, textAlign: 'center' },
  link: { marginTop: 8, color: '#2563eb', fontWeight: '600' },
});
