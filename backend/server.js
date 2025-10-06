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

// ------------------- User Schema -------------------
const userSchema = new mongoose.Schema({
  name: String,
  regNo: String,
  class: String,
  year: String,
  phone: String,
  username: { type: String, unique: true },
  email: { type: String, unique: true },
  password: String,
  uuid: { type: String, unique: true },
  location: {
    latitude: Number,
    longitude: Number
  }
});
const User = mongoose.model("User", userSchema);

// ------------------- Attendance Schema -------------------
const attendanceSchema = new mongoose.Schema({
  studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  studentName: String,
  regNo: String,
  date: String, // "YYYY-MM-DD"
  periods: [
    {
      periodNumber: Number,
      status: { type: String, enum: ['present', 'absent'] }
    }
  ]
});
const Attendance = mongoose.model("Attendance", attendanceSchema);

// ------------------- Ping Schema -------------------
const pingSchema = new mongoose.Schema({
  studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
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
  const student = await User.findOne({ name, regNo });
  res.json({ exists: !!student });
});

app.post('/check-username', async (req, res) => {
  const { username } = req.body;
  const user = await User.findOne({ username });
  res.json({ exists: !!user });
});

app.post('/check-email', async (req, res) => {
  const { email } = req.body;
  const user = await User.findOne({ email });
  res.json({ exists: !!user });
});

// ------------------- Signup Route -------------------
app.post('/signup', async (req, res) => {
  try {
    const { name, regNo, class: className, year, phone, username, email, password, location, uuid } = req.body;

    if (!name || !regNo || !className || !year || !phone || !username || !email || !password || !uuid) {
      return res.status(400).json({ error: "All fields are required" });
    }

    const existsNameReg = await User.findOne({ name, regNo });
    if (existsNameReg) return res.status(400).json({ error: "Student already exists" });

    const existsUsername = await User.findOne({ username });
    if (existsUsername) return res.status(400).json({ error: "Username already taken" });

    const existsEmail = await User.findOne({ email });
    if (existsEmail) return res.status(400).json({ error: "Email already registered" });

    const existsUuid = await User.findOne({ uuid });
    if (existsUuid) return res.status(400).json({ error: "UUID already registered" });

    const hashedPassword = await bcrypt.hash(password, 10);

    const newUser = new User({
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

    const user = await User.findOne({ username });
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

    const student = await User.findById(studentId);
    if (!student) return res.status(404).json({ error: "Student not found" });

    const collegeLocation = { latitude: 12.8005328, longitude: 80.0388091 };

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

    if (distance > 100) {
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

    const today = new Date().toISOString().slice(0, 10);
    const startOfDay = new Date(`${today}T00:00:00`);
    const endOfDay = new Date(`${today}T23:59:59`);

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
      return R * c <= 100;
    });

    if (validPings.length === 4) {
      let attendance = await Attendance.findOne({ studentId, date: today });

      if (!attendance) {
        attendance = new Attendance({
          studentId,
          studentName: student.name,
          regNo: student.regNo,
          date: today,
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
    const today = new Date().toISOString().slice(0, 10);

    const record = await Attendance.findOne({ studentId, date: today });
        if (!record) {
      return res.status(200).json({ periods: [] });
    }

    const summary = record.periods.map(p => ({
      periodNumber: p.periodNumber,
      status: p.status
    }));

    res.status(200).json({
      date: today,
      studentName: record.studentName,
      regNo: record.regNo,
      periods: summary
    });
  } catch (err) {
    console.error('Fetch attendance error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
