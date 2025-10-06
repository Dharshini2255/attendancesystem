const express = require('express');
const router = express.Router();
const Ping = require('../models/ping');
const Attendance = require('../models/Attendance');
const User = require('../models/User');

// Helper: check if location is within 100m
const isWithinLocation = (pingLocation, referenceLocation) => {
  const toRad = (value) => (value * Math.PI) / 180;
  const R = 6371000;
  const dLat = toRad(referenceLocation.latitude - pingLocation.latitude);
  const dLon = toRad(referenceLocation.longitude - pingLocation.longitude);
  const lat1 = toRad(pingLocation.latitude);
  const lat2 = toRad(referenceLocation.latitude);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = R * c;

  return distance <= 100;
};

// Hardcoded reference location (college)
const referenceLocation = {
  latitude: 12.8005328,
  longitude: 80.0388091
};

// ✅ POST /attendance/mark
router.post('/mark', async (req, res) => {
  const { studentId, periodNumber, timestampType, location } = req.body;

  try {
    const student = await User.findById(studentId);
    if (!student) return res.status(404).json({ error: 'Student not found' });

    const ping = new Ping({
      studentId,
      studentName: student.name,
      regNo: student.regNo,
      periodNumber,
      timestampType,
      location,
      timestamp: new Date()
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

    const validPings = allPings.filter(p =>
      isWithinLocation(p.location, referenceLocation)
    );

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

    res.status(200).json({ message: 'Ping recorded' });
  } catch (err) {
    console.error('Ping error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ✅ GET /attendance/today/:studentId
router.get('/today/:studentId', async (req, res) => {
  const { studentId } = req.params;
  const today = new Date().toISOString().slice(0, 10);

  try {
    const record = await Attendance.findOne({ studentId, date: today });
    if (!record) return res.status(200).json({ periods: [] });

    res.status(200).json(record);
  } catch (err) {
    console.error('Fetch attendance error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
