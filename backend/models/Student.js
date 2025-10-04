const mongoose = require('mongoose');

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

module.exports = mongoose.model('Student', studentSchema);
