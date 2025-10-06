const mongoose = require('mongoose');

const attendanceSchema = new mongoose.Schema({
  studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  studentName: { type: String, required: true },
  regNo: { type: String, required: true },
  date: { type: String, required: true }, // Format: "YYYY-MM-DD"
  periods: [
    {
      periodNumber: Number,
      status: { type: String, enum: ['present', 'absent'] }
    }
  ]
});

module.exports = mongoose.model('Attendance', attendanceSchema);
