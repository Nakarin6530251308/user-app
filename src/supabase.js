import 'react-native-url-polyfill/auto'; // 👈 ต้องใส่บรรทัดนี้บนสุดสำหรับมือถือ
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://fedtpylgingbqdfxbluf.supabase.co'; // ใส่ URL ที่ก๊อปมา
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZlZHRweWxnaW5nYnFkZnhibHVmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY0Nzc4ODEsImV4cCI6MjA4MjA1Mzg4MX0.ERpJiUIgtP9CYrZGVLUVo3Uz0GdRnYfLeD-ei_Raf6Q';    // ใส่ Key ที่ก๊อปมา

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    storage: AsyncStorage, // ช่วยให้ล็อกอินค้างไว้ได้ ไม่หลุดตอนปิดแอป
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});