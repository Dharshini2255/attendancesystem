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
  location: { latitude: Number, longitude: Number }
});
const Student = mongoose.model('Student', studentSchema);

const attendanceSchema = new mongoose.Schema({
  studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student' },
  studentName: String,
  regNo: String,
  date: String,
  periods: [
    {
      periodNumber: Number,
      status: { type: String, enum: ['present', 'absent'] }
    }
  ]
});
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
  timestamp: { type: Date, default: Date.now }
});
const Ping = mongoose.model("Ping", pingSchema);

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
      uuid
    });

    await newUser.save();
    res.status(201).json({ message: "User registered successfully", user: newUser });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
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

// ------------------- Attendance Ping Route -------------------
app.post('/attendance/mark', async (req, res) => {
  try {
    const { studentId, periodNumber, timestampType, location } = req.body;

    const student = await Student.findById(studentId);
    if (!student) return res.status(404).json({ error: "Student not found" });

    const collegeLocation = { latitude: 12.8005328, longitude: 80.0388091 };
    const MAX_RADIUS_METERS = parseInt(process.env.MAX_RADIUS_METERS || '50000', 10); // widen for testing; set to 100 in prod

    const toRad = (value) => (value * Math.PI) / 180;
    const R = 6371000;
    const dLat = toRad(location.latitude - collegeLocation.latitude);
    const dLon = toRad(location.longitude - collegeLocation.longitude);
    const lat1 = toRad(collegeLocation.latitude);
    const lat2 = toRad(location.latitude);

    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distance = R * c;

    if (distance > MAX_RADIUS_METERS) {
      return res.status(403).json({ error: "Outside college location. Attendance not marked." });
    }

    const ping = new Ping({
      studentId,
      studentName: student.name,
      regNo: student.regNo,
      periodNumber,
      timestampType,
      location
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
      const dLat = toRad(p.location.latitude - collegeLocation.latitude);
      const dLon = toRad(p.location.longitude - collegeLocation.longitude);
      const lat1 = toRad(collegeLocation.latitude);
      const lat2 = toRad(p.location.latitude);
      const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      return R * c <= MAX_RADIUS_METERS;
    });

    if (validPings.length === 4) {
      const todayLocal = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
      let attendance = await Attendance.findOne({ studentId, date: todayLocal });

      if (!attendance) {
        attendance = new Attendance({
          studentId,
          studentName: student.name,
          regNo: student.regNo,
          date: todayLocal,
          periods: []
        });
      }

      const existingPeriod = attendance.periods.find(p => p.periodNumber === periodNumber);
      if (!existingPeriod) {
        attendance.periods.push({ periodNumber, status: 'present' });
      }

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
      return res.status(200).json({ periods: [], date: todayLocal });
    }

    const summary = record.periods.map(p => ({
      periodNumber: p.periodNumber,
      status: p.status
    }));

    res.status(200).json({
      date: todayLocal,
      studentName: record.studentName,
      regNo: record.regNo,
      periods: summary
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

// ------------------- Admin APIs (no auth in demo) -------------------
// List all users
app.get('/admin/users', async (_req, res) => {
  try {
    const users = await Student.find({}).sort({ name: 1 }).lean();
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
    const { from, to, studentId, granularity = 'day' } = req.query;
    const fromDate = from || new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
    const toDate = to || fromDate;

    const records = await Attendance.find({
      ...(studentId ? { studentId } : {}),
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

// Pings with coordinates for map/view
app.get('/admin/pings', async (req, res) => {
  try {
    const { studentId, from, to, date } = req.query;
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
    const pings = await Ping.find(query).sort({ timestamp: 1 }).lean();
    res.json(pings);
  } catch (err) {
    console.error('Admin pings error:', err);
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

app.get('/admin/export/users.csv', async (_req, res) => {
  try {
    const users = await Student.find({}).sort({ name: 1 }).lean();
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
    const { from, to, studentId } = req.query;
    const f = from || new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
    const t = to || f;
    const records = await Attendance.find({ ...(studentId ? { studentId } : {}), date: { $gte: f, $lte: t } }).lean();
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

// ------------------- Server Startup -------------------
const PORT = process.env.PORT;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
