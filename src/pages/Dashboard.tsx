import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { 
  Activity, 
  AlertTriangle, 
  Phone, 
  Heart, 
  History, 
  Map, 
  Smartphone,
  TrendingUp,
  MapPin
} from 'lucide-react';
import { AppLayout } from '@/components/layout/AppLayout';
import { SensorGraph } from '@/components/dashboard/SensorGraph';
import { StatusCard } from '@/components/dashboard/StatusCard';
import { EmergencyOverlay } from '@/components/dashboard/EmergencyOverlay';
import { useSensorSimulation } from '@/hooks/useSensorSimulation';
import { useGeolocation } from '@/hooks/useGeolocation';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

const FALL_ACCEL_THRESHOLD = 25;     // m/s²
const FALL_ROTATION_THRESHOLD = 300; // deg/sec
const FALL_COOLDOWN_MS = 10000;      // 10 seconds

export default function Dashboard() {
  const { user } = useAuth();
  const { sensorData, simulateFall, isFalling } = useSensorSimulation();
  const { latitude, longitude, requestPermission, permissionDenied } = useGeolocation();

  const [showEmergency, setShowEmergency] = useState(false);
  const [currentEventId, setCurrentEventId] = useState<string | null>(null);
  const [locationRequested, setLocationRequested] = useState(false);

  const lastFallTimeRef = useRef(0);

  const [stats, setStats] = useState({
    totalFalls: 0,
    emergencies: 0,
    falseAlarms: 0,
    lastActivity: null as Date | null,
  });

  /* ---------------- LOCATION PERMISSION ---------------- */
  useEffect(() => {
    if (!locationRequested) {
      requestPermission();
      setLocationRequested(true);
    }
  }, [requestPermission, locationRequested]);

  /* ---------------- FETCH STATS ---------------- */
  useEffect(() => {
    if (!user) return;

    const fetchStats = async () => {
      const { data: events } = await supabase
        .from('fall_events')
        .select('*')
        .eq('user_id', user.id);

      if (events) {
        setStats({
          totalFalls: events.length,
          emergencies: events.filter(e => e.is_emergency).length,
          falseAlarms: events.filter(e => !e.is_emergency && e.resolved).length,
          lastActivity: events.length
            ? new Date(events[events.length - 1].timestamp)
            : null,
        });
      }
    };

    fetchStats();
  }, [user, showEmergency]);

  /* ---------------- FALL HANDLER (USED BY BUTTON + AUTO) ---------------- */
  const handleSimulateFall = async () => {
    if (!user) return;

    simulateFall();

    const eventLatitude =
      latitude ?? 28.6139 + (Math.random() - 0.5) * 0.1;
    const eventLongitude =
      longitude ?? 77.2090 + (Math.random() - 0.5) * 0.1;

    const { data, error } = await supabase
      .from('fall_events')
      .insert({
        user_id: user.id,
        latitude: eventLatitude,
        longitude: eventLongitude,
        is_emergency: false,
        resolved: false,
      })
      .select()
      .single();

    if (error) {
      toast.error('Error creating fall event');
      return;
    }

    setCurrentEventId(data.id);

    await supabase.from('sensor_data').insert({
      user_id: user.id,
      accelerometer_x: sensorData.accelerometer.x,
      accelerometer_y: sensorData.accelerometer.y,
      accelerometer_z: sensorData.accelerometer.z,
      gyroscope_x: sensorData.gyroscope.x,
      gyroscope_y: sensorData.gyroscope.y,
      gyroscope_z: sensorData.gyroscope.z,
    });

    setTimeout(() => setShowEmergency(true), 500);
  };

  /* ---------------- AUTOMATIC FALL DETECTION ---------------- */
  useEffect(() => {
    if (!user) return;

    const onMotion = (e: DeviceMotionEvent) => {
      const now = Date.now();
      if (now - lastFallTimeRef.current < FALL_COOLDOWN_MS) return;

      // Accelerometer spike
      if (e.accelerationIncludingGravity) {
        const { x = 0, y = 0, z = 0 } = e.accelerationIncludingGravity;
        const magnitude = Math.sqrt(x*x + y*y + z*z);

        if (magnitude > FALL_ACCEL_THRESHOLD) {
          lastFallTimeRef.current = now;
          handleSimulateFall();
          return;
        }
      }

      // Gyroscope spike
      if (e.rotationRate) {
        const { alpha = 0, beta = 0, gamma = 0 } = e.rotationRate;
        const rotation = Math.abs(alpha) + Math.abs(beta) + Math.abs(gamma);

        if (rotation > FALL_ROTATION_THRESHOLD) {
          lastFallTimeRef.current = now;
          handleSimulateFall();
        }
      }
    };

    if (
      typeof DeviceMotionEvent !== 'undefined' &&
      typeof (DeviceMotionEvent as any).requestPermission === 'function'
    ) {
      (DeviceMotionEvent as any).requestPermission().then((res: string) => {
        if (res === 'granted') {
          window.addEventListener('devicemotion', onMotion);
        }
      });
    } else {
      window.addEventListener('devicemotion', onMotion);
    }

    return () => window.removeEventListener('devicemotion', onMotion);
  }, [user]);

  /* ---------------- UI ---------------- */
  return (
    <AppLayout>
      <div className="space-y-8">

        <StatusCard
          status={isFalling ? 'warning' : 'safe'}
          title={isFalling ? 'Fall Detected' : 'All Clear'}
          description={isFalling ? 'Processing fall detection...' : 'Your safety monitoring is active'}
        />

        <motion.button
          onClick={handleSimulateFall}
          disabled={isFalling}
          className="btn-danger w-full py-6 text-xl disabled:opacity-50"
        >
          <AlertTriangle className="mr-3 inline h-6 w-6" />
          Simulate Fall Detection
        </motion.button>

        <div className="grid gap-4 md:grid-cols-2">
          <SensorGraph icon={Activity} label="Accelerometer" sensor="accelerometer" />
          <SensorGraph icon={Smartphone} label="Gyroscope" sensor="gyroscope" />
        </div>
      </div>

      <EmergencyOverlay
        isOpen={showEmergency}
        onClose={() => setShowEmergency(false)}
        eventId={currentEventId || undefined}
      />
    </AppLayout>
  );
}
