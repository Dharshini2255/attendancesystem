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
  name: { type: String, required: true },
  regNo: { type: String, required: true },
  class: { type: String, required: true },
  year: { type: String, required: true },
  phone: { type: String, required: true },
  username: { type: String, required: true, unique: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  uuid: { type: String, required: true, unique: true }, // ✅ Added UUID
  location: {
    latitude: { type: Number },
    longitude: { type: Number }
  },
});

const User = mongoose.model("User", userSchema);

// ------------------- Attendance Schema -------------------
const attendanceSchema = new mongoose.Schema({
  studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  date: { type: Date, required: true },
  periods: [
    {
      periodNumber: Number,
      timestamps: {
        start: { type: Boolean, default: false },
        afterStart15: { type: Boolean, default: false },
        beforeEnd10: { type: Boolean, default: false },
        end: { type: Boolean, default: false }
      },
      present: { type: Boolean, default: false }
    }
  ]
});

const Attendance = mongoose.model("Attendance", attendanceSchema);

// ------------------- Validation Routes -------------------
app.post('/check-student', async (req, res) => {
  try {
    const { name, regNo } = req.body;
    const student = await User.findOne({ name, regNo });
    res.json({ exists: !!student });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/check-username', async (req, res) => {
  try {
    const { username } = req.body;
    const user = await User.findOne({ username });
    res.json({ exists: !!user });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/check-email', async (req, res) => {
  try {
    const { email } = req.body;
    const user = await User.findOne({ email });
    res.json({ exists: !!user });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
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

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

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

    if (!username || !password) {
      return res.status(400).json({ error: "Username and password are required" });
    }

    const user = await User.findOne({ username });
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const passwordMatch = await bcrypt.compare(password, user.password);
    if (!passwordMatch) {
      return res.status(401).json({ error: "Invalid password" });
    }

    res.json({
      message: "✅ Login successful",
      user: {
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

// ------------------- Attendance Routes -------------------
app.post('/attendance/mark', async (req, res) => {
  try {
    const { studentId, periodNumber, timestampType, location } = req.body;

    if (!studentId || !periodNumber || !timestampType || !location) {
      return res.status(400).json({ error: "Required fields missing" });
    }

    // ✅ College location (replace with your actual coordinates)
    const collegeLocation = { latitude: 12.9716, longitude: 77.5946 };

    // ✅ Calculate distance using Haversine formula
    const toRad = (value) => (value * Math.PI) / 180;
    const R = 6371000; // Earth radius in meters
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

    let today = new Date();
    today.setHours(0, 0, 0, 0);

    let record = await Attendance.findOne({ studentId, date: today });

    if (!record) {
      record = new Attendance({
        studentId,
        date: today,
        periods: Array.from({ length: 7 }, (_, i) => ({
          periodNumber: i + 1,
          timestamps: { start: false, afterStart15: false, beforeEnd10: false, end: false },
          present: false
        }))
      });
    }

    let period = record.periods.find(p => p.periodNumber === periodNumber);
    if (!period) return res.status(400).json({ error: "Invalid period number" });

    period.timestamps[timestampType] = true;
    const countTrue = Object.values(period.timestamps).filter(v => v).length;
    period.present = countTrue >= 3;

    await record.save();
    res.json({ message: "Attendance marked", period });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to mark attendance" });
  }
});


// ------------------- Server Start -------------------
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
