// @ts-nocheck
import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, FlatList, Modal, TextInput, Alert, ActivityIndicator } from 'react-native';
import MapLibreGL from '@maplibre/maplibre-react-native'; // 👈 ใช้ MapLibre
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { supabase } from '../src/supabase';

// ตั้งค่า Token (ใช้ null สำหรับ MapLibre ฟรี)
MapLibreGL.setAccessToken(null);

export default function SavedLocations() {
  const router = useRouter();
  const [locations, setLocations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  
  // State สำหรับฟอร์มเพิ่มสถานที่
  const [newLocName, setNewLocName] = useState('');
  const [newLocDesc, setNewLocDesc] = useState('');
  const [selectedCoords, setSelectedCoords] = useState<any>(null); // { latitude, longitude }

  // ดึง User ID
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        setUserId(session.user.id);
        fetchLocations(session.user.id);
      }
    });
  }, []);

  const fetchLocations = async (uid: string) => {
    setLoading(true);
    const { data, error } = await supabase.from('user_locations_saved').select('*').eq('user_id', uid).order('created_at', { ascending: false });
    if (error) console.log('Error fetching:', error);
    else setLocations(data || []);
    setLoading(false);
  };

  const handleAddLocation = async () => {
    if (!newLocName || !selectedCoords) {
      return Alert.alert('ข้อมูลไม่ครบ', 'กรุณาใส่ชื่อสถานที่และจิ้มเลือกจุดบนแผนที่');
    }
    
    // เตรียมข้อมูลบันทึก
    const { error } = await supabase.from('user_locations_saved').insert({
      user_id: userId,
      name: newLocName,
      description: newLocDesc,
      latitude: selectedCoords.latitude,
      longitude: selectedCoords.longitude
    });

    if (error) {
      Alert.alert('Error', error.message);
    } else {
      Alert.alert('สำเร็จ', 'บันทึกสถานที่เรียบร้อย');
      setModalVisible(false);
      setNewLocName('');
      setNewLocDesc('');
      setSelectedCoords(null);
      if(userId) fetchLocations(userId);
    }
  };

  const handleDelete = async (id: number) => {
      Alert.alert('ยืนยัน', 'ต้องการลบสถานที่นี้?', [
          { text: 'ยกเลิก' },
          { text: 'ลบ', style: 'destructive', onPress: async () => {
              const { error } = await supabase.from('user_locations_saved').delete().eq('id', id);
              if(!error && userId) fetchLocations(userId);
          }}
      ])
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="#333" />
        </TouchableOpacity>
        <Text style={styles.title}>📍 สถานที่ของฉัน</Text>
        <TouchableOpacity onPress={() => setModalVisible(true)}>
          <Ionicons name="add-circle" size={30} color="#3498db" />
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator size="large" color="#3498db" style={{marginTop: 20}} />
      ) : (
        <FlatList
          data={locations}
          keyExtractor={(item) => item.id.toString()}
          ListEmptyComponent={<Text style={styles.emptyText}>ยังไม่มีสถานที่บันทึกไว้</Text>}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <View>
                <Text style={styles.cardTitle}>{item.name}</Text>
                <Text style={styles.cardDesc}>{item.description || 'ไม่มีรายละเอียด'}</Text>
              </View>
              <TouchableOpacity onPress={() => handleDelete(item.id)}>
                <Ionicons name="trash-outline" size={24} color="#e74c3c" />
              </TouchableOpacity>
            </View>
          )}
        />
      )}

      {/* MODAL เพิ่มสถานที่ */}
      <Modal visible={modalVisible} animationType="slide">
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>เพิ่มสถานที่ใหม่</Text>
            <TouchableOpacity onPress={() => setModalVisible(false)}>
              <Ionicons name="close" size={24} color="#333" />
            </TouchableOpacity>
          </View>

          <TextInput 
            style={styles.input} 
            placeholder="ชื่อสถานที่ (เช่น บ้าน, ที่ทำงาน)" 
            value={newLocName} 
            onChangeText={setNewLocName} 
          />
          <TextInput 
            style={styles.input} 
            placeholder="รายละเอียดเพิ่มเติม" 
            value={newLocDesc} 
            onChangeText={setNewLocDesc} 
          />

          <Text style={{marginTop: 10, marginBottom: 5}}>👇 จิ้มเลือกจุดบนแผนที่:</Text>
          
          <View style={styles.mapContainer}>
             {/* 🗺️ MAPLIBRE (แก้ไขให้ใช้ CartoDB เหมือนหน้าแรก) */}
            <MapLibreGL.MapView
    style={styles.map}
    // 👇 ใช้ Style ของ OpenStreetMap ต้นฉบับ (ไม่ต้องใช้ API Key)
    styleJSON={JSON.stringify({
        "version": 8,
        "sources": {
            "osm": {
                "type": "raster",
                "tiles": ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"], // 👈 ลิงก์ต้นฉบับ
                "tileSize": 256,
                "attribution": "© OpenStreetMap contributors",
                "maxzoom": 19
            }
        },
        "layers": [
            { "id": "osm", "type": "raster", "source": "osm" }
        ]
    })}
    logoEnabled={false}
                onPress={(e) => {
                    // ดึงพิกัดจากการจิ้ม
                    const { geometry } = e;
                    setSelectedCoords({ latitude: geometry.coordinates[1], longitude: geometry.coordinates[0] });
                }}
            >
                <MapLibreGL.Camera
                    defaultSettings={{
                        centerCoordinate: [100.5018, 13.7563],
                        zoomLevel: 10
                    }}
                />
                
                {/* แสดงจุดที่เลือก */}
                {selectedCoords && (
                    <MapLibreGL.PointAnnotation
                        id="selectedPoint"
                        coordinate={[selectedCoords.longitude, selectedCoords.latitude]}
                    >
                        <View style={styles.marker} />
                    </MapLibreGL.PointAnnotation>
                )}
            </MapLibreGL.MapView>

            {/* แสดงพิกัดที่เลือก */}
            {selectedCoords && (
                <View style={styles.coordBadge}>
                    <Text style={{color:'white', fontSize: 12}}>
                        {selectedCoords.latitude.toFixed(4)}, {selectedCoords.longitude.toFixed(4)}
                    </Text>
                </View>
            )}
          </View>

          <TouchableOpacity style={styles.saveBtn} onPress={handleAddLocation}>
            <Text style={styles.saveBtnText}>บันทึก</Text>
          </TouchableOpacity>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f6fa', paddingTop: 50 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, marginBottom: 20 },
  title: { fontSize: 20, fontWeight: 'bold' },
  emptyText: { textAlign: 'center', marginTop: 50, color: '#999' },
  card: { backgroundColor: 'white', marginHorizontal: 20, marginBottom: 10, padding: 15, borderRadius: 10, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', elevation: 2 },
  cardTitle: { fontSize: 16, fontWeight: 'bold' },
  cardDesc: { fontSize: 14, color: '#666' },
  modalContainer: { flex: 1, backgroundColor: '#fff', padding: 20, paddingTop: 50 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20 },
  modalTitle: { fontSize: 20, fontWeight: 'bold' },
  input: { borderWidth: 1, borderColor: '#ddd', padding: 12, borderRadius: 8, marginBottom: 10, fontSize: 16 },
  mapContainer: { height: 300, borderRadius: 10, overflow: 'hidden', marginBottom: 20, borderWidth: 1, borderColor: '#ccc' },
  map: { flex: 1 },
  saveBtn: { backgroundColor: '#3498db', padding: 15, borderRadius: 10, alignItems: 'center' },
  saveBtnText: { color: 'white', fontSize: 18, fontWeight: 'bold' },
  marker: { width: 20, height: 20, borderRadius: 10, backgroundColor: 'red', borderWidth: 2, borderColor: 'white' },
  coordBadge: { position: 'absolute', bottom: 10, right: 10, backgroundColor: 'rgba(0,0,0,0.6)', padding: 5, borderRadius: 5 }
});