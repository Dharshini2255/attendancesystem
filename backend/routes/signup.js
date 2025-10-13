const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const User = require('../models/Student');

router.post('/', async (req, res) => {
  try {
    const { name, class: className, year, regNo, phone, username, email, password, uuid, location } = req.body;

    if (!name || !className || !year || !regNo || !username || !password || !email || !uuid || !location) {
      return res.status(400).json({ error: "All required fields must be provided" });
    }

    const existingUser = await User.findOne({ $or: [{ username }, { email }, { uuid }] });
    if (existingUser) {
      return res.status(400).json({ error: "❌ Username, Email, or UUID already exists" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const newUser = new User({
      name,
      class: className,
      year,
      regNo,
      phone,
      username,
      email,
      password: hashedPassword,
      uuid,
      location
    });

    await newUser.save();
    console.log('✅ User saved:', newUser);

    res.json({ message: "✅ Account created successfully" });

  } catch (err) {
    console.error('Signup Error:', err);
    res.status(500).json({ error: 'Server error while creating account' });
  }
});

module.exports = router;
