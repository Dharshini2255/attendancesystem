const express = require('express');
const router = express.Router();
const User = require('../models/Student');

router.get('/', async (req, res) => {
  try {
    const { username } = req.query;
    if (!username) return res.status(400).json({ error: 'Username is required' });

    const user = await User.findOne({ username });
    if (!user) return res.status(404).json({ error: 'User not found' });

    const { password, ...safeUser } = user.toObject();
    res.json(safeUser);
  } catch (err) {
    console.error('User info fetch error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
