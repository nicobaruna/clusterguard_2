import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import {
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

type Category = 'MEDIS' | 'BENCANA' | 'KEAMANAN';
type EventStatus = 'PENDING' | 'FALLBACK' | 'RESOLVED';

type SosEvent = {
  id: string;
  category: Category;
  status: EventStatus;
};

const categories: Array<{ name: Category; label: string; detail: string; color: string }> = [
  { name: 'MEDIS', label: 'Medis', detail: 'Butuh bantuan kesehatan', color: '#c92828' },
  { name: 'BENCANA', label: 'Bencana', detail: 'Api, banjir, atau kerusakan', color: '#e47a1b' },
  { name: 'KEAMANAN', label: 'Keamanan', detail: 'Ancaman atau kondisi mencurigakan', color: '#123c73' },
];

const apiUrl = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:8787';

export default function App() {
  const [authenticated, setAuthenticated] = useState(false);
  const [email, setEmail] = useState('budi@example.com');
  const [password, setPassword] = useState('password123');
  const [selected, setSelected] = useState<Category | null>(null);
  const [event, setEvent] = useState<SosEvent | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!event || event.status !== 'PENDING') return;

    const timer = setInterval(() => setElapsed((value) => value + 1), 1000);
    const fallback = setTimeout(() => {
      setEvent((current) => current ? { ...current, status: 'FALLBACK' } : current);
    }, 30_000);

    return () => {
      clearInterval(timer);
      clearTimeout(fallback);
    };
  }, [event]);

  const signIn = () => {
    if (!email || !password) {
      setMessage('Masukkan email dan password.');
      return;
    }

    setMessage('');
    setAuthenticated(true);
  };

  const sendSos = async () => {
    if (!selected || busy) return;

    setBusy(true);
    setMessage('');

    try {
      const response = await fetch(`${apiUrl}/sos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category: selected }),
      });

      if (!response.ok) throw new Error('API unavailable');
      const payload = await response.json();
      setEvent({
        id: payload.event?.id ?? 'mobile-event',
        category: payload.event?.category ?? selected,
        status: payload.event?.status ?? 'PENDING',
      });
    } catch {
      setEvent({ id: `demo-${Date.now()}`, category: selected, status: 'PENDING' });
      setMessage('Mode demo aktif. API belum terhubung.');
    } finally {
      setElapsed(0);
      setBusy(false);
    }
  };

  const reset = () => {
    setEvent(null);
    setSelected(null);
    setElapsed(0);
    setMessage('');
  };

  if (!authenticated) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <StatusBar style="light" />
        <ScrollView contentContainerStyle={styles.authScreen} keyboardShouldPersistTaps="handled">
          <View style={styles.brandMark}><Text style={styles.brandMarkText}>CG</Text></View>
          <Text style={styles.eyebrow}>CLUSTERGUARD</Text>
          <Text style={styles.authTitle}>Komunitas siaga, saling menjaga.</Text>
          <Text style={styles.authCopy}>Masuk untuk mengirim sinyal darurat ke PIC lingkungan Anda.</Text>
          <View style={styles.form}>
            <Text style={styles.inputLabel}>Email</Text>
            <TextInput autoCapitalize="none" keyboardType="email-address" style={styles.input} value={email} onChangeText={setEmail} />
            <Text style={styles.inputLabel}>Password</Text>
            <TextInput secureTextEntry style={styles.input} value={password} onChangeText={setPassword} />
            {message ? <Text style={styles.errorText}>{message}</Text> : null}
            <Pressable style={styles.primaryButton} onPress={signIn}>
              <Text style={styles.primaryButtonText}>Masuk ke ClusterGuard</Text>
            </Pressable>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeAreaLight}>
      <StatusBar style="dark" />
      <ScrollView contentContainerStyle={styles.screen}>
        <View style={styles.header}>
          <View>
            <Text style={styles.eyebrowBlue}>CLUSTERGUARD</Text>
            <Text style={styles.greeting}>Halo, Bpk. Budi</Text>
            <Text style={styles.muted}>Blok A-12 · Warga</Text>
          </View>
          <Pressable onPress={() => setAuthenticated(false)}><Text style={styles.logout}>Keluar</Text></Pressable>
        </View>

        {!event ? (
          <>
            <View style={styles.alertBanner}>
              <Text style={styles.alertTitle}>Ada keadaan darurat?</Text>
              <Text style={styles.alertCopy}>Pilih jenis bantuan. PIC akan menerima sinyal Anda.</Text>
            </View>
            <Text style={styles.sectionLabel}>PILIH KATEGORI</Text>
            {categories.map((category) => (
              <Pressable key={category.name} style={[styles.categoryCard, { borderLeftColor: category.color }]} onPress={() => setSelected(category.name)}>
                <View style={[styles.categoryBadge, { backgroundColor: category.color }]}><Text style={styles.categoryBadgeText}>{category.name.slice(0, 1)}</Text></View>
                <View style={styles.categoryInfo}><Text style={styles.categoryTitle}>{category.label}</Text><Text style={styles.categoryDetail}>{category.detail}</Text></View>
                <Text style={styles.chevron}>›</Text>
              </Pressable>
            ))}
            {selected ? (
              <View style={styles.confirmBox}>
                <Text style={styles.confirmTitle}>Kirim sinyal {selected.toLowerCase()}?</Text>
                <Text style={styles.confirmCopy}>PIC akan melihat lokasi dan kategori darurat Anda.</Text>
                <Pressable style={styles.sosButton} onPress={() => void sendSos()}><Text style={styles.sosButtonText}>{busy ? 'Mengirim...' : 'Kirim SOS Sekarang'}</Text></Pressable>
                <Pressable onPress={() => setSelected(null)}><Text style={styles.cancelText}>Batal</Text></Pressable>
              </View>
            ) : null}
          </>
        ) : (
          <View style={styles.statusCard}>
            <Text style={styles.sectionLabel}>SINYAL TERKIRIM</Text>
            <View style={styles.statusDotRow}><View style={styles.statusDot} /><Text style={styles.statusText}>{event.status}</Text></View>
            <Text style={styles.statusTitle}>{event.category}</Text>
            <Text style={styles.muted}>Waktu berlalu: {elapsed} detik</Text>
            {event.status === 'PENDING' ? <Text style={styles.statusCopy}>Menunggu respons PIC lingkungan...</Text> : null}
            {event.status === 'FALLBACK' ? <Text style={styles.fallbackCopy}>PIC belum merespons. Hubungi kontak darurat langsung.</Text> : null}
            {event.status === 'FALLBACK' ? <Pressable style={styles.callButton} onPress={() => setMessage('Tambahkan nomor PIC setelah konfigurasi cluster.') }><Text style={styles.callButtonText}>Hubungi PIC</Text></Pressable> : null}
            <Pressable style={styles.secondaryButton} onPress={reset}><Text style={styles.secondaryButtonText}>Kembali ke beranda</Text></Pressable>
            {message ? <Text style={styles.demoText}>{message}</Text> : null}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#123c73' },
  safeAreaLight: { flex: 1, backgroundColor: '#eef2f5' },
  authScreen: { flexGrow: 1, justifyContent: 'center', padding: 28 },
  brandMark: { width: 58, height: 58, borderRadius: 16, backgroundColor: '#f7c948', justifyContent: 'center', alignItems: 'center', marginBottom: 22 },
  brandMarkText: { color: '#123c73', fontWeight: '900', fontSize: 20 },
  eyebrow: { color: '#f7c948', fontSize: 12, fontWeight: '800', letterSpacing: 2 },
  eyebrowBlue: { color: '#123c73', fontSize: 11, fontWeight: '800', letterSpacing: 2 },
  authTitle: { color: '#fff', fontSize: 38, lineHeight: 43, fontWeight: '800', marginTop: 14 },
  authCopy: { color: '#d6e2f0', fontSize: 16, lineHeight: 24, marginTop: 14 },
  form: { marginTop: 32, backgroundColor: '#fff', borderRadius: 20, padding: 20 },
  inputLabel: { color: '#526273', fontSize: 12, fontWeight: '700', marginTop: 4, marginBottom: 7 },
  input: { borderWidth: 1, borderColor: '#d7e0e8', borderRadius: 10, paddingHorizontal: 13, paddingVertical: 12, fontSize: 16, marginBottom: 14, color: '#17283a' },
  errorText: { color: '#b42318', fontSize: 13, marginBottom: 12 },
  primaryButton: { backgroundColor: '#123c73', borderRadius: 12, padding: 15, alignItems: 'center', marginTop: 4 },
  primaryButtonText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  screen: { flexGrow: 1, padding: 22 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 26 },
  greeting: { color: '#17283a', fontSize: 28, fontWeight: '800', marginTop: 7 },
  muted: { color: '#637386', fontSize: 14, marginTop: 5 },
  logout: { color: '#123c73', fontSize: 13, fontWeight: '700', paddingTop: 5 },
  alertBanner: { backgroundColor: '#123c73', borderRadius: 18, padding: 20, marginBottom: 26 },
  alertTitle: { color: '#fff', fontSize: 24, fontWeight: '800' },
  alertCopy: { color: '#d6e2f0', fontSize: 14, lineHeight: 20, marginTop: 7 },
  sectionLabel: { color: '#637386', fontSize: 11, fontWeight: '800', letterSpacing: 1.4, marginBottom: 11 },
  categoryCard: { backgroundColor: '#fff', borderRadius: 16, borderLeftWidth: 5, padding: 15, flexDirection: 'row', alignItems: 'center', marginBottom: 11, shadowColor: '#17283a', shadowOpacity: 0.08, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 2 },
  categoryBadge: { width: 44, height: 44, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  categoryBadgeText: { color: '#fff', fontSize: 20, fontWeight: '900' },
  categoryInfo: { flex: 1, marginLeft: 13 },
  categoryTitle: { color: '#17283a', fontSize: 18, fontWeight: '800' },
  categoryDetail: { color: '#637386', fontSize: 13, marginTop: 4 },
  chevron: { color: '#9ba9b6', fontSize: 28, paddingLeft: 8 },
  confirmBox: { backgroundColor: '#fff8e1', borderRadius: 16, padding: 18, marginTop: 10, borderWidth: 1, borderColor: '#f0d986' },
  confirmTitle: { color: '#674f00', fontSize: 19, fontWeight: '800' },
  confirmCopy: { color: '#806b2a', lineHeight: 20, marginTop: 6, marginBottom: 16 },
  sosButton: { backgroundColor: '#c92828', borderRadius: 12, padding: 15, alignItems: 'center' },
  sosButtonText: { color: '#fff', fontWeight: '900', fontSize: 15 },
  cancelText: { textAlign: 'center', color: '#674f00', fontWeight: '700', paddingTop: 14 },
  statusCard: { backgroundColor: '#fff', borderRadius: 20, padding: 21, marginTop: 20 },
  statusDotRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 14 },
  statusDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#e47a1b', marginRight: 8 },
  statusText: { color: '#a0540e', fontSize: 12, fontWeight: '800', letterSpacing: 1 },
  statusTitle: { color: '#17283a', fontSize: 34, fontWeight: '900' },
  statusCopy: { color: '#637386', fontSize: 15, marginTop: 22 },
  fallbackCopy: { color: '#a0540e', fontSize: 15, lineHeight: 22, marginTop: 22 },
  callButton: { backgroundColor: '#c92828', borderRadius: 12, alignItems: 'center', padding: 15, marginTop: 18 },
  callButtonText: { color: '#fff', fontWeight: '800' },
  secondaryButton: { borderWidth: 1, borderColor: '#d7e0e8', borderRadius: 12, alignItems: 'center', padding: 14, marginTop: 12 },
  secondaryButtonText: { color: '#123c73', fontWeight: '800' },
  demoText: { color: '#a0540e', textAlign: 'center', fontSize: 12, marginTop: 14 },
});
