// @ts-nocheck
import React, { useState, useEffect, useRef } from 'react';
import {
  Alert, Dimensions, Platform, StyleSheet, Text, View,
  TextInput, TouchableOpacity, ActivityIndicator,
  FlatList, Modal, Vibration, SafeAreaView, Image, Switch, ScrollView, StatusBar
} from 'react-native';

import MapLibreGL from '@maplibre/maplibre-react-native';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import * as ImagePicker from 'expo-image-picker';
import { decode } from 'base64-arraybuffer';

import { supabase } from '../src/supabase'; 
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import * as FileSystem from 'expo-file-system/legacy';

import {
  MapPin, LogOut, Navigation, ShieldAlert, Hospital, Flame,
  School, Store, Car, Droplets, HelpCircle, User, CheckCircle,
  XCircle, AlertTriangle, Phone, Globe, Crosshair, Camera,
  Clock, Image as ImageIcon, Timer, Home, List,
  Settings, Bell, Megaphone, HeartHandshake, Users, FileText, Wrench, Headphones,
  Search, Compass, ChevronLeft, Radio, Map, Menu, X, Plus, Check, RefreshCcw
} from 'lucide-react-native';
import { red } from 'react-native-reanimated/lib/typescript/Colors';

WebBrowser.maybeCompleteAuthSession();
MapLibreGL.setAccessToken(null);

const { width, height } = Dimensions.get('window');

// --- THEME COLORS ---
const THEME = {
  primary: '#FF6F00',
  secondary: '#FF8F00',
  background: '#000000',
  card: '#111827',
  input: '#F3F4F6',
  text: '#1F2937',
  textSec: '#6B7280',
  glow: '#FF3D00',
};

export default function App() {
  const cameraRef = useRef(null);

  const [session, setSession] = useState(null);
  const [role, setRole] = useState('user');
  const [loading, setLoading] = useState(true);

  // Profile Data
  const [editName, setEditName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  
  // Map Data
  const [location, setLocation] = useState(null);
  const [landmarks, setLandmarks] = useState([]);
  const [nearbyLandmarks, setNearbyLandmarks] = useState([]); 
  const [activeZones, setActiveZones] = useState([]);

  // Rescue Data
  const [jobList, setJobList] = useState([]);
  const [myJob, setMyJob] = useState(null);
  const [userActiveCase, setUserActiveCase] = useState(null); 
  const [isOnline, setIsOnline] = useState(false); 

  // UI State
  const [activeTab, setActiveTab] = useState('home'); 
  const [reportModalVisible, setReportModalVisible] = useState(false);
  const [notificationModalVisible, setNotificationModalVisible] = useState(false);
  const [nearbyListVisible, setNearbyListVisible] = useState(false);
  const [isMenuVisible, setIsMenuVisible] = useState(true);
  
  // ✅ Reporting State (เพิ่มตัวแปรสำหรับฟอร์มใหม่)
  const [reportType, setReportType] = useState('accident'); // accident, fire, flood, other
  const [reportDesc, setReportDesc] = useState('');
  const [reportImages, setReportImages] = useState([]); // เก็บรูปหลายรูป
  const [reporterNameInput, setReporterNameInput] = useState(''); // ชื่อในฟอร์มแจ้งเหตุ
  const [reporterPhoneInput, setReporterPhoneInput] = useState(''); // เบอร์ในฟอร์มแจ้งเหตุ
  const [sendingReport, setSendingReport] = useState(false);
  const [isPickingLocation, setIsPickingLocation] = useState(false); 
  const [reportLocation, setReportLocation] = useState(null); 
  
  const [closeJobModalVisible, setCloseJobModalVisible] = useState(false);
  const [closeNotes, setCloseNotes] = useState('');
  const [submittingClose, setSubmittingClose] = useState(false);

  // AUTH
  useEffect(() => {
    let mounted = true;
    const loadUserData = async (userId) => {
      try {
        const { data } = await supabase.from('profiles').select('*').eq('id', userId).single();
        if (mounted && data) {
          setRole(data.role || 'user');
          setEditName(data.full_name || '');
          setEditPhone(data.phone || '');
          // ✅ Set ค่าเริ่มต้นให้ฟอร์มแจ้งเหตุด้วย
          setReporterNameInput(data.full_name || '');
          setReporterPhoneInput(data.phone || '');
          setIsOnline(data.availability === 'online');
        }
      } catch (e) { } finally { if (mounted) setLoading(false); }
    };
    const initializeApp = async () => {
      const { data: { session: currentSession } } = await supabase.auth.getSession();
      if (mounted) {
        setSession(currentSession);
        if (currentSession) loadUserData(currentSession.user.id); else setLoading(false);
      }
    };
    initializeApp();
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!mounted) return;
      setSession(session);
      if (event === 'SIGNED_IN' && session) loadUserData(session.user.id);
      else if (event === 'SIGNED_OUT') { setRole('user'); setLoading(false); }
    });
    return () => { mounted = false; subscription.unsubscribe(); };
  }, []);

  // DATA FETCHING (Real-time)
  useEffect(() => {
    if (!session) return;
    fetchGeneralData();
    if (role === 'rescue') fetchJobs();
    else fetchUserActiveCase();
    
    const sub = supabase.channel('updates')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cases' }, () => {
         if (role === 'rescue') fetchJobs(); else fetchUserActiveCase();
      })
      .subscribe();
    return () => supabase.removeChannel(sub);
  }, [session, role]);

  const getDistance = (lat1, lon1, lat2, lon2) => {
      const R = 6371; 
      const dLat = (lat2 - lat1) * (Math.PI / 180);
      const dLon = (lon2 - lon1) * (Math.PI / 180);
      const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      return R * c;
  };

  useEffect(() => {
      if (location && landmarks.length > 0) {
          const nearby = landmarks.map(lm => ({
              ...lm, 
              distance: getDistance(location.latitude, location.longitude, lm.latitude, lm.longitude)
          })).filter(lm => lm.distance <= 10).sort((a, b) => a.distance - b.distance); 
          setNearbyLandmarks(nearby);
      }
  }, [location, landmarks]);

  const getLandmarkIcon = (category) => {
      switch (category) {
          case 'hospital': return { icon: Hospital, color: '#EF4444' };
          case 'police': return { icon: ShieldAlert, color: '#1E40AF' };
          default: return { icon: MapPin, color: '#6B7280' };
      }
  };

  const handleNavigateToLandmark = (lat, lng) => {
      const url = Platform.select({ ios: `maps:0,0?q=${lat},${lng}`, android: `geo:0,0?q=${lat},${lng}` });
      Linking.openURL(url);
  };

  const fetchGeneralData = async () => { 
    const { data: lmData } = await supabase.from('landmarks').select('*');
    if (lmData) setLandmarks(lmData);
    const { data: notiData } = await supabase.from('notifications').select('*').eq('status', 'ACTIVE');
    if (notiData) setActiveZones(notiData); 
  }; 

  const fetchJobs = async () => {
    const { data } = await supabase.from('cases').select('*, profiles:user_id(full_name, phone)').eq('rescue_id', session.user.id).in('status', ['assigned', 'accepted']).order('created_at', { ascending: false });
    if (data) { setMyJob(data.find((j) => j.status === 'accepted') || null); setJobList(data.filter((j) => j.status === 'assigned')); }
  };

  const fetchUserActiveCase = async () => {
    const { data } = await supabase.from('cases').select('*').eq('user_id', session.user.id).in('status', ['pending', 'assigned', 'accepted']).order('created_at', { ascending: false }).limit(1);
    if (data && data.length > 0) setUserActiveCase(data[0]); else setUserActiveCase(null);
  };

  const handleLogout = async () => {
    Alert.alert("ยืนยัน", "ต้องการออกจากระบบ?", [{ text: "ยกเลิก" }, { text: "ออก", style: 'destructive', onPress: async () => {
        setLoading(true); await supabase.auth.signOut(); setSession(null); setRole('user'); setLoading(false);
    }}]);
  };

  const toggleRescuerStatus = async (value) => {
    try {
        await supabase.from('profiles').update({ availability: value ? 'online' : 'offline' }).eq('id', session.user.id);
        setIsOnline(value);
    } catch(e) { setIsOnline(value); }
  };

  const handleCenterLocation = () => {
    if (location && cameraRef.current) {
        cameraRef.current.setCamera({ 
            centerCoordinate: [location.longitude, location.latitude], 
            zoomLevel: 15, 
            animationDuration: 500,
            padding: { top: 400, bottom: 0, left: 0, right: 0 } 
        });
    } else { 
        Alert.alert('รอสักครู่', 'กำลังระบุตำแหน่งของคุณ...'); 
    }
};

  useEffect(() => { (async () => { await Location.requestForegroundPermissionsAsync(); await Location.watchPositionAsync({ accuracy: 6, timeInterval: 5000, distanceInterval: 10 }, (loc) => { setLocation(loc.coords); if(session?.user) supabase.from('user_locations').upsert({ id: session.user.id, email: session.user.email, latitude: loc.coords.latitude, longitude: loc.coords.longitude, updated_at: new Date() }); }); })(); }, [session]);
  
 // 1. ฟังก์ชันเลือกรูป (ยอมใช้ MediaTypeOptions เพื่อไม่ให้แอปเด้ง แม้จะมี Warning)
  const pickReportImage = async () => {
      Alert.alert("เพิ่มรูปภาพ", "ต้องการถ่ายรูปใหม่ หรือเลือกจากอัลบั้ม?", [
          {
              text: "ถ่ายรูป",
              onPress: async () => {
                  const { status } = await ImagePicker.requestCameraPermissionsAsync();
                  if (status !== 'granted') return Alert.alert('ขออภัย', 'ต้องการสิทธิ์กล้อง');
                  
                  let result = await ImagePicker.launchCameraAsync({
                      // ✅ ยอมใช้ตัวนี้ (ถึงจะเตือนสีเหลือง แต่ใช้ได้จริง ไม่เด้ง)
                      mediaTypes: ImagePicker.MediaTypeOptions.Images, 
                      quality: 0.5,
                      base64: true,
                  });
                  if (!result.canceled) setReportImages([...reportImages, result.assets[0]]);
              }
          },
          {
              text: "เลือกจากอัลบั้ม",
              onPress: async () => {
                  let result = await ImagePicker.launchImageLibraryAsync({
                      // ✅ ยอมใช้ตัวนี้
                      mediaTypes: ImagePicker.MediaTypeOptions.Images, 
                      quality: 0.5,
                  });
                  if (!result.canceled) setReportImages([...reportImages, result.assets[0]]);
              }
          },
          { text: "ยกเลิก", style: "cancel" }
      ]);
  };

  // 2. ฟังก์ชันช่วยอัปโหลดรูป (สำคัญ! ต้องแก้ Import ด้านบนไฟล์เป็น /legacy ก่อนนะ)
  const uploadImage = async (imageUri) => {
      try {
          // อ่านไฟล์เป็น Base64
          // ⚠️ ถ้าแก้ import ด้านบนแล้ว บรรทัดนี้จะทำงานผ่านฉลุยครับ
          const base64 = await FileSystem.readAsStringAsync(imageUri, {
              encoding: 'base64', 
          });
          
          const fileData = decode(base64);
          const fileName = `${Date.now()}-${Math.floor(Math.random() * 1000)}.jpg`;
          const filePath = `sos/${fileName}`;

          const { error } = await supabase.storage
              .from('case_images') 
              .upload(filePath, fileData, {
                  contentType: 'image/jpeg'
              });

          if (error) throw error;

          const { data } = supabase.storage
              .from('case_images')
              .getPublicUrl(filePath);

          return data.publicUrl;
      } catch (error) {
          console.log("Upload Failed:", error.message);
          return null;
      }
  };

  // 3. ฟังก์ชันกดส่ง (เหมือนเดิม)
  const handleSubmitReport = async () => { 
      if (!reporterNameInput || !reporterPhoneInput) {
          return Alert.alert("แจ้งเตือน", "กรุณากรอกชื่อและเบอร์โทรศัพท์");
      }
      setSendingReport(true); 
      try { 
          let imageUrls = [];
          if (reportImages.length > 0) {
              for (let img of reportImages) {
                  const url = await uploadImage(img.uri);
                  if (url) imageUrls.push(url);
              }
          }
          
          const finalLat = reportLocation ? reportLocation.latitude : (location?.latitude || 0); 
          const finalLng = reportLocation ? reportLocation.longitude : (location?.longitude || 0); 
          
          const { error } = await supabase.from('cases').insert({ 
              user_id: session.user.id, 
              reporter_name: reporterNameInput, 
              reporter_phone: reporterPhoneInput, 
              report_type: reportType, 
              description: reportDesc || '-', 
              images: imageUrls, 
              latitude: finalLat, 
              longitude: finalLng, 
              status: 'pending' 
          }); 
          
          if (error) throw error; 
          Alert.alert("สำเร็จ", "แจ้งเหตุเรียบร้อยแล้ว"); 
          
          setReportModalVisible(false); 
          setReportDesc(''); 
          setReportImages([]);
          setReportLocation(null); 
          fetchUserActiveCase(); 
      } catch (e) { 
          Alert.alert("Error", "ส่งข้อมูลไม่สำเร็จ: " + e.message); 
      } finally { 
          setSendingReport(false); 
      } 
  };
  const handleSubmitCloseJob = async () => { 
      setSubmittingClose(true); 
      try { 
          await supabase.from('cases').update({ status: 'completed', close_notes: closeNotes }).eq('id', myJob.id); 
          setCloseJobModalVisible(false); setMyJob(null); fetchJobs(); setActiveTab('home'); 
      } catch (e) { Alert.alert("Error", "ปิดงานไม่สำเร็จ"); } finally { setSubmittingClose(false); } 
  };

  const handleSaveProfile = async () => { 
      const updates = { id: session.user.id, full_name: editName, phone: editPhone, updated_at: new Date() };
      const { error } = await supabase.from('profiles').upsert(updates); 
      if (error) Alert.alert("Error", error.message); else Alert.alert("สำเร็จ", "บันทึกข้อมูลเรียบร้อย"); 
  };

  if (loading) return <View style={styles.center}><ActivityIndicator size="large" color={THEME.primary} /></View>;
  if (!session) return <LoginScreen />;

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={THEME.primary} />
      
      {/* --- USER MODE --- */}
      {role === 'user' && (
         <View style={{flex:1, backgroundColor: 'black'}}> 
            
            {/* Map */}
            {(activeTab === 'home' || activeTab === 'explore') && (
               <View style={StyleSheet.absoluteFill}>
                 <MapLibreGL.MapView
        style={styles.map}  // (เช็คของเดิมด้วยนะครับว่าใช้ styles.map หรือเปล่า)
        logoEnabled={false} 
        attributionEnabled={false}
      >
        
        {/* 1. ส่วนกล้อง (Camera) */}
        <MapLibreGL.Camera 
          ref={cameraRef} 
          defaultSettings={{ centerCoordinate: [100.5018, 13.7563], zoomLevel: 15 }} 
          followUserLocation={true}  // ✅ แนะนำให้เปิด true ไว้ครับ กล้องจะได้ตามจุดสีฟ้าไป
        />

        {/* 2. ส่วนแผนที่ OpenStreetMap (อันเดิมของคุณ) */}
        <MapLibreGL.RasterSource 
          id="osmSource" 
          tileUrlTemplates={["https://tile.openstreetmap.org/{z}/{x}/{y}.png"]} 
          tileSize={256} 
          tms={false}
        >
          <MapLibreGL.RasterLayer id="osmLayer" sourceID="osmSource" />
        </MapLibreGL.RasterSource>
        
        {/* 3. ✅ จุดสีฟ้ากระพริบ (UserLocation) ใส่แค่นี้จบเลยครับ! */}
        <MapLibreGL.UserLocation 
           visible={true} 
           animated={true} 
           showsUserHeadingIndicator={true} // (ตัวเลือกเสริม) ให้มีลูกศรบอกทิศที่หันหน้า
        />

      </MapLibreGL.MapView>
               </View>
            )}

            {activeTab === 'home' && (
                <>
                    <SafeAreaView style={[styles.headerContainer, {borderBottomLeftRadius: 0, borderBottomRightRadius: 0, paddingBottom: 15}]}> 
                        <View style={styles.headerContent}>
                            <View style={{flexDirection:'row', alignItems:'center'}}>
                                <View style={styles.avatarPlaceholder}><User size={30} color="white" /></View>
                                <View style={{marginLeft: 10}}>
                                    <Text style={styles.welcomeText}>Welcome!</Text>
                                    <Text style={styles.userName}>{editName || 'User'}</Text>
                                </View>
                            </View>
                            <View style={{flexDirection:'row', gap: 15}}>
                                <TouchableOpacity onPress={() => setActiveTab('profile')}><Settings size={28} color="white" /></TouchableOpacity>
                                <TouchableOpacity onPress={() => setIsMenuVisible(!isMenuVisible)}>
                                    <Menu size={28} color="white" />
                                </TouchableOpacity>
                            </View>
                        </View>
                    </SafeAreaView>

                    {isMenuVisible && (
                        <View style={{backgroundColor: 'black', paddingVertical: 15, paddingHorizontal: 10, borderBottomWidth: 1, borderBottomLeftRadius: 20,borderBottomRightRadius: 20,borderBottomColor: '#070404'}}>
                            <View style={styles.gridContainer}>
                                <MenuButton icon={Bell} label="เหตุฉุกเฉิน" onPress={() => setNotificationModalVisible(true)} />
                                <MenuButton icon={Megaphone} label="ประกาศ" onPress={() => setNotificationModalVisible(true)} />
                                <MenuButton icon={HeartHandshake} label="ขอความช่วยเหลือ" />
                                <MenuButton icon={Users} label="กลุ่มเปราะบาง" />
                                <MenuButton icon={MapPin} label="ปักหมุด" onPress={() => { setIsPickingLocation(true); setActiveTab('explore'); Alert.alert("ปักหมุด", "แตะบนแผนที่เพื่อระบุจุดเกิดเหตุ"); }} />
                                <MenuButton icon={FileText} label="ร้องทุกข์" />
                                <MenuButton icon={Wrench} label="บริการอื่นๆ" />
                                <MenuButton icon={Headphones} label="ติดต่อเจ้าหน้าที่" />
                            </View>
                        </View>
                    )}
                </>
            )}

            {(activeTab === 'home' || activeTab === 'explore') && (
                
                <>
                <TouchableOpacity 
                        style={styles.refreshBtn} 
                        onPress={async () => {
                            // 1. สั่งโหลดข้อมูล "งาน/เคส" ใหม่ (อันเดิมที่มีอยู่แล้ว)
                            if (role === 'rescue') {
                                await fetchJobs(); 
                            } else {
                                await fetchUserActiveCase(); 
                            }

                            // 2. 👇 เพิ่มบรรทัดนี้ครับ! สั่งโหลด "ข้อมูลส่วนตัว" ใหม่ด้วย
                            // (ต้องเช็คก่อนว่ามี session มั้ย กัน Error)
                            if (session?.user?.id) {
                                const { data } = await supabase
                                    .from('profiles')
                                    .select('*')
                                    .eq('id', session.user.id)
                                    .single();
                                
                                // ถ้าดึงสำเร็จ ให้เอาค่าใหม่มาแปะที่หน้าจอทันที
                                if (data) {
                                    setEditName(data.full_name || '');
                                    setEditPhone(data.phone || '');
                                    // อัปเดตฟอร์มแจ้งเหตุด้วย (เผื่อไว้)
                                    setReporterNameInput(data.full_name || '');
                                    setReporterPhoneInput(data.phone || '');
                                    setIsOnline(data.availability === 'online');
                                }
                            }

                            // 3. สั่นเตือน
                            Vibration.vibrate(100); 
                            Alert.alert("อัปเดต", "รีเฟรชข้อมูลล่าสุดแล้ว");
                        }}
                    >
                        <RefreshCcw size={28} color={THEME.primary} />
                    </TouchableOpacity>

                    {/* (ปุ่ม nearbyListBtn ของเดิมอยู่แถวๆ นี้) */}
                    <TouchableOpacity style={styles.nearbyListBtn} onPress={() => setNearbyListVisible(true)}>
                        <List size={28} color={THEME.primary} />
                    </TouchableOpacity>

                    <TouchableOpacity 
              style={styles.myLocationBtnUser} 
              onPress={() => {
                  // เช็คว่ามีค่าพิกัดล่าสุดไหม
                  if (location && cameraRef.current) {
                      cameraRef.current.setCamera({
                          centerCoordinate: [location.longitude, location.latitude],
                          zoomLevel: 15,
                          animationDuration: 1000,
                          padding: { paddingTop: 200, paddingBottom: 0, paddingLeft: 0, paddingRight: 0 } 
                      });
                  }
              }}
            >
                <Crosshair size={32} color={THEME.primary} />
            </TouchableOpacity>

                    <TouchableOpacity style={styles.sosButton} onPress={() => { setReportLocation(null); setReportModalVisible(true); }}>
                        <Text style={styles.sosText}>SOS</Text>
                    </TouchableOpacity>
                </>
            )}

            <View style={styles.bottomBar}>
                <TabButton icon={Home} label="Home" active={activeTab === 'home'} onPress={() => setActiveTab('home')} />
                <TabButton icon={Compass} label="Explore" active={activeTab === 'explore'} onPress={() => setActiveTab('explore')} />
                <TabButton icon={Search} label="Search" active={activeTab === 'search'} onPress={() => setActiveTab('search')} />
                <TabButton icon={User} label="Profile" active={activeTab === 'profile'} onPress={() => setActiveTab('profile')} />
            </View>
            
            {activeTab === 'profile' && (
                <View style={[styles.container, {backgroundColor: 'black'}]}>
                    <ScrollView contentContainerStyle={{padding: 20, paddingBottom: 150}}> 
                        <SafeAreaView>
                            <Text style={[styles.pageTitle, {color: THEME.primary}]}>Profile</Text>
                            <View style={{alignItems:'center', marginVertical:30}}>
                                <View style={{width:100, height:100, borderRadius:50, backgroundColor: THEME.input, justifyContent:'center', alignItems:'center', marginBottom:10}}>
                                    <User size={50} color={THEME.textSec}/>
                                </View>
                                <Text style={{fontSize:22, fontWeight:'bold', color:'white'}}>{editName || 'Guest User'}</Text>
                                <Text style={{color:THEME.textSec, fontSize:16}}>{session?.user?.email || 'No Email'}</Text>
                            </View>
                            <View style={{marginBottom: 20}}>
                                <Text style={{color: THEME.textSec, marginBottom: 5}}>Full Name</Text>
                                <TextInput value={editName} onChangeText={setEditName} style={[styles.profileInput, {color: 'black', backgroundColor: THEME.input}]} placeholder="ชื่อ-สกุล" placeholderTextColor="#666"/>
                            </View>
                            <View style={{marginBottom: 30}}>
                                <Text style={{color: THEME.textSec, marginBottom: 5}}>Phone Number</Text>
                                <TextInput value={editPhone} onChangeText={setEditPhone} style={[styles.profileInput, {color: 'black', backgroundColor: THEME.input}]} placeholder="เบอร์โทรศัพท์" keyboardType="phone-pad" placeholderTextColor="#666"/>
                            </View>
                            <TouchableOpacity style={styles.saveProfileBtn} onPress={handleSaveProfile}><Text style={{color:'white', fontWeight:'bold', fontSize:18}}>บันทึกข้อมูล</Text></TouchableOpacity>
            <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}><LogOut size={24} color={THEME.danger} /><Text style={{color: THEME.danger, marginLeft: 10, fontSize: 16, fontWeight: 'bold'}}>ออกจากระบบ</Text>
            </TouchableOpacity>
                        </SafeAreaView>
                    </ScrollView>
                    <View style={styles.bottomBar}>
                        <TabButton icon={Home} label="Home" active={activeTab === 'home'} onPress={() => setActiveTab('home')} />
                        <TabButton icon={Compass} label="Explore" active={activeTab === 'explore'} onPress={() => setActiveTab('explore')} />
                        <TabButton icon={Search} label="Search" active={activeTab === 'search'} onPress={() => setActiveTab('search')} />
                        <TabButton icon={User} label="Profile" active={activeTab === 'profile'} onPress={() => setActiveTab('profile')} />
                    </View>
                </View>
            )}
         </View>
      )}
      
      {/* --- RESCUE MODE (No changes requested, kept consistent) --- */}
      {role === 'rescue' && (
         <View style={{flex:1, backgroundColor: 'black'}}>
            <SafeAreaView style={styles.rescueHeader}>
                <View style={{flexDirection:'row', alignItems:'center'}}>
                    <Image source={{uri: 'https://via.placeholder.com/100'}} style={styles.avatarPlaceholder} /> 
                    <View style={{marginLeft: 10}}>
                        <Text style={{color:'white', fontSize:22, fontWeight:'bold'}}>Welcome!</Text>
                        <Text style={{color:'rgba(255,255,255,0.9)', fontSize:16}}>{editName}</Text>
                    </View>
                </View>
                <TouchableOpacity onPress={handleLogout}><Settings size={32} color="white"/></TouchableOpacity>
            </SafeAreaView>
            {/* ... Rescue Mode UI (Same as before) ... */}
            <View style={{paddingHorizontal: 20, marginBottom: 25, marginTop: 20}}> 
                <View style={styles.neonStatusBar}>
                    <Text style={{color:'white', fontWeight:'bold', fontSize:16}}>สถานะรับงาน</Text>
                    <View style={{flexDirection:'row', alignItems:'center', gap: 10}}>
                        <Switch value={isOnline} onValueChange={toggleRescuerStatus} trackColor={{false: '#555', true: THEME.primary}} thumbColor={'white'} style={{transform:[{scale:1.2}]}} />
                        <Text style={{color: isOnline ? 'white' : '#999', fontWeight:'bold', fontSize:14}}>{isOnline ? 'พร้อม (Online)' : 'พัก (Offline)'}</Text>
                    </View>
                </View>
            </View>
            <View style={{marginBottom: 20}}>
                <Text style={{color:'white', marginLeft:20, marginBottom:15, fontSize:16}}>เมนูการทำงานกู้ภัย</Text>
                <View style={styles.rescueGrid}>
                    <RescueMenuButton icon={Megaphone} label={`งานที่ได้รับ\nมอบหมาย (${jobList.length})`} badge={jobList.length} active />
                    <RescueMenuButton icon={MapPin} label="แผนที่นำทาง" onPress={()=>setActiveTab('map')} />
                    <RescueMenuButton icon={FileText} label="รายงานสถานะ" />
                    <RescueMenuButton icon={List} label="ประวัติงาน" />
                </View>
            </View>
            <View style={{flex: 1, paddingHorizontal: 20, paddingBottom: 20}}>
                {myJob ? (
                    <View style={[styles.neonCard, {borderColor: THEME.success, shadowColor: THEME.success}]}>
                        <Text style={{color: THEME.success, fontSize: 18, fontWeight: 'bold', marginBottom: 10}}>กำลังปฏิบัติภารกิจ (Ongoing Case)</Text>
                        <Text style={{color: 'white', fontSize: 20, fontWeight:'bold', marginBottom:5}}>SOS: {myJob.report_type}</Text>
                        <Text style={{color: '#ccc', marginBottom: 15}}>{myJob.description}</Text>
                        <View style={{flexDirection: 'row', gap: 10}}>
                             <TouchableOpacity style={[styles.glowBtn, {backgroundColor: THEME.primary}]} onPress={handleCenterLocation}><Text style={styles.glowBtnText}>นำทาง (Nav)</Text></TouchableOpacity>
                             <TouchableOpacity style={[styles.glowBtn, {backgroundColor: THEME.success}]} onPress={()=>setCloseJobModalVisible(true)}><Text style={styles.glowBtnText}>ปิดงาน (Close)</Text></TouchableOpacity>
                        </View>
                    </View>
                ) : jobList.length > 0 ? (
                    <View style={styles.neonCard}>
                        <Text style={{color: THEME.glow, fontSize: 18, fontWeight: 'bold', marginBottom: 5}}>งานด่วน! รอการตอบรับ (Pending Case)</Text>
                        <View style={{height: 1, backgroundColor: '#333', marginBottom: 10}} />
                        <View style={{flexDirection: 'row'}}>
                            <View style={{flex: 1, paddingRight: 10}}>
                                <Text style={{color: THEME.danger, fontWeight:'bold', fontSize: 16}}>SOS Case #{jobList[0].id.toString().slice(0,4)}</Text>
                                <Text style={{color: 'white', fontSize: 18, fontWeight:'bold', marginVertical: 5}}>{jobList[0].report_type}</Text>
                                <Text style={{color: '#ccc', fontSize: 14}} numberOfLines={2}>{jobList[0].description}</Text>
                                <Text style={{color: '#999', fontSize: 12, marginTop: 5}}>ผู้แจ้ง: {jobList[0].profiles?.full_name || 'ไม่ระบุ'}</Text>
                                <Text style={{color: '#999', fontSize: 12}}>โทร: {jobList[0].profiles?.phone || '-'}</Text>
                            </View>
                            <View style={styles.mapMockup}>
                                <Map size={40} color="#666" />
                                <View style={{position:'absolute', top:10, right:10, backgroundColor:THEME.danger, borderRadius:10, padding:2}}><Text style={{color:'white', fontSize:8, fontWeight:'bold'}}>SOS</Text></View>
                                <View style={{position:'absolute', bottom:25, left:25, width:10, height:10, borderRadius:5, backgroundColor:THEME.primary}} />
                            </View>
                        </View>
                        <View style={{flexDirection: 'row', gap: 10, marginTop: 15}}>
                             <TouchableOpacity style={[styles.glowBtn, {backgroundColor: THEME.primary}]} onPress={() => { Alert.alert("ยืนยัน", "รับงานนี้?", [{text:"ยกเลิก"}, {text:"รับงาน", onPress:async()=>{ await supabase.from('cases').update({status:'accepted', rescue_id:session.user.id}).eq('id', jobList[0].id); fetchJobs(); }}]); }}>
                                <Text style={styles.glowBtnText}>รับงาน (Accept)</Text>
                             </TouchableOpacity>
                             <TouchableOpacity style={[styles.glowBtn, {backgroundColor: 'transparent', borderWidth: 1, borderColor: THEME.primary}]}>
                                <Text style={[styles.glowBtnText, {color: THEME.primary}]}>ดูพิกัด (View Map)</Text>
                             </TouchableOpacity>
                        </View>
                    </View>
                ) : (
                    <View style={[styles.neonCard, {borderColor: '#333', opacity: 0.5}]}>
                        <Text style={{color: 'white', textAlign: 'center', fontSize: 16}}>ยังไม่มีงานเข้ามา...</Text>
                    </View>
                )}
            </View>
            <View style={[styles.bottomBar, {backgroundColor: THEME.primary}]}>
               <TabButton icon={Home} label="Home" active={true} onPress={() => {}} />
               <TabButton icon={Compass} label="Explore" active={false} onPress={() => {}} />
               <TabButton icon={Search} label="Search" active={false} onPress={() => {}} />
               <TabButton icon={User} label="Profile" active={false} onPress={handleLogout} />
            </View>
            <TouchableOpacity 
                style={styles.rescueRefreshBtn} 
                onPress={async () => {
                    await fetchJobs();
                    if (session?.user?.id) {
                        const { data } = await supabase.from('profiles').select('*').eq('id', session.user.id).single();
                        if (data) {
                            setEditName(data.full_name || '');
                            setEditPhone(data.phone || '');
                            setIsOnline(data.availability === 'online');
                        }
                    }
                    Vibration.vibrate(100);
                    Alert.alert("อัปเดต", "รีเฟรชข้อมูลล่าสุดแล้ว");
                }}
            >
                <RefreshCcw size={28} color={THEME.primary} />
            </TouchableOpacity>
         </View>
      )}

      {/* ✅ Modal แจ้งเหตุฉุกเฉิน (SOS Form) - ปรับ UI ใหม่ตามรูป */}
      <Modal visible={reportModalVisible} animationType="slide">
          <SafeAreaView style={{flex:1, backgroundColor: 'white'}}>
              {/* Header สีส้ม */}
              <View style={{backgroundColor: THEME.primary, padding: 20, flexDirection: 'row', alignItems: 'center', paddingTop: Platform.OS==='android'?40:20}}>
                  <TouchableOpacity onPress={()=>setReportModalVisible(false)}><ChevronLeft size={30} color="white"/></TouchableOpacity>
                  <View style={{marginLeft: 15}}>
                      <Text style={{color:'white', fontSize: 16}}>Welcome!</Text>
                      <Text style={{color:'white', fontSize: 16}}>{editName}</Text>
                  </View>
                  <View style={{flex:1}} />
                  <Settings size={28} color="white" />
              </View>
              
              <View style={{backgroundColor: THEME.primary, alignItems:'center', paddingBottom: 15}}>
                  <Text style={{color:'white', fontSize: 24, fontWeight:'bold'}}>แจ้งเหตุฉุกเฉิน</Text>
              </View>

              <ScrollView style={{padding:20}}>
                 {/* 1. ผู้แจ้งเหตุ */}
                 <Text style={styles.fieldLabel}>ผู้แจ้งเหตุ:</Text>
                 <View style={{flexDirection: 'row', gap: 10, marginBottom: 15}}>
                     <TextInput style={[styles.input, {flex:1}]} placeholder="ชื่อ-สกุล" value={reporterNameInput} onChangeText={setReporterNameInput} />
                     <TextInput style={[styles.input, {flex:1}]} placeholder="เบอร์โทร" keyboardType="phone-pad" value={reporterPhoneInput} onChangeText={setReporterPhoneInput} />
                 </View>

                 {/* 2. เลือกประเภทเหตุ */}
                 <Text style={styles.fieldLabel}>เลือกประเภทเหตุ:</Text>
                 <View style={{flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20}}>
                     <TypeSelector icon={Car} label="อุบัติเหตุ" selected={reportType === 'accident'} onPress={()=>setReportType('accident')} color="#EF4444" />
                     <TypeSelector icon={Flame} label="ไฟไหม้" selected={reportType === 'fire'} onPress={()=>setReportType('fire')} color="#F97316" />
                     <TypeSelector icon={Droplets} label="น้ำท่วม" selected={reportType === 'flood'} onPress={()=>setReportType('flood')} color="#3B82F6" />
                     <TypeSelector icon={HelpCircle} label="อื่นๆ" selected={reportType === 'other'} onPress={()=>setReportType('other')} color="#6B7280" />
                 </View>

                 {/* 3. รายละเอียด */}
                 <Text style={styles.fieldLabel}>รายละเอียด:</Text>
                 <TextInput style={[styles.input, {height:100, textAlignVertical: 'top'}]} multiline placeholder="ระบุรายละเอียดเพิ่มเติม..." value={reportDesc} onChangeText={setReportDesc} />

                 {/* 4. รูปภาพ */}
                 <Text style={styles.fieldLabel}>รูปภาพ/วิดีโอ (ถ้ามี):</Text>
                 <View style={{flexDirection:'row', gap: 10, marginBottom: 20}}>
                     <TouchableOpacity style={styles.addPhotoBtn} onPress={pickReportImage}>
                         <Camera size={24} color="#6B7280" />
                         <Text style={{color:'#6B7280', fontSize:12, marginTop:5}}>เพิ่มรูป</Text>
                     </TouchableOpacity>
                     <ScrollView horizontal>
                         {reportImages.map((img, i) => (
                             <Image key={i} source={{uri: img.uri}} style={{width:100, height:100, borderRadius:8, marginRight:10}} />
                         ))}
                     </ScrollView>
                 </View>

                 {/* ปุ่มยืนยัน */}
                 <TouchableOpacity style={styles.submitReportBtn} onPress={handleSubmitReport} disabled={sendingReport}>
                    {sendingReport ? <ActivityIndicator color="white"/> : (
                        <>
                            <Check size={20} color="white" style={{marginRight: 10}} />
                            <Text style={styles.submitBtnText}>ยืนยันการแจ้งเหตุ</Text>
                        </>
                    )}
                 </TouchableOpacity>
                 <TouchableOpacity onPress={()=>setReportModalVisible(false)} style={{marginTop:15, alignItems:'center', marginBottom: 40}}>
                     <Text style={{color: THEME.textSec, fontSize: 16}}>❌ ยกเลิก</Text>
                 </TouchableOpacity>
              </ScrollView>
          </SafeAreaView>
      </Modal>

      <Modal visible={closeJobModalVisible} transparent animationType="slide">
         <View style={styles.modalOverlay}>
             <View style={[styles.modalContent, {backgroundColor: THEME.card}]}>
                 <Text style={{fontSize:20, fontWeight:'bold', marginBottom:10, color: 'white'}}>ปิดงาน</Text>
                 <TextInput style={[styles.input, {height:100, backgroundColor: THEME.input, color: 'white'}]} multiline placeholder="รายละเอียดการช่วยเหลือ..." placeholderTextColor="#666" value={closeNotes} onChangeText={setCloseNotes} />
                 <TouchableOpacity style={[styles.submitReportBtn, {backgroundColor:THEME.success}]} onPress={handleSubmitCloseJob} disabled={submittingClose}>
                    {submittingClose ? <ActivityIndicator color="white"/> : <Text style={styles.submitBtnText}>ยืนยัน</Text>}
                 </TouchableOpacity>
                 <TouchableOpacity onPress={()=>setCloseJobModalVisible(false)} style={{marginTop:10, alignSelf:'center'}}><Text style={{color:'#999'}}>ยกเลิก</Text></TouchableOpacity>
             </View>
         </View>
      </Modal>

      <Modal visible={notificationModalVisible} transparent animationType="fade">
         <View style={styles.modalOverlay}>
             <View style={[styles.modalContent, {maxHeight: '60%', backgroundColor: THEME.card}]}>
                 <Text style={{fontSize:20, fontWeight:'bold', marginBottom:15, color: THEME.primary}}>ประกาศแจ้งเตือน</Text>
                 <ScrollView>
                     {activeZones.length === 0 ? <Text style={{textAlign:'center', color:'#999', fontSize:16}}>ไม่มีประกาศในขณะนี้</Text> : 
                      activeZones.map((z, i) => (
                          <View key={i} style={{marginBottom:15, borderBottomWidth:1, borderBottomColor:'#333', paddingBottom:10}}>
                              <Text style={{fontWeight:'bold', fontSize:18, color: 'white'}}>{z.title}</Text>
                              <Text style={{color:'#EA580C', fontSize:16}}>{z.message}</Text>
                          </View>
                      ))
                     }
                 </ScrollView>
                 <TouchableOpacity onPress={()=>setNotificationModalVisible(false)} style={{marginTop:15, padding:15, backgroundColor:THEME.input, borderRadius:8, alignItems:'center'}}>
                     <Text style={{fontWeight:'bold', fontSize:16, color: 'orange'}}>ปิด</Text>
                 </TouchableOpacity>
             </View>
         </View>
      </Modal>

      <Modal visible={nearbyListVisible} animationType="slide" transparent>
         <View style={{flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)'}}>
             <View style={{height: '60%', backgroundColor: THEME.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20}}>
                 <View style={{flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15}}>
                     <Text style={{fontSize: 20, fontWeight: 'bold', color: 'white'}}>📍 สถานที่สำคัญใกล้ฉัน</Text>
                     <TouchableOpacity onPress={() => setNearbyListVisible(false)} style={{backgroundColor: THEME.danger, borderRadius: 15, padding: 5}}>
                         <X size={20} color="white" />
                     </TouchableOpacity>
                 </View>
                 
                 {nearbyLandmarks.length === 0 ? (
                     <Text style={{color: '#999', textAlign: 'center', marginTop: 20}}>ไม่พบสถานที่ในระยะ 10 กม.</Text>
                 ) : (
                     <FlatList
                         data={nearbyLandmarks}
                         keyExtractor={item => item.id.toString()}
                         renderItem={({item}) => {
                             const { icon: Icon, color } = getLandmarkIcon(item.category);
                             return (
                                 <View style={{flexDirection: 'row', alignItems: 'center', paddingVertical: 15, borderBottomWidth: 1, borderBottomColor: '#333'}}>
                                     <View style={{width: 40, height: 40, borderRadius: 20, backgroundColor: color + '20', justifyContent: 'center', alignItems: 'center', marginRight: 15}}>
                                         <Icon size={20} color={color} />
                                     </View>
                                     <View style={{flex: 1}}>
                                         <Text style={{color: 'white', fontSize: 16, fontWeight: 'bold'}}>{item.name}</Text>
                                         <Text style={{color: '#999', fontSize: 12}}>{item.category} • {item.distance.toFixed(1)} กม.</Text>
                                     </View>
                                     <TouchableOpacity 
                                         style={{backgroundColor: THEME.success, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, flexDirection: 'row', alignItems: 'center'}}
                                         onPress={() => handleNavigateToLandmark(item.latitude, item.longitude)}
                                     >
                                         <Navigation size={14} color="white" style={{marginRight: 5}} />
                                         <Text style={{color: 'white', fontWeight: 'bold', fontSize: 12}}>นำทาง</Text>
                                     </TouchableOpacity>
                                 </View>
                             );
                         }}
                     />
                 )}
             </View>
         </View>
      </Modal>

    </View>
  );
}

// --- SUB COMPONENTS ---
// Type Selector for Report Form
const TypeSelector = ({ icon: Icon, label, selected, onPress, color }) => (
    <TouchableOpacity onPress={onPress} style={{alignItems:'center', width: '22%'}}>
        <View style={{
            width: 60, height: 60, borderRadius: 12, 
            borderWidth: 2, borderColor: selected ? color : '#E5E7EB',
            backgroundColor: selected ? color + '20' : 'white',
            justifyContent: 'center', alignItems: 'center'
        }}>
            <Icon size={30} color={selected ? color : '#9CA3AF'} />
        </View>
        <Text style={{marginTop: 5, fontSize: 12, color: selected ? color : '#6B7280', fontWeight: selected ? 'bold' : 'normal'}}>{label}</Text>
    </TouchableOpacity>
);

const MenuButton = ({ icon: Icon, label, onPress }) => (
    <TouchableOpacity style={styles.menuItem} onPress={onPress}>
        <View style={styles.menuIconCircle}>
            <Icon size={40} color="white" />
        </View>
        <Text style={[styles.menuText, {color: 'white'}]}>{label}</Text>
    </TouchableOpacity>
);

const RescueMenuButton = ({ icon: Icon, label, badge, onPress }) => (
    <TouchableOpacity style={styles.rescueMenuItem} onPress={onPress}>
        <View style={styles.rescueIconCircle}>
            <Icon size={36} color={THEME.primary} />
            {badge > 0 && <View style={styles.badge}><Text style={styles.badgeText}>{badge}</Text></View>}
        </View>
        <Text style={styles.rescueMenuText}>{label}</Text>
    </TouchableOpacity>
);

const TabButton = ({ icon: Icon, label, active, onPress }) => (
    <TouchableOpacity style={styles.tabItem} onPress={onPress}>
        <Icon size={32} color={active ? 'white' : 'black'} />
        <Text style={[styles.tabText, {color: active ? 'white' : 'black'}]}>{label}</Text>
    </TouchableOpacity>
);

const LoginScreen = () => {
    const [isRegister, setIsRegister] = useState(false);
    const [email, setEmail] = useState(''); const [password, setPassword] = useState('');
    const [name, setName] = useState(''); const [phone, setPhone] = useState('');
    const [loading, setLoading] = useState(false);

    const performGoogleLogin = async () => {
        setLoading(true);
        try {
            const redirectUrl = 'thairescue://'; 
            const { data, error } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: redirectUrl, skipBrowserRedirect: true, queryParams: { prompt: 'select_account' } } });
            if (error) throw error;
            if (data?.url) {
                const result = await WebBrowser.openAuthSessionAsync(data.url, redirectUrl);
                if (result.type === 'success' && result.url) {
                    const params = {}; const hash = result.url.split('#')[1];
                    if (hash) { hash.split('&').forEach((part) => { const [key, value] = part.split('='); params[key] = decodeURIComponent(value); }); }
                    if (params.access_token && params.refresh_token) { const { error: sessionError } = await supabase.auth.setSession({ access_token: params.access_token, refresh_token: params.refresh_token }); if (sessionError) Alert.alert("ข้อผิดพลาด", sessionError.message); }
                }
            }
        } catch (e) { Alert.alert("Error", e.message); } finally { setLoading(false); }
    };

    const handleAuth = async () => {
        setLoading(true);
        try {
            if(isRegister) {
                const {data, error} = await supabase.auth.signUp({email, password});
                if(error) throw error;
                if(data.user) await supabase.from('profiles').upsert({id: data.user.id, full_name: name, phone: phone});
                Alert.alert("Success", "สมัครสมาชิกสำเร็จ!"); setIsRegister(false);
            } else {
                const {error} = await supabase.auth.signInWithPassword({email, password});
                if(error) throw error;
            }
        } catch(e) { Alert.alert("Error", e.message); } finally { setLoading(false); }
    };

    return (
        <View style={styles.authContainer}>
            <View style={{alignItems:'center', marginBottom:40}}>
              <View style={{alignItems:'center', marginBottom:40}}>
              {/* 👇 ใส่โค้ดนี้แทนอันเดิมครับ */}
              <Image 
                source={require('../assets/images/logo.png')} 
                style={{ width: 320, height: 100, resizeMode: 'contain' }} 
              />
            </View>
            </View>
            <Text style={styles.authTitle}>{isRegister ? 'Create new Account' : 'Login'}</Text>
            {isRegister && <><Text style={styles.label}>NAME</Text><TextInput style={styles.authInput} placeholder="Your Name" placeholderTextColor="#666" value={name} onChangeText={setName} /><Text style={styles.label}>PHONE</Text><TextInput style={styles.authInput} placeholder="Phone Number" placeholderTextColor="#666" value={phone} onChangeText={setPhone} keyboardType="phone-pad" /></>}
            <Text style={styles.label}>EMAIL</Text><TextInput style={styles.authInput} placeholder="Email" placeholderTextColor="#666" value={email} onChangeText={setEmail} autoCapitalize="none"/>
            <Text style={styles.label}>PASSWORD</Text><TextInput style={styles.authInput} placeholder="****" placeholderTextColor="#666" value={password} onChangeText={setPassword} secureTextEntry/>
            <TouchableOpacity style={styles.authBtn} onPress={handleAuth}>{loading ? <ActivityIndicator color="black"/> : <Text style={styles.authBtnText}>{isRegister ? 'Sign up' : 'Log in'}</Text>}</TouchableOpacity>
            {!isRegister && (
                <TouchableOpacity style={[styles.authBtn, {backgroundColor: THEME.google, marginTop: 18}]} onPress={performGoogleLogin}>
                    <View style={{flexDirection: 'row', alignItems: 'center', gap: 10, justifyContent: 'center'}}>
                        <Globe size={24} color="white" />
                        <Text style={[styles.authBtnText, {color: 'white'}]}>Sign in with Google</Text>
                    </View>
                </TouchableOpacity>
            )}
            <TouchableOpacity onPress={() => setIsRegister(!isRegister)} style={{marginTop:20}}><Text style={{color:'white', textAlign:'center', fontSize:16}}>{isRegister ? 'Already Have Account? Login!' : 'Forgot Password? Signup!'}</Text></TouchableOpacity>
        </View>
    );
};

// --- STYLES ---
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: THEME.background },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'black' },
  map: { flex: 1 },
  
  headerContainer: { backgroundColor: THEME.primary, paddingBottom: 10, paddingTop: Platform.OS==='android'?40:20 }, 
  headerContent: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 20, marginBottom: 5 },
  avatarPlaceholder: { width: 50, height: 50, borderRadius: 25, backgroundColor: 'rgba(255,255,255,0.2)', justifyContent:'center', alignItems:'center' },
  welcomeText: { color: 'rgba(255,255,255,0.8)', fontSize: 14 },
  userName: { color: 'white', fontSize: 18, fontWeight: 'bold' },
  
  gridContainer: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', paddingHorizontal: 10 }, 
  menuItem: { width: '23%', alignItems: 'center', marginBottom: 15 },
  
  menuIconCircle: {
      width: 70,
      height: 70,
      borderRadius: 35,
      backgroundColor: 'rgba(255, 111, 0, 0.15)', 
      justifyContent: 'center',
      alignItems: 'center',
      marginBottom: 5,
      borderWidth: 1.5,
      borderColor: THEME.primary,
      shadowColor: THEME.primary,
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: 1,
      shadowRadius: 10,  
      elevation: 10,     
  },
  menuText: { color: 'white', fontSize: 14, textAlign: 'center' },
  
  rescueHeader: { flexDirection: 'row', justifyContent: 'space-between', padding: 20, paddingTop: Platform.OS==='android'?45:20, backgroundColor: THEME.primary },
  neonStatusBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'black', padding: 15, borderRadius: 12, borderWidth: 1, borderColor: THEME.glow, shadowColor: THEME.glow, shadowOpacity: 0.8, shadowRadius: 10, elevation: 5 },
  rescueGrid: { flexDirection: 'row', justifyContent: 'space-around', paddingHorizontal: 10, marginBottom: 20 },
  rescueMenuItem: { alignItems: 'center' },
  refreshBtn: { 
      position: 'absolute', 
      bottom: 240,      
      left: 20,         
      width: 56, 
      height: 56, 
      borderRadius: 28, 
      backgroundColor: 'white', 
      justifyContent: 'center', 
      alignItems: 'center', 
      elevation: 5, 
      shadowColor: '#000', 
      shadowOpacity: 0.3, 
      shadowRadius: 5, 
      zIndex: 99 
  },
  rescueRefreshBtn: { 
      position: 'absolute', 
      bottom: 160,        
      right: 20,          
      width: 56, 
      height: 56, 
      borderRadius: 28, 
      backgroundColor: 'white', 
      justifyContent: 'center', 
      alignItems: 'center', 
      elevation: 5, 
      shadowColor: '#ffffff', 
      shadowOpacity: 0.3, 
      shadowRadius: 5, 
      zIndex: 99 
  },
  rescueIconCircle: {
      width: 70,
      height: 70,
      borderRadius: 35,
      backgroundColor: 'black', 
      justifyContent: 'center',
      alignItems: 'center',
      marginBottom: 8,
      borderWidth: 2,
      borderColor: THEME.primary, 
      shadowColor: '#FF6F00',
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: 0.9,
      shadowRadius: 15,
      elevation: 15,
  },
  rescueMenuText: { color: 'white', fontSize: 12, textAlign: 'center' },
  badge: { position: 'absolute', top: 0, right: 0, backgroundColor: THEME.danger, width: 24, height: 24, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  badgeText: { color: 'white', fontSize: 10, fontWeight: 'bold' },
  
  neonCard: { backgroundColor: 'black', borderRadius: 16, padding: 20, borderWidth: 2, borderColor: THEME.glow, shadowColor: THEME.glow, shadowOpacity: 0.6, shadowRadius: 15, elevation: 8 },
  mapMockup: { width: 100, height: 100, backgroundColor: '#E5E7EB', borderRadius: 12, justifyContent: 'center', alignItems: 'center', overflow: 'hidden' },
  glowBtn: { flex: 1, padding: 12, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  glowBtnText: { color: 'white', fontWeight: 'bold', fontSize: 16 },

  bottomBar: { position: 'absolute', bottom: 0, width: '100%', height: 120, backgroundColor: THEME.primary, flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center', borderTopWidth:0, paddingBottom: 50 },
  tabItem: { alignItems: 'center' },
  tabText: { fontSize: 14, marginTop: 4, fontWeight: 'bold' },
  
  sosButton: { position: 'absolute', bottom: 140, right: 20, width: 80, height: 80, borderRadius: 40, backgroundColor: '#FF3B30', justifyContent: 'center', alignItems: 'center', elevation: 10,},
  sosText: { color: 'white', fontWeight: 'bold', fontSize: 20 },
  myLocationBtn: { position: 'absolute', top: 290, right: 20, width: 56, height: 56, borderRadius: 28, backgroundColor: 'white', justifyContent: 'center', alignItems: 'center', elevation: 5, zIndex: 99 },
  myLocationBtnUser: { position: 'absolute', bottom: 240, right: 20, width: 56, height: 56, borderRadius: 28, backgroundColor: 'white', justifyContent: 'center', alignItems: 'center', elevation: 5, zIndex: 99 },
  
  nearbyListBtn: { position: 'absolute', bottom: 140, left: 20, backgroundColor: 'white', borderRadius: 40, width: 80, height: 80, justifyContent: 'center', alignItems: 'center', elevation: 5, shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 5, zIndex: 99 },

  userDot: { width: 16, height: 16, borderRadius: 8, backgroundColor: '#3B82F6', borderWidth: 2, borderColor: 'white' },
  jobMarker: { backgroundColor: THEME.danger, padding: 6, borderRadius: 12 },
  myJobMarker: { backgroundColor: THEME.success, padding: 8, borderRadius: 20 },
  fab: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'white', justifyContent: 'center', alignItems: 'center', elevation: 5 },
  
  pageTitle: { fontSize: 28, fontWeight: 'bold', color: THEME.primary, marginBottom: 20 },
  profileInput: { backgroundColor: THEME.input, borderRadius: 8, padding: 18, fontSize: 18, color: THEME.text },
  saveProfileBtn: { backgroundColor: THEME.primary, padding: 18, borderRadius: 10, alignItems: 'center', marginTop: 20 },
  logoutBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 30, padding: 18, borderWidth: 1, borderColor: THEME.danger, borderRadius: 10, backgroundColor: 'white' },
  authContainer: { flex: 1, backgroundColor: '#000000', justifyContent: 'center', padding: 30 },
  authTitle: { fontSize: 32, color: THEME.primary, fontWeight: 'bold', textAlign: 'center', marginBottom: 20 },
  label: { color: 'white', fontSize: 14, fontWeight: 'bold', marginTop: 15, marginBottom: 5, letterSpacing: 1 },
  authInput: { backgroundColor: '#333333', color: 'white', padding: 18, borderRadius: 8, fontSize: 16 },
  authBtn: { backgroundColor: THEME.primary, padding: 18, borderRadius: 8, alignItems: 'center', marginTop: 30 },
  authBtnText: { color: 'black', fontWeight: 'bold', fontSize: 20 },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
  modalContent: { width: '85%', backgroundColor: 'white', padding: 25, borderRadius: 16 },
  modalHeader: { backgroundColor: THEME.primary, padding: 20, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  modalTitle: { color: 'white', fontSize: 20, fontWeight: 'bold' },
  fieldLabel: { fontSize: 18, color: '#333', marginBottom: 8, marginTop: 15 },
  input: { backgroundColor: '#F3F4F6', padding: 15, borderRadius: 8, marginBottom: 15, fontSize: 16 },
  typeChip: { width: '23%', height: 80, borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  typeChipActive: { borderColor: THEME.primary, backgroundColor: '#fff7ed' },
  addPhotoBtn: { width: 100, height: 100, borderRadius: 8, backgroundColor: '#f3f4f6', justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: '#d1d5db', borderStyle: 'dashed' },
  submitReportBtn: { backgroundColor: THEME.primary, padding: 18, borderRadius: 10, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginTop: 30 },
  submitBtnText: { color: 'white', fontWeight: 'bold', fontSize: 18 },
});