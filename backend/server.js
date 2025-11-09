const express = require('express');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const cors = require('cors');
const bcrypt = require('bcryptjs');

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// ------------------- MongoDB Connection -------------------
mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
}).then(() => console.log("✅ MongoDB Connected"))
  .catch(err => console.error("❌ MongoDB Connection Error:", err));

// ------------------- Models -------------------
const studentSchema = new mongoose.Schema({
  name: String,
  class: String,
  year: Number,
  regNo: { type: String, unique: true },
  phone: String,
  username: { type: String, unique: true },
  email: { type: String, unique: true },
  password: String,
  uuid: { type: String, unique: true },
  location: { latitude: Number, longitude: Number },
  loggedIn: { type: Boolean, default: false },
  lastLoginAt: { type: Date },
  lastLogoutAt: { type: Date },
  biometricEnrolled: { type: Boolean, default: false }
});
const Student = mongoose.model('Student', studentSchema);

const attendanceSchema = new mongoose.Schema({
  studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student' },
  studentName: String,
  regNo: String,
  class: String,
  year: Number,
  date: String,
  periods: [
    {
      periodNumber: Number,
      status: { type: String, enum: ['present', 'absent'] }
    }
  ]
}, { 
  // Add unique constraint to prevent duplicate records
  timestamps: true 
});

// Create compound index to prevent duplicate attendance records
attendanceSchema.index({ studentId: 1, date: 1 }, { unique: true });
const Attendance = mongoose.model("Attendance", attendanceSchema);

const pingSchema = new mongoose.Schema({
  studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student' },
  studentName: String,
  regNo: String,
  periodNumber: Number,
  timestampType: String,
  location: {
    latitude: Number,
    longitude: Number
  },
  locationValid: { type: Boolean, default: false },
  biometricType: { type: String, enum: ['fingerprint', 'face', null], default: null },
  biometricVerified: { type: Boolean, default: false },
  timestamp: { type: Date, default: Date.now }
});
const Ping = mongoose.model("Ping", pingSchema);

const notificationSchema = new mongoose.Schema({
  type: { type: String, enum: ['online', 'offline', 'locationOff', 'helpRequest', 'noPing'], required: true },
  studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student' },
  studentName: String,
  regNo: String,
  message: String,
  at: { type: Date, default: Date.now },
  read: { type: Boolean, default: false },
  attendanceStatus: { type: String, enum: ['present', 'absent', null], default: null } // For help requests
}, { timestamps: true });
// Add index to prevent duplicates
notificationSchema.index({ type: 1, studentId: 1, at: 1 }, { unique: false });
const Notification = mongoose.model("Notification", notificationSchema);

// Message/Reply system for admin-user communication
const messageSchema = new mongoose.Schema({
  studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student' },
  studentName: String,
  regNo: String,
  sender: { type: String, enum: ['student', 'admin'], required: true },
  message: String,
  replyTo: { type: mongoose.Schema.Types.ObjectId, ref: 'Message', default: null }, // For threading
  read: { type: Boolean, default: false },
  at: { type: Date, default: Date.now }
}, { timestamps: true });
const Message = mongoose.model("Message", messageSchema);

// ------------------- Validation Routes -------------------
app.post('/check-student', async (req, res) => {
  const { name, regNo } = req.body;
  const student = await Student.findOne({ name, regNo });
  res.json({ exists: !!student });
});

app.post('/check-username', async (req, res) => {
  const { username } = req.body;
  const user = await Student.findOne({ username });
  res.json({ exists: !!user });
});

app.post('/check-email', async (req, res) => {
  const { email } = req.body;
  const user = await Student.findOne({ email });
  res.json({ exists: !!user });
});

// ------------------- Signup Route -------------------
app.post('/signup', async (req, res) => {
  try {
    const { name, regNo, class: className, year, phone, username, email, password, location, uuid } = req.body;

    if (!name || !regNo || !className || !year || !phone || !username || !email || !password || !uuid) {
      return res.status(400).json({ error: "All fields are required" });
    }

    const existsNameReg = await Student.findOne({ name, regNo });
    if (existsNameReg) return res.status(400).json({ error: "Student already exists" });

    const existsUsername = await Student.findOne({ username });
    if (existsUsername) return res.status(400).json({ error: "Username already taken" });

    const existsEmail = await Student.findOne({ email });
    if (existsEmail) return res.status(400).json({ error: "Email already registered" });

    const existsUuid = await Student.findOne({ uuid });
    if (existsUuid) return res.status(400).json({ error: "UUID already registered" });

    const hashedPassword = await bcrypt.hash(password, 10);

    const newUser = new Student({
      name,
      regNo,
      class: className,
      year,
      phone,
      username,
      email,
      password: hashedPassword,
      location,
      uuid,
      biometricEnrolled: false
    });

    await newUser.save();
    res.status(201).json({ message: "User registered successfully", user: newUser });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

// ------------------- Biometric Enroll -------------------
app.post('/biometric/enroll', async (req, res) => {
  try {
    const { username } = req.body;
    if (!username) return res.status(400).json({ error: 'Username required' });
    const user = await Student.findOne({ username });
    if (!user) return res.status(404).json({ error: 'User not found' });
    user.biometricEnrolled = true;
    await user.save();
    res.json({ ok: true });
  } catch (err) {
    console.error('Biometric enroll error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ------------------- Login Route -------------------
app.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    const user = await Student.findOne({ username });
    if (!user) return res.status(404).json({ error: "User not found" });

    const passwordMatch = await bcrypt.compare(password, user.password);
    if (!passwordMatch) return res.status(401).json({ error: "Invalid password" });

    user.loggedIn = true;
    user.lastLoginAt = new Date();
    await user.save();

    // Create online notification
    const onlineNotification = new Notification({
      type: 'online',
      studentId: user._id,
      studentName: user.name,
      regNo: user.regNo,
      message: `${user.name} (${user.regNo}) is now online`,
      at: new Date()
    });
    await onlineNotification.save();

    res.json({
      message: "✅ Login successful",
      user: {
        _id: user._id,
        name: user.name,
        regNo: user.regNo,
        class: user.class,
        year: user.year,
        phone: user.phone,
        username: user.username,
        email: user.email,
        uuid: user.uuid,
        location: user.location
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error during login" });
  }
});

// ------------------- Logout Route -------------------
app.post('/logout', async (req, res) => {
  try {
    const { username } = req.body;
    if (!username) return res.status(400).json({ error: 'Username required' });
    const user = await Student.findOne({ username });
    if (!user) return res.status(404).json({ error: 'User not found' });
    user.loggedIn = false;
    user.lastLogoutAt = new Date();
    await user.save();

    // Create offline notification
    const offlineNotification = new Notification({
      type: 'offline',
      studentId: user._id,
      studentName: user.name,
      regNo: user.regNo,
      message: `${user.name} (${user.regNo}) is now offline`,
      at: new Date()
    });
    await offlineNotification.save();

    res.json({ ok: true });
  } catch (err) {
    console.error('Logout error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ------------------- Attendance Ping Route -------------------
app.post('/attendance/mark', async (req, res) => {
  try {
    const { studentId, periodNumber, timestampType, location } = req.body;

    const student = await Student.findById(studentId);
    if (!student) return res.status(404).json({ error: "Student not found" });

    // read settings
    const settings = await AdminSettings.findOne({ key: 'global' }).lean();
    const collegeDefault = { latitude: 12.8005328, longitude: 80.0388091 };
    const collegeAnchor = settings?.collegeLocation?.latitude ? settings.collegeLocation : collegeDefault;
    const proximityAnchor = settings?.proximityLocation;
    const proximityRadius = Number(settings?.proximityRadiusMeters || 100);

    // Validate location is provided
    if (!location || typeof location.latitude !== 'number' || typeof location.longitude !== 'number' || 
        isNaN(location.latitude) || isNaN(location.longitude)) {
      // Create location off notification
      const locationOffNotification = new Notification({
        type: 'locationOff',
        studentId: student._id,
        studentName: student.name,
        regNo: student.regNo,
        message: `${student.name} (${student.regNo}) switched off location while taking attendance`,
        at: new Date()
      });
      await locationOffNotification.save();
      
      return res.status(400).json({ error: "Valid location is required. Attendance not marked." });
    }

    const MAX_RADIUS_METERS = parseInt(process.env.MAX_RADIUS_METERS || '500', 10); // Default to 500m instead of 50km

    const toRad = (value) => (value * Math.PI) / 180;
    const R = 6371000;
    const distanceMeters = (a, b) => {
      if (!a || !b || typeof a.latitude !== 'number' || typeof a.longitude !== 'number' ||
          typeof b.latitude !== 'number' || typeof b.longitude !== 'number') {
        return Infinity; // Invalid location = infinite distance
      }
      const dLat = toRad(a.latitude - b.latitude);
      const dLon = toRad(a.longitude - b.longitude);
      const lat1 = toRad(b.latitude);
      const lat2 = toRad(a.latitude);
      const h = Math.sin(dLat/2)**2 + Math.cos(lat1)*Math.cos(lat2)*Math.sin(dLon/2)**2;
      return 2 * R * Math.atan2(Math.sqrt(h), Math.sqrt(1-h));
    };

    // polygon containment if provided
    const pointInPolygon = (pt, poly) => {
      if (!pt || !poly || !Array.isArray(poly) || poly.length < 3) return false;
      let inside = false;
      for (let i=0,j=poly.length-1; i<poly.length; j=i++) {
        const xi=poly[i].latitude, yi=poly[i].longitude;
        const xj=poly[j].latitude, yj=poly[j].longitude;
        if (typeof xi !== 'number' || typeof yi !== 'number' || typeof xj !== 'number' || typeof yj !== 'number') continue;
        const intersect = ((yi>pt.longitude)!==(yj>pt.longitude)) && (pt.latitude < (xj - xi) * (pt.longitude - yi) / (yj - yi + 1e-12) + xi);
        if (intersect) inside = !inside;
      }
      return inside;
    };

    // ALWAYS verify location - check college location by default
    let allowedByCollege = false;
    // Check college polygon first if available
    if (Array.isArray(settings?.collegePolygon) && settings.collegePolygon.length >= 3) {
      allowedByCollege = pointInPolygon(location, settings.collegePolygon);
    } 
    // If no polygon, check distance to college location
    else if (collegeAnchor && typeof collegeAnchor.latitude === 'number' && typeof collegeAnchor.longitude === 'number') {
      const distance = distanceMeters(location, collegeAnchor);
      const radiusToUse = settings?.useCollegeLocation !== false ? MAX_RADIUS_METERS : MAX_RADIUS_METERS;
      allowedByCollege = distance <= radiusToUse;
    }

    // Check proximity anchors (admin's current location or configured anchors)
    let allowedByProximity = false;
    if (proximityAnchor && typeof proximityAnchor.latitude === 'number' && typeof proximityAnchor.longitude === 'number') {
      const distance = distanceMeters(location, proximityAnchor);
      allowedByProximity = distance <= proximityRadius;
    }
    if (Array.isArray(settings?.proximityAnchors) && settings.proximityAnchors.length) {
      for (const a of settings.proximityAnchors) {
        if (a?.location?.latitude && a?.location?.longitude && 
            typeof a.location.latitude === 'number' && typeof a.location.longitude === 'number') {
          const r = Number(a.radiusMeters || proximityRadius);
          const distance = distanceMeters(location, a.location);
          if (distance <= r) { 
            allowedByProximity = true; 
            break; 
          }
        }
      }
    }

    // REJECT if location is not valid - must be within college OR proximity area
    if (!allowedByCollege && !allowedByProximity) {
      const collegeDist = collegeAnchor ? distanceMeters(location, collegeAnchor) : Infinity;
      const proximityDist = proximityAnchor ? distanceMeters(location, proximityAnchor) : Infinity;
      return res.status(403).json({ 
        error: `Outside allowed location. Distance from college: ${Math.round(collegeDist)}m, from proximity: ${Math.round(proximityDist)}m. Attendance not marked.` 
      });
    }

    // Validate ping time against period configuration
    if (settings?.periodConfig && Array.isArray(settings.periodConfig) && settings.periodConfig.length > 0) {
      const periodConfig = settings.periodConfig.find(p => p.periodNumber === periodNumber);
      if (periodConfig && periodConfig.pings && Array.isArray(periodConfig.pings) && periodConfig.pings.length > 0) {
        const now = new Date();
        const nowIST = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
        const currentTime = `${String(nowIST.getHours()).padStart(2, '0')}:${String(nowIST.getMinutes()).padStart(2, '0')}`;
        
        // Check if current time matches any of the configured ping times (with ±5 minute tolerance)
        const isWithinTimeWindow = periodConfig.pings.some(pingConfig => {
          if (!pingConfig.time) return false;
          const [pingHour, pingMin] = pingConfig.time.split(':').map(Number);
          const pingTimeMinutes = pingHour * 60 + pingMin;
          const [currHour, currMin] = currentTime.split(':').map(Number);
          const currTimeMinutes = currHour * 60 + currMin;
          const diff = Math.abs(currTimeMinutes - pingTimeMinutes);
          // Allow ±5 minutes tolerance
          return diff <= 5;
        });

        if (!isWithinTimeWindow) {
          const allowedTimes = periodConfig.pings.map(p => p.time).filter(Boolean).join(', ');
          return res.status(403).json({ 
            error: `Ping time ${currentTime} is not within allowed time windows for period ${periodNumber}. Allowed times: ${allowedTimes}` 
          });
        }

        // Validate timestampType matches the ping type
        if (timestampType && periodConfig.pings.some(p => p.type === timestampType)) {
          // Valid timestamp type
        } else if (timestampType) {
          // Invalid timestamp type, but we'll allow it with a warning
          console.warn(`Timestamp type ${timestampType} doesn't match period config for period ${periodNumber}`);
        }
      }
    }

    const { biometricType, biometricVerified } = req.body || {};

    const ping = new Ping({
      studentId,
      studentName: student.name,
      regNo: student.regNo,
      periodNumber,
      timestampType,
      location,
      locationValid: true,
      biometricType: biometricType || null,
      biometricVerified: !!biometricVerified
    });
    await ping.save();

    // Use IST (Asia/Kolkata) for date boundaries to avoid UTC shifting across days
    const todayLocal = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }); // YYYY-MM-DD
    const startOfDay = new Date(`${todayLocal}T00:00:00+05:30`);
    const endOfDay = new Date(`${todayLocal}T23:59:59+05:30`);

    const allPings = await Ping.find({
      studentId,
      periodNumber,
      timestamp: { $gte: startOfDay, $lte: endOfDay }
    });

    const validPings = allPings.filter(p => {
      // Validate ping location
      if (!p.location || typeof p.location.latitude !== 'number' || typeof p.location.longitude !== 'number' ||
          isNaN(p.location.latitude) || isNaN(p.location.longitude)) {
        return false;
      }

      // ALWAYS check college location
      let byCollege = false;
      if (Array.isArray(settings?.collegePolygon) && settings.collegePolygon.length >= 3) {
        byCollege = pointInPolygon(p.location, settings.collegePolygon);
      } else if (collegeAnchor && typeof collegeAnchor.latitude === 'number' && typeof collegeAnchor.longitude === 'number') {
        const distance = distanceMeters(p.location, collegeAnchor);
        const radiusToUse = settings?.useCollegeLocation !== false ? MAX_RADIUS_METERS : MAX_RADIUS_METERS;
        byCollege = distance <= radiusToUse;
      }

      // Check proximity anchors
      let byProx = false;
      if (proximityAnchor && typeof proximityAnchor.latitude === 'number' && typeof proximityAnchor.longitude === 'number') {
        const distance = distanceMeters(p.location, proximityAnchor);
        byProx = distance <= proximityRadius;
      }
      if (Array.isArray(settings?.proximityAnchors) && settings.proximityAnchors.length) {
        for (const a of settings.proximityAnchors) {
          if (a?.location?.latitude && a?.location?.longitude && 
              typeof a.location.latitude === 'number' && typeof a.location.longitude === 'number') {
            const r = Number(a.radiusMeters || proximityRadius);
            const distance = distanceMeters(p.location, a.location);
            if (distance <= r) { 
              byProx = true; 
              break; 
            }
          }
        }
      }
      if (!byCollege && !byProx) return false;

      // Validate ping time against period configuration
      if (settings?.periodConfig && Array.isArray(settings.periodConfig) && settings.periodConfig.length > 0) {
        const periodConfig = settings.periodConfig.find(per => per.periodNumber === p.periodNumber);
        if (periodConfig && periodConfig.pings && Array.isArray(periodConfig.pings) && periodConfig.pings.length > 0) {
          const pingTime = new Date(p.timestamp);
          const pingTimeIST = new Date(pingTime.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
          const pingTimeStr = `${String(pingTimeIST.getHours()).padStart(2, '0')}:${String(pingTimeIST.getMinutes()).padStart(2, '0')}`;
          
          // Check if ping time matches any of the configured ping times (with ±5 minute tolerance)
          const isWithinTimeWindow = periodConfig.pings.some(pingConfig => {
            if (!pingConfig.time) return false;
            const [pingHour, pingMin] = pingConfig.time.split(':').map(Number);
            const expectedTimeMinutes = pingHour * 60 + pingMin;
            const [actualHour, actualMin] = pingTimeStr.split(':').map(Number);
            const actualTimeMinutes = actualHour * 60 + actualMin;
            const diff = Math.abs(actualTimeMinutes - expectedTimeMinutes);
            // Allow ±5 minutes tolerance
            return diff <= 5;
          });

          if (!isWithinTimeWindow) {
            return false; // Ping is outside allowed time window
          }
        }
      }

      return true;
    });

    const hasBiometric = validPings.some(p => p.biometricVerified === true);

    const enforceBiometric = !!settings?.biometricEnforced;
    if (enforceBiometric && !student.biometricEnrolled) {
      return res.status(403).json({ error: 'Biometric enrollment required. Please complete biometric setup.' });
    }

    const threshold = Number(settings?.pingThresholdPerPeriod || 4);
    if (validPings.length >= threshold && (!enforceBiometric || hasBiometric)) {
      const todayLocal = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
      let attendance = await Attendance.findOne({ studentId, date: todayLocal });

      if (!attendance) {
        attendance = new Attendance({
          studentId,
          studentName: student.name,
          regNo: student.regNo,
          class: student.class,
          year: student.year,
          date: todayLocal,
          periods: []
        });
      }

      // Check if period already exists and update if needed, or add if new
      const existingPeriodIndex = attendance.periods.findIndex(p => p.periodNumber === periodNumber);
      if (existingPeriodIndex === -1) {
        // Period doesn't exist, add it
        attendance.periods.push({ periodNumber, status: 'present' });
      } else if (attendance.periods[existingPeriodIndex].status !== 'present') {
        // Period exists but status is absent, update to present
        attendance.periods[existingPeriodIndex].status = 'present';
      }
      // If period already exists with present status, no need to update

      await attendance.save();
    }

    res.json({ message: "Ping recorded" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to mark attendance" });
  }
});

// ------------------- Attendance Summary Route -------------------
app.get('/attendance/today/:studentId', async (req, res) => {
  try {
    const { studentId } = req.params;
    // Use IST for "today"
    const todayLocal = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });

    const record = await Attendance.findOne({ studentId, date: todayLocal });
    if (!record) {
      return res.status(200).json({ periods: [], date: todayLocal, overall: 'absent' });
    }

    // Deduplicate periods by periodNumber (keep the most recent/last one)
    const periodMap = new Map();
    (record.periods || []).forEach(p => {
      const pnum = Number(p.periodNumber);
      // Keep the most recent status (or present over absent)
      if (!periodMap.has(pnum) || p.status === 'present') {
        periodMap.set(pnum, { periodNumber: pnum, status: p.status });
      }
    });
    const summary = Array.from(periodMap.values()).sort((a, b) => a.periodNumber - b.periodNumber);
    
    const presentCount = summary.filter(p=>p.status==='present').length;
    const overall = presentCount === 8 ? 'present' : (presentCount > 0 ? 'partial' : 'absent');

    res.status(200).json({
      date: todayLocal,
      studentName: record.studentName,
      regNo: record.regNo,
      periods: summary,
      overall
    });
  } catch (err) {
    console.error('Fetch attendance error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ------------------- User Info Route -------------------
app.get('/test', (req, res) => {
  res.send('✅ Test route is working');
});

app.get('/userinfo', async (req, res) => {
  try {
    const { username } = req.query;
    if (!username) return res.status(400).json({ error: 'Username is required' });

    const user = await Student.findOne({ username });
    if (!user) return res.status(404).json({ error: 'User not found' });

    const { password, ...safeUser } = user.toObject(); // exclude password
    res.json(safeUser);
  } catch (err) {
    console.error('User info fetch error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ------------------- Admin Control Model -------------------
const adminControlSchema = new mongoose.Schema({
  key: { type: String, unique: true },
  pingEnabled: { type: Boolean, default: false },
  intervalMs: { type: Number, default: 60000 }
});
const AdminControl = mongoose.model('AdminControl', adminControlSchema);

// Admin settings (schedule, scope, locations)
const adminSettingsSchema = new mongoose.Schema({
  key: { type: String, unique: true },
  date: String, // YYYY-MM-DD
  day: String,
  startTime: String, // HH:mm
  endTime: String,   // HH:mm
  classes: [String],
  sections: [String],
  years: [Number],
  // Location controls
  locationMode: { type: String, enum: ['college','staff'], default: 'college' }, // legacy
  useCollegeLocation: { type: Boolean, default: true },
  collegeLocation: { latitude: Number, longitude: Number }, // center (optional)
  collegePolygon: [{ latitude: Number, longitude: Number }], // up to 4 vertices
  staffLocation: { latitude: Number, longitude: Number },
  proximityLocation: { latitude: Number, longitude: Number },
  proximityRadiusMeters: { type: Number, default: 100 },
  proximityAnchors: [{ username: String, regNo: String, location: { latitude: Number, longitude: Number }, radiusMeters: { type: Number, default: 100 } }],
  // Attendance rules
  pingThresholdPerPeriod: { type: Number, default: 4 },
  pingIntervalMs: { type: Number, default: 60000 },
  // Biometric trigger configuration
  biometricTriggerMode: { type: String, enum: ['off','pingNumber','time','period'], default: 'pingNumber' },
  biometricAtPingNumber: { type: Number, default: 1 },
  biometricTimeWindows: [{ start: String, end: String }], // HH:mm
  biometricPeriods: [Number],
  // Period-based ping configuration
  collegeTiming: { from: String, to: String }, // HH:mm format
  numberOfPeriods: { type: Number, default: 8 },
  defaultPingCount: { type: Number, default: 4 },
  periodConfig: [{
    periodNumber: Number,
    pingCount: Number,
    pings: [{ type: String, time: String }] // type: 'start'|'after15mins'|'before10mins'|'end', time: 'HH:mm'
  }],
  biometricEnabled: { type: Boolean, default: false },
  biometricTrigger: { type: String, enum: ['start','after15mins','before10mins','end'], default: 'start' }
});
const AdminSettings = mongoose.model('AdminSettings', adminSettingsSchema);

// ------------------- Admin APIs (no auth in demo) -------------------
// Ping control
app.get('/admin/ping-control', async (_req, res) => {
  try {
    let ctrl = await AdminControl.findOne({ key: 'global' }).lean();
    if (!ctrl) ctrl = { pingEnabled: false, intervalMs: 60000 };
    res.json({ pingEnabled: !!ctrl.pingEnabled, intervalMs: ctrl.intervalMs || 60000 });
  } catch (err) {
    console.error('Ping control get error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/admin/ping-control', async (req, res) => {
  try {
    const { enabled, intervalMs } = req.body;
    let ctrl = await AdminControl.findOne({ key: 'global' });
    if (!ctrl) ctrl = new AdminControl({ key: 'global' });
    if (typeof enabled === 'boolean') ctrl.pingEnabled = enabled;
    if (!isNaN(Number(intervalMs))) ctrl.intervalMs = Number(intervalMs);
    await ctrl.save();
    res.json({ ok: true, pingEnabled: ctrl.pingEnabled, intervalMs: ctrl.intervalMs });
  } catch (err) {
    console.error('Ping control set error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Admin settings endpoints
app.get('/admin/settings', async (_req, res) => {
  try {
    let s = await AdminSettings.findOne({ key: 'global' }).lean();
    if (!s) s = { 
      date: new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }), 
      day: '', startTime: '09:00', endTime: '17:00', 
      classes: [], sections: [], years: [],
      locationMode: 'college',
      useCollegeLocation: true,
      collegeLocation: { latitude: 12.8005328, longitude: 80.0388091 },
      collegePolygon: [],
      proximityLocation: null,
      proximityRadiusMeters: 100,
      proximityAnchors: [],
      pingThresholdPerPeriod: 4,
      pingIntervalMs: 60000,
      biometricTriggerMode: 'pingNumber',
      biometricAtPingNumber: 1,
      biometricTimeWindows: [],
      biometricPeriods: [],
      biometricEnforced: false,
    };
    res.json(s);
  } catch (err) {
    console.error('Admin settings get error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/admin/settings', async (req, res) => {
  try {
    const body = req.body || {};
    let s = await AdminSettings.findOne({ key: 'global' });
    if (!s) s = new AdminSettings({ key: 'global' });
    Object.assign(s, body);
    await s.save();
    res.json({ ok: true });
  } catch (err) {
    console.error('Admin settings post error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Sessions overview - Check actual activity, not just loggedIn flag
app.get('/admin/sessions', async (_req, res) => {
  try {
    const users = await Student.find({}).select('name regNo username email loggedIn lastLoginAt lastLogoutAt class year').lean();
    
    // Check for actual activity: user must have logged in AND have recent activity (ping or login within last 30 minutes)
    const now = new Date();
    const activeThreshold = new Date(now.getTime() - 30 * 60 * 1000); // 30 minutes
    
    // Get all recent pings in one query for efficiency
    const recentPings = await Ping.find({ 
      timestamp: { $gte: activeThreshold } 
    }).select('studentId').lean();
    const activeStudentIds = new Set(recentPings.map(p => String(p.studentId)));
    
    const actuallyActive = [];
    const inactive = [];
    const inactiveUserIds = [];
    
    for (const u of users) {
      // Check if user has recent activity
      const hasRecentLogin = u.lastLoginAt && new Date(u.lastLoginAt) >= activeThreshold;
      const hasRecentPing = activeStudentIds.has(String(u._id));
      
      // User is considered active only if:
      // 1. loggedIn flag is true AND
      // 2. Has recent login (within 30 min) OR has recent ping (within 30 min)
      if (u.loggedIn && (hasRecentLogin || hasRecentPing)) {
        actuallyActive.push(u);
      } else {
        // If loggedIn is true but no recent activity, mark as inactive
        if (u.loggedIn && !hasRecentLogin && !hasRecentPing) {
          inactiveUserIds.push(u._id);
        }
        inactive.push({ ...u, loggedIn: false });
      }
    }
    
    // Batch update all inactive users
    if (inactiveUserIds.length > 0) {
      await Student.updateMany(
        { _id: { $in: inactiveUserIds } },
        { $set: { loggedIn: false } }
      );
    }
    
    res.json({ loggedIn: actuallyActive, loggedOut: inactive, total: users.length });
  } catch (err) {
    console.error('Admin sessions error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Attendance detail per day with ping breakdown
app.get('/admin/attendance/detail', async (req, res) => {
  try {
    const { studentId, date } = req.query;
    if (!studentId) return res.status(400).json({ error: 'studentId required' });
    const theDate = date || new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
    const startDate = new Date(`${theDate}T00:00:00+05:30`);
    const endDate = new Date(`${theDate}T23:59:59+05:30`);
    const pings = await Ping.find({ studentId, timestamp: { $gte: startDate, $lte: endDate } }).sort({ timestamp: 1 }).lean();
    const byPeriod = {};
    for (const p of pings) {
      const key = p.periodNumber || 0;
      if (!byPeriod[key]) byPeriod[key] = [];
      byPeriod[key].push({
        time: p.timestamp,
        type: p.timestampType,
        locationValid: p.locationValid !== false, // default true for saved ones
        biometricVerified: !!p.biometricVerified,
        biometricType: p.biometricType || null,
        lat: p.location?.latitude,
        lon: p.location?.longitude,
      });
    }
    const periods = Object.keys(byPeriod).sort((a,b)=>Number(a)-Number(b)).map(k => ({ periodNumber: Number(k), pings: byPeriod[k] }));
    res.json({ date: theDate, studentId, periods });
  } catch (err) {
    console.error('Admin attendance detail error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Student history (attendance + pings)
app.get('/admin/student/:id/history', async (req, res) => {
  try {
    const { id } = req.params;
    const { from, to } = req.query;
    const f = from || new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
    const t = to || f;
    const start = new Date(`${f}T00:00:00+05:30`);
    const end = new Date(`${t}T23:59:59+05:30`);

    const pings = await Ping.find({ studentId: id, timestamp: { $gte: start, $lte: end } }).sort({ timestamp: 1 }).lean();
    const records = await Attendance.find({ studentId: id, date: { $gte: f, $lte: t } }).lean();
    res.json({ pings, records });
  } catch (err) {
    console.error('Admin student history error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Help request endpoint
app.post('/help/request', async (req, res) => {
  try {
    const { studentId, message } = req.body;
    if (!studentId) return res.status(400).json({ error: 'studentId required' });
    
    const student = await Student.findById(studentId);
    if (!student) return res.status(404).json({ error: 'Student not found' });

    // Check today's attendance status
    const todayLocal = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
    const todayAttendance = await Attendance.findOne({ studentId, date: todayLocal }).lean();
    let attendanceStatus = null;
    if (todayAttendance && todayAttendance.periods && todayAttendance.periods.length > 0) {
      const presentCount = todayAttendance.periods.filter(p => p.status === 'present').length;
      attendanceStatus = presentCount === 8 ? 'present' : (presentCount > 0 ? 'partial' : 'absent');
    } else {
      attendanceStatus = 'absent';
    }

    // Check for duplicate help request in last 5 minutes
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    const recentHelpRequest = await Notification.findOne({
      type: 'helpRequest',
      studentId: student._id,
      at: { $gte: fiveMinutesAgo }
    }).lean();

    if (recentHelpRequest) {
      return res.status(400).json({ error: 'Please wait before sending another help request' });
    }

    const helpMessage = message || `${student.name} (${student.regNo}) requested help`;
    const statusText = attendanceStatus === 'present' ? 'Present' : (attendanceStatus === 'partial' ? 'Partially Present' : 'Absent');
    
    const helpNotification = new Notification({
      type: 'helpRequest',
      studentId: student._id,
      studentName: student.name,
      regNo: student.regNo,
      message: `${helpMessage} (Status: ${statusText})`,
      attendanceStatus: attendanceStatus,
      at: new Date()
    });
    await helpNotification.save();

    // Also create a message for the conversation
    const helpMessageDoc = new Message({
      studentId: student._id,
      studentName: student.name,
      regNo: student.regNo,
      sender: 'student',
      message: message || 'Requested help',
      at: new Date()
    });
    await helpMessageDoc.save();

    res.json({ ok: true, message: 'Help request sent successfully', attendanceStatus });
  } catch (err) {
    console.error('Help request error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Notifications (all types: online, offline, locationOff, helpRequest, noPing)
app.get('/admin/notifications', async (req, res) => {
  try {
    const { limit = 100 } = req.query;
    const ctrl = await AdminControl.findOne({ key: 'global' }).lean();
    const settings = await AdminSettings.findOne({ key: 'global' }).lean();
    const intervalMs = ctrl?.intervalMs || 60000;

    const now = new Date();
    // within window? if start/end set
    const withinWindow = (() => {
      if (!settings?.startTime || !settings?.endTime) return true;
      const [sh, sm] = settings.startTime.split(':').map(Number);
      const [eh, em] = settings.endTime.split(':').map(Number);
      const m = now.getHours()*60 + now.getMinutes();
      const a = sh*60+sm, b = eh*60+em;
      return m >= a && m <= b;
    })();

    // Get stored notifications from database (online, offline, locationOff, helpRequest)
    const storedNotifications = await Notification.find({})
      .sort({ at: -1 })
      .limit(Number(limit) * 2) // Get more to filter duplicates
      .lean();

    // Deduplicate notifications - keep only the most recent of each type+studentId combination within a time window
    const seen = new Map();
    const uniqueNotifications = [];
    for (const n of storedNotifications) {
      const key = `${n.type}-${String(n.studentId)}`;
      const timeWindow = 60 * 1000; // 1 minute window for duplicates
      
      if (seen.has(key)) {
        const lastSeen = seen.get(key);
        const timeDiff = Math.abs(new Date(n.at) - new Date(lastSeen.at));
        if (timeDiff < timeWindow) {
          // Skip duplicate within time window
          continue;
        }
      }
      
      seen.set(key, n);
      uniqueNotifications.push(n);
    }

    const alerts = uniqueNotifications.slice(0, Number(limit)).map(n => ({
      type: n.type,
      studentId: String(n.studentId),
      studentName: n.studentName,
      regNo: n.regNo,
      message: n.message,
      at: n.at,
      attendanceStatus: n.attendanceStatus || null,
      _id: String(n._id) // Include ID for reply functionality
    }));

    // Add noPing notifications if ping is enabled and within window
    // Deduplicate by checking if we already have a recent noPing for this student
    if (ctrl?.pingEnabled && withinWindow) {
      const since = new Date(now.getTime() - intervalMs * 2);
      const students = await Student.find({}).select('name regNo username').lean();
      const noPingSeen = new Set();
      
      for (const s of students) {
        const studentIdStr = String(s._id);
        // Check if we already have a noPing notification for this student in alerts
        const hasNoPing = alerts.some(a => a.type === 'noPing' && a.studentId === studentIdStr);
        if (hasNoPing || noPingSeen.has(studentIdStr)) continue;
        
        const last = await Ping.findOne({ studentId: s._id, timestamp: { $gte: since } }).sort({ timestamp: -1 }).lean();
        if (!last) {
          noPingSeen.add(studentIdStr);
          alerts.push({ 
            type: 'noPing', 
            studentId: studentIdStr, 
            studentName: s.name, 
            regNo: s.regNo, 
            message: `${s.name} (${s.regNo}) - No recent ping (location off or not in app).`, 
            at: now 
          });
        }
      }
    }

    // Sort by date (newest first)
    alerts.sort((a, b) => new Date(b.at) - new Date(a.at));

    res.json({ alerts: alerts.slice(0, Number(limit)) });
  } catch (err) {
    console.error('Admin notifications error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// User admin APIs
app.patch('/admin/user', async (req, res) => {
  try {
    const { _id, name, class: className, year, phone, email } = req.body || {};
    if (!_id) return res.status(400).json({ error: 'Missing _id' });
    const u = await Student.findById(_id);
    if (!u) return res.status(404).json({ error: 'User not found' });
    if (name != null) u.name = name;
    if (className != null) u.class = className;
    if (year != null) u.year = Number(year);
    if (phone != null) u.phone = phone;
    if (email != null) u.email = email;
    await u.save();
    res.json({ ok: true });
  } catch (err) {
    console.error('Admin user patch error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});
app.delete('/admin/user/:id', async (req, res) => {
  try {
    await Student.findByIdAndDelete(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    console.error('Admin user delete error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// List all users
app.get('/admin/users', async (req, res) => {
  try {
    const { q } = req.query;
    let filter = {};
    if (q) {
      const re = new RegExp(q, 'i');
      const or = [
        { name: re },
        { regNo: re },
        { username: re },
        { email: re },
        { uuid: re },
        { class: re },
        { phone: re },
      ];
      if (!isNaN(Number(q))) or.push({ year: Number(q) });
      if (mongoose.Types.ObjectId.isValid(q)) or.push({ _id: q });
      filter = { $or: or };
    }
    let users = await Student.find(filter).sort({ name: 1 }).lean();
    
    // Update loggedIn status based on actual activity (within last 30 minutes)
    const now = new Date();
    const activeThreshold = new Date(now.getTime() - 30 * 60 * 1000); // 30 minutes
    
    // Get all recent pings in one query for efficiency
    const recentPings = await Ping.find({ 
      timestamp: { $gte: activeThreshold } 
    }).select('studentId').lean();
    const activeStudentIds = new Set(recentPings.map(p => String(p.studentId)));
    
    // Batch update inactive users
    const inactiveUserIds = [];
    for (const u of users) {
      if (u.loggedIn) {
        // Check if user has recent activity
        const hasRecentLogin = u.lastLoginAt && new Date(u.lastLoginAt) >= activeThreshold;
        const hasRecentPing = activeStudentIds.has(String(u._id));
        
        // If no recent activity, mark as offline
        if (!hasRecentLogin && !hasRecentPing) {
          inactiveUserIds.push(u._id);
          u.loggedIn = false;
        }
      }
    }
    
    // Batch update all inactive users
    if (inactiveUserIds.length > 0) {
      await Student.updateMany(
        { _id: { $in: inactiveUserIds } },
        { $set: { loggedIn: false } }
      );
    }
    const safe = users.map(u => { const { password, ...rest } = u; return rest; });
    res.json(safe);
  } catch (err) {
    console.error('Admin users error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Attendance query: by date range and optional student, grouped by granularity
app.get('/admin/attendance', async (req, res) => {
  try {
    const { from, to, studentId, granularity = 'day', q } = req.query;
    const fromDate = from || new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
    const toDate = to || fromDate;

    // Optional multi-field query -> resolve to matching student IDs
    let studentFilter = {};
    if (q) {
      const re = new RegExp(q, 'i');
      const or = [
        { name: re },
        { regNo: re },
        { username: re },
        { email: re },
        { uuid: re },
        { class: re },
        { phone: re },
      ];
      if (!isNaN(Number(q))) or.push({ year: Number(q) });
      if (mongoose.Types.ObjectId.isValid(q)) or.push({ _id: q });
      const matching = await Student.find({ $or: or }).select('_id').lean();
      const ids = matching.map(s => s._id);
      if (ids.length === 0) return res.json({ rows: [] });
      studentFilter = { studentId: { $in: ids } };
    }

    const records = await Attendance.find({
      ...(studentId ? { studentId } : {}),
      ...studentFilter,
      date: { $gte: fromDate, $lte: toDate }
    }).lean();

    // Flatten to rows
    const rows = [];
    for (const r of records) {
      for (const p of r.periods || []) {
        rows.push({
          date: r.date,
          studentId: String(r.studentId),
          studentName: r.studentName,
          regNo: r.regNo,
          periodNumber: p.periodNumber,
          status: p.status
        });
      }
    }

    if (granularity === 'day') return res.json({ rows });

    // Simple groupers
    const groupKey = (d) => {
      const [y, m, day] = d.split('-');
      if (granularity === 'month') return `${y}-${m}`;
      if (granularity === 'year') return `${y}`;
      if (granularity === 'week') {
        const dt = new Date(`${d}T00:00:00+05:30`);
        const onejan = new Date(dt.getFullYear(), 0, 1);
        const week = Math.ceil((((dt - onejan) / 86400000) + onejan.getDay() + 1) / 7);
        return `${y}-W${week}`;
      }
      return d;
    };

    const grouped = {};
    for (const r of rows) {
      const key = `${r.studentId}|${groupKey(r.date)}`;
      if (!grouped[key]) grouped[key] = { studentId: r.studentId, studentName: r.studentName, regNo: r.regNo, bucket: groupKey(r.date), present: 0, absent: 0 };
      if (r.status === 'present') grouped[key].present += 1; else grouped[key].absent += 1;
    }
    res.json({ rows: Object.values(grouped) });
  } catch (err) {
    console.error('Admin attendance error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Update a single attendance cell
app.patch('/admin/attendance', async (req, res) => {
  try {
    const { studentId, date, periodNumber, status } = req.body;
    if (!studentId || !date || !periodNumber || !status) return res.status(400).json({ error: 'Missing fields' });
    let attendance = await Attendance.findOne({ studentId, date });
    if (!attendance) attendance = new Attendance({ studentId, date, studentName: '', regNo: '', periods: [] });
    const existing = attendance.periods.find(p => p.periodNumber === Number(periodNumber));
    if (existing) existing.status = status; else attendance.periods.push({ periodNumber: Number(periodNumber), status });
    await attendance.save();
    res.json({ ok: true });
  } catch (err) {
    console.error('Admin attendance patch error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Delete a single attendance cell
app.delete('/admin/attendance', async (req, res) => {
  try {
    const { studentId, date, periodNumber } = req.query;
    if (!studentId || !date || !periodNumber) return res.status(400).json({ error: 'Missing fields' });
    const attendance = await Attendance.findOne({ studentId, date });
    if (!attendance) return res.json({ ok: true });
    attendance.periods = (attendance.periods || []).filter(p => p.periodNumber !== Number(periodNumber));
    await attendance.save();
    res.json({ ok: true });
  } catch (err) {
    console.error('Admin attendance delete error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Delete entire day attendance record
app.delete('/admin/attendance/day', async (req, res) => {
  try {
    const { studentId, date } = req.query;
    if (!studentId || !date) return res.status(400).json({ error: 'Missing fields' });
    await Attendance.deleteOne({ studentId, date });
    res.json({ ok: true });
  } catch (err) {
    console.error('Admin attendance day delete error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Pings with coordinates for map/view
app.get('/admin/pings', async (req, res) => {
  try {
    const { studentId, from, to, date, q } = req.query;
    let startDate, endDate;
    if (date) {
      startDate = new Date(`${date}T00:00:00+05:30`);
      endDate = new Date(`${date}T23:59:59+05:30`);
    } else {
      const f = from || new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
      const t = to || f;
      startDate = new Date(`${f}T00:00:00+05:30`);
      endDate = new Date(`${t}T23:59:59+05:30`);
    }
    const query = { timestamp: { $gte: startDate, $lte: endDate } };
    if (studentId) query.studentId = studentId;
    if (q) {
      const re = new RegExp(q, 'i');
      const or = [
        { name: re },
        { regNo: re },
        { username: re },
        { email: re },
        { uuid: re },
        { class: re },
        { phone: re },
      ];
      if (!isNaN(Number(q))) or.push({ year: Number(q) });
      if (mongoose.Types.ObjectId.isValid(q)) or.push({ _id: q });
      const matching = await Student.find({ $or: or }).select('_id').lean();
      const ids = matching.map(s => s._id);
      if (ids.length === 0) return res.json([]);
      query.studentId = { $in: ids };
    }
    const pings = await Ping.find(query).sort({ timestamp: 1 }).lean();
    res.json(pings);
  } catch (err) {
    console.error('Admin pings error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Ping admin actions
app.delete('/admin/ping/:id', async (req, res) => {
  try {
    const p = await Ping.findById(req.params.id);
    if (!p) return res.json({ ok: true });
    const studentId = String(p.studentId);
    const d = new Date(p.timestamp).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
    await Ping.deleteOne({ _id: p._id });
    await recomputeAttendanceFor(studentId, d);
    res.json({ ok: true });
  } catch (err) {
    console.error('Admin ping delete error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Helper to recompute attendance from pings
async function recomputeAttendanceFor(studentId, dateStr) {
  const student = await Student.findById(studentId);
  if (!student) return;
  const settings = await AdminSettings.findOne({ key: 'global' }).lean();
  const collegeDefault = { latitude: 12.8005328, longitude: 80.0388091 };
  const collegeAnchor = settings?.collegeLocation?.latitude ? settings.collegeLocation : collegeDefault;
  const proximityAnchor = settings?.proximityLocation;
  const proximityRadius = Number(settings?.proximityRadiusMeters || 100);
  const MAX_RADIUS_METERS = parseInt(process.env.MAX_RADIUS_METERS || '500', 10); // Default to 500m instead of 50km
  const toRad = (v)=> (v*Math.PI)/180; const R=6371000;
  const dist=(a,b)=>{ 
    if (!a || !b || typeof a.latitude !== 'number' || typeof a.longitude !== 'number' ||
        typeof b.latitude !== 'number' || typeof b.longitude !== 'number') {
      return Infinity; // Invalid location = infinite distance
    }
    const dLat=toRad(a.latitude-b.latitude);
    const dLon=toRad(a.longitude-b.longitude);
    const lat1=toRad(b.latitude);
    const lat2=toRad(a.latitude); 
    const h=Math.sin(dLat/2)**2+Math.cos(lat1)*Math.cos(lat2)*Math.sin(dLon/2)**2; 
    return 2*R*Math.atan2(Math.sqrt(h),Math.sqrt(1-h)); 
  };
  const pinPoly=(pt,poly)=>{ 
    if (!pt || !poly || !Array.isArray(poly) || poly.length < 3) return false; 
    let inside=false; 
    for(let i=0,j=poly.length-1;i<poly.length;j=i++){
      const xi=poly[i].latitude, yi=poly[i].longitude; 
      const xj=poly[j].latitude, yj=poly[j].longitude; 
      if (typeof xi !== 'number' || typeof yi !== 'number' || typeof xj !== 'number' || typeof yj !== 'number') continue;
      const intersect=((yi>pt.longitude)!==(yj>pt.longitude)) && (pt.latitude < (xj - xi) * (pt.longitude - yi) / (yj - yi + 1e-12) + xi); 
      if(intersect) inside=!inside;
    } 
    return inside; 
  };
  const startDate = new Date(`${dateStr}T00:00:00+05:30`);
  const endDate = new Date(`${dateStr}T23:59:59+05:30`);
  const pings = await Ping.find({ studentId, timestamp: { $gte: startDate, $lte: endDate } }).sort({ timestamp: 1 }).lean();
  const per = {}; // period -> valid pings, biometric flag
  for (const p of pings) {
    const loc = { latitude: p.location?.latitude, longitude: p.location?.longitude };
    // Validate location
    if (!loc || typeof loc.latitude !== 'number' || typeof loc.longitude !== 'number' ||
        isNaN(loc.latitude) || isNaN(loc.longitude)) {
      continue; // Skip invalid locations
    }
    
    // ALWAYS check college location
    let byCollege = false;
    if (Array.isArray(settings?.collegePolygon) && settings.collegePolygon.length >= 3) {
      byCollege = pinPoly(loc, settings.collegePolygon);
    } else if (collegeAnchor && typeof collegeAnchor.latitude === 'number' && typeof collegeAnchor.longitude === 'number') {
      const distance = dist(loc, collegeAnchor);
      const radiusToUse = settings?.useCollegeLocation !== false ? MAX_RADIUS_METERS : MAX_RADIUS_METERS;
      byCollege = distance <= radiusToUse;
    }
    
    // Check proximity anchors
    let byProx = false;
    if (proximityAnchor && typeof proximityAnchor.latitude === 'number' && typeof proximityAnchor.longitude === 'number') {
      const distance = dist(loc, proximityAnchor);
      byProx = distance <= proximityRadius;
    }
    if (Array.isArray(settings?.proximityAnchors)) { 
      for (const a of settings.proximityAnchors) { 
        if (a?.location?.latitude && a?.location?.longitude && 
            typeof a.location.latitude === 'number' && typeof a.location.longitude === 'number') {
          const r = Number(a.radiusMeters || proximityRadius);
          const distance = dist(loc, a.location);
          if (distance <= r) { 
            byProx = true; 
            break; 
          }
        }
      } 
    }
    if (!(byCollege || byProx)) continue;

    // Validate ping time against period configuration
    const k = Number(p.periodNumber)||1;
    if (settings?.periodConfig && Array.isArray(settings.periodConfig) && settings.periodConfig.length > 0) {
      const periodConfig = settings.periodConfig.find(per => per.periodNumber === k);
      if (periodConfig && periodConfig.pings && Array.isArray(periodConfig.pings) && periodConfig.pings.length > 0) {
        const pingTime = new Date(p.timestamp);
        const pingTimeIST = new Date(pingTime.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
        const pingTimeStr = `${String(pingTimeIST.getHours()).padStart(2, '0')}:${String(pingTimeIST.getMinutes()).padStart(2, '0')}`;
        
        // Check if ping time matches any of the configured ping times (with ±5 minute tolerance)
        const isWithinTimeWindow = periodConfig.pings.some(pingConfig => {
          if (!pingConfig.time) return false;
          const [pingHour, pingMin] = pingConfig.time.split(':').map(Number);
          const expectedTimeMinutes = pingHour * 60 + pingMin;
          const [actualHour, actualMin] = pingTimeStr.split(':').map(Number);
          const actualTimeMinutes = actualHour * 60 + actualMin;
          const diff = Math.abs(actualTimeMinutes - expectedTimeMinutes);
          // Allow ±5 minutes tolerance
          return diff <= 5;
        });

        if (!isWithinTimeWindow) {
          continue; // Skip ping outside allowed time window
        }
      }
    }

    if (!per[k]) per[k] = { count:0, biometric:false };
    per[k].count += 1; if (p.biometricVerified) per[k].biometric = true;
  }
  const threshold = Number(settings?.pingThresholdPerPeriod || 4);
  const enforceBiometric = !!settings?.biometricEnforced;
  let attendance = await Attendance.findOne({ studentId, date: dateStr });
  if (!attendance) attendance = new Attendance({ studentId, date: dateStr, studentName: student.name, regNo: student.regNo, class: student.class, year: student.year, periods: [] });
  const out = [];
  for (let k=1;k<=8;k++) {
    const ok = per[k] && per[k].count >= threshold && (!enforceBiometric || (per[k].biometric && student.biometricEnrolled));
    if (ok) out.push({ periodNumber: k, status: 'present' });
  }
  attendance.periods = out;
  await attendance.save();
}

app.post('/admin/recompute-attendance', async (req, res) => {
  try {
    const { studentId, date } = req.body || {};
    if (!studentId) return res.status(400).json({ error: 'studentId required' });
    const d = date || new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
    await recomputeAttendanceFor(studentId, d);
    res.json({ ok: true });
  } catch (err) {
    console.error('Admin recompute error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Attendance summaries
app.get('/admin/attendance/summary', async (req, res) => {
  try {
    const { from, to, by = 'class' } = req.query;
    const f = from || new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
    const t = to || f;
    const records = await Attendance.find({ date: { $gte: f, $lte: t } }).lean();
    const buckets = {};
    for (const r of records) {
      const key = by === 'year' ? r.year : r.class;
      if (!buckets[key]) buckets[key] = { key, present: 0, absent: 0, students: new Set() };
      for (const p of r.periods || []) {
        if (p.status === 'present') buckets[key].present += 1; else buckets[key].absent += 1;
      }
      buckets[key].students.add(String(r.studentId));
    }
    const rows = Object.values(buckets).map(b => ({ key: b.key, present: b.present, absent: b.absent, uniqueStudents: b.students.size }));
    res.json({ rows });
  } catch (err) {
    console.error('Attendance summary error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// CSV exports
const toCsv = (rows, headers) => {
  const esc = (v) => (v == null ? '' : String(v).replace(/"/g, '""'));
  const h = headers.map(x => `"${x}"`).join(',');
  const body = rows.map(r => headers.map(k => `"${esc(r[k])}"`).join(',')).join('\n');
  return h + '\n' + body + '\n';
};

app.get('/admin/export/users.csv', async (req, res) => {
  try {
    const { q } = req.query;
    let filter = {};
    if (q) {
      const re = new RegExp(q, 'i');
      const or = [
        { name: re },
        { regNo: re },
        { username: re },
        { email: re },
        { uuid: re },
        { class: re },
        { phone: re },
      ];
      if (!isNaN(Number(q))) or.push({ year: Number(q) });
      if (mongoose.Types.ObjectId.isValid(q)) or.push({ _id: q });
      filter = { $or: or };
    }
    const users = await Student.find(filter).sort({ name: 1 }).lean();
    const rows = users.map(u => ({ name: u.name, regNo: u.regNo, class: u.class, year: u.year, phone: u.phone, username: u.username, email: u.email, uuid: u.uuid }));
    const csv = toCsv(rows, ['name','regNo','class','year','phone','username','email','uuid']);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="users.csv"');
    res.send(csv);
  } catch (err) {
    console.error('Export users error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/admin/export/attendance.csv', async (req, res) => {
  try {
    const { from, to, studentId, q } = req.query;
    const f = from || new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
    const t = to || f;

    let studentFilter = {};
    if (q) {
      const re = new RegExp(q, 'i');
      const or = [
        { name: re },
        { regNo: re },
        { username: re },
        { email: re },
        { uuid: re },
        { class: re },
        { phone: re },
      ];
      if (!isNaN(Number(q))) or.push({ year: Number(q) });
      if (mongoose.Types.ObjectId.isValid(q)) or.push({ _id: q });
      const matching = await Student.find({ $or: or }).select('_id').lean();
      const ids = matching.map(s => s._id);
      if (ids.length === 0) return res.send(toCsv([], ['date','studentName','regNo','periodNumber','status']));
      studentFilter = { studentId: { $in: ids } };
    }

    const records = await Attendance.find({ ...(studentId ? { studentId } : {}), ...studentFilter, date: { $gte: f, $lte: t } }).lean();
    const rows = [];
    for (const r of records) {
      for (const p of r.periods || []) {
        rows.push({ date: r.date, studentName: r.studentName, regNo: r.regNo, periodNumber: p.periodNumber, status: p.status });
      }
    }
    const csv = toCsv(rows, ['date','studentName','regNo','periodNumber','status']);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="attendance.csv"');
    res.send(csv);
  } catch (err) {
    console.error('Export attendance error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Server-Sent Events for notifications
app.get('/admin/notifications/stream', async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  const send = async () => {
    try {
      const ctrl = await AdminControl.findOne({ key: 'global' }).lean();
      const settings = await AdminSettings.findOne({ key: 'global' }).lean();
      const intervalMs = ctrl?.intervalMs || 60000;
      const now = new Date();
      const withinWindow = (() => {
        if (!settings?.startTime || !settings?.endTime) return true;
        const [sh, sm] = settings.startTime.split(':').map(Number);
        const [eh, em] = settings.endTime.split(':').map(Number);
        const m = now.getHours()*60 + now.getMinutes();
        const a = sh*60+sm, b = eh*60+em;
        return m >= a && m <= b;
      })();
      
      // Get recent stored notifications (last 5 minutes)
      const recentTime = new Date(now.getTime() - 5 * 60 * 1000);
      const storedNotifications = await Notification.find({ at: { $gte: recentTime } })
        .sort({ at: -1 })
        .lean();
      
      const alerts = storedNotifications.map(n => ({
        type: n.type,
        studentId: String(n.studentId),
        studentName: n.studentName,
        regNo: n.regNo,
        message: n.message,
        at: n.at
      }));
      
      if (ctrl?.pingEnabled && withinWindow) {
        const since = new Date(now.getTime() - intervalMs * 2);
        const students = await Student.find({}).select('name regNo username').lean();
        for (const s of students) {
          const last = await Ping.findOne({ studentId: s._id, timestamp: { $gte: since } }).sort({ timestamp: -1 }).lean();
          if (!last) alerts.push({ type: 'noPing', studentId: String(s._id), studentName: s.name, regNo: s.regNo, message: `${s.name} (${s.regNo}) - No recent ping`, at: now });
        }
      }
      
      alerts.sort((a, b) => new Date(b.at) - new Date(a.at));
      res.write(`data: ${JSON.stringify({ alerts })}\n\n`);
    } catch (e) {
      res.write(`data: ${JSON.stringify({ alerts: [], error: true })}\n\n`);
    }
  };

  const iv = setInterval(send, 8000);
  send();
  req.on('close', () => clearInterval(iv));
});

// Message/Reply endpoints
// Get messages for a student
app.get('/messages/:studentId', async (req, res) => {
  try {
    const { studentId } = req.params;
    const messages = await Message.find({ studentId })
      .sort({ at: 1 })
      .lean();
    res.json({ messages });
  } catch (err) {
    console.error('Get messages error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get all messages for admin
app.get('/admin/messages', async (req, res) => {
  try {
    const messages = await Message.find({})
      .sort({ at: -1 })
      .limit(100)
      .lean();
    res.json({ messages });
  } catch (err) {
    console.error('Get admin messages error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Send message (student or admin)
app.post('/messages/send', async (req, res) => {
  try {
    const { studentId, sender, message, replyTo } = req.body;
    if (!studentId || !sender || !message) {
      return res.status(400).json({ error: 'studentId, sender, and message are required' });
    }

    const student = await Student.findById(studentId);
    if (!student) return res.status(404).json({ error: 'Student not found' });

    const messageDoc = new Message({
      studentId,
      studentName: student.name,
      regNo: student.regNo,
      sender,
      message,
      replyTo: replyTo || null,
      at: new Date()
    });
    await messageDoc.save();

    res.json({ ok: true, message: messageDoc });
  } catch (err) {
    console.error('Send message error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Mark message as read
app.patch('/messages/:messageId/read', async (req, res) => {
  try {
    const { messageId } = req.params;
    await Message.findByIdAndUpdate(messageId, { read: true });
    res.json({ ok: true });
  } catch (err) {
    console.error('Mark message read error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ------------------- Server Startup -------------------
const PORT = process.env.PORT;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});