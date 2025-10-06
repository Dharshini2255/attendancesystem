const mongoose = require('mongoose');

const pingSchema = new mongoose.Schema({
  studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  studentName: { type: String, required: true },
  regNo: { type: String, required: true },
  periodNumber: { type: Number, required: true },
  timestampType: { type: String, enum: ['start', 'afterStart15', 'beforeEnd10', 'end'], required: true },
  location: {
    latitude: { type: Number, required: true },
    longitude: { type: Number, required: true }
  },
  timestamp: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Ping', pingSchema);
